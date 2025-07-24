// VectorManager.ts (src/services/rag/query/VectorManager.ts)
// --------------------------------------------------------
// 业务层封装，目前仅代理至 VectorRepository，但预留策略扩展能力。

import { SimilaritySearchOptions, VectorRepository, EmbeddingSearchResult } from './VectorRepository'

export class VectorManager {
  constructor(private repo: VectorRepository) {}

  /**
   * 进行相似度检索
   */
  async performSimilaritySearch(
    queryVector: number[],
    modelId: string,
    dimension: number,
    options: SimilaritySearchOptions,
  ): Promise<EmbeddingSearchResult[]> {
    return this.repo.performSimilaritySearch(queryVector, modelId, dimension, options)
  }
} 