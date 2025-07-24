// 公共类型定义 (src/services/rag/types.ts)
// --------------------------------------

/**
 * RAG 服务运行时配置
 * - embeddingModel: 向量模型名称，如 "text-embedding-3-small"
 * - embeddingEndpoint: 版本级 Base URL，以 /v1 结尾
 * - apiKey: Bearer Token，用于调用向量接口
 */
export interface RagConfig {
  embeddingModel: string
  embeddingEndpoint: string
  apiKey?: string
  /** 可选：最小相似度阈值 (0~1)，低于该值的片段将被过滤 */
  minSimilarity?: number
} 