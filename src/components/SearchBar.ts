import BetterNotesPlugin from "../main";
import { Entry } from "../models/Entry";
import { SidebarView } from "../views/SidebarView";
import { t } from '../i18n';
/**
 * 支持 value / comment / tag 的轻量级即时搜索组件
 * UI: 输入框 + 过滤器下拉 + 结果列表
 */
export class SearchBar {
    private plugin: BetterNotesPlugin;
    private sidebarView: SidebarView;
    private parent: HTMLElement;

    private inputEl: HTMLInputElement;
    private resultContainer: HTMLElement;

    // debounce handler
    private debounceTimer: number | null = null;

    constructor(parent: HTMLElement, plugin: BetterNotesPlugin, sidebarView: SidebarView) {
        this.parent = parent;
        this.plugin = plugin;
        this.sidebarView = sidebarView;

        this.render();
    }

    /**
     * 创建并渲染搜索栏 UI
     */
    private render(): void {
        const bar = this.parent.createDiv("BetterNotes-search-bar");

        // 输入框
        this.inputEl = bar.createEl("input", {
            cls: "BetterNotes-search-input",
            attr: {
                type: "text"
            }
        }) as HTMLInputElement;

        // 根据上下文更新 placeholder
        this.updatePlaceholder();

        // 结果列表
        this.resultContainer = this.parent.createDiv("BetterNotes-search-result-list");

        // 事件绑定
        this.inputEl.addEventListener("input", () => this.scheduleSearch());
    }

    /**
     * 在 150ms 内防抖执行搜索
     */
    private scheduleSearch(): void {
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(() => {
            this.debounceTimer = null;
            this.performSearch();
        }, 150);
    }

    /**
     * 执行搜索并渲染结果
     */
    private performSearch(): void {
        const keywordRaw = this.inputEl.value.trim();
        // 若关键字过短，清空结果
        if (keywordRaw.length < 2) {
            this.resultContainer.empty();
            return;
        }
        const words = keywordRaw.split(/\s+/).filter(Boolean);
        const tagTokens = words.filter(w => w.startsWith('#')).map(t => t.slice(1).toLowerCase());
        const textKeyword = words.filter(w => !w.startsWith('#')).join(' ').toLowerCase();

        const candidates = this.getEntriesByContext();
        const matched: Entry[] = [];

        for (const entry of candidates) {
            // Tag filtering (must contain all tagTokens)
            const entryTagsLower = (entry.tag || []).map(t => t.replace(/^#/, '').toLowerCase());
            const hasAllTags = tagTokens.every(t => entryTagsLower.includes(t));
            if (!hasAllTags) continue;

            if (textKeyword.length === 0) {
                matched.push(entry);
            } else {
                const haystack = (
                    (entry.value || "") + " " +
                    (entry.comment || "") + " " +
                    entryTagsLower.join(' ')
                ).toLowerCase();
                if (haystack.includes(textKeyword)) {
                    matched.push(entry);
                }
            }
        }

        this.renderResults(matched, textKeyword.length ? textKeyword : keywordRaw);
    }

    /**
     * 根据 SidebarView 的上下文返回候选条目数组
     * 规则：
     *  - comments 视图：当前活动文件中的条目
     *  - home 根目录：所有集合条目
     *  - home>folderX：folderX 及其子文件夹下所有集合的条目
     */
    private getEntriesByContext(): Entry[] {
        const viewType = this.sidebarView.getCurrentView?.() ?? "home";

        if (viewType === "comments") {
            const activeFile = this.plugin.app.workspace.getActiveFile();
            if (!activeFile) return [];
            return this.plugin.dataManager.getEntriesBySourceFile(activeFile.path);
        }

        const collection = this.sidebarView.getCurrentCollection?.();
        if (collection) {
            return this.plugin.dataManager.getEntriesBySet(collection.name);
        }

        const folder = this.sidebarView.getCurrentFolder?.();

        if (!folder) {
            // 在根目录，返回全部
            return this.plugin.dataManager.getAllEntries();
        }

        // 收集该文件夹及其子层级的所有 set 名称
        const allowedSets = this.collectSetsUnderFolder(folder.name);
        const allowedSetSet = new Set<string>(allowedSets);
        return this.plugin.dataManager.getAllEntries().filter(e => allowedSetSet.has(e.set));
    }

    /**
     * 递归收集指定文件夹下所有 set 集合名称
     */
    private collectSetsUnderFolder(folderName: string): string[] {
        const collections = this.plugin.dataManager.getAllCollections();
        const result: string[] = [];

        const dfs = (name: string) => {
            for (const c of collections) {
                if (c.parent === name) {
                    if (c.type === "set") result.push(c.name);
                    else if (c.type === "folder") dfs(c.name);
                }
            }
        };

        dfs(folderName);
        return result;
    }

    /**
     * 渲染搜索结果列表
     * @param entries 命中条目
     * @param keyword 原始关键字（保持大小写，用于高亮）
     */
    private renderResults(entries: Entry[], keyword: string): void {
        this.resultContainer.empty();

        if (entries.length === 0) {
            this.resultContainer.createDiv({ text: t('no matching results'), cls: "BetterNotes-search-empty" });
            return;
        }

        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

        entries.forEach(entry => {
            const item = this.resultContainer.createDiv("BetterNotes-search-result-item");

            // 根据匹配字段生成上下文片段
            const snippet = this.buildContextSnippet(entry, keyword, this.plugin.settings.snippetContext);
            const snippetEl = item.createDiv("BetterNotes-search-snippet");
            snippetEl.innerHTML = this.highlight(snippet, regex);

            // 标注来源
            const metaEl = item.createDiv("BetterNotes-search-meta");
            metaEl.setText(`${entry.set} · ${entry.sourceFile}`);

            // 根据集合颜色设置背景
            const collection = this.plugin.dataManager.getCollection(entry.set);
            if (collection) {
                item.style.backgroundColor = this.hexToRgba(collection.color, 0.6);
            }

            // 点击跳转：先打开源文件，再切换 comments 视图并高亮
            item.addEventListener("click", async () => {
                try {
                    await this.plugin.entryNavigation.navigateToEntry(entry);
                    // 确保侧边栏处于活动状态并显示 comments 视图
                    await this.plugin.activateSidebarView?.();
                    this.sidebarView.openCommentsViewAndHighlightEntry(entry);
                    this.sidebarView.getSearchBar()?.updatePlaceholder();
                } catch (e) {
                    console.error(t('search result jump failed'), e);
                }
            });
        });
    }

    /**
     * 高亮 keyword
     */
    private highlight(text: string, regex: RegExp): string {
        return text.replace(regex, match => `<mark>${match}</mark>`);
    }

    /**
     * 构建包含匹配关键字的上下文片段（前后各 contextLen 字）
     */
    private buildContextSnippet(entry: Entry, keyword: string, contextLen: number): string {
        const keywordLower = keyword.toLowerCase();
        const fields: Array<{text: string, label: string}> = [
            { text: entry.value, label: '' },
            { text: entry.comment || '', label: '' },
        ];
        for (const field of fields) {
            const idx = field.text.toLowerCase().indexOf(keywordLower);
            if (idx !== -1) {
                const start = Math.max(0, idx - contextLen);
                const end = Math.min(field.text.length, idx + keyword.length + contextLen);
                let snippet = field.text.substring(start, end);
                if (start > 0) snippet = '…' + snippet;
                if (end < field.text.length) snippet = snippet + '…';
                return snippet;
            }
        }
        // fallback tag match
        if (entry.tag && entry.tag.length > 0) {
            const joined = entry.tag.join(' ');
            const idx = joined.toLowerCase().indexOf(keywordLower);
            if (idx !== -1) {
                const start = Math.max(0, idx - contextLen);
                const end = Math.min(joined.length, idx + keyword.length + contextLen);
                let snippet = joined.substring(start, end);
                if (start > 0) snippet = '…' + snippet;
                if (end < joined.length) snippet += '…';
                return snippet;
            }
        }
        return entry.value.substring(0, contextLen * 2) + '…';
    }

    /** RGBA helper */
    private hexToRgba(hex: string, alpha: number): string {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    /**
     * 根据 SidebarView 上下文更新输入框 placeholder
     */
    public updatePlaceholder(): void {
        if (!this.inputEl) return;
        const view = this.sidebarView.getCurrentView?.() ?? "home";
        let placeholder: string;
        if (view === "comments") {
            placeholder = t('current search range: this file');
        } else {
            const collection = this.sidebarView.getCurrentCollection?.();
            if (collection) {
                placeholder = t('current search range: this collection');
            } else {
                const folder = this.sidebarView.getCurrentFolder?.();
                if (!folder) {
                    placeholder = t('current search range: all collections');
                } else {
                    placeholder = t('current search range: all collections in this folder');
                }
            }
        }
        this.inputEl.placeholder = placeholder;
    }

    /**
     * 外部调用：设置搜索框内容并立即执行搜索
     */
    public setSearch(text: string): void {
        if (!this.inputEl) return;
        this.inputEl.value = text;
        this.scheduleSearch();
    }
} 