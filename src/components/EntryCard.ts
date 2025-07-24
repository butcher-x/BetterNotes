import { Entry } from "../models/Entry";
import { Collection } from "../models/Collection";
import BetterNotesPlugin from "../main";
import { setIcon } from "obsidian";
import { AnnotationModal } from "./AnnotationModal";
import { ImageEditorModal } from "./ImageEditorModal";
import { AttachmentService } from "../services/AttachmentService";
import { LinkedEntriesModal } from "./LinkedEntriesModal";
import { hexToRgba } from '../utils/utils';
import { t } from '../i18n';
/**
 * 条目卡片组件
 * 用于显示单个条目的卡片
 */
export class EntryCard {
    private container: HTMLElement;
    private entry: Entry;
    private plugin: BetterNotesPlugin;
    private collection: Collection;
    
    /**
     * 构造函数
     * @param container 容器元素
     * @param entry 条目对象
     * @param plugin 插件实例
     * @param collection 所属集合
     */
    constructor(
        container: HTMLElement, 
        entry: Entry, 
        plugin: BetterNotesPlugin,
        collection: Collection
    ) {
        this.container = container;
        this.entry = entry;
        this.plugin = plugin;
        this.collection = collection;
    }
    
    /**
     * 渲染卡片内容
     */
    public render(): void {
        // 清空容器
        this.container.empty();
        
        // 允许拖拽到 AI mention 区域
        this.container.setAttr('draggable', 'true');
        this.container.addEventListener('dragstart', (ev) => {
            const dt = ev.dataTransfer!;
            // 自定义 MIME：内部逻辑
            dt.setData('text/BetterNotes-entry', this.entry.hash);
            dt.effectAllowed = 'copy';
        });
        
        // 设置卡片背景色（使用所属集合的颜色，但透明度降低）
        this.container.style.backgroundColor = hexToRgba(this.collection.color, 0.7);
        
        // 添加条目哈希属性，用于在侧边栏中查找和高亮条目
        this.container.setAttribute('data-entry-hash', this.entry.hash);
        
        // 创建主内容区域
        const contentArea = this.container.createEl('div', { cls: 'BetterNotes-entry-content-area' });
        
        // 显示条目的文本内容
        const contentEl = contentArea.createEl('div', { cls: 'BetterNotes-entry-content' });
        contentEl.setText(this.entry.value);
        
        // 显示条目的评论/批注（如果有）
        if (this.entry.comment) {
            const commentEl = contentArea.createEl('div', { cls: 'BetterNotes-entry-comment' });
            commentEl.setText(this.entry.comment);
        }
        
        // ------- 附件栏渲染 -------
        // 如果有图片附件，则在批注下方显示缩略图
        if (this.entry.attachmentFile && this.entry.attachmentFile.length > 0) {
            // 过滤出图片类型的附件（简单按扩展名判断）
            const imageAttachments = this.entry.attachmentFile.filter(p => this.isImageFile(p));
            if (imageAttachments.length > 0) {
                const attachmentsEl = contentArea.createEl('div', { cls: 'BetterNotes-entry-attachments' });
                
                // 检查是否为需全宽显示的截图条目
                const isPdfRectEntry = this.entry.type === 'pdf' && this.entry.index?.includes('rect=');
                const isVideoTimestampEntry = this.entry.type === 'video' && this.entry.index?.includes('timestamp&&&');
                
                imageAttachments.forEach((path, index) => {
                    // 对于PDF矩形截图条目的第一张图，使用全宽显示
                    const isFullWidthImage = (isPdfRectEntry || isVideoTimestampEntry) && index === 0;
                    
                    const thumbEl = attachmentsEl.createEl('img', {
                        cls: isFullWidthImage ? 'BetterNotes-attachment-fullwidth' : 'BetterNotes-attachment-thumb',
                        attr: {
                            src: this.plugin.app.vault.adapter.getResourcePath(path),
                            alt: t('attachment image')
                        }
                    });
                    // 点击缩略图打开图片编辑器
                    thumbEl.addEventListener('click', (e) => {
                        e.stopPropagation(); // 阻止冒泡到卡片点击
                        this.openImageEditor(path);
                    });
                });
            }
        }
        
        // ----- 渲染标签（无论是否有图片） -----
        if (this.entry.tag && this.entry.tag.length > 0) {
            const tagsEl = contentArea.createEl('div', { cls: 'BetterNotes-entry-tags' });
            this.entry.tag.forEach(t => {
                const tagEl = tagsEl.createSpan('BetterNotes-entry-tag');
                tagEl.setText('#' + t);

                // 允许拖拽 tag 到 AI 聊天视图
                tagEl.setAttr('draggable', 'true');
                tagEl.addEventListener('dragstart', (ev) => {
                    ev.dataTransfer?.setData('text/BetterNotes-tag', t);
                    ev.dataTransfer!.effectAllowed = 'copy';
                });

                tagEl.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.plugin.activateSidebarView();
                    this.plugin.sidebarView?.goHome();
                    this.plugin.sidebarView?.getSearchBar()?.setSearch('#' + t);
                });
            });
        }
        
        // 创建底部区域
        const bottomArea = this.container.createEl('div', { cls: 'BetterNotes-entry-bottom-area' });
        
        // 创建左侧操作按钮区域
        const actionsEl = bottomArea.createEl('div', { cls: 'BetterNotes-entry-actions' });
        
        // 编辑按钮
        const editBtn = actionsEl.createEl('div', { cls: 'BetterNotes-entry-action' });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            this.openEditEntryModal();
        });
        
        /**
         * 批注按钮：点击后直接在卡片内联编辑 comment 字段
         */
        const annotationBtn = actionsEl.createEl('div', { cls: 'BetterNotes-entry-action' });
        // 使用 lucide icon "message-square" 代表批注
        setIcon(annotationBtn, 'message-square');
        annotationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openInlineCommentEditor(contentArea, annotationBtn);
        });
        
        /**
         * 链接操作按钮：点击后显示链接操作菜单
         */
        const linkActionBtn = actionsEl.createEl('div', { cls: 'BetterNotes-entry-action' });
        setIcon(linkActionBtn, 'download');
        linkActionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // 使用LinkService显示链接操作菜单
            this.plugin.linkService.showLinkMenu(this.entry, linkActionBtn);
        });
        
        /**
         * 双链按钮：点击后打开链接模态框
         */
        const internalLinkBtn = actionsEl.createEl('div', { cls: 'BetterNotes-entry-action' });
        // 使用 lucide icon "link-2" 代表双链
        setIcon(internalLinkBtn, 'link-2');
        
        // 如果有链接，添加链接数量指示器
        if (this.entry.link && this.entry.link.length > 0) {
            const linkCountBadge = internalLinkBtn.createSpan({ cls: 'BetterNotes-link-count-badge' });
            linkCountBadge.setText(this.entry.link.length.toString());
        }
        
        internalLinkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openLinkedEntriesModal();
        });
        
        // 删除按钮
        const deleteBtn = actionsEl.createEl('div', { cls: 'BetterNotes-entry-action' });
        setIcon(deleteBtn, 'trash');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            this.openDeleteEntryConfirm();
        });
        
        // 创建右侧信息区域
        const infoEl = bottomArea.createEl('div', { cls: 'BetterNotes-entry-info' });
        
        // 显示条目类型徽章
        const typeEl = infoEl.createEl('div', { cls: 'BetterNotes-entry-type' });
        const typeBadge = typeEl.createEl('span', { cls: 'BetterNotes-type-badge' });
        
        // 根据类型设置不同的文本和样式
        switch (this.entry.type) {
            case 'md':
                typeBadge.setText('M');
                break;
            case 'video':
                typeBadge.setText('V');
                break;
            case 'pdf':
                typeBadge.setText('P');
                break;
            case 'image':
                typeBadge.setText('I');
                break;
            default:
                typeBadge.setText(String(this.entry.type).charAt(0).toUpperCase());
        }
        
        // 添加类型样式类
        typeBadge.classList.add(`BetterNotes-type-${this.entry.type}`);
        
       
        
        // 为卡片添加点击事件，打开条目详情
        this.container.addEventListener('click', (e) => {
            // 如果点击的是按钮，不触发详情事件
            if (!(e.target as HTMLElement).closest('.BetterNotes-entry-action')) {
                this.naviToEntry();
            }
        });
        
        // 添加右键点击事件，用于内部链接
        this.container.addEventListener('contextmenu', async (e) => {
            e.preventDefault(); // 阻止默认右键菜单
            
            // 如果插件有内部链接服务，则处理右键点击
            if (this.plugin.internalLinkService) {
                await this.plugin.internalLinkService.handleEntryRightClick(this.entry);
            }
        });
        
        // 如果处于链接模式且当前条目是源条目，添加视觉提示
        const sourceHash = this.plugin.internalLinkService?.getLinkingSourceHash();
        if (sourceHash && sourceHash === this.entry.hash) {
            this.container.classList.add('BetterNotes-linking-source');
        }
    }
    
    /**
     * 打开链接模态框
     * 显示与当前条目相关的链接
     */
    private openLinkedEntriesModal(): void {
        const modal = new LinkedEntriesModal(this.plugin, this.entry);
        modal.open();
    }
    
    /**
     * 打开编辑条目模态框
     * 使用AnnotationModal进行编辑
     */
    private openEditEntryModal(): void {
        //console.log('编辑条目:', this.entry.hash);
        
        // 创建标注模态框，传入现有条目
        const modal = new AnnotationModal(this.plugin, {
            selectedText: this.entry.value,
            sourcePath: this.entry.sourceFile || '',
            entry: this.entry, // 传入现有条目
            onConfirm: async (updatedEntry) => {
                try {
                    // 更新条目
                    await this.plugin.updateEntry(this.entry.hash, updatedEntry);
                    
                    // 刷新视图
                    await this.plugin.refreshViews();
                    
                    
                    return Promise.resolve();
                } catch (error) {
                    console.error('更新条目失败:', error);
                    return Promise.reject(error);
                }
            }
        });
        
        // 打开模态框
        modal.open();
    }
    
    /**
     * 打开删除条目确认对话框
     */
    private openDeleteEntryConfirm(): void {
        /**
         * 立即删除条目
         * --------------------------------------------------
         * 原实现使用 `window.confirm` 进行二次确认，会打断用户的批量操作流。
         * 根据需求改为直接调用 `deleteEntry()`，保持删除逻辑单一入口，
         * 如需恢复确认框可在上层调用处自行包装。
         */
            this.deleteEntry();
    }
    
    /**
     * 删除当前条目
     */
    private async deleteEntry(): Promise<void> {
        try {
            const result = await this.plugin.deleteEntry(this.entry.hash);
            if (result) {
                // 移除DOM元素，平滑过渡
                this.container.style.opacity = '0';
                this.container.style.height = '0';
                
                setTimeout(() => {
                    this.container.remove();
                }, 300);
            }
        } catch (error) {
            console.error('删除条目失败:', error);
        }
    }
    
    /**
     * 
     * 跳转到条目在文档中的位置并高亮显示
     */
    private async naviToEntry(): Promise<void> {
        // 使用导航服务跳转到条目位置
        const entryNavigation = this.plugin.entryNavigation;
        if (entryNavigation) {
            await entryNavigation.navigateToEntry(this.entry);
        } else {
            console.error('导航服务未初始化');
        }
    }
    
    /**
     * 截断字符串
     * @param str 原字符串
     * @param maxLength 最大长度
     * @returns 截断后的字符串
     */
    private truncateString(str: string, maxLength: number): string {
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }
    
    /**
     * 判断路径是否为常见图片文件
     * @param path 文件路径
     */
    private isImageFile(path: string): boolean {
        return /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(path);
    }
    
    /**
     * 打开图片编辑器，并在保存后替换原附件文件，同时更新 Entry 数据并刷新视图
     * @param imagePath 图片在 Vault 中的路径
     */
    private openImageEditor(imagePath: string): void {
        const viewerModal = new ImageEditorModal(this.plugin, { imagePath });
        viewerModal.open();
    }
    
    /**
     * 打开/显示批注的内联编辑器
     * @param contentArea 条目主体内容区域 DOM 元素
     * @param triggerBtn 触发按钮，用于在编辑状态时禁用
     */
    private openInlineCommentEditor(contentArea: HTMLElement, triggerBtn: HTMLElement): void {
        // 若已存在编辑器，则不重复创建
        if (contentArea.querySelector('.BetterNotes-inline-comment-editor')) {
            return;
        }

        // 隐藏现有 comment 显示（如有）
        const existingComment = contentArea.querySelector('.BetterNotes-entry-comment') as HTMLElement | null;
        if (existingComment) existingComment.style.display = 'none';

        // 禁用触发按钮，避免重复点击
        triggerBtn.addClass('disabled');

        // 创建 textarea，放置在 comment 原位置，保持布局稳定
        const textarea = (existingComment
            ? existingComment.parentElement!.insertBefore(document.createElement('textarea'), existingComment)
            : contentArea.appendChild(document.createElement('textarea'))) as HTMLTextAreaElement;

        textarea.classList.add('BetterNotes-inline-comment-editor');
        textarea.value = this.entry.comment || '';

        // 自动聚焦并将光标置于文本末尾
        setTimeout(() => {
            textarea.focus();
            const len = textarea.value.length;
            textarea.setSelectionRange(len, len);
        }, 0);

        // 自动高度适配函数
        const autoResize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        };
        autoResize();
        textarea.addEventListener('input', autoResize);

        // 阻止事件冒泡，避免触发卡片点击导航
        const stop = (ev: Event) => ev.stopPropagation();
        textarea.addEventListener('click', stop);
        textarea.addEventListener('mousedown', stop);
        textarea.addEventListener('mouseup', stop);
        textarea.addEventListener('keydown', stop);

        // 保存逻辑：Enter 保存，Shift+Enter 换行
        textarea.addEventListener('keydown', async (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                await saveAndRender();
            }
        });

        // 失焦后自动保存
        textarea.addEventListener('blur', async () => {
            await saveAndRender();
        });

        /**
         * 保存批注并重新渲染条目。
         * 若内容未变则仅恢复 UI，不触发持久化。
         */
        const saveAndRender = async () => {
                const newComment = textarea.value.trim();
            // 若内容相同则直接刷新 UI
            if (newComment === (this.entry.comment || '')) {
                this.render();
                return;
            }
                try {
                    const updated = await this.plugin.updateEntry(this.entry.hash, { comment: newComment });
                    this.entry = updated;
                    this.render();
                } catch (err) {
                    console.error(err);
                }
        };

        

        // 若有旧 comment 元素，移除它
        if (existingComment) existingComment.remove();

        /*************** 粘贴图片处理 *****************/
        const attachmentService = new AttachmentService(this.plugin.app);
        textarea.addEventListener('paste', async (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const hasImage = Array.from(e.clipboardData.files).some(f => f.type.startsWith('image/'));
            if (!hasImage) return; // 非图片粘贴，忽略

            e.preventDefault();
            const imagePaths = await attachmentService.handlePastedImages(e);
            if (imagePaths.length > 0) {
                const merged = [...(this.entry.attachmentFile || []), ...imagePaths];
                // 更新条目
                const updated = await this.plugin.updateEntry(this.entry.hash, { attachmentFile: merged });
                this.entry = updated;
                // 重新渲染以显示缩略图
                this.render();
            }
        });

        // 清理函数在重新渲染后自动执行（render 调用会重新构建 DOM）
    }
} 