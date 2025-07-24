/**
 * RectHighlightManager (Singleton)
 * ---------------------------------------------------
 * 负责存储和渲染所有 PDF 文件的矩形高亮。
 *
 * 数据结构： Map<filePath, Map<pageNumber, RectInfo[]>>
 * 在渲染时根据当前 viewer 的 filePath + pageNumber 获取对应矩形并绘制。
 */

/** 矩形信息类型 */
interface RectInfo {
  rect: [number, number, number, number];
  hash: string;
  /**
   * 填充颜色，如果存在则表示该矩形是 selection 类型，需要使用填充高亮而非虚线边框。
   * 颜色值应包含透明度，如 'rgba(255,255,0,0.4)'
   */
  color?: string;
}

export class RectHighlightManager {
  
  /** Map<filePath, Map<pageNumber, RectInfo[]>> */
  private readonly rects = new Map<string, Map<number, RectInfo[]>>();

  /** 记录已绑定的 eventBus，避免重复绑定 */
  private readonly boundBuses = new WeakSet<any>();
  
  /** 保存当前活动的 PDF 文件路径，用于 pageRenderedCallback */
  private activeFilePath: string | null = null;

  public setActiveFilePath(filePath: string) {
    this.activeFilePath = filePath;
  }
  
  public pageRenderedCallback = (data: { pageNumber: number; source: any }) => {
    if (!this.activeFilePath) {
      console.warn('RectHighlightManager: No active file path for pageRenderedCallback');
      return;
    }
    this.renderPage(this.activeFilePath, data.pageNumber, data.source);
  };
  
  /**
   * 添加矩形并立即渲染（若 pageView 提供）。
   * @param filePath PDF 文件路径
   * @param pageNumber 页码（1-based）
   * @param rect 矩形坐标 [left, bottom, right, top]
   * @param hash 唯一标识 selection 的 hash
   * @param pageView 可选，当前页的 PageView
   *
   * 注意：
   * 1. 同一页、同一 hash 允许存在多个 rect（跨行 selection）。
   * 2. 但若 hash + rect 坐标完全相同，则判重跳过，避免重复渲染。
   */
  public addRect(
    filePath: string,
    pageNumber: number,
    rect: [number, number, number, number],
    hash: string,
    pageView?: any,
    color?: string
  ) {
    const byPage = this.rects.get(filePath) ?? new Map<number, RectInfo[]>();
    const list = byPage.get(pageNumber) ?? [];

    // ----- Hash + Rect 去重：完全相同的矩形不再添加 -----
    const exists = list.some(
      (info) =>
        info.hash === hash &&
        info.rect[0] === rect[0] &&
        info.rect[1] === rect[1] &&
        info.rect[2] === rect[2] &&
        info.rect[3] === rect[3]
    );
    if (exists) return;

    list.push({ rect, hash, color });
    byPage.set(pageNumber, list);
    this.rects.set(filePath, byPage);

    if (pageView) {
      this.renderPage(filePath, pageNumber, pageView);
      this.ensureEventBusListener(filePath, pageView);
    }
  }

  /**
   * 批量加载矩形（用于打开 PDF 时）。
   */
  public loadRects(filePath: string, rectMap: Map<number, RectInfo[]>) {
    this.rects.set(filePath, new Map(rectMap));
  }

  /**
   * 当 Viewer 的 pageView 渲染时调用
   */
  public renderPage(filePath: string, pageNumber: number, pageView: any) {
    const byPage = this.rects.get(filePath);
    if (!byPage) return;
    console.warn('renderPage', filePath, pageNumber);
    const infos = byPage.get(pageNumber) ?? [];
    if (infos.length === 0) return;

    const layerEl = this.ensureLayer(pageView);
    layerEl.querySelectorAll('.rect-capture-highlight').forEach((el) => el.remove());
    infos.forEach((info: RectInfo) => this.placeRectCss(info.rect, pageView, layerEl, info.hash, info.color));
  }

  /**
   * 获取指定文件、页码、hash 对应的所有矩形。
   * @param filePath PDF 文件路径
   * @param pageNumber 页码（1-based）
   * @param hash selection 的 hash
   * @returns 对应的矩形数组，若不存在返回 undefined
   */
  public getRects(
    filePath: string,
    pageNumber: number,
    hash: string
  ): [number, number, number, number][] | undefined {
    const byPage = this.rects.get(filePath);
    if (!byPage) return undefined;
    const list = byPage.get(pageNumber);
    if (!list) return undefined;
    return list.filter((info) => info.hash === hash).map((info) => info.rect);
  }

  /** 在 eventBus 上绑定 pagerendered 事件 */
  private ensureEventBusListener(filePath: string, pdfViewer: any) {
    const eventBus = pdfViewer.eventBus;
    
    eventBus.on('pagerendered', this.pageRenderedCallback);

    this.boundBuses.add(eventBus);
  }

  /** 创建/获取 per-page highlight layer */
  private ensureLayer(pageView: any): HTMLElement {
    const pageDiv: HTMLElement = pageView.div;
    return (
      pageDiv.querySelector<HTMLElement>('div.BetterNotes-rect-highlight-layer') ||
      pageDiv.createDiv('BetterNotes-rect-highlight-layer', (el) => {
        if ((window as any).pdfjsLib?.setLayerDimensions) {
          (window as any).pdfjsLib.setLayerDimensions(el, pageView.viewport);
        }
      })
    );
  }

  private placeRectCss(
    rect: [number, number, number, number],
    pageView: any,
    layerEl: HTMLElement,
    hash: string,
    color?: string
  ) {
    const [left, bottom, right, top] = rect;
    const viewBox = pageView.pdfPage.view as number[];
    const pageX = viewBox[0];
    const pageY = viewBox[1];
    const pageW = viewBox[2] - viewBox[0];
    const pageH = viewBox[3] - viewBox[1];

    const mirrored = (window as any).pdfjsLib?.Util?.normalizeRect
      ? (window as any).pdfjsLib.Util.normalizeRect([
          left,
          viewBox[3] - bottom + viewBox[1],
          right,
          viewBox[3] - top + viewBox[1],
        ])
      : [left, viewBox[3] - bottom + viewBox[1], right, viewBox[3] - top + viewBox[1]];

    const hl = layerEl.createDiv({ cls: 'rect-capture-highlight' });
    const baseStyle = {
      position: 'absolute',
      left: `${((mirrored[0] - pageX) / pageW) * 100}%`,
      top: `${((mirrored[1] - pageY) / pageH) * 100}%`,
      width: `${((mirrored[2] - mirrored[0]) / pageW) * 100}%`,
      height: `${((mirrored[3] - mirrored[1]) / pageH) * 100}%`,
      pointerEvents: 'auto',
      cursor: 'pointer',
      borderRadius: '0.1em',
    } as Partial<CSSStyleDeclaration>;

    if (color) {
      // selection 类型：内部填充颜色，无边框
      Object.assign(hl.style, baseStyle, {
        background: color,
        border: 'none',
      });
    } else {
      // rect 类型：虚线框，无填充
      Object.assign(hl.style, baseStyle, {
        border: '2px dashed rgba(255,165,0,0.9)',
        background: 'rgba(255, 255, 255, 0)',
      });
    }
    if (hash) hl.dataset.hash = hash;
    
    if (!color) {
      // 悬停效果仅用于虚线框类型
      hl.addEventListener('mouseenter', () => {
        hl.style.border = '2px solid rgba(255,165,0,1)';
        hl.style.boxShadow = '0 0 8px rgba(255,165,0,0.5)';
      });
      hl.addEventListener('mouseleave', () => {
        hl.style.border = '2px dashed rgba(255,165,0,0.9)';
        hl.style.boxShadow = 'none';
      });
    }
  }

  /**
   * 根据条目的唯一 hash 删除矩形高亮记录，并立即从当前页面移除对应 DOM。
   * 如果记录不存在则返回 false。
   *
   * @param hash 条目哈希，唯一标识一个矩形条目
   * @returns 是否找到并删除成功
   */
  public removeRectByHash(hash: string): boolean {
    let found = false;

    // 遍历 file → page → rectInfo
    for (const [filePath, pageMap] of this.rects) {
      for (const [page, list] of pageMap) {
        const filtered = list.filter((info: RectInfo) => info.hash !== hash);
        if (filtered.length !== list.length) {
          found = true;
          if (filtered.length) {
            pageMap.set(page, filtered);
          } else {
            pageMap.delete(page);
          }
        }
      }
      // 若该文件已无任何矩形，整体移除
      if (pageMap.size === 0) {
        this.rects.delete(filePath);
      }
    }

    // 移除已经渲染到页面上的 DOM
    if (found && typeof document !== 'undefined') {
      document
        .querySelectorAll(`.rect-capture-highlight[data-hash="${hash}"]`)
        .forEach((el) => el.remove());
    }

    return found;
  }

  /**
   * 将已加载的 pdfViewer 绑定到管理器，并对已渲染的页面立即绘制矩形。
   * @param filePath 当前 PDF 文件路径
   * @param pdfViewer pdf.js BaseViewer 实例 (child.pdfViewer.pdfViewer)
   */
  public attachViewer(filePath: string, pdfViewer: any) {
    if (!pdfViewer) return;    
    this.ensureEventBusListener(filePath, pdfViewer);
  }
} 