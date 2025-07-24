export interface PdfViewerState {
  page: number;
  left: number | null;
  top: number | null;
  zoom: number | null;
  scaleValue: string | null;
}

/**
 * Capture current PDF viewer state (page, offset, zoom) from a viewer child.
 * @param child pdf.js viewer child obtained from Obsidian PDF view.
 * @returns captured PdfViewerState or undefined if not available.
 */
export function capturePdfViewerState(child: any): PdfViewerState | undefined {
  try {
    const pdfViewer = child?.pdfViewer?.pdfViewer;
    if (pdfViewer) {
      return {
        page: pdfViewer._location?.pageNumber ?? pdfViewer.currentPageNumber,
        left: pdfViewer._location?.left ?? null,
        top: pdfViewer._location?.top ?? null,
        zoom: pdfViewer.currentScale ?? null,
        scaleValue: pdfViewer.currentScaleValue ?? null
      };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Restore PDF viewer state after reloading file or annotation update.
 * If page is available but scroll offsets are null, it will simply jump to that page.
 * @param child pdf.js viewer child.
 * @param state previously captured PdfViewerState.
 */
export function restorePdfViewerState(child: any, state?: PdfViewerState): void {
  if (!child || !state) return;
  try {
    const pdfViewer = child?.pdfViewer?.pdfViewer;
    if (!pdfViewer) return;

    const { page, left, top, zoom } = state;

    const doRestore = () => {
      if (left !== null && top !== null && zoom !== null) {
        pdfViewer.scrollPageIntoView({
          pageNumber: page,
          destArray: [page, { name: 'XYZ' }, left, top, zoom]
        });
      } else {
        pdfViewer.currentPageNumber = page;
      }
    };

    // 监听注释层渲染完成事件
    const onAnnotLayerRendered = (data: any) => {
      if (data.pageNumber === page) {
        // 只有当目标页面的注释层渲染完成时才恢复视图状态
        pdfViewer.eventBus?.off?.('annotationlayerrendered', onAnnotLayerRendered);
        setTimeout(() => doRestore(), 0);
      }
    };
    pdfViewer.eventBus?.on?.('annotationlayerrendered', onAnnotLayerRendered);

  } catch (e) {
    console.error('Failed to restore PDF view state', e);
  }
}