// 工具函数集合 (src/services/rag/utils.ts)
// ---------------------------------------

/**
 * 将文本按固定字符数拆分为 chunk。
 * @param text 原始文本
 * @param chunkSize 目标 chunk 大小（字符数）
 * @param overlap 相邻 chunk 之间的重叠字符数
 */
export function splitIntoChunks(
  text: string,
  chunkSize: number,
  overlap: number,
): string[] {
  // 预处理文本，删除多余空白
  const cleanText = text.trim().replace(/\n\s*\n/g, '\n\n');
  
  const chunks: string[] = [];
  let position = 0;
  
  // 按固定字符数切分
  while (position < cleanText.length) {
    // 截取当前chunk
    const chunk = cleanText.substring(position, position + chunkSize);
    chunks.push(chunk);
    
    // 更新位置，考虑重叠
    position += chunkSize - overlap;
    
    // 确保不会因为重叠而原地踏步
    if (position <= 0) position = chunkSize;
  }
  
  return chunks;
}

/** 延迟 ms 毫秒 */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) 