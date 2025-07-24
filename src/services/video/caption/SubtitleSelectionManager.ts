/*
 * SubtitleSelectionManager.ts
 * -----------------------------------
 * Handles pointer-drag selection of subtitle words rendered by SubtitleRenderer.
 * When the user drags across word spans (data-index), the spans are highlighted
 * with a temporary style. On mouseup the contiguous selected words are merged
 * into a single element which is styled in green.
 */

export class SubtitleSelectionManager {
  /** Root element that contains word spans (rendered by SubtitleRenderer). */
  private root: HTMLElement;
  /** Selection state */
  private selecting = false;
  private selectedSpans: HTMLElement[] = [];
  private anchorSpan: HTMLElement | null = null;
  /** 当前高亮颜色 */
  private highlightColor: string | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.bindEvents();
  }

  /**
   * Attach pointer listeners to the root container.
   * Word <span> elements are identified by the presence of the `index`
   * attribute. Listeners are delegated to avoid rebinding on every cue update.
   */
  private bindEvents(): void {
    // Start selection
    this.root.addEventListener('pointerdown', (ev) => {
      const target = ev.target as HTMLElement;
      // 不允许选择已高亮的元素，也不允许选择非 index 元素
      if (!target?.hasAttribute('index') || target.closest('.subtitle-auto-highlight')) return;
      // 阻止默认行为，防止可能的原生文本选择
      ev.preventDefault();
      ev.stopPropagation();
      // 若未选中集合则静默返回，不执行选择
      const docColor = document.documentElement.dataset.snCurrentColor || '';
      if (!docColor) return;

      this.resetSelection();
      this.selecting = true;

      // 获取当前集合颜色
      this.highlightColor = docColor;
      this.anchorSpan = target;
      this.updateRangeSelection(target);
      this.root.setPointerCapture(ev.pointerId);

      // While pointer is captured, listen for movement to extend selection
      const moveHandler = (mv: PointerEvent) => {
        // 阻止默认行为，防止可能的原生文本选择
        mv.preventDefault();
        mv.stopPropagation();
        if (!this.selecting) return;
        const el = document.elementFromPoint(mv.clientX, mv.clientY) as HTMLElement | null;
        // 不选择已高亮的元素
        if (el && el.hasAttribute('index') && !el.closest('.subtitle-auto-highlight')) {
          this.updateRangeSelection(el);
        }
      };
      const upHandler = (up: PointerEvent) => {
        // 阻止默认行为，防止可能的原生文本选择
        up.preventDefault();
        up.stopPropagation();
        
        if (!this.selecting) return;
        
        this.selecting = false;
        this.root.releasePointerCapture(up.pointerId);
        this.root.removeEventListener('pointermove', moveHandler);
        this.root.removeEventListener('pointerup', upHandler);
        this.root.removeEventListener('pointercancel', upHandler);
        if (this.selectedSpans.length > 0) {
          this.mergeSelection();
        }
      };
      this.root.addEventListener('pointermove', moveHandler);
      this.root.addEventListener('pointerup', upHandler);
      this.root.addEventListener('pointercancel', upHandler);
    });
  }

  /** Highlight or add span to current selection */
  private toggleSpan(span: HTMLElement, adding: boolean): void {
    if (adding && !this.selectedSpans.includes(span)) {
      this.selectedSpans.push(span);
      span.classList.add('subtitle-selecting');
      if (this.highlightColor) {
        span.style.color = this.highlightColor;
      }
    }
  }

  /** Reset any in-progress selection state */
  private resetSelection(): void {
    this.selectedSpans.forEach((s) => {
      s.classList.remove('subtitle-selecting');
      // 恢复颜色（移除行内 color，仅当先前设置过）
      if (this.highlightColor) {
        s.style.removeProperty('color');
      }
    });
    this.selectedSpans = [];
    this.anchorSpan = null;
    this.highlightColor = null;
  }

  /**
   * Merge the selected word spans into a single span element. The words are
   * concatenated with spaces to preserve original spacing. The new span gets
   * class `subtitle-auto-highlight` and inline style for color.
   */
  private mergeSelection(): void {
    if (this.selectedSpans.length === 0) return;

    // Sort spans in DOM order to maintain natural word order
    this.selectedSpans.sort((a, b) => {
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    const mergedText = this.selectedSpans.map((s) => s.textContent ?? '').join(' ');
    const firstSpan = this.selectedSpans[0];

    // Determine start & end word indexes (1-based within the line)
    const startIdx = Number((this.selectedSpans[0].getAttribute('index')!));
    const endIdx = Number((this.selectedSpans[this.selectedSpans.length - 1].getAttribute('index')!));

    // Create new merged span
    const merged = document.createElement('span');
    merged.textContent = mergedText;
    merged.classList.add('subtitle-auto-highlight');
    // 仅当有集合颜色时才着色
    if (this.highlightColor) {
      merged.style.color = this.highlightColor;
    }

    // Preserve line attribute
    const lineEl = firstSpan.closest('[line]') as HTMLElement | null;
    const lineNumber = lineEl ? lineEl.getAttribute('line')! : '0';
    if (lineEl) {
      merged.setAttribute('line', lineNumber);
    }

    // Insert merged span and remove originals + whitespace
    const lastSpan = this.selectedSpans[this.selectedSpans.length - 1];
    let node: ChildNode | null = firstSpan;
    const nodesToRemove: ChildNode[] = [];
    while (node) {
      nodesToRemove.push(node);
      if (node === lastSpan) break;
      node = node.nextSibling;
    }
    firstSpan.parentElement?.insertBefore(merged, firstSpan);
    nodesToRemove.forEach((n) => n.remove());

    // Dispatch custom event with selection info for entry creation & coloring
    const videoUrl = this.root.dataset.videoUrl || '';
    const payload = {
      element: merged,
      text: mergedText,
      line: Number(lineNumber),
      start: startIdx,
      end: endIdx,
      url: videoUrl,
      time: parseFloat(this.root.dataset.startTime || '0'),
    };
    document.dispatchEvent(new CustomEvent('BetterNotes-subtitle-entry', { detail: payload }));

    // Clear selection state
    this.selectedSpans = [];
    this.anchorSpan = null;
  }

  /**
   * Highlight all word spans between the anchor and current span (inclusive).
   * This allows the user to drag backwards to shrink the selection.
   */
  private updateRangeSelection(current: HTMLElement): void {
    if (!this.anchorSpan) return;

    // Get all word spans under root in DOM order
    const allWords = Array.from(this.root.querySelectorAll<HTMLElement>('span[index]'));
    const startIdx = allWords.indexOf(this.anchorSpan);
    const endIdx = allWords.indexOf(current);
    if (startIdx === -1 || endIdx === -1) return;

    const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    const newSelection = allWords.slice(lo, hi + 1);

    // Remove highlight from previously selected but now out-of-range spans
    this.selectedSpans.forEach((s) => {
      if (!newSelection.includes(s)) {
        s.classList.remove('subtitle-selecting');
        if (this.highlightColor) s.style.removeProperty('color');
      }
    });

    // Add highlight to new spans
    newSelection.forEach((s) => {
      if (!this.selectedSpans.includes(s)) s.classList.add('subtitle-selecting');
      if (this.highlightColor) s.style.color = this.highlightColor;
    });

    this.selectedSpans = newSelection;
  }
}

/**
 * Injects base CSS once per document (idempotent).
 */
export function injectSubtitleSelectionStyles(): void {
  if (document.getElementById('subtitle-selection-style')) return;
  const style = document.createElement('style');
  style.id = 'subtitle-selection-style';
  style.textContent = `
    /* Temporary selecting state */
    .subtitle-selecting {
      /* 动态着色由行内 style 决定，如无集合则继承文字色 */
      transform: translateY(-1px);
      cursor: pointer;
    }
    /* 字幕单词可点击指针样式 */
    .video-caption span[index] {
      cursor: pointer;
      /* 禁止文本选择 */
      user-select: none;
      -webkit-user-select: none;
    }
    /* 已高亮条目悬停提示 */
    .subtitle-auto-highlight {
      /* 合并高亮元素样式，颜色由行内style决定 */
      cursor: pointer;
      /* 悬停添加下划线，提示可点击 */
      transition: text-decoration-color 0.2s;
      /* 禁止文本选择 */
      user-select: none;
      -webkit-user-select: none;
    }
    .subtitle-auto-highlight:hover {
      text-decoration: underline;
      text-decoration-color: rgba(255, 255, 255, 0.6);
    }
    /* 为整个字幕容器添加选择限制 */
    .video-caption {
      user-select: none;
      -webkit-user-select: none;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 全局字幕条目导航，点击即可跳转
 */
export function setupSubtitleNavigationKeys(): void {
  // 避免重复添加
  if ((window as any).__subtitleKeysSetup) return;
  (window as any).__subtitleKeysSetup = true;
  
  // 点击自动高亮词时直接跳转
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('subtitle-auto-highlight')) {
      const entryHash = target.getAttribute('data-entry-hash');
      if (entryHash) {
        e.preventDefault();
        e.stopPropagation();
        
        // 派发导航事件，让上层处理
        document.dispatchEvent(new CustomEvent('BetterNotes-navigate-to-entry', {
          detail: { hash: entryHash }
        }));
      }
    }
  });
} 