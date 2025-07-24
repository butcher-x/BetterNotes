import { Modal, setIcon, Setting, Notice, TFile } from 'obsidian';
import BetterNotesPlugin from '../main';
import { Collection } from '../models/Collection';
import { Entry } from '../models/Entry';
import { AttachmentService } from '../services/AttachmentService';
import { ImageEditorModal } from './ImageEditorModal';
import { t } from '../i18n';

/**
 * 标注模态框配置接口
 */
export interface AnnotationModalOptions {
    selectedText: string;  // 选中的文本
    sourcePath: string;    // 源文件路径
    onConfirm: (entry: Partial<Entry>) => Promise<void>;  // 确认回调
    entry?: Entry;  // 可选的现有条目，用于编辑模式
}

/**
 * 标注模态框组件
 * 用于将选中的文本添加到集合中，支持添加批注、标签等
 * 也可用于编辑现有条目
 */
export class AnnotationModal extends Modal {
    private plugin: BetterNotesPlugin;
    private options: AnnotationModalOptions;
    private attachmentService: AttachmentService;
    
    // 表单数据
    private selectedText: string;
    private selectedCollection: string = '';
    private comments: string = '';
    private tags: string[] = [];
    private attachmentFiles: string[] = []; // 附件文件路径
    // 待删除的附件文件路径（在点击删除按钮时仅入队，待保存时再真正删除）
    private attachmentsToDelete: string[] = [];
    private isEditMode: boolean = false; // 是否为编辑模式
    private editingEntry: Entry | null = null; // 正在编辑的条目
    
    // 集合列表
    private collections: Collection[] = [];
    
    // 所有可用标签
    private availableTags: string[] = [];
    
    // 图片预览容器
    private imagesPreviewContainer: HTMLElement | null = null;
    
    /**
     * 构造函数
     * @param plugin 插件实例
     * @param options 模态框配置选项
     */
    constructor(plugin: BetterNotesPlugin, options: AnnotationModalOptions) {
        super(plugin.app);
        this.plugin = plugin;
        this.options = options;
        this.selectedText = options.selectedText;
        this.attachmentService = new AttachmentService(plugin.app);
        
        // 判断是否为编辑模式
        if (options.entry) {
            this.isEditMode = true;
            this.editingEntry = options.entry;
            this.selectedText = options.entry.value;
            this.selectedCollection = options.entry.set;
            this.comments = options.entry.comment || '';
            this.tags = options.entry.tag ? [...options.entry.tag] : [];
            this.attachmentFiles = options.entry.attachmentFile ? [...options.entry.attachmentFile] : [];
        }
        
        // 加载所有可用标签
        this.loadAvailableTags();
    }
    
    /**
     * 加载所有可用标签
     * 从现有条目中提取所有已使用的标签
     */
    private loadAvailableTags(): void {
        const tags = this.plugin.dataManager.getAllTags();
        this.availableTags = tags.map(t => t.tagName);
    }
    
    /**
     * 渲染模态框内容
     */
    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.classList.add('BetterNotes-modal');
        
        // 标题区域
        const headerEl = contentEl.createDiv('BetterNotes-modal-header');
        
        
        // 创建表单容器
        const formEl = contentEl.createDiv('BetterNotes-modal-form');
        
        // 选中的文本
        const valueContainer = formEl.createDiv('BetterNotes-input-container');
        valueContainer.createEl('label', { text: t('Front') });
        const valueInput = valueContainer.createEl('textarea');
        valueInput.classList.add('BetterNotes-input');
        valueInput.style.minHeight = '60px';
        valueInput.style.resize = 'vertical';
        // 直接设置文本内容
        valueInput.value = this.selectedText;
        valueInput.addEventListener('input', () => {
            this.selectedText = valueInput.value;
        });
        
        // 获取所有集合（仅类型为set的）
        this.collections = this.plugin.dataManager.getAllCollections()
            .filter(c => c.type === 'set')
            .sort((a, b) => a.name.localeCompare(b.name));
        
        // 选择集合
        const collectionContainer = formEl.createDiv('BetterNotes-input-container');
        collectionContainer.createEl('label', { text: t('Collection') });
        
        // 创建集合标签容器
        const collectionTagsContainer = collectionContainer.createDiv('BetterNotes-folder-tags-container');
        
        // 添加集合标签
        this.collections.forEach(collection => {
            const collectionTag = collectionTagsContainer.createDiv('BetterNotes-folder-tag');
            
            // 设置标签背景色为集合颜色的浅色版本
            const collectionColor = collection.color;
            collectionTag.style.backgroundColor = this.adjustColorOpacity(collectionColor, 0.2);
            collectionTag.style.borderColor = collectionColor;
            
            // 添加集合图标
            const collectionIconEl = collectionTag.createSpan('BetterNotes-folder-tag-icon');
            setIcon(collectionIconEl, 'note');
            collectionIconEl.style.color = collectionColor;
            
            // 添加集合名称
            collectionTag.createSpan('BetterNotes-folder-tag-name').setText(collection.name);
            
            // 如果是编辑模式且当前集合已选中，添加选中样式
            if (this.isEditMode && this.selectedCollection === collection.name) {
                collectionTag.classList.add('selected');
            }
            
            // 添加点击事件
            collectionTag.addEventListener('click', () => {
                // 移除所有标签的选中状态
                document.querySelectorAll('.BetterNotes-folder-tag').forEach(el => {
                    el.classList.remove('selected');
                });
                
                // 选中当前标签
                collectionTag.classList.add('selected');
                this.selectedCollection = collection.name;
            });
        });
        
        // 批注
        const commentsContainer = formEl.createDiv('BetterNotes-input-container');
        commentsContainer.createEl('label', { text: t('Back') });
        const commentsInput = commentsContainer.createEl('textarea', { 
            placeholder: t('add your comments...')
        });
        commentsInput.classList.add('BetterNotes-input');
        commentsInput.style.minHeight = '80px';
        commentsInput.style.resize = 'vertical';
        // 如果是编辑模式，设置批注内容
        if (this.isEditMode && this.comments) {
            commentsInput.value = this.comments;
        }
        commentsInput.addEventListener('input', () => {
            this.comments = commentsInput.value;
        });
        
        // 添加粘贴事件监听器
        commentsInput.addEventListener('paste', async (e) => {
            // 如果粘贴的内容包含图片，处理图片
            if (e.clipboardData && e.clipboardData.files.length > 0) {
                // 保存粘贴的图片
                const imagePaths = await this.attachmentService.handlePastedImages(e);
                
                if (imagePaths.length > 0) {
                    // 添加到附件文件列表
                    this.attachmentFiles = [...this.attachmentFiles, ...imagePaths];
                    
                    // 显示图片预览
                    this.renderImagePreviews(formEl);
                    
                    // 显示通知
                    new Notice(t('added') + ' ' + imagePaths.length + ' ' + t('images'));
                }
            }
        });
        
        // 创建图片预览容器
        this.imagesPreviewContainer = formEl.createDiv('BetterNotes-images-preview-container');
        this.imagesPreviewContainer.style.display = 'none'; // 初始隐藏
        
        // 如果是编辑模式且有附件，显示图片预览
        if (this.isEditMode && this.attachmentFiles.length > 0) {
            this.renderImagePreviews(formEl);
        }
        
        // 标签
        const tagsContainer = formEl.createDiv('BetterNotes-input-container');
        tagsContainer.createEl('label', { text: t('Tags') });
        
        // 创建标签容器
        const tagsGridContainer = tagsContainer.createDiv('BetterNotes-tags-grid-container');
        
        // 渲染所有可用标签
        this.renderAvailableTags(tagsGridContainer);
        
        // 自定义标签输入
        const customTagContainer = tagsContainer.createDiv('BetterNotes-custom-tag-container');
        const customTagInput = customTagContainer.createEl('input', {
            type: 'text',
            placeholder: t('add custom tags...')
        });
        customTagInput.classList.add('BetterNotes-input');
        
        const addTagBtn = customTagContainer.createEl('button', { text: t('add') });
        addTagBtn.classList.add('BetterNotes-btn');
        
        // 添加自定义标签
        addTagBtn.addEventListener('click', () => {
            const tag = customTagInput.value.trim();
            if (tag) {
                // 如果标签不在可用标签列表中，添加到列表中
                if (!this.availableTags.includes(tag)) {
                    // 将新标签保存到全局 DataManager，方便后续模态框直接读取
                    this.plugin.dataManager.ensureTag(tag);

                    this.availableTags.push(tag);
                    this.availableTags.sort();
                    
                    // 重新渲染标签列表
                    tagsGridContainer.empty();
                    this.renderAvailableTags(tagsGridContainer);
                }
                
                // 选中新添加的标签
                if (!this.tags.includes(tag)) {
                    this.tags.push(tag);
                    
                    // 更新标签选中状态
                    const tagElements = tagsGridContainer.querySelectorAll('.BetterNotes-tag');
                    tagElements.forEach(el => {
                        if (el.textContent === tag) {
                            el.classList.add('selected');
                        }
                    });
                }
                
                // 清空输入框
                customTagInput.value = '';
            }
        });
        
        
        // 按钮容器
        const buttonContainer = contentEl.createDiv();
        buttonContainer.classList.add('BetterNotes-modal-buttons');
        
        // 取消按钮
        const cancelButton = buttonContainer.createEl('button', { text: t('cancel') });
        cancelButton.classList.add('BetterNotes-btn');
        cancelButton.addEventListener('click', () => {
            this.close();
        });
        
        // 确认按钮
        const confirmButton = buttonContainer.createEl('button', { 
            text: this.isEditMode ? t('save changes') : t('save annotation') 
        });
        confirmButton.classList.add('BetterNotes-btn', 'BetterNotes-btn-primary');
        confirmButton.addEventListener('click', () => {
            if (this.selectedCollection) {
                // 构造条目更新 / 创建对象
                const entry: Partial<Entry> = {
                    value: this.selectedText.trim() || '',
                    set: this.selectedCollection,
                    comment: this.comments,
                    tag: this.tags,
                    sourceFile: this.options.sourcePath,
                    attachmentFile: this.attachmentFiles // 附件文件路径
                } as Partial<Entry>;
                
                // 仅在新建模式下设置默认类型为 markdown；
                // 编辑模式保持原有类型，避免被错误覆盖。
                if (!this.isEditMode) {
                    entry.type = "md";
                }
                
                // 如果是编辑模式，添加hash
                if (this.isEditMode && this.editingEntry) {
                    entry.hash = this.editingEntry.hash;
                    // 若需要同步保持原条目类型，可显式赋值
                    entry.type = this.editingEntry.type;
                }
                
                // 调用确认回调
                this.options.onConfirm(entry).then(async () => {
                    // 在保存成功后再真正删除标记的附件文件
                    await this.deleteMarkedAttachments();
                    this.close();
                }).catch(error => {
                    console.error('保存标注失败:', error);
                    // 显示错误消息
                    const errorMsg = formEl.createEl('div', {
                        text: t('save failed') + ': ' + error.message,
                        cls: 'BetterNotes-error'
                    });
                    
                    // 2秒后移除错误消息
                    setTimeout(() => {
                        errorMsg.remove();
                    }, 2000);
                });
            } else {
                // 显示错误消息
                const errorMsg = formEl.createEl('div', {
                    text: t('please select a collection'),
                    cls: 'BetterNotes-error'
                });
                
                // 2秒后移除错误消息
                setTimeout(() => {
                    errorMsg.remove();
                }, 2000);
            }
        });
    }
    
    /**
     * 渲染图片预览
     * @param container 容器元素
     */
    private renderImagePreviews(container: HTMLElement): void {
        if (!this.imagesPreviewContainer) return;
        
        // 清空预览容器
        this.imagesPreviewContainer.empty();
        
        // 如果没有图片，隐藏容器
        if (this.attachmentFiles.length === 0) {
            this.imagesPreviewContainer.style.display = 'none';
            return;
        }
        
        // 显示容器
        this.imagesPreviewContainer.style.display = 'flex';
        
        
        // 创建图片网格容器
        const gridEl = this.imagesPreviewContainer.createDiv('BetterNotes-images-preview-grid');
        
        // 添加每张图片的预览
        this.attachmentFiles.forEach((path, index) => {
            // 创建图片预览项
            const previewItem = gridEl.createDiv('BetterNotes-image-preview-item');
            
            // 创建图片容器
            const imageContainer = previewItem.createDiv('BetterNotes-image-container');
            
            // 创建图片元素
            const imgEl = imageContainer.createEl('img', { 
                cls: 'BetterNotes-preview-image',
                attr: {
                    src: this.plugin.app.vault.adapter.getResourcePath(path),
                    alt: t('attachment image') + ' ' + (index + 1)
                }
            });
            
            // 点击图片打开编辑器
            imgEl.addEventListener('click', () => {
                const viewerModal = new ImageEditorModal(this.plugin, { imagePath: path });
                viewerModal.open();
            });
            
            // 创建删除按钮
            const deleteBtn = previewItem.createDiv('BetterNotes-image-delete-btn');
            setIcon(deleteBtn, 'trash');
            
            // 添加删除事件（仅将文件标记为待删除，不立即删除）
            deleteBtn.addEventListener('click', () => {
                const normPath = path.startsWith('/') ? path.slice(1) : path;
                // 记录待删除
                if (!this.attachmentsToDelete.includes(normPath)) {
                    this.attachmentsToDelete.push(normPath);
                }
                // 从附件列表中移除
                this.attachmentFiles = this.attachmentFiles.filter(p => p !== path && p !== normPath);
                // 重新渲染预览
                this.renderImagePreviews(container);
            });
            
            // 添加图片路径显示
            const pathEl = previewItem.createDiv('BetterNotes-image-path');
            pathEl.setText(path);
        });
    }
    
    /**
     * 渲染所有可用标签
     * @param container 标签容器元素
     */
    private renderAvailableTags(container: HTMLElement): void {
        // 创建标签网格
        const tagsGrid = container.createDiv('BetterNotes-tags-grid');
        
        // 渲染所有可用标签
        this.availableTags.forEach(tag => {
            const tagEl = tagsGrid.createDiv('BetterNotes-tag');
            tagEl.setText(tag);
            
            // 如果标签已选中，添加选中样式
            if (this.tags.includes(tag)) {
                tagEl.classList.add('selected');
            }
            
            // 添加点击事件
            tagEl.addEventListener('click', () => {
                if (tagEl.classList.contains('selected')) {
                    // 如果已选中，则取消选中
                    tagEl.classList.remove('selected');
                    this.tags = this.tags.filter(t => t !== tag);
                } else {
                    // 如果未选中，则选中
                    tagEl.classList.add('selected');
                    if (!this.tags.includes(tag)) {
                        this.tags.push(tag);
                    }
                }
                
                
            });
        });
    }
    
    
    
    /**
     * 调整颜色的透明度
     * @param color 原始颜色（十六进制格式）
     * @param opacity 目标透明度（0-1之间）
     * @returns 调整透明度后的颜色（rgba格式）
     */
    private adjustColorOpacity(color: string, opacity: number): string {
        // 移除可能的 # 前缀
        const hex = color.replace('#', '');
        
        // 将十六进制转换为 RGB
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // 返回 rgba 格式
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    
    /**
     * 关闭模态框
     */
    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    /**
     * 真正执行已标记的附件删除操作
     */
    private async deleteMarkedAttachments(): Promise<void> {
        if (this.attachmentsToDelete.length === 0) return;

        for (const p of this.attachmentsToDelete) {
            try {
                const file = this.plugin.app.vault.getAbstractFileByPath(p);
                if (file instanceof TFile) {
                    await this.plugin.app.vault.delete(file);
                }
            } catch (e) {
                console.error('删除附件文件失败:', e);
            }
        }

        // 清空队列
        this.attachmentsToDelete = [];
    }
} 