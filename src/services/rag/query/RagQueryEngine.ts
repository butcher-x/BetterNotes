// RagQueryEngine.ts (src/services/rag/query/RagQueryEngine.ts)
// ------------------------------------------------------------------
// BetterNotes Vault Search 的核心门面：保证索引最新后执行向量检索。

import { App } from 'obsidian'
import { DEFAULT_MIN_SIMILARITY, DEFAULT_TOP_K } from '../constants'
import { RagService } from '../RagService'
import { VectorRepository, SimilaritySearchOptions, EmbeddingSearchResult } from './VectorRepository'
import { VectorManager } from './VectorManager'

/** 进度上报状态 */
export type QueryProgressState =
  | { type: 'indexing'; percent: number }
  | { type: 'querying' }
  | { type: 'querying-done'; queryResult: EmbeddingSearchResult[] }

export class RagQueryEngine {
  private vecManager: VectorManager

  constructor(private app: App, private ragService: RagService) {
    const repo = new VectorRepository(this.ragService.getDb().getClient())
    this.vecManager = new VectorManager(repo)
  }

  /**
   * 处理查询流程：索引 -> embed -> 相似度检索
   * @param params.query   用户纯文本查询
   * @param params.scope   可选范围限定
   * @param onProgress     进度回调
   */
  async processQuery(
    params: {
      query: string
      scope?: SimilaritySearchOptions['scope']
    },
    onProgress?: (state: QueryProgressState) => void,
  ): Promise<EmbeddingSearchResult[]> {
    // 1. 增量索引（若有所更新）
    onProgress?.({ type: 'indexing', percent: 0 })
    await this.ragService.indexVault(false, (done: number, total: number) => {
      const percent = total === 0 ? 100 : Math.floor((done / total) * 100)
      onProgress?.({ type: 'indexing', percent })
    })

    // 2. 获取查询向量
    const embedder = this.ragService.getEmbedder()
    const queryVector = await embedder.embed(params.query)

    onProgress?.({ type: 'querying' })

    // 3. 相似度查询
    const modelId = embedder.getModelId()
    const dimension = queryVector.length

    const minSim = this.ragService.getConfig().minSimilarity ?? DEFAULT_MIN_SIMILARITY
    const results = await this.vecManager.performSimilaritySearch(queryVector, modelId, dimension, {
      minSimilarity: minSim,
      limit: DEFAULT_TOP_K,
      scope: params.scope,
    })

    onProgress?.({ type: 'querying-done', queryResult: results })
    return results
  }

  /**
   * 针对 BetterNotes 条目库执行检索。
   * 会先进行条目索引（增量）再做向量相似度查询，只返回 path 以 `note:` 开头的结果。
   */
  async processNotesQuery(
    params: {
      query: string
    },
    dataManager: import('../../DataManager').DataManager,
    onProgress?: (state: QueryProgressState) => void,
  ): Promise<EmbeddingSearchResult[]> {
    // 1. 增量索引
    onProgress?.({ type: 'indexing', percent: 0 })
    await this.ragService.indexNotes(dataManager, false, (done: number, total: number) => {
      const percent = total === 0 ? 100 : Math.floor((done / total) * 100)
      onProgress?.({ type: 'indexing', percent })
    })

    // 2. 查询向量
    const embedder = this.ragService.getEmbedder()
    const queryVector = await embedder.embed(params.query)

    onProgress?.({ type: 'querying' })

    // 3. 相似度查询
    const modelId = embedder.getModelId()
    const dimension = queryVector.length

    const minSim = this.ragService.getConfig().minSimilarity ?? DEFAULT_MIN_SIMILARITY
    const rawResults = await this.vecManager.performSimilaritySearch(
      queryVector,
      modelId,
      dimension,
      {
        minSimilarity: minSim,
        limit: DEFAULT_TOP_K,
      },
    )

    const results = rawResults.filter((r) => r.path.startsWith('note:'))

    onProgress?.({ type: 'querying-done', queryResult: results })
    return results
  }
} 