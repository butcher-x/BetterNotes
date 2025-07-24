import { Collection } from "../models/Collection";
import { Entry } from "../models/Entry";
import BetterNotesPlugin from "../main";
import { EntryCard } from "./EntryCard";
import { TitleBar } from "./TitleBar";

/**
 * 条目列表视图组件
 * 用于显示指定集合中的所有条目
 */
export class EntryListView {
    private container: HTMLElement;
    private collection: Collection;
    private plugin: BetterNotesPlugin;
    private entries: Entry[] = [];
    private navBar: TitleBar;
    private contentContainer: HTMLElement;
    private onBackClick: () => void;

    /**
     * 构造函数
     * @param container 容器元素
     * @param collection 集合对象
     * @param plugin 插件实例
     * @param onBackClick 返回按钮点击回调
     */
    constructor(
        container: HTMLElement,
        collection: Collection,
        plugin: BetterNotesPlugin,
        onBackClick: () => void
    ) {
        this.container = container;
        this.collection = collection;
        this.plugin = plugin;
        this.onBackClick = onBackClick;
        
        // 获取集合中的所有条目
        this.entries = this.plugin.dataManager.getEntriesBySet(collection.name);
        
        // 创建标题栏
        this.navBar = new TitleBar(this.container, collection.name, this.onBackClick);
        
        // 创建内容容器
        this.contentContainer = this.container.createEl('div', { cls: 'BetterNotes-entry-list-container' });
    }

    /**
     * 渲染条目列表
     */
    public render(): void {
        // 清空内容容器
        this.contentContainer.empty();
        
        // 如果没有条目，显示空状态
        if (this.entries.length === 0) {
            this.renderEmptyState();
            return;
        }

        // 创建条目列表
        const listContainer = this.contentContainer.createEl('div', { cls: 'BetterNotes-entries-container' });
        
        // 按到期时间排序（从近到远）
        const sortedEntries = [...this.entries].sort((a, b) => {
            return new Date(a.expireTime).getTime() - new Date(b.expireTime).getTime();
        });

        // 渲染每个条目
        sortedEntries.forEach(entry => {
            this.renderEntryCard(listContainer, entry);
        });

     
    }

    /**
     * 渲染单个条目卡片
     * @param container 父容器元素
     * @param entry 条目对象
     */
    private renderEntryCard(container: HTMLElement, entry: Entry): void {
        const cardEl = container.createEl('div', {
            cls: 'BetterNotes-entry-item'
        });

        // 创建条目卡片组件并启用导航功能
        const entryCard = new EntryCard(cardEl, entry, this.plugin, this.collection);
        entryCard.render();
        
        // 为卡片添加特殊的可点击样式
        if (entry.sourceFile) {
            cardEl.classList.add('BetterNotes-entry-navigable');
        }
    }

   
    /**
     * 渲染空状态
     */
    private renderEmptyState(): void {
        const emptyStateEl = this.contentContainer.createEl('div', {
            cls: 'BetterNotes-empty-state'
        });        
       
    }

    /**
     * 刷新视图
     */
    public refresh(): void {
        // 重新获取条目
        this.entries = this.plugin.dataManager.getEntriesBySet(this.collection.name);
        
        // 重新渲染
        this.render();
    }
} 