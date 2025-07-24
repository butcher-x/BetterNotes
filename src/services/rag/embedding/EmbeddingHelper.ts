// EmbeddingHelper.ts  (src/services/rag/embedding/EmbeddingHelper.ts)
// --------------------------------------------------------------
// 负责向量 API 调用、指数退避与限流处理。

import { backOff } from 'exponential-backoff'
import { RagConfig } from '../types'
import { sleep } from '../utils'
import { VECTOR_DIMENSION } from '../constants'

/** 封装向量接口请求 */
export class EmbeddingHelper {
  private baseUrl: string
  private model: string
  private apiKey: string

  constructor(cfg: RagConfig) {
    this.baseUrl = cfg.embeddingEndpoint.replace(/\/+$/, '') // 去除尾部 /
    this.model = cfg.embeddingModel
    this.apiKey = cfg.apiKey || ''
  }

  /**
   * 请求向量接口，返回 embedding 数组。
   * 带有指数退避重试，最大 10 次。
   */
  async embed(text: string): Promise<number[]> {
    return (await this.embedBatch([text]))[0]
  }

  /**
   * 批量请求向量接口，返回 embeddings 数组。
   * 可显著减少 HTTP 往返，提升索引速度。
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const run = async () => {
      if (texts.length === 0) return []

      // 过滤掉空文本，避免API报错
      const validTexts = texts.filter(t => t && t.trim().length > 0)
      
      // 如果全部是空文本，直接返回
      if (validTexts.length === 0) {
        return []
      }
      
      const url = `${this.baseUrl}/embeddings`
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ model: this.model, input: validTexts }),
        })

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after') ?? '1')
          await sleep((retryAfter || 1) * 1000)
          throw new Error('Rate limited')
        }

        if (!res.ok) {
          throw new Error(`Embedding failed: ${res.status} ${res.statusText}`)
        }

        const json = await res.json()
        const vectors = (json?.data ?? []).map((d: any) => d.embedding as number[])
        
        // 恢复原始数组长度，对于过滤掉的空文本，返回零向量
        let result: number[][] = []
        let validIndex = 0
        
        for (let i = 0; i < texts.length; i++) {
          if (texts[i] && texts[i].trim().length > 0) {
            // 有效文本，使用API返回的向量
            if (validIndex < vectors.length) {
              result.push(vectors[validIndex++])
            } else {
              // API返回的向量数量不足，使用零向量填充
              result.push(new Array(VECTOR_DIMENSION).fill(0))
            }
          } else {
            // 空文本，使用零向量
            result.push(new Array(VECTOR_DIMENSION).fill(0))
          }
        }
        
        if (vectors.length !== validTexts.length) {
          throw new Error('Unexpected embedding response')
        }
        
        return result
      } catch (err) {
        throw err
      }
    }

    return backOff(run, {
      jitter: 'full',
      startingDelay: 500,
      timeMultiple: 2,
      maxDelay: 60_000,
      numOfAttempts: 10,
      retry: (e) => e.message === 'Rate limited',
    })
  }

  /** 动态更新配置 */
  update(cfg: Partial<RagConfig>) {
    if (cfg.embeddingEndpoint) this.baseUrl = cfg.embeddingEndpoint.replace(/\/+$/, '')
    if (cfg.embeddingModel) this.model = cfg.embeddingModel
    if (cfg.apiKey !== undefined) this.apiKey = cfg.apiKey
  }

  /** 返回当前使用的模型 id */
  getModelId() {
    return this.model
  }
} 