// RagService.ts (src/services/rag/RagService.ts)
// ---------------------------------------------
// 门面：组合 Database、EmbeddingHelper、IndexBuilder，供插件使用。

import { App, Notice } from 'obsidian'
import { RagConfig } from './types'
import { DEFAULT_RAG_CONFIG } from './constants'
import { Database } from './db/Database'
import { EmbeddingHelper } from './embedding/EmbeddingHelper'
import { IndexBuilder } from './indexer/IndexBuilder'
import { NotesIndexBuilder } from './indexer/NotesIndexBuilder'
import { DataManager } from '../DataManager'
import { t } from '../../i18n';
export class RagService {
  private db: Database
  private embedder: EmbeddingHelper
  private indexer: IndexBuilder
  private notesIndexer?: NotesIndexBuilder
  private cfg: RagConfig
  private queryEngine?: import('./query/RagQueryEngine').RagQueryEngine

  constructor(private app: App, cfg: RagConfig) {
    const merged = { ...DEFAULT_RAG_CONFIG, ...cfg }
    this.cfg = merged
    this.db = new Database(app)
    this.embedder = new EmbeddingHelper(merged)
    this.indexer = new IndexBuilder(app, this.db, this.embedder)
    // notesIndexer will be lazy-created when needed
    // 异步初始化
    this.db.init().catch((e) => console.error('[RAG] 数据库初始化失败', e))
  }

  /** 构建索引（增量 / 全量） */
  async indexVault(
    reindexAll = false,
    progressCb?: (done: number, total: number) => void,
  ) {
    // 若调用方未提供回调，则使用 Notice 反馈进度
    if (!progressCb) {
      const notice = new Notice(t('RAG indexing progress') + ' 0%', 0)
      await this.indexer.buildIndex(reindexAll, (done, total) => {
        const percent = total === 0 ? 100 : Math.floor((done / total) * 100)
        notice.setMessage(t('RAG indexing progress') + ' ' + percent + '%')
      })
      await this.db.save()
      notice.setMessage(t('RAG indexing completed'))
      await new Promise(resolve => setTimeout(resolve, 3000))
      setTimeout(() => notice.hide(), 3000)
    } else {
      await this.indexer.buildIndex(reindexAll, progressCb)
      await this.db.save()
    }
  }

  /** 构建条目索引（BetterNotes entries） */
  async indexNotes(
    dm: DataManager,
    reindexAll = false,
    progressCb?: (done: number, total: number) => void,
  ) {
    if (!this.notesIndexer) {
      this.notesIndexer = new NotesIndexBuilder(this.db, this.embedder)
    }

    // 若调用方未提供回调，使用 Notice 提示
    if (!progressCb) {
      const notice = new Notice(t('RAG indexing progress') + ' 0%', 0)
      await this.notesIndexer.buildIndex(dm, reindexAll, (done, total) => {
        const percent = total === 0 ? 100 : Math.floor((done / total) * 100)
        notice.setMessage(t('RAG indexing progress') + ' ' + percent + '%')
      })
      await this.db.save()
      notice.setMessage(t('RAG indexing completed'))
      setTimeout(() => notice.hide(), 3000)
    } else {
      await this.notesIndexer.buildIndex(dm, reindexAll, progressCb)
      await this.db.save()
    }
  }

  /** 插件卸载时调用 */
  async onunload() {
    await this.db.save()
  }

  /** 运行期更新配置 */
  updateConfig(cfg: Partial<RagConfig>) {
    this.cfg = { ...this.cfg, ...cfg }
    this.embedder.update(cfg)
  }

  /** 当前 RAG 配置 */
  getConfig() {
    return this.cfg
  }

  /** 暴露底层数据库实例，供查询引擎使用 */
  getDb() {
    return this.db
  }

  /** 暴露嵌入器实例 */
  getEmbedder() {
    return this.embedder
  }

  /** 获取（或懒创建）查询引擎 */
  async getQueryEngine() {
    if (!this.queryEngine) {
      const { RagQueryEngine } = await import('./query/RagQueryEngine')
      this.queryEngine = new RagQueryEngine(this.app, this)
    }
    return this.queryEngine
  }
} 