import { Cue } from '../types';
import { renderSubtitleCue } from './SubtitleRenderer';

/**
 * CaptionSync
 * ---------------------------
 * 根据播放器当前时间决定应显示的字幕，并将其渲染到指定容器。
 * - 构造时接收已排序或未排序的 Cue 列表，会在内部按 start 升序排序。
 * - `update(time)` 在播放进度变化时调用，若字幕行有变化则刷新 DOM。
 */
export class CaptionSync {
  private readonly cues: Cue[];
  private readonly container: HTMLElement;
  private lastIndex: number = -1;

  constructor(cues: Cue[], container: HTMLElement) {
    // 确保按开始时间排序，便于二分查找
    this.cues = [...cues].sort((a, b) => a.start - b.start);
    this.container = container;
  }

  /**
   * 在播放时间更新时调用。
   * 若当前时间落在不同 Cue 内，则重新渲染字幕。
   */
  update(time: number): void {
    const idx = this.findCueIndex(time);
    if (idx === this.lastIndex) return; // 字幕未改变

    if (idx === -1) {
      // 不在任何 Cue 范围内，清空字幕
      renderSubtitleCue(null, this.container);
    } else {
      renderSubtitleCue(this.cues[idx], this.container);
    }
    this.lastIndex = idx;
  }

  /**
   * 手动清空字幕并重置内部状态。
   */
  reset(): void {
    this.lastIndex = -1;
    renderSubtitleCue(null, this.container);
  }

  /**
   * 使用二分查找定位包含给定时间点的 Cue。
   * @returns Cue 的索引；未命中则返回 -1
   */
  private findCueIndex(time: number): number {
    let lo = 0;
    let hi = this.cues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const cue = this.cues[mid];

      if (time < cue.start) {
        hi = mid - 1;
      } else if (time > cue.end) {
        lo = mid + 1;
      } else {
        return mid; // 命中
      }
    }
    return -1;
  }
} 