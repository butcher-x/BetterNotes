import { App, Notice, TFile } from 'obsidian';
import BetterNotesPlugin from '../../main';
import { RectHighlightManager } from './RectHighlightManager';
import { t } from '../../i18n';
/**
 * PdfRectCaptureService
 * -------------------------------------------------------------------
 * 当用户按下预设快捷键后，在当前活动的 PDF 视图中进入「矩形截取」模式：
 * 1. 鼠标拖拽选择任意矩形区域（显示虚线框）。
 * 2. 结束拖拽后，截取该区域的 PNG 图片（以 2×scale 渲染）。
 * 3. 将图片保存至当前 Vault 的附件文件夹（遵从用户设置）。
 * 4. 同时在当前光标位置/新建笔记插入指向该图片的 Markdown 链接（交由调用者处理）。
 *
 * 该服务仅提供 `startCapture()` 方法，不长期驻留事件，
 * 使用完毕后立刻清理所有临时元素和事件监听以降低耦合。
 */
export class PdfRectCaptureService {
  private readonly app: App;
  private readonly plugin: BetterNotesPlugin;

  private readonly highlightManager = new RectHighlightManager();

  constructor(app: App, plugin: BetterNotesPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * 入口：启动一次矩形截取流程。
   * 若当前活动面板不是 PDF，则会给出提示并直接返回。
   */
  public startCapture(): void {
    // 1) 必须先在 SetSelectionBar 中选择集合
    const selectedSet = this.plugin.setSelectionService?.getSelected?.();
    if (!selectedSet) {
      new Notice(t('please select a set first'));
      return;
    }

    const leaf = this.app.workspace.activeLeaf;
    // @ts-ignore Obsidian 的私有属性访问
    const child: any = (leaf as any)?.view?.viewer?.child;
    const pdfContainer: HTMLElement | undefined = (leaf as any)?.view?.containerEl;
    const file: TFile | undefined = (leaf as any)?.view?.file;
    if (!child || !pdfContainer || !file || file.extension !== 'pdf') {
      new Notice(t('current view is not pdf view'));
      return;
    }

    // 进入选取模式：改变鼠标指针 + 禁用原生选区
    pdfContainer.style.cursor = 'crosshair';

    let startX = 0,
      startY = 0,
      marquee: HTMLElement | null = null;

    // 注入样式并立即添加 class，保证在按下前也保持十字光标
    const ensureSelectionStyle = () => {
      if (document.getElementById('BetterNotes-pdf-selecting-style')) return;
      const style = document.createElement('style');
      style.id = 'BetterNotes-pdf-selecting-style';
      style.textContent = `
      .BetterNotes-pdf-selecting *{cursor:crosshair !important;user-select:none !important;-webkit-user-select:none !important;}
      .BetterNotes-pdf-selecting .textLayer{pointer-events:none;}`;
      document.head.appendChild(style);
    };

    ensureSelectionStyle();
    pdfContainer.classList.add('BetterNotes-pdf-selecting');

    const onPointerDown = (evt: PointerEvent) => {
      if (!(evt.target instanceof HTMLElement)) return;
      // 仅当点击在 PDF viewer 区域中时才继续
      if (!evt.target.closest('.pdf-embed, .pdf-viewer-container, .page')) return;

      startX = evt.clientX;
      startY = evt.clientY;
      marquee = document.body.createDiv({ cls: 'BetterNotes-select-box' });


      Object.assign(marquee.style, {
        position: 'fixed',
        border: '2px dashed #3a7bfc',
        background: 'rgba(58,123,252,0.1)',
        zIndex: 9999,
        left: `${startX}px`,
        top: `${startY}px`,
      });

      const onMove = (e: PointerEvent) => {
        const x = e.clientX,
          y = e.clientY;
        const rectLeft = Math.min(x, startX),
          rectTop = Math.min(y, startY),
          w = Math.abs(x - startX),
          h = Math.abs(y - startY);
        Object.assign(marquee!.style, {
          left: `${rectLeft}px`,
          top: `${rectTop}px`,
          width: `${w}px`,
          height: `${h}px`,
        });
      };

      const onUp = async (e: PointerEvent) => {
        window.getSelection()?.empty?.();
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        pdfContainer.style.cursor = '';
        pdfContainer.classList.remove('BetterNotes-pdf-selecting');
        if (!marquee) return;
        const box = marquee.getBoundingClientRect();
        marquee.remove();

        // 计算选择中心点所属 page
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;
        const elAtCenter = document.elementFromPoint(centerX, centerY);
        const pageEl = elAtCenter?.closest?.('.page') as HTMLElement | null;
        if (!pageEl || !pageEl.dataset.pageNumber) return;
        const pageNumber = Number(pageEl.dataset.pageNumber);

        const pageView = child.getPage(pageNumber);
        //console.log("chilxxxxxx",child);
        //console.log("pageView",pageView);
        if (!pageView) return;

        try {
          const rectPdf = this.browserRectToPdfRect(box, pageEl, pageView);
          const rectArr = (rectPdf as [number, number, number, number]).map((v) => Math.round(v)) as [number, number, number, number];

          // 保存截图到附件
          const pngPath = await this.renderAndSaveCroppedPng(file, pageView, rectArr, pageNumber);

          // 尝试保存额外的裁剪图片
          
          // 准备附件数组
          const attachments: string[] = [];
          if (pngPath) attachments.push(pngPath);

          // ---------------- 创建条目 ----------------
          try {
            const indexLink = `${file.path}#page=${pageNumber}&rect=${rectArr.join(',')}`;
            // 创建条目并将截图路径添加到附件数组
            const entry = await this.plugin.createEntry('', selectedSet, {
              comment: '',
              sourceFile: file.path,
              type: 'pdf',
              index: indexLink,
              attachmentFile: attachments
            });
            // 自动导航至评论视图并高亮该条目
            await this.plugin.navigateToEntryInComments(entry);

            // ----- 记录并绘制矩形（带 hash） -----
            const viewer = (leaf as any)?.view?.viewer;
            const mgr: RectHighlightManager = this.plugin.rectHighlightManager;
            if (viewer && !viewer.__snRectMgr) viewer.__snRectMgr = mgr;
            mgr.addRect(file.path, pageNumber, rectArr, entry.hash, pageView);
          } catch (e) {
            console.error('PdfRectCaptureService createEntry error', e);
          }
        } catch (err) {
          console.error('PdfRectCaptureService: saveCroppedPng error', err);
          new Notice(t('save cropped png failed'));
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp, { once: true });
    };

    // 监听一次 pointerdown，完成后自动移除
    pdfContainer.addEventListener('pointerdown', onPointerDown, { once: true });
  }

  /**
   * 将浏览器坐标系下的 DOMRect 转换为 PDF 坐标系 Rect
   * 返回 [x1, y1, x2, y2]，对应左、下、右、上 (PDF 坐标系 y 轴向上)
   */
  private browserRectToPdfRect(box: DOMRect, pageEl: HTMLElement, pageView: any): [number, number, number, number] {
    const style = window.getComputedStyle(pageEl);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;

    const pageRect = pageEl.getBoundingClientRect();
    const local = (clientX: number, clientY: number) => [
      clientX - (pageRect.left + borderLeft + paddingLeft),
      clientY - (pageRect.top + borderTop + paddingTop),
    ];

    const [lx1, ly1] = local(box.left, box.top);
    const [lx2, ly2] = local(box.right, box.bottom);

    const [x1, y1] = pageView.viewport.convertToPdfPoint(lx1, ly1);
    const [x2, y2] = pageView.viewport.convertToPdfPoint(lx2, ly2);

    // 归一化到 [left,bottom,right,top]
    return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
  }

  /**
   * 将整个页面以指定 scale 渲染到 canvas，然后裁剪 rect ，保存 PNG
   * @returns 返回保存后的文件路径（相对 Vault 根目录），失败返回空字符串
   */
  private async renderAndSaveCroppedPng(
    origPdf: TFile,
    pageView: any,
    rect: [number, number, number, number],
    pageNumber: number
  ): Promise<string> {
    const pdfPage = pageView.pdfPage;
    // 渲染倍率：2 倍，保证清晰度，但避免体积过大
    const scale = 2;
    const renderVp = pdfPage.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = renderVp.width;
    canvas.height = renderVp.height;
    const ctx = canvas.getContext('2d')!;

    await pdfPage.render({ canvasContext: ctx, viewport: renderVp }).promise;

    // PDF 原始 viewBox: [x0,y0,x1,y1]
    const viewBox = pdfPage.view;

    const [x1, y1, x2, y2] = rect;
    const crop = {
      sx: (x1 - viewBox[0]) * scale,
      sy: (viewBox[3] - y2) * scale, // y 轴翻转
      sw: (x2 - x1) * scale,
      sh: (y2 - y1) * scale,
    };

    if (crop.sw <= 0 || crop.sh <= 0) throw new Error('invalid crop size');

    const outCanvas = document.createElement('canvas');
    outCanvas.width = crop.sw;
    outCanvas.height = crop.sh;
    outCanvas.getContext('2d')!.drawImage(canvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

    const blob: Blob = await new Promise((res) => outCanvas.toBlob((b) => res(b!), 'image/png'));
    const arrayBuffer = await blob.arrayBuffer();

    // ---------- 保存到附件文件夹 ----------
    const { AttachmentService } = await import('../AttachmentService');
    const svc = new AttachmentService(this.app);
    // 防止文件名冲突
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${origPdf.basename} p${pageNumber} ${timestamp}-front.png`;

    const targetPath = await svc.saveBinaryAttachment(fileName, arrayBuffer);
    return targetPath;
  }

  
} 