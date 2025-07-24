import { App, Notice } from 'obsidian';
import BetterNotesPlugin from '../main';
import { Entry } from '../models/Entry';
import { t } from '../i18n';

/**
 * HashSpanHandler 服务
 * 负责处理带有data-hash属性的span标签的交互功能
 */
export class HashSpanHandler {
    private app: App;
    private plugin: BetterNotesPlugin;
    private isModifierKeyPressed: boolean = false;
    private currentHoverSpan: HTMLElement | null = null; // 跟踪当前悬停的span元素
    
    // 存储绑定后的事件处理函数，避免重复绑定
    private boundHandleMouseOver: (event: MouseEvent) => void;
    private boundHandleMouseOut: (event: MouseEvent) => void;
    private boundHandleClick: (event: MouseEvent) => void;
    private boundHandleKeyDown: (event: KeyboardEvent) => void;
    private boundHandleKeyUp: (event: KeyboardEvent) => void;
    
    // 追踪已处理的元素，避免重复处理
    private processedElements: Set<HTMLElement> = new Set();

    /**
     * 悬停计时器 ID，超过阈值后显示 tooltip
     */
    private hoverTimer: number | null = null;

    /**
     * 当前展示的 tooltip 元素
     */
    private tooltipEl: HTMLElement | null = null;

    /**
     * 构造函数
     * @param app Obsidian应用实例
     * @param plugin BetterNotes插件实例
     */
    constructor(app: App, plugin: BetterNotesPlugin) {
        this.app = app;
        this.plugin = plugin;
        
        // 预先绑定事件处理函数
        this.boundHandleMouseOver = this.handleMouseOver.bind(this);
        this.boundHandleMouseOut = this.handleMouseOut.bind(this);
        this.boundHandleClick = this.handleClick.bind(this);
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundHandleKeyUp = this.handleKeyUp.bind(this);
        
        this.initializeEventListeners();
    }

    /**
     * 初始化事件监听器
     * 包括全局键盘事件和文档变更监听器
     */
    private initializeEventListeners(): void {
        // 监听修饰键(CMD/CTRL)按下和释放事件
        document.addEventListener('keydown', this.boundHandleKeyDown);
        document.addEventListener('keyup', this.boundHandleKeyUp);

        // 设置DOM变更观察器，当文档内容变化时添加hash-span类
        this.setupMutationObserver();

        // 立即处理当前文档中的所有hash spans
        this.processExistingHashSpans();
    }

    /**
     * 处理已存在的hash span元素
     * 为文档中所有带data-hash属性的span添加类和事件监听器
     */
    private processExistingHashSpans(): void {
        // 获取所有带data-hash属性的span
        const hashSpans = document.querySelectorAll('span[data-hash]');
        
        // 为每个span添加类名并绑定事件
        hashSpans.forEach(span => {
            this.setupHashSpan(span as HTMLElement);
        });
    }

    /**
     * 设置DOM变更观察器
     * 监听文档的变化以处理新添加的hash span
     */
    private setupMutationObserver(): void {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        // 检查添加的节点是否为元素
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 检查节点本身是否为带data-hash的span
                            if (node instanceof HTMLElement && 
                                node.tagName === 'SPAN' && 
                                node.hasAttribute('data-hash')) {
                                this.setupHashSpan(node);
                            }

                            // 检查节点内是否有带data-hash的span
                            const hashSpans = (node as HTMLElement).querySelectorAll('span[data-hash]');
                            hashSpans.forEach(span => {
                                this.setupHashSpan(span as HTMLElement);
                            });
                        }
                    });
                }
            });
        });

        // 监视整个文档的变更
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * 设置单个hash span元素
     * 添加类名和事件监听器
     * @param span HTML span元素
     */
    private setupHashSpan(span: HTMLElement): void {
        // 确保元素有data-hash属性
        if (!span.hasAttribute('data-hash')) return;
        
        // 如果已经设置过，避免重复添加事件监听器
        if (this.processedElements.has(span)) return;
        
        // 添加到已处理集合中
        this.processedElements.add(span);
        
        // 添加CSS类
        span.classList.add('BetterNotes-hash-span');

        // 添加鼠标事件监听器，使用预先绑定的函数
        span.addEventListener('mouseover', this.boundHandleMouseOver);
        span.addEventListener('mouseout', this.boundHandleMouseOut);
        span.addEventListener('click', this.boundHandleClick);
    }

    /**
     * 处理键盘按下事件
     * @param event 键盘事件对象
     */
    private handleKeyDown(event: KeyboardEvent): void {
        // 检测CMD(Mac)或CTRL(Windows)键
        if (event.metaKey || event.ctrlKey) {
            this.isModifierKeyPressed = true;
            //console.log('handleKeyDown', this.isModifierKeyPressed);
            // 如果当前有悬停的span元素，立即应用高亮效果
            if (this.currentHoverSpan) {
                this.currentHoverSpan.classList.add('mod-hover');
            }
        }
    }

    /**
     * 处理键盘释放事件
     * @param event 键盘事件对象
     */
    private handleKeyUp(event: KeyboardEvent): void {
        // 如果释放的是CMD或CTRL键
        if (event.key === 'Meta' || event.key === 'Control') {
            this.isModifierKeyPressed = false;
            //console.log('handleKeyUp', this.isModifierKeyPressed);
            // 移除所有span的mod-hover类
            document.querySelectorAll('.BetterNotes-hash-span.mod-hover').forEach(span => {
                span.classList.remove('mod-hover');
            });
        }
    }

    /**
     * 处理鼠标悬停事件
     * @param event 鼠标事件对象
     */
    private handleMouseOver(event: MouseEvent): void {
        const span = event.currentTarget as HTMLElement;
        //console.log('handleMouseOver', this.isModifierKeyPressed);
        // 记录当前悬停的span元素
        this.currentHoverSpan = span;
        // 若已存在计时器，先清除
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        // 获取 Entry ，若不存在 comment 则不显示
        const hash = span.getAttribute('data-hash');
        if (hash) {
            const entry = this.plugin.dataManager.getEntry(hash);
            if (entry && entry.comment) {
                // 延时 1s 显示 tooltip
                this.hoverTimer = window.setTimeout(() => {
                    this.showCommentTooltip(span, entry);
                }, 1000);
            }
        }
        
        // 如果按下了修饰键，添加高亮效果
        if (this.isModifierKeyPressed) {
            //console.log('highlight');
            span.classList.add('mod-hover');
        }
    }

    /**
     * 处理鼠标离开事件
     * @param event 鼠标事件对象
     */
    private handleMouseOut(event: MouseEvent): void {
        const span = event.currentTarget as HTMLElement;
        
        // 清除当前悬停的span元素引用
        if (this.currentHoverSpan === span) {
            this.currentHoverSpan = null;
        }
        // 取消计时器
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        // 隐藏 tooltip
        this.hideCommentTooltip();
        
        // 移除高亮效果
        span.classList.remove('mod-hover');
    }

    /**
     * 处理点击事件
     * @param event 鼠标事件对象
     */
    private handleClick(event: MouseEvent): void {
        // 只在按下修饰键时处理点击
        if (!this.isModifierKeyPressed) return;
        
        const span = event.currentTarget as HTMLElement;
        const hash = span.getAttribute('data-hash');
        
        if (!hash) return;
        
        // 获取Entry对象
        const entry = this.plugin.dataManager.getEntry(hash);
        
        if (entry) {
            // 打开侧边栏并导航到对应条目
            this.openSidebarAndNavigateToEntry(entry);
        } 
        
        event.preventDefault();
        event.stopPropagation();
    }
    
    /**
     * 打开侧边栏并导航到对应条目
     * 激活侧边栏，打开comments视图，并高亮显示特定条目
     * @param entry 要导航到的条目对象
     */
    private async openSidebarAndNavigateToEntry(entry: Entry): Promise<void> {
        try {
            // 1. 首先激活侧边栏
            await this.plugin.activateSidebarView();
            
            // 2. 确保侧边栏视图已加载
            if (!this.plugin.sidebarView) {
                new Notice(t('cannot open sidebar view'));
                return;
            }
            
            // 3. 通知侧边栏视图打开comments视图并高亮条目
            this.plugin.sidebarView.openCommentsViewAndHighlightEntry(entry);
            
        } catch (error) {
            console.error('打开侧边栏并导航到条目时出错:', error);
            new Notice(t('cannot navigate') + ': ' + t('unsupported entry type or missing necessary information'));
        }
    }
    
    /**
     * 清理资源，移除事件监听器
     * 在插件卸载时调用
     */
    public cleanup(): void {
        // 移除全局事件监听器
        document.removeEventListener('keydown', this.boundHandleKeyDown);
        document.removeEventListener('keyup', this.boundHandleKeyUp);
        
        // 移除所有span的事件监听器
        this.processedElements.forEach(span => {
            span.removeEventListener('mouseover', this.boundHandleMouseOver);
            span.removeEventListener('mouseout', this.boundHandleMouseOut);
            span.removeEventListener('click', this.boundHandleClick);
        });
        
        // 清空已处理元素集合
        this.processedElements.clear();

        // 清理 tooltip
        this.hideCommentTooltip();
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
    }

    /**
     * 创建并显示评论 tooltip
     * @param span 触发的 span 元素
     * @param entry 对应的条目对象
     */
    private showCommentTooltip(span: HTMLElement, entry: Entry): void {
        // 若已有 tooltip，先移除
        this.hideCommentTooltip();

        // 创建容器
        const tooltip = document.createElement('div');
        tooltip.className = 'BetterNotes-comment-tooltip';

        // 主体内容
        const contentEl = document.createElement('div');
        contentEl.className = 'BetterNotes-comment-content';
        contentEl.textContent = entry.comment;
        tooltip.appendChild(contentEl);

        // 日期信息
        const dateEl = document.createElement('div');
        dateEl.className = 'BetterNotes-comment-date';
        dateEl.textContent = entry.addTime;
        tooltip.appendChild(dateEl);

        // 计算位置：以 span 为锚点，下方偏移
        document.body.appendChild(tooltip);
        const rect = span.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const top = rect.bottom + window.scrollY + 6;
        let left = rect.left + window.scrollX + (rect.width - tooltipRect.width) / 2;
        // 防止越界
        left = Math.max(left, 8);
        const maxLeft = document.documentElement.clientWidth - tooltipRect.width - 8;
        left = Math.min(left, maxLeft);

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;

        this.tooltipEl = tooltip;
    }

    /**
     * 隐藏并销毁评论 tooltip
     */
    private hideCommentTooltip(): void {
        if (this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
    }
} 