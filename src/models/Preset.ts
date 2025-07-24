export interface Preset {
  /** 显示名称（唯一） */
  label: string;
  /** 实际发送给 LLM 的提示文本 */
  prompt: string;
} 