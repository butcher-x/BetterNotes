import { mergeSequentialRects, applyInverseTransform } from '../../utils/pdfUtils';

/**
 * 表示跨 textLayerNode 的精确字符偏移范围。
 */
export interface TextSelectionRange {
  beginIndex: number;
  beginOffset: number;
  endIndex: number;
  endOffset: number;
}

/**
 * 负责将浏览器 Selection 转换为 PDF 坐标、矩形等信息。
 * 仅依赖 DOM 与 pdf.js viewport，无 Obsidian 依赖，可在其他环境中复用。
 */
export class PdfSelectionService {
  /**
   * 从浏览器 Selection 解析出页码及精确字符范围。
   * @param selection `window.getSelection()` 的结果
   * @returns `{ page, selection? }` 若无法确定则返回 `null`
   */
  public getPageAndTextRange(selection: Selection): { page: number; selection?: TextSelectionRange } | null {
    const pageEl = this.getPageElementFromSelection(selection);
    if (!pageEl || pageEl.dataset.pageNumber === undefined) return null;

    const pageNumber = Number(pageEl.dataset.pageNumber);
    if (Number.isNaN(pageNumber)) return null;

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (range) {
      const selRange = this.getTextSelectionRange(pageEl, range);
      if (selRange) return { page: pageNumber, selection: selRange };
    }
    return { page: pageNumber };
  }

  /**
   * 计算选区在 PDF 坐标中的矩形集合（每行为一个矩形）。
   * @param pageEl `div.page` 元素
   * @param selRange 字符范围
   * @param pageView pdf.js PageView（需包含 viewport / div 等）
   */
  public computeRectsForSelection(pageEl: HTMLElement, selRange: TextSelectionRange, pageView: any): number[][] {
    const rects: number[][] = [];
    const { beginIndex, beginOffset, endIndex, endOffset } = selRange;
    if (!pageView?.viewport) return rects;

    const viewport = pageView.viewport; // pdf.js ViewPort
    const pageRect = pageEl.getBoundingClientRect();

    // 预计算 border / padding
    const style = window.getComputedStyle(pageView.div);
    const borderLeft = parseFloat(style.borderLeftWidth);
    const paddingLeft = parseFloat(style.paddingLeft);
    const borderTop = parseFloat(style.borderTopWidth);
    const paddingTop = parseFloat(style.paddingTop);

    // 浏览器坐标 -> PDF 坐标
    const toPdf = (clientX: number, clientY: number): [number, number] => {
      const localX = clientX - (pageRect.left + borderLeft + paddingLeft);
      const localY = clientY - (pageRect.top + borderTop + paddingTop);
      return applyInverseTransform(viewport.transform, [localX, localY]);
    };

    for (let idx = beginIndex; idx <= endIndex; idx++) {
      const node = pageEl.querySelector<HTMLElement>(`span.textLayerNode[data-idx='${idx}']`);
      if (!node) continue;

      // --- DOM rect（可能是部分节点）---
      let domRect: DOMRect;
      if (idx === beginIndex || idx === endIndex) {
        const range = node.ownerDocument!.createRange();
        if (idx === beginIndex) {
          const pos = this.getNodeAndOffsetOfTextPos(node, Math.min(beginOffset, node.textContent?.length ?? 0));
          range.setStart(pos?.node ?? node, pos?.offset ?? 0);
        } else {
          range.setStartBefore(node);
        }
        if (idx === endIndex) {
          const pos = this.getNodeAndOffsetOfTextPos(node, Math.min(endOffset, node.textContent?.length ?? 0));
          range.setEnd(pos?.node ?? node, pos?.offset ?? (node.textContent?.length ?? 0));
        } else {
          range.setEndAfter(node);
        }
        domRect = range.getBoundingClientRect();
      } else {
        domRect = node.getBoundingClientRect();
      }

      const [x1, yTop] = toPdf(domRect.left, domRect.top);
      const [x2, yBottom] = toPdf(domRect.right, domRect.bottom);
      const bottom = Math.min(yTop, yBottom);
      const top = Math.max(yTop, yBottom);

      //normalize前
      //console.log('normalize前', [x1, bottom, x2, top]);
      // pdf.js Util.normalizeRect
      const normalized = (window as any).pdfjsLib?.Util?.normalizeRect
        ? (window as any).pdfjsLib.Util.normalizeRect([x1, bottom, x2, top])
        : [x1, bottom, x2, top];
      //normalize后
      //console.log('normalize后', normalized);
      rects.push(normalized);
    }

    return mergeSequentialRects(rects);
  }

  /**
   * 获取选区所在的 `div.page` 元素。
   */
  public getPageElementFromSelection(selection: Selection): HTMLElement | null {
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    let node: Node | null = range.commonAncestorContainer;
    while (node && node !== document) {
      if (node instanceof HTMLElement && node.classList.contains('page')) return node;
      node = node.parentNode;
    }
    return null;
  }

  // ----------------------- 私有工具 -----------------------
  private getTextSelectionRange(pageEl: HTMLElement, range: Range): TextSelectionRange | null {
    const startTLN = this.getTextLayerNode(pageEl, range.startContainer);
    const endTLN = this.getTextLayerNode(pageEl, range.endContainer);
    if (!startTLN || !endTLN) return null;

    const beginIndex = parseInt(startTLN.dataset.idx ?? '', 10);
    const endIndex = parseInt(endTLN.dataset.idx ?? '', 10);
    if (Number.isNaN(beginIndex) || Number.isNaN(endIndex)) return null;

    const beginOffset = this.getOffsetInTextLayerNode(startTLN, range.startContainer, range.startOffset);
    const endOffset = this.getOffsetInTextLayerNode(endTLN, range.endContainer, range.endOffset);
    if (beginOffset == null || endOffset == null) return null;

    return { beginIndex, beginOffset, endIndex, endOffset };
  }

  private getTextLayerNode(pageEl: HTMLElement, node: Node): HTMLElement | null {
    if (!pageEl.contains(node)) return null;
    if (node instanceof HTMLElement && node.classList.contains('textLayerNode')) return node;

    let cur: Node | null = node;
    while ((cur = cur.parentNode)) {
      if (cur === pageEl) return null;
      if (cur instanceof HTMLElement && cur.classList.contains('textLayerNode')) return cur;
    }
    return null;
  }

  private getOffsetInTextLayerNode(textLayerNode: HTMLElement, container: Node, offsetInNode: number): number | null {
    if (!textLayerNode.contains(container)) return null;
    const iter = textLayerNode.ownerDocument!.createNodeIterator(textLayerNode, NodeFilter.SHOW_TEXT);
    let textNode: Node | null;
    let offset = offsetInNode;
    // eslint-disable-next-line no-cond-assign
    while ((textNode = iter.nextNode())) {
      if (textNode === container) break;
      offset += textNode.textContent?.length ?? 0;
    }
    return offset;
  }

  /**
   * 遍历 textLayerNode 获取给定字符偏移对应的具体 DOM Node 及其偏移。
   */
  private getNodeAndOffsetOfTextPos(textLayerNode: HTMLElement, offset: number): { node: Node; offset: number } | null {
    const iter = textLayerNode.ownerDocument!.createNodeIterator(textLayerNode, NodeFilter.SHOW_TEXT);
    let textNode: Text | null;
    while ((textNode = iter.nextNode() as Text | null) && offset > textNode.length) {
      offset -= textNode.length;
    }
    return textNode ? { node: textNode, offset } : null;
  }
} 