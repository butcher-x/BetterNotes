import { App, TFile, WorkspaceLeaf } from 'obsidian';
import { PdfSelectionService } from './PdfSelectionService';
import { PdfIOService } from './PdfIOService';
import { rectsToQuadPoints } from '../../utils/pdfUtils';
import { capturePdfViewerState, restorePdfViewerState, PdfViewerState } from '../../utils/pdfViewState';
import BetterNotesPlugin from '../../main';
import { generateHash, hexToRgba } from '../../utils/utils';

/**
 * 在 Obsidian 中监听 PDF 选区并自动写入 Highlight 注释。
 * 该类自身不继承 Plugin，而是作为一个可插拔服务，由主插件持有。
 */
export class PdfBacklinkHighlighter {
  private currentPdfContainerEl?: HTMLElement;
  private currentPdfFile?: TFile;
  private currentChild?: any; // pdf.js ViewerChild

  private readonly selectionService = new PdfSelectionService();
  private readonly annotationService: PdfIOService;

  // 记录已绑定的 pointer 事件，方便后续解绑
  private boundPointerDown?: (ev: PointerEvent) => void;

  /**
   * 控制是否将高亮写入 PDF（内嵌注释）
   * 若为 false，则仅绘制到 `BetterNotes-rect-highlight-layer` 图层，不修改 PDF 文件。
   * 可通过 `setUseEmbeddedHighlights` 动态切换。
   */
  private useEmbeddedHighlights = true;

  /**
   * 切换高亮模式
   * @param value true = 内嵌高亮，false = 图层高亮
   */
  public setUseEmbeddedHighlights(value: boolean) {
    this.useEmbeddedHighlights = value;
  }

  constructor(private readonly app: App, private readonly plugin: BetterNotesPlugin) {
    this.annotationService = new PdfIOService(app);
    this.initialize();
  }

  /**
   * 初始化工作区监听。
   */
  private initialize() {
    // `register` 由主插件传入，用于在插件卸载时自动清理事件
    this.plugin.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
        this.handleActiveLeafChange(leaf);
      })
    );
  }

  /**
   * 清理已绑定到 PDF 容器的事件。
   */
  private cleanupPdfContainerEvents() {
    if (this.currentPdfContainerEl && this.boundPointerDown) {
      this.currentPdfContainerEl.removeEventListener('pointerdown', this.boundPointerDown);
    }
    this.currentPdfContainerEl = undefined;
    this.currentPdfFile = undefined;
    this.currentChild = undefined;
    this.boundPointerDown = undefined;
  }

  private handleActiveLeafChange(leaf: WorkspaceLeaf | null) {
    // 先清理上一 PDF 容器的事件
    this.cleanupPdfContainerEvents();

    if (!leaf) return;

    // 仅处理 PDF 文件
    const file = (leaf as any)?.view?.file as TFile | undefined;
    if (!file || file.extension !== 'pdf') return;

    const container = (leaf as any)?.view?.containerEl as HTMLElement | undefined;
    const child = (leaf as any)?.view?.viewer?.child;
    if (!container) return;

    this.currentPdfContainerEl = container;
    this.currentPdfFile = file;
    this.currentChild = child;

    // -------------- 注册 pointer 事件 --------------
    this.boundPointerDown = () => {
      const onPointerUp = () => {
        this.handleSelection();
        this.currentPdfContainerEl?.removeEventListener('pointerup', onPointerUp);
      };
      this.currentPdfContainerEl?.addEventListener('pointerup', onPointerUp, { once: true });
    };

    container.addEventListener('pointerdown', this.boundPointerDown);
  }

  /**
   * 在 pointerup 后获取选区并写入注释。
   */
  private async handleSelection() {
    if (!this.currentPdfContainerEl) return;
    const sel = (window as any).getSelection?.() as Selection | null;
    if (!sel || sel.isCollapsed) return;

    const selectedText = sel.toString();
    if (!selectedText) return;

    // 若未选择集合，直接退出（不写注释，不创建条目）
    const selectedSet = this.plugin.setSelectionService?.getSelected?.();
    if (!selectedSet) return;

    const info = this.selectionService.getPageAndTextRange(sel);
    if (!info || !info.selection) return;

    const pageEl = this.selectionService.getPageElementFromSelection(sel);
    if (!pageEl) return;

    const pageView = this.currentChild?.getPage?.(info.page);
    const rects = this.selectionService.computeRectsForSelection(pageEl, info.selection, pageView);
    if (!rects.length) return;

    const quad = rectsToQuadPoints(rects);

    if (!this.currentPdfFile) return;

    if (this.useEmbeddedHighlights) {
      // ---------------- 内嵌高亮 ----------------
      // 获取集合颜色
      let color = '#ffff00';
      if (selectedSet && this.plugin.dataManager) {
        const collection = this.plugin.dataManager.getCollection(selectedSet);
        if (collection && collection.color) color = collection.color;
      }
      const opacity = this.plugin?.settings?.highlightOpacity ?? 0.7;
      const objectNum = await this.annotationService.writeHighlightAnnotation(
        this.currentPdfFile,
        info.page,
        rects,
        quad,
        color,
        opacity,
        this.currentChild
      );

      // 创建条目，index = sourceFile#page=..&annotation=..
      if (objectNum) {
        const indexLink = `${this.currentPdfFile.path}#page=${info.page}&annotation=${objectNum}R`;
        try {
          const entry = await this.plugin.createEntry(selectedText, selectedSet, {
            comment: '',
            sourceFile: this.currentPdfFile.path,
            type: 'pdf',
            index: indexLink
          });
          await this.plugin.navigateToEntryInComments(entry);
        } catch (e) {
          console.error('Create PDF entry failed', e);
        }
      }
    } else {
      // ---------------- 图层高亮 ----------------
      const hash = generateHash();

      // 计算填充颜色：集合颜色 + 用户设置透明度
      const opacity = this.plugin?.settings?.highlightOpacity ?? 0.7;
      let fillColor = hexToRgba('#FFFF00', opacity); // 默认黄色
      if (selectedSet && this.plugin.dataManager) {
        const collection = this.plugin.dataManager.getCollection(selectedSet);
        if (collection && collection.color) {
          fillColor = hexToRgba(collection.color, opacity);
        }
      }

      // 将高亮矩形添加到全局 RectHighlightManager
      const mgr = this.plugin.rectHighlightManager;
      mgr.setActiveFilePath(this.currentPdfFile.path);

      // 对选区中的每一个合并后的矩形都创建高亮，以复用 RectHighlightManager 逻辑
      rects.forEach((r) =>
        mgr.addRect(
          this.currentPdfFile!.path,
          info.page,
          r as [number, number, number, number],
          hash,
          pageView,
          fillColor
        )
      );

      // 选区索引串：beginIdx,beginOffset,endIdx,endOffset
      if (!info.selection) return; // 理论上一定有
      const { beginIndex, beginOffset, endIndex, endOffset } = info.selection;
      const selectionStr = [beginIndex, beginOffset, endIndex, endOffset].map((n) => Math.round(n)).join(',');

      const indexLink = `${this.currentPdfFile.path}#page=${info.page}&selection=${selectionStr}`;

      try {
        const entry = await this.plugin.createEntryWithHash(selectedText, selectedSet, hash, {
          comment: '',
          sourceFile: this.currentPdfFile.path,
          type: 'pdf',
          index: indexLink
        });
        await this.plugin.navigateToEntryInComments(entry);
      } catch (e) {
        console.error('Create PDF entry (layer) failed', e);
      }
    }
  }
} 