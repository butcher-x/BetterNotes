import { Notice, MarkdownRenderer } from 'obsidian';
import BetterNotesPlugin from '../../main';
import { t } from '../../i18n';
/**
 * 消息方向枚举
 * INCOMING: 接收到的消息 (AI发送)
 * OUTGOING: 发出的消息 (用户发送)
 */
export enum MessageDirection {
    INCOMING = 'incoming',
    OUTGOING = 'outgoing'
}

/**
 * AI聊天消息组件
 * 负责渲染单条聊天消息，支持不同方向和样式
 */
export class AiChatMessage {
    private container: HTMLElement;
    private content: string;
    private direction: MessageDirection;
    private element: HTMLElement | null = null;
    private plugin: BetterNotesPlugin;
    private chips?: import('./ChatChip').ChatChip[];

    /**
     * streaming 阶段的容器，用于纯文本快速追加。
     * 在 finalizeStream 之后会被清空并替换为 MarkdownRenderer 结果。
     */
    private streamingPre?: HTMLElement;
    private isStreaming = false;

    /**
     * 构造函数
     * @param container 消息容器元素
     * @param content 消息内容
     * @param direction 消息方向
     */
    constructor(
        container: HTMLElement, 
        content: string, 
        direction: MessageDirection,
        plugin: BetterNotesPlugin,
        chips?: import('./ChatChip').ChatChip[]
    ) {
        this.container = container;
        this.content = content;
        this.direction = direction;
        this.plugin = plugin;
        this.chips = chips;
    }

    /**
     * 渲染消息到容器中
     */
    public render(): void {
        // 创建消息容器元素
        this.element = this.container.createDiv({
            cls: `BetterNotes-ai-chat-message ${this.direction}`
        });

        // 如果有 chips，先渲染 chip 容器
        if (this.chips && this.chips.length) {
            const chipWrap = this.element.createDiv({ cls: 'sn-bubble-chip-wrap' });
            chipWrap.style.display = 'flex';
            chipWrap.style.flexWrap = 'wrap';
            chipWrap.style.gap = '4px';

            this.chips.forEach(c => {
                const chipEl = chipWrap.createDiv('sn-bubble-chip');
                chipEl.setText(c.label);
            });
        }

        // 创建消息内容区域
        const contentEl = this.element.createDiv({ cls: 'BetterNotes-ai-message-content' });

        // 默认直接渲染；如果后续进入流式模式，会清空重建
        MarkdownRenderer.renderMarkdown(this.content, contentEl, '', this.plugin);

        // 渲染完成后，为内部链接（Obsidian wiki link）绑定点击处理，
        // 以保证在自定义视图中也能正常跳转。
        this.bindInternalLinkClicks(contentEl);

        // 创建 copy 按钮（悬浮时可见）
        const copyBtn = this.element.createEl('button', {
            cls: 'sn-bubble-copy-btn',
            attr: { 'aria-label': '复制' }
        });
        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v16h13a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 18H8V7h11v16z"></path></svg>';

        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await navigator.clipboard.writeText(this.content);
            } catch (err) {
                console.error('复制失败', err);
                new Notice(t('copy failed'));
            }
        });
    }

    
    /**
     * 更新消息内容
     * @param newContent 新的消息内容
     */
    public updateContent(newContent: string): void {
        this.content = newContent;
        
        if (this.element) {
            const contentEl = this.element.querySelector('.BetterNotes-ai-message-content');
            if (contentEl) {
                contentEl.empty();
                MarkdownRenderer.renderMarkdown(this.content, contentEl as HTMLElement, '', this.plugin);
                this.bindInternalLinkClicks(contentEl as HTMLElement);
            }
        }
    }

    /**
     * 从DOM中移除消息
     */
    public remove(): void {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }

 
   

    /**
     * 绑定 internal-link 链接点击事件，确保在自定义容器中也能跳转。
     */
    private bindInternalLinkClicks(scope: HTMLElement) {
        const anchors = scope.querySelectorAll('a.internal-link');
        anchors.forEach(anchorEl => {
            anchorEl.addEventListener('click', (ev) => {
                ev.preventDefault();
                const a = anchorEl as HTMLElement & { dataset: Record<string, string> };
                const href = (a.getAttribute('href') || a.dataset?.href || '').trim();
                if (!href) return;
                // 第三个参数若留空，Obsidian 会选择默认 newLeafOrSame 查看行为
                this.plugin.app.workspace.openLinkText(href, '/', false);
            });
        });
    }
} 