import { Modal, Notice } from 'obsidian';
import BetterNotesPlugin from '../main';
import { t } from '../i18n';

/**
 * ImageEditorModalOptions 接口
 * imagePath: 原始 Vault 路径（绝对路径或相对 Vault）
 * imageUrl: 浏览器可访问的 url(若已知)，若未传则通过 app.vault.adapter.getResourcePath(imagePath) 自动生成
 * onSave: （可选）保存回调，参数 dataUrl 为当前图片的 base64 数据。
 */
export interface ImageEditorModalOptions {
    imagePath: string;
    imageUrl?: string;
    onSave?: (dataUrl: string) => Promise<void> | void;
}

/**
 * ImageEditorModal —— 轻量级图片查看器
 * -----------------------------------------------------------
 * • 使用 <img> 元素呈现图片；
 * • 绑定滚轮事件以进行缩放；
 * • 绑定鼠标拖拽以平移视图；
 * • 若传入 onSave，则提供"保存"按钮，点击后把当前图片的 DataURL 返回。
 *   当前实现不提供编辑功能，因此返回的即为原图数据。
 */
export class ImageEditorModal extends Modal {
    private plugin: BetterNotesPlugin;
    private options: ImageEditorModalOptions;

    // 状态
    private scale = 1;
    private translateX = 0;
    private translateY = 0;

    constructor(plugin: BetterNotesPlugin, options: ImageEditorModalOptions) {
        super(plugin.app);
        this.plugin = plugin;
        this.options = options;
    }

    /**
     * Modal 打开时渲染内容
     */
    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        // 调整整体模态框大小
        modalEl.style.width = '90vw';
        modalEl.style.height = '90vh';
        modalEl.style.maxWidth = '90vw';
        modalEl.style.maxHeight = '90vh';

        contentEl.style.width = '100%';
        contentEl.style.height = '100%';
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        contentEl.style.overflow = 'hidden';

        // 图片容器（用于平移/缩放）
        const imgWrapper = contentEl.createDiv();
        imgWrapper.style.flex = '1';
        imgWrapper.style.position = 'relative';
        imgWrapper.style.overflow = 'hidden';

        // 创建图片元素
        const imgEl = imgWrapper.createEl('img');
        imgEl.style.userSelect = 'none';
        imgEl.style.pointerEvents = 'all';
        imgEl.style.position = 'absolute';
        imgEl.style.top = '50%';
        imgEl.style.left = '50%';
        imgEl.style.transform = 'translate(-50%, -50%) scale(1)';
        imgEl.style.transformOrigin = 'center center';
        imgEl.style.maxWidth = 'none';
        imgEl.style.maxHeight = 'none';
        // 禁用浏览器/Obsidian 默认拖拽行为
        imgEl.setAttr('draggable', 'false');
        imgEl.addEventListener('dragstart', (e) => e.preventDefault());

        // 生成可访问 URL
        const imageUrl =
            this.options.imageUrl ?? this.plugin.app.vault.adapter.getResourcePath(this.options.imagePath);
        imgEl.src = imageUrl;

        // 缩放逻辑
        imgWrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.scale = Math.min(10, Math.max(0.1, this.scale + delta));
            this.applyTransform(imgEl);
        });

        // 拖拽逻辑 (使用 pointer 事件，保证按下拖拽，松开结束)
        imgWrapper.style.cursor = 'grab';
        imgWrapper.addEventListener('pointerdown', (e) => {
            e.preventDefault(); // 阻止默认拖拽启动
            // 仅响应主键（通常是左键）
            if (e.button !== 0) return;
            imgWrapper.style.cursor = 'grabbing';
            imgWrapper.setPointerCapture(e.pointerId);

            const onMove = (ev: PointerEvent) => {
                // 使用 movementX/Y 直接获得增量
                this.translateX += ev.movementX;
                this.translateY += ev.movementY;
                this.applyTransform(imgEl);
            };

            const onUp = (ev: PointerEvent) => {
                if (ev.pointerId !== e.pointerId) return;
                imgWrapper.releasePointerCapture(e.pointerId);
                imgWrapper.style.cursor = 'grab';
                imgWrapper.removeEventListener('pointermove', onMove);
                imgWrapper.removeEventListener('pointerup', onUp);
            };

            imgWrapper.addEventListener('pointermove', onMove);
            imgWrapper.addEventListener('pointerup', onUp);
        });

        // 按钮区域
        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '12px';
        btnContainer.style.marginTop = '8px';

        // 关闭按钮
        const closeBtn = btnContainer.createEl('button', { text: t('close') });
        closeBtn.classList.add('BetterNotes-btn');
        closeBtn.addEventListener('click', () => this.close());

        // 如果有 onSave 回调，则显示保存按钮，保存原图数据
        if (this.options.onSave) {
            const saveBtn = btnContainer.createEl('button', { text: t('save') });
            saveBtn.classList.add('BetterNotes-btn', 'BetterNotes-btn-primary');
            saveBtn.addEventListener('click', async () => {
                try {
                    const dataUrl = await this.convertImgToDataUrl(imgEl);
                    await Promise.resolve(this.options.onSave!(dataUrl));
                    this.close();
                } catch (err) {
                    console.error('[BetterNotes] convert image to DataURL failed', err);
                    new Notice(t('save image failed'));
                }
            });
        }
    }

    /**
     * 应用缩放和平移变换
     */
    private applyTransform(imgEl: HTMLImageElement) {
        imgEl.style.transform = `translate(-50%, -50%) translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }

    /**
     * 将 <img> 元素转换为 DataURL（无编辑功能，因此直接复制原图）
     */
    private async convertImgToDataUrl(img: HTMLImageElement): Promise<string> {
        // image 可能尚未加载完成
        if (!img.complete) {
            await new Promise((res) => {
                img.addEventListener('load', res, { once: true });
            });
        }

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(t('cannot get canvas context'));
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
} 