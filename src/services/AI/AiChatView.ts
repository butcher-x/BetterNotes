import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import BetterNotesPlugin from '../../main';
import { AiChatMessage, MessageDirection } from './AiChatMessage';
import { ChatSessionManager } from './ChatSessionManager';
import { MentionMenu, MentionItem } from './MentionMenu';
import { ChatChip } from './ChatChip';
import { t } from '../../i18n';
/**
 * AI聊天视图的唯一标识符
 */
export const AI_CHAT_VIEW_TYPE = "BetterNotes-ai-chat-view";

/**
 * AI聊天消息接口
 */
export interface ChatMessage {
    id: string;           // 消息唯一ID
    content: string;      // 消息内容
    timestamp: number;    // 时间戳
    direction: MessageDirection; // 消息方向：incoming (AI) 或 outgoing (用户)
    chips?: import('./ChatChip').ChatChip[]; // 可选，用户选择的 chips
}

/**
 * AI聊天视图组件
 * 负责在侧边栏中显示AI聊天界面，包括消息列表和输入框
 */
export class AiChatView extends ItemView {
    private plugin: BetterNotesPlugin;
    private chatContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private messageContainer: HTMLElement;
    private messages: ChatMessage[] = [];
    private selectedContainer!: HTMLElement;
    private selectedSet = new Map<string, ChatChip>();
    private insertChipFromLabel(label: string): void { }
    private addEntryChip(hash: string): void { }
    private addSetChip(setName: string): void { }
    private addTagChip(tagName: string): void { }
    /** 会话历史管理器  */
    private sessionManager!: ChatSessionManager;
    private slashActive = false;
    /**
     * 发送锁：在上一次 sendMessage 未完成（等待 AI 回复）时，禁止再次发送，
     * 防止用户连续按 Enter 导致重复消息。
     */
    private isSending = false;
    // 添加等待条容器引用
    private loadingBar: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: BetterNotesPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    /**
     * 获取视图类型标识符
     * @returns 视图类型标识符
     */
    getViewType(): string {
        return AI_CHAT_VIEW_TYPE;
    }

    /**
     * 获取视图显示名称
     * @returns 视图名称
     */
    getDisplayText(): string {
        return "AI 助手";
    }

    /**
     * 获取视图图标
     * @returns 视图图标名称
     */
    getIcon(): string {
        return "message-square";
    }

    /**
     * 初始化视图
     * 创建聊天界面的主要元素：消息容器和输入区域
     */
    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.classList.add("BetterNotes-ai-chat-view");

        // 初始化会话（可加 system prompt）
        const text =
        "1. You are an intelligent assistant for the Obsidian plugin BetterNotes.\
         2. You can call functions to get data from BetterNotes. You should call appropriate function in corresponding situations after understanding the user's demandings.\
            When you get no results after calling a function, you can try another function. \
         3. You will receive many notes by json, you should focus on the notes themselves like the content, comment, links, tags, sourcePath, not the json structure\
         4. When analyzing vault or notes, you'd better provide their sources in Obsidian's double-link format, such as [[essay.md|reference]].\
         5. If users did not mention useing notesSearch function explicitly , you'd better all the vaultSearch function.\
         "
        this.sessionManager = new ChatSessionManager(text);

        // 创建聊天主容器
        this.chatContainer = contentEl.createDiv("BetterNotes-ai-chat-container");


        // 创建消息显示区域
        this.messageContainer = this.chatContainer.createDiv("BetterNotes-ai-message-container");

        // 创建已选文件列表容器 (chips)
        this.selectedContainer = this.chatContainer.createDiv('sn-selected-list');
        const handleDragOver = (ev: DragEvent) => {
            const dt = ev.dataTransfer;
            if (!dt) return;
            if (dt.types.includes('text/BetterNotes-entry') || dt.types.includes('text/BetterNotes-set') || dt.types.includes('text/BetterNotes-tag')) {
                ev.preventDefault();
                dt.dropEffect = 'copy';
            }
        };

        const handleDrop = (ev: DragEvent) => {
            // 优先处理 tag 其次 set，再 fallback entry，避免事件冒泡导致 entry 数据覆盖 tag
            const tagName = ev.dataTransfer?.getData('text/BetterNotes-tag');
            if (tagName) {
                this.addTagChip(tagName);
                return;
            }

            const setName = ev.dataTransfer?.getData('text/BetterNotes-set');
            if (setName) {
                this.addSetChip(setName);
                return;
            }

            const hash = ev.dataTransfer?.getData('text/BetterNotes-entry');
            if (hash) {
                this.addEntryChip(hash);
            }
        };

        // 接收拖拽条目 chip（扩大到整个聊天容器）
        this.chatContainer.addEventListener('dragover', handleDragOver);
        this.chatContainer.addEventListener('drop', handleDrop);

        // 创建顶部 Header
        this.createHeader();

        // 创建固定等待条
        this.loadingBar = this.chatContainer.createDiv('sn-ai-loading-bar');
        // 将等待条放在 Header 与消息容器之间
        this.chatContainer.insertBefore(this.loadingBar, this.messageContainer);

        // 创建输入区域
        this.createInputArea();


    }

    /**
     * 创建用户输入区域
     * 包含文本输入框和发送按钮
     */
    private createInputArea(): void {
        this.inputContainer = this.chatContainer.createDiv("BetterNotes-ai-input-container");

        // 创建文本输入区域
        const textarea = this.inputContainer.createEl("textarea", {
            cls: "BetterNotes-ai-chat-input",
            attr: { placeholder: "输入消息..." }
        });

        // Mention menu handling
        const functionNames = ['curFile', 'notesInFile', 'allNotes', 'notesLinkedBy', 'notesNet', 'vaultSearch', 'notesSearch'];

        let lastPos = 0;
        let mentionActive = false;
        let mentionStart = 0;
        const mentionMenu = new MentionMenu(this.inputContainer, (item) => {
            // 其它情况直接插入芯片
            this.insertChipFromLabel(item.label);
        });

        // helper to add chip
        const addChip = (chipData: ChatChip) => {
            if (chipData.type === 'function') {
                // 任何函数芯片（含参数化）全局唯一
                for (const v of this.selectedSet.values()) {
                    if (v.type === 'function') return;
                }
            }

            // 规则：若已存在需要单条目的函数芯片（notesLinkedBy / notesNet），entry 芯片数量限制为 1
            const singleEntryFuncs = ['notesLinkedBy', 'notesNet'];
            const hasSingleEntryFunc = Array.from(this.selectedSet.values()).some(v => v.type === 'function' && singleEntryFuncs.includes(v.label));
            if (hasSingleEntryFunc && chipData.type === 'entry') {
                const entryCount = Array.from(this.selectedSet.values()).filter(v => v.type === 'entry').length;
                if (entryCount >= 1) return;
            }

            if (this.selectedSet.has(chipData.id)) return; // 去重
            this.selectedSet.set(chipData.id, chipData);

            const chip = this.selectedContainer.createDiv('sn-selected-chip');
            chip.setText(chipData.label);
            chip.addEventListener('click', () => {
                chip.remove();
                this.selectedSet.delete(chipData.id);
            });
        };

        // 根据 label 判断是 function 还是 entry
        this.insertChipFromLabel = (label: string) => {
            // 删除 @token
            const pos = textarea.selectionStart || 0;
            const before = textarea.value.slice(0, mentionStart);
            const after = textarea.value.slice(pos);
            textarea.value = before + after;
            textarea.selectionStart = textarea.selectionEnd = mentionStart;

            if (functionNames.includes(label)) {
                addChip({ id: label, type: 'function', label });
                mentionMenu.hide();
                return;
            }

            // preset label
            const presetObj = this.plugin.dataManager.getPreset(label);
            if (presetObj) {
                addChip({ id: presetObj.label, type: 'preset', label: presetObj.label });
                mentionMenu.hide();
                return;
            }

            // 默认按 entry hash 处理
            this.addEntryChip(label);
        };

        // 单独方法：插入 entry chip by hash
        this.addEntryChip = (hash: string) => {
            const pos = textarea.selectionStart || 0;
            // 计算当前 mentionStart -> pos 区段为 @token
            const before = textarea.value.slice(0, mentionStart);
            const after = textarea.value.slice(pos);
            textarea.value = before + after;
            // 将光标移至删除后的原 mentionStart 位置
            textarea.selectionStart = textarea.selectionEnd = mentionStart;

            addChip({ id: hash, type: 'entry', label: hash });
            mentionMenu.hide();
        };

        // 单独方法：插入 set chip by name
        this.addSetChip = (setName: string) => {
            const pos = textarea.selectionStart || 0;
            // 删除拖拽或 mention token（如有）
            const before = textarea.value.slice(0, mentionStart);
            const after = textarea.value.slice(pos);
            textarea.value = before + after;
            textarea.selectionStart = textarea.selectionEnd = mentionStart;

            const chipId = `set:${setName}`;
            addChip({ id: chipId, type: 'set', label: setName });
            mentionMenu.hide();
        };

        // 单独方法：插入 tag chip by tag name
        this.addTagChip = (tagName: string) => {
            const pos = textarea.selectionStart || 0;
            // 删除拖拽或 mention token（如有）
            const before = textarea.value.slice(0, mentionStart);
            const after = textarea.value.slice(pos);
            textarea.value = before + after;
            textarea.selectionStart = textarea.selectionEnd = mentionStart;

            const chipId = `tag:${tagName}`;
            addChip({ id: chipId, type: 'tag', label: '#' + tagName });
            mentionMenu.hide();
        };

        textarea.addEventListener('input', () => {
            lastPos = textarea.selectionStart || 0;
            const val = textarea.value;

            const charBefore = val[lastPos - 1];

            // 1. 新触发 @
            if (charBefore === '@') {
                mentionActive = true;
                mentionStart = lastPos - 1;
                this.slashActive = false;
            }

            // 新触发 /
            if (charBefore === '/') {
                this.slashActive = true;
                mentionActive = false;
                mentionStart = lastPos - 1;
            }

            if (mentionActive) {
                const token = val.slice(mentionStart + 1, lastPos); // 不含@
                // 若遇到空格、换行或删除了@，结束
                if (/[^\w]/.test(token) || mentionStart >= val.length || val[mentionStart] !== '@') {
                    mentionActive = false;
                    mentionMenu.hide();
                    return;
                }

                const tokenLower = token.toLowerCase();
                const filtered = functionNames
                    .filter((f) => f.toLowerCase().includes(tokenLower))
                    .map((f, idx) => ({ id: String(idx), label: f }));

                if (filtered.length) {
                    mentionMenu.show(filtered);
                } else {
                    mentionMenu.hide();
                }
                return;
            }

            // slash 活动
            if (this.slashActive) {
                const token = val.slice(mentionStart + 1, lastPos); // 不含 '/'
                if (/[\s]/.test(token) || mentionStart >= val.length || val[mentionStart] !== '/') {
                    this.slashActive = false;
                    mentionMenu.hide();
                    return;
                }

                const presets = this.plugin.dataManager.getAllPresets();
                const tokLower = token.toLowerCase();
                const items = presets
                    .filter(p => p.label.toLowerCase().includes(tokLower))
                    .map((p, idx) => ({ id: String(idx), label: p.label }));

                if (items.length) mentionMenu.show(items); else mentionMenu.hide();
                return;
            }
        });

        textarea.addEventListener('blur', () => mentionMenu.hide());

        // IME composition track (retain previous logic)
        let composing = false;
        textarea.addEventListener('compositionstart', () => (composing = true));
        textarea.addEventListener('compositionend', () => (composing = false));

        textarea.addEventListener("keydown", (e) => {
            if (mentionMenu.isVisible()) {
                if (e.key === 'ArrowDown') { mentionMenu.move(1); e.preventDefault(); return; }
                if (e.key === 'ArrowUp') { mentionMenu.move(-1); e.preventDefault(); return; }
                if (e.key === 'Enter') {
                    mentionMenu.choose();
                    e.preventDefault();
                    return;
                }
            }

            if (e.key === "Enter" && !e.shiftKey && !composing && !e.isComposing) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    /**
     * 发送消息
     * 获取输入框内容，创建新消息，并清空输入框
     */
    private async sendMessage(): Promise<void> {
        if (this.isSending) return; // 已在发送中，直接忽略重复触发
        this.isSending = true;
        // 激活等待条动画
        this.loadingBar?.classList.add('running');
        const textarea = this.inputContainer.querySelector("textarea");
        if (!textarea) { this.isSending = false; return; }

        let entrySummaries = this.collectEntrySummaries();

        // 用于保存 vault/notes search 的指令
        let toolInstruction = '';

        // 处理 preset chips
        const presetChips = Array.from(this.selectedSet.values()).filter(c => c.type === 'preset');
        let presetText = '';
        if (presetChips.length) {
            presetText = presetChips
                .map(p => this.plugin.dataManager.getPreset(p.label)?.prompt || '')
                .filter(Boolean)
                .join('\n');
        }

        // 根据所有 function chips 处理数据
        const functionChips = Array.from(this.selectedSet.values()).filter(c => c.type === 'function');
        let extraFileData: any = null;

        const dm = this.plugin.dataManager;
        const activeFile = this.plugin.app.workspace.getActiveFile();

        // 使用集合确保条目不重复
        const entrySet = new Set<string>();
        // 先将已有 summaries 的 hash 放入集合，避免重复
        entrySummaries.forEach(es => entrySet.add(es.hash));

        let userBubbleShown = false; // 标记是否已渲染用户气泡

        for (const fc of functionChips) {
            switch (true) {
                case fc.label === 'curFile':
                    if (activeFile) {
                        extraFileData = {
                            path: activeFile.path,
                            content: await this.plugin.app.vault.read(activeFile)
                        };
                    }
                    break;
                case fc.label === 'notesInFile':
                    if (activeFile) {
                        dm.getEntriesBySourceFile(activeFile.path).forEach(entry => {
                            if (!entrySet.has(entry.hash)) {
                                entrySummaries.push({
                                    hash: entry.hash,
                                    value: entry.value,
                                    comment: entry.comment,
                                    link: entry.link,
                                    attachmentFile: entry.attachmentFile,
                                    tag: entry.tag,
                                    sourcePath: entry.sourceFile
                                });
                                entrySet.add(entry.hash);
                            }
                        });
                    }
                    break;
                case fc.label === 'allNotes':
                    dm.getAllEntries().forEach(entry => {
                        if (!entrySet.has(entry.hash)) {
                            entrySummaries.push({
                                hash: entry.hash,
                                value: entry.value,
                                comment: entry.comment,
                                link: entry.link,
                                attachmentFile: entry.attachmentFile,
                                tag: entry.tag,
                                sourcePath: entry.sourceFile
                            });
                            entrySet.add(entry.hash);
                        }
                    });
                    break;
                case fc.label === 'notesLinkedBy': {
                    // 必须且只能选中一个 entry chip
                    const entryChips = Array.from(this.selectedSet.values()).filter(c => c.type === 'entry');
                    if (entryChips.length !== 1) {
                        new Notice('"notesLinkedBy"' + t('need to select only one entry'));
                        break;
                    }
                    const mainHash = entryChips[0].id;
                    const mainEntry = dm.getEntryByHash(mainHash);
                    if (mainEntry && !entrySet.has(mainHash)) {
                        entrySummaries.push({
                            hash: mainEntry.hash,
                            value: mainEntry.value,
                            comment: mainEntry.comment,
                            link: mainEntry.link,
                            attachmentFile: mainEntry.attachmentFile,
                            tag: mainEntry.tag,
                            sourcePath: mainEntry.sourceFile
                        });
                        entrySet.add(mainHash);
                    }
                    // 遍历 link 数组
                    if (mainEntry && Array.isArray(mainEntry.link)) {
                        mainEntry.link.forEach(lh => {
                            const le = dm.getEntryByHash(lh);
                            if (le && !entrySet.has(le.hash)) {
                                entrySummaries.push({
                                    hash: le.hash,
                                    value: le.value,
                                    comment: le.comment,
                                    link: le.link,
                                    attachmentFile: le.attachmentFile,
                                    tag: le.tag,
                                    sourcePath: le.sourceFile
                                });
                                entrySet.add(le.hash);
                            }
                        });
                    }
                    break;
                }
                case fc.label === 'notesNet': {
                    const entryChips = Array.from(this.selectedSet.values()).filter(c => c.type === 'entry');
                    if (entryChips.length !== 1) {
                        new Notice('"notesNet"' + t('need to select only one entry'));
                        break;
                    }
                    const rootHash = entryChips[0].id;
                    const visited = new Set<string>();
                    const queue: string[] = [rootHash];
                    while (queue.length) {
                        const h = queue.shift() as string;
                        if (visited.has(h)) continue;
                        visited.add(h);
                        const e = dm.getEntryByHash(h);
                        if (e) {
                            if (!entrySet.has(e.hash)) {
                                entrySummaries.push({
                                    hash: e.hash,
                                    value: e.value,
                                    comment: e.comment,
                                    link: e.link,
                                    attachmentFile: e.attachmentFile,
                                    tag: e.tag,
                                    sourcePath: e.sourceFile
                                });
                                entrySet.add(e.hash);
                            }
                            if (Array.isArray(e.link)) {
                                e.link.forEach(lh => { if (!visited.has(lh)) queue.push(lh); });
                            }
                        }
                    }
                    break;
                }
                case fc.label === 'vaultSearch':
                case fc.label === 'notesSearch': {
                    const queryText = textarea.value.trim();
                    const toolName = fc.label;
                    if (!queryText) {
                        new Notice(`"${toolName}"` + t('need to input query content'));
                        break;
                    }

                    // 提前渲染用户气泡并清理输入区，避免等待索引完成
                    if (!userBubbleShown) {
                        this.addMessage({
                            id: this.generateId(),
                            content: queryText,
                            timestamp: Date.now(),
                            direction: MessageDirection.OUTGOING,
                            chips: Array.from(this.selectedSet.values()),
                        });
                        userBubbleShown = true;
                        // 清空输入框与已选 chips
                        textarea.value = "";
                        this.selectedContainer.empty();
                        this.selectedSet.clear();
                        this.slashActive = false;
                    }

                    toolInstruction = `please call the ${toolName} tool to solve following problem:\n\`\`\`\n${queryText}\n\`\`\``;
                    break;
                }
            }
        }

        // 处理 set 类型 chips（拖拽生成）
        const setChips = Array.from(this.selectedSet.values()).filter(c => c.type === 'set');
        for (const sc of setChips) {
            const setName = sc.label;
            dm.getEntriesBySet(setName).forEach(entry => {
                if (!entrySet.has(entry.hash)) {
                    entrySummaries.push({
                        hash: entry.hash,
                        value: entry.value,
                        comment: entry.comment,
                        link: entry.link,
                        attachmentFile: entry.attachmentFile,
                        tag: entry.tag,
                        sourcePath: entry.sourceFile
                    });
                    entrySet.add(entry.hash);
                }
            });
        }

        // 处理 tag 类型 chips（拖拽生成）
        const tagChips = Array.from(this.selectedSet.values()).filter(c => c.type === 'tag');
        for (const tc of tagChips) {
            const rawTag = tc.label.startsWith('#') ? tc.label.slice(1) : tc.label;
            dm.getEntriesByTag(rawTag).forEach(entry => {
                if (!entrySet.has(entry.hash)) {
                    entrySummaries.push({
                        hash: entry.hash,
                        value: entry.value,
                        comment: entry.comment,
                        link: entry.link,
                        attachmentFile: entry.attachmentFile,
                        tag: entry.tag,
                        sourcePath: entry.sourceFile
                    });
                    entrySet.add(entry.hash);
                }
            });
        }

        const userText = textarea.value.trim();

        if (!userText && entrySummaries.length === 0 && !presetText && !toolInstruction) return; // nothing to send

        const chipVisual = this.buildChipVisualString();

        const displayContent = userText;

        let payload: any = {};
        if (entrySummaries.length) payload.entries = entrySummaries;
        if (extraFileData) payload.file = extraFileData;

        
        const llmContent = (toolInstruction ? toolInstruction + '\n\n' : '') +
            (Object.keys(payload).length ? '```json\n' + JSON.stringify(payload, null, 2) + '\n```\n\n' : '') +
            (presetText ? presetText + '\n' : '') +
            userText;

        // 显示用户气泡（若尚未显示）
        if (!userBubbleShown) {
            this.addMessage({
                id: this.generateId(),
                content: displayContent,
                timestamp: Date.now(),
                direction: MessageDirection.OUTGOING,
                chips: Array.from(this.selectedSet.values()),
            });
        }

        // 如果早已清空（vaultSearch 逻辑），此时 selectedSet 可能已经为空，无需再清空
        if (!userBubbleShown) {
            // 清空输入框与已选 chips
            textarea.value = "";
            this.selectedContainer.empty();
            this.selectedSet.clear();
            this.slashActive = false;
        }

        // 写入会话历史（发送给模型）
        this.sessionManager.addUserMessage(llmContent);

        // 预先声明变量，稍后用于渲染最终 AI 回复
        let finalAiComponent: import('./AiChatMessage').AiChatMessage | null = null;

        // 定义工具调用开始时的 UI 回调，用于插入进度气泡
        const handleToolCall = (name: string, args: any) => {
            const tip = this.buildToolCallBubble(name, args);
            if (!tip) return;
            this.addMessage({
                id: this.generateId(),
                content: tip,
                timestamp: Date.now(),
                direction: MessageDirection.INCOMING
            });
            this.scrollToBottom();
        };

        try {
            const { FunctionCallRunner } = await import('./FunctionCallRunner');
            const runner = new FunctionCallRunner(this.plugin, this.sessionManager, { onToolCall: handleToolCall });
            const content = await runner.run();

            // 渲染最终 AI 回复气泡
            const aiMsgMeta: ChatMessage = {
                id: this.generateId(),
                content,
                timestamp: Date.now(),
                direction: MessageDirection.INCOMING
            };
            finalAiComponent = this.addMessage(aiMsgMeta);
            this.sessionManager.addAssistantMessage(content);
            this.scrollToBottom();
        } catch (err) {
            console.error('AI 请求失败', err);
            if (finalAiComponent) {
                finalAiComponent.updateContent('**[错误]** ' + (err as any).message);
            } else {
                // AI 气泡尚未创建，直接新建错误消息
                this.addMessage({
                    id: this.generateId(),
                    content: '**[错误]** ' + (err as any).message,
                    timestamp: Date.now(),
                    direction: MessageDirection.INCOMING
                });
            }
            new Notice(t('AI request failed') + ', ' + t('please check network or API configuration'));
        } finally {
            // 无论成功或失败，都解锁
            this.isSending = false;
            // 停止等待条动画
            this.loadingBar?.classList.remove('running');
        }
    }

    /**
     * 根据不同工具函数名称生成对应的提示文本。
     * @param name 工具函数名称（Function Calling 中返回的 name）
     * @param args 解析后的参数对象
     */
    private buildToolCallBubble(name: string, args: any): string | null {
        switch (name) {
            case 'getCurFile': {
                const file = this.plugin.app.workspace.getActiveFile();
                if (file) {
                    // 使用 Obsidian wiki link 形式，携带别名显示文件名，完整路径用于准确定位
                    return `🤖正在查看文件[[${file.path}|${file.basename}]]...`;
                }
                return '🤖未找到当前文件...';
            }
            case 'getCurFileNotes':
                return '🤖正在查看本文件的笔记...';
            case 'getAllNotes':
                return '🤖正在查看所有笔记...';
            case 'getNotesLinkedBy': {
                const hash = args?.hash || '';
                return `🤖正在查看笔记${hash}的相关条目...`;
            }
            case 'getNotesNet': {
                const hash = args?.hash || '';
                return `🤖正在查看笔记${hash}的网络图...`;
            }
            case 'searchVault': {
                return `🤖正在检索仓库...`;
            }
            case 'notesSearch': {
                return `🤖查询库笔记...`;
            }
            default:
                return null;
        }
    }

    /**
     * 添加新消息到聊天界面
     * @param message 消息对象
     */
    public addMessage(message: ChatMessage): AiChatMessage {
        // 添加到消息数组
        this.messages.push(message);

        // 创建消息UI元素
        const messageComponent = new AiChatMessage(
            this.messageContainer,
            message.content,
            message.direction,
            this.plugin,
            message.chips
        );
        messageComponent.render();

        // 滚动到最新消息
        this.scrollToBottom();
        return messageComponent;
    }

    /**
     * 滚动到最新消息
     */
    private scrollToBottom(): void {
        this.messageContainer.scrollTo({
            top: this.messageContainer.scrollHeight,
            behavior: "smooth"
        });
    }

    /**
     * 生成唯一消息ID
     * @returns 唯一ID字符串
     */
    private generateId(): string {
        return Date.now().toString() + Math.random().toString(36).substring(2, 9);
    }

    /**
     * 创建顶部渐变 Header，包含标题与刷新按钮
     */
    private createHeader(): void {
        const header = createDiv({ cls: 'sn-ai-header' });
        this.chatContainer.prepend(header);
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.padding = '10px 12px';

        const title = header.createDiv();
        title.setText('BetterNotes AI');
        title.style.fontWeight = '600';

        const refresh = header.createEl('button');
        refresh.addClass('sn-ai-refresh-btn');
        refresh.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35a8 8 0 1 0 2.3 6.65h-2.08a6 6 0 1 1-1.64-6.31l-3.29 3.29H22V2l-4.35 4.35z"/></svg>';
        refresh.addEventListener('click', () => {
            this.clearHistory();
        });
    }

    /**
     * 清空对话历史（UI + 内存）
     */
    private clearHistory(): void {
        this.sessionManager.reset();
        this.messages = [];
        this.messageContainer.empty();
    }

    /**
     * 视图关闭时的清理工作
     */
    async onClose() {
        // 执行必要的清理工作
        this.chatContainer.empty();
    }

    /**
     * 收集 entry 类型 chip，返回简要信息数组
     */
    private collectEntrySummaries(): any[] {
        const summaries: any[] = [];
        for (const chip of this.selectedSet.values()) {
            if (chip.type === 'entry') {
                const entry = (this.plugin as any).dataManager?.getEntryByHash?.(chip.id);
                if (entry) {
                    summaries.push({
                        hash: entry.hash,
                        value: entry.value,
                        comment: entry.comment,
                        link: entry.link,
                        attachmentFile: entry.attachmentFile,
                        tag: entry.tag,
                        sourcePath: entry.sourceFile
                    });
                }
            }
        }
        return summaries;
    }

    /**
     * 构造形如 [[label]] 列表的可视字符串
     */
    private buildChipVisualString(): string {
        if (!this.selectedSet.size) return '';
        return Array.from(this.selectedSet.values())
            .map((c) => `[[${c.label}]]`)
            .join(' ');
    }

    /**
     * 将向量检索结果格式化为 Markdown 代码块 Prompt
     */
    private buildVaultPrompt(snippets: any[]): string {
        if (!snippets?.length) return '';
        const blocks = snippets.map((s: any) => `\`\`\`${s.path}\n${s.content}\n\`\`\``);
        //console.log('blocks', blocks.join('\n'));
        return `## Potentially Relevant Snippets from the vault\n${blocks.join('\n')}\n`;
    }


} 