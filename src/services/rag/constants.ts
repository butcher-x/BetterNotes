// RAG 常量与默认配置  (src/services/rag/constants.ts)
// -------------------------------------------------------
// 本文件集中维护 RAG 相关的各类常量，方便统一修改与复用。

import type { RagConfig } from './types'

// 向量维度（text-embedding-3-small）
export const VECTOR_DIMENSION = 1536

// Chunk 相关参数
export const MAX_TOKENS_PER_CHUNK = 300
export const MAX_CHUNK_OVERLAP = 50

// 文件大小限制（bytes）
export const MAX_FILE_BYTES = 300 * 1000

// 并发 worker 数
export const MAX_CONCURRENCY = 20 // 可按需调整

// 相似度搜索参数
export const DEFAULT_MIN_SIMILARITY = 0.1 // 过滤阈值（0~1）
export const DEFAULT_TOP_K = 10           // 返回的片段数量

// 数据库压缩包路径（存储在 vault 根目录）
export const DB_PATH = '.BetterNotes_db.tar.gz'

// 元数据键名
export const NOTES_LAST_INDEX_TIME = 'notes_last_index_time' // 笔记上次索引时间的键名

// 默认配置
export const DEFAULT_RAG_CONFIG: RagConfig = {
  embeddingModel: 'text-embedding-3-small',
  embeddingEndpoint: '' ,
  apiKey: '',
  minSimilarity: DEFAULT_MIN_SIMILARITY,
} 