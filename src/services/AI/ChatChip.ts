/**
 * ChatChip - 通用标签数据结构
 * --------------------------------------------------
 * 仅包含最小三字段，足以唯一定位与 UI 展示。
 */

export type ChatChipType = 'function' | 'entry' | 'preset' | 'file' | 'set' | 'tag';

export interface ChatChip {
  /** 唯一标识：entry->hash, file->path, set->name, preset->模板名, function->函数名, tag->tagName */
  id: string;
  /** 类型 */
  type: ChatChipType;
  /** 用户可读文本 */
  label: string;
} 