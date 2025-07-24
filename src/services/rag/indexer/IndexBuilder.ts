// IndexBuilder.ts  (src/services/rag/indexer/IndexBuilder.ts)
// ---------------------------------------------------------
// 处理 Vault 索引：遍历文件、分块、写入数据库，并通过回调汇报进度。

import { App, TFile } from 'obsidian'
import { Database } from '../db/Database'
import { EmbeddingHelper } from '../embedding/EmbeddingHelper'
import {
  MAX_CONCURRENCY,
  MAX_FILE_BYTES,
  MAX_TOKENS_PER_CHUNK,
  MAX_CHUNK_OVERLAP,
} from '../constants'
import { splitIntoChunks } from '../utils'

export type ProgressCb = (done: number, total: number) => void

/** 索引构建器 */
export class IndexBuilder {
  private app: App
  private db: Database
  private embedder: EmbeddingHelper

  constructor(app: App, db: Database, embedder: EmbeddingHelper) {
    this.app = app
    this.db = db
    this.embedder = embedder
  }

  /**
   * 构建索引
   * @param reindexAll true=强制全量重建；false=增量
   * @param progress 回调：已完成 chunk / total chunk
   */
  async buildIndex(reindexAll: boolean, progress: ProgressCb) {
    const pg = this.db.getClient()

    // -------- 0. 数据库清理 --------
    if (reindexAll) {
      await pg.query('TRUNCATE TABLE embeddings')
    } else {
      // 增量模式：清理已删除文件记录
      try {
        const res = await pg.query('SELECT DISTINCT path FROM embeddings')
        const indexedPaths: string[] = res?.rows?.map((r: any) => r.path) || []
        const liveSet = new Set(
          this.app.vault.getMarkdownFiles().map((f) => f.path),
        )
        const toRemove = indexedPaths.filter((p) => !liveSet.has(p))
        if (toRemove.length) {
          await pg.query(
            `DELETE FROM embeddings WHERE path = ANY($1::text[])`,
            [toRemove],
          )
        }
      } catch (e) {
        // 错误处理但不中断流程
      }
    }

    // 1. 收集符合大小限制的 Markdown 文件
    const allFiles = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.stat.size < MAX_FILE_BYTES)

    // 2. 若为增量索引，读取数据库中已保存的 mtime 信息并做对比，挑选出真正需要处理的文件
    let targetFiles: TFile[] = allFiles
    if (!reindexAll) {
      // 构造 "path -> mtime" 映射表，BigInt 可能被序列化成字符串，这里统一转成 number 方便比较
      const rows = await pg.query(
        'SELECT path, MAX(mtime) AS mtime FROM embeddings GROUP BY path'
      )
      const mtimeMap = new Map<string, number>()
      for (const r of rows.rows as any[]) {
        mtimeMap.set(r.path as string, Number(r.mtime))
      }

      targetFiles = allFiles.filter((f) => {
        const prev = mtimeMap.get(f.path)
        return prev === undefined || f.stat.mtime > prev
      })
    }

    // 提前计算总 chunks 数量以用于进度条
    let totalChunks = 0
    const fileChunksMap: Map<string, string[]> = new Map()
    for (const f of targetFiles) {
      const content = await this.app.vault.read(f)
      const chunks = splitIntoChunks(
        content,
        MAX_TOKENS_PER_CHUNK,
        MAX_CHUNK_OVERLAP
      )
      fileChunksMap.set(f.path, chunks)
      totalChunks += chunks.length
    }

    // 如果没有需要处理的文件，直接完成
    if (totalChunks === 0) {
      progress(1, 1) // 直接显示 100%
      return
    }

    let doneChunks = 0
    const update = () => progress(++doneChunks, totalChunks)

    // 3. 并发 worker 逐个处理文件
    const indexRef = { value: 0 }
    const worker = async () => {
      while (true) {
        const idx = indexRef.value++
        if (idx >= targetFiles.length) break
        const file = targetFiles[idx]
        const chunks = fileChunksMap.get(file.path) || []

        // 3.1 删除该文件旧记录（保持幂等）
        await pg.query('DELETE FROM embeddings WHERE path=$1', [file.path])

        // 3.2 批量请求向量并写入数据库
        let searchStart = 0 // 用于定位行号
        const fullContent = await this.app.vault.read(file)
        try {
          const embeddings = await this.embedder.embedBatch(chunks)
          
          // 使用事务包裹所有INSERT操作，提高性能
          await pg.query('BEGIN')
          
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]
            const pos = fullContent.indexOf(chunk, searchStart)
            const before = fullContent.slice(0, pos)
            const startLine = before.split('\n').length // 1-based
            const lineCount = chunk.split('\n').length
            const endLine = startLine + lineCount - 1
            searchStart = pos + chunk.length // 下一轮起点，避免匹配前文

            const emb = embeddings[i]
            await pg.query(
              `INSERT INTO embeddings(path, mtime, content, model, dimension, embedding, metadata)
               VALUES($1,$2,$3,$4,$5,$6::vector,$7)`,
              [
                file.path,
                file.stat.mtime,
                chunk,
                this.embedder.getModelId(),
                emb.length,
                `[${emb.join(',')}]`,
                JSON.stringify({ startLine, endLine }),
              ]
            )
            update()
          }
          
          // 提交事务
          await pg.query('COMMIT')
        } catch (err) {
          // 回滚事务
          try {
            await pg.query('ROLLBACK')
          } catch (rollbackErr) {
            // 回滚失败处理
          }
          
          // 继续处理其他文件，不要中断整个流程
        }
      }
    }

    const workers = Array.from({ length: MAX_CONCURRENCY }, () => worker())
    await Promise.all(workers)
  }
} 