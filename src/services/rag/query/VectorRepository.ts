// VectorRepository.ts  (src/services/rag/query/VectorRepository.ts)
// -----------------------------------------------------------------
// 与数据库交互，执行向量相似度检索。
// 该层不包含任何业务逻辑，仅负责拼装 SQL 与返回结果。

import { PGlite } from '@electric-sql/pglite'

/** 检索范围约束 */
export interface SearchScope {
  files: string[]
  folders: string[]
}

export interface SimilaritySearchOptions {
  /** 相似度阈值 (0~1)，结果需大于此值 */
  minSimilarity: number
  /** 最大返回条数 */
  limit: number
  /** 限定检索的文件 / 文件夹，可选 */
  scope?: SearchScope
}

export interface EmbeddingSearchResult {
  id: number
  path: string
  mtime: number
  content: string
  model: string
  dimension: number
  metadata: unknown
  similarity: number
}

/**
 * VectorRepository
 * ----------------
 * 负责执行余弦相似度查询，命中 pgvector HNSW 部分索引。
 */
export class VectorRepository {
  constructor(private db: PGlite) {}

  /**
   * 执行相似度检索
   * @param queryVector 查询向量 (长度需等于 dimension)
   * @param modelId     嵌入模型 id
   * @param dimension   向量维度（用于命中部分索引）
   * @param options     搜索参数
   */
  async performSimilaritySearch(
    queryVector: number[],
    modelId: string,
    dimension: number,
    options: SimilaritySearchOptions,
  ): Promise<EmbeddingSearchResult[]> {
    // 将向量数组转为 pgvector 字面量
    const vectorLiteral = `[${queryVector.join(',')}]`;

    // 构造范围条件 SQL
    const scopeSQL = this.buildScopeCondition(options.scope);

    const sql = `
      SELECT
        id, path, mtime, content, model, dimension, metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM embeddings
      WHERE
        model = $2
        AND dimension = $3
        AND 1 - (embedding <=> $1::vector) > $4
        ${scopeSQL ? `AND (${scopeSQL})` : ''}
      ORDER BY similarity DESC
      LIMIT $5;
    `;
    
    const res = await this.db.query(sql, [
      vectorLiteral,
      modelId,
      dimension,
      options.minSimilarity,
      options.limit,
    ]);
    
    return (res?.rows ?? []) as EmbeddingSearchResult[];
  }

  /**
   * 生成文件 / 文件夹范围过滤 SQL（已做基本转义）
   */
  private buildScopeCondition(scope?: SearchScope): string {
    if (!scope) return ''
    const conds: string[] = []

    if (scope.files && scope.files.length) {
      for (const p of scope.files) {
        conds.push(`path = '${this.escape(p)}'`)
      }
    }

    if (scope.folders && scope.folders.length) {
      for (const f of scope.folders) {
        conds.push(`path LIKE '${this.escape(f)}/%'`)
      }
    }

    return conds.join(' OR ')
  }

  /** 极简 SQL 字符串转义 */
  private escape(str: string) {
    return str.replace(/'/g, "''")
  }
} 