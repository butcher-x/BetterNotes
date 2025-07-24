/*
 * SubtitleRenderer.ts
 * -----------------------------------
 * Converts a Cue object into structured DOM elements for display. Each line
 * of subtitle text receives the attribute `data-line`, and each word is
 * wrapped in a <span data-index="n"> element. The original visual styling of
 * subtitles should remain unchanged, so all elements are inline and minimal.
 */

import { Cue } from '../types';
import { SubtitleSelectionManager, injectSubtitleSelectionStyles } from './SubtitleSelectionManager';

/**
 * Renders a single subtitle cue into the given container element.
 *
 * @param cue       The cue to render, or null to clear the container.
 * @param container The HTMLElement that will display the subtitle lines.
 *                  It is emptied and repopulated on each call.
 */
export function renderSubtitleCue(cue: Cue | null, container: HTMLElement): void {
  // Inject base styles once per document
  injectSubtitleSelectionStyles();

  // Clear previous content
  container.empty();

  // 存储当前 cue 起始时间（秒）到 dataset，用于后续创建条目时引用
  if (cue) {
    container.dataset.startTime = String(cue.start);
  } else {
    delete (container.dataset as any).startTime;
  }
  // 不再设置sourceFile

  if (!cue) return;

  const lineNumber = cue.lineNumber;
  const singleLineText = cue.text.replace(/\s*\n+\s*/g, ' ').trim();

  const lineEl = document.createElement('span');
  lineEl.setAttr('line', String(lineNumber ?? 1));

  const words = singleLineText.split(/\s+/);
  words.forEach((word, i) => {
    const wordSpan = document.createElement('span');
    wordSpan.setAttr('index', String(i + 1));
    wordSpan.setAttr('data-original-index', String(i + 1));
    wordSpan.textContent = word;
    lineEl.appendChild(wordSpan);
    if (i !== words.length - 1) {
      lineEl.appendChild(document.createTextNode(' '));
    }
  });

  container.appendChild(lineEl);

  // Attach selection manager (delegated event listeners)
  ensureSelectionManager(container);

  // 通知外部：该行字幕已渲染完成
  if (typeof lineNumber === 'number') {
    document.dispatchEvent(new CustomEvent('BetterNotes-subtitle-line-rendered', {
      detail: { line: lineNumber, container }
    }));
  }
}

/**
 * Ensures a single SubtitleSelectionManager instance is bound to the container.
 * The instance is stored on a symbol property of the element to avoid repeats.
 */
const MANAGER_SYMBOL = Symbol('subtitle-selection-manager');

function ensureSelectionManager(container: HTMLElement): void {
  if ((container as any)[MANAGER_SYMBOL]) return;
  
  // 阻止原生文本选择
  container.addEventListener('selectstart', (e) => {
    e.preventDefault();
    return false;
  });
  
  (container as any)[MANAGER_SYMBOL] = new SubtitleSelectionManager(container);
} 