// Database.ts  (src/services/rag/db/Database.ts)
// ------------------------------------------------
// 封装 PGlite 数据库的创建、迁移与持久化，供 IndexBuilder 调用。

import { App, Notice, requestUrl } from 'obsidian'
import { PGlite } from '@electric-sql/pglite'
import {
  DB_PATH,
} from '../constants'
import { t } from '../../../i18n';
const SUPPORTED_DIMENSIONS = [
  128, 256, 384, 512, 768, 1024, 1280, 1536, 1792,
]

/**
 * 数据库管理类
 */
export class Database {
  private app: App
  private pgClient: PGlite | null = null

  constructor(app: App) {
    this.app = app
  }

  /**
   * 初始化数据库（加载或新建，并执行迁移）
   */
  async init() {
    const dbPath = DB_PATH
    const exists = await this.app.vault.adapter.exists(dbPath)

    if (exists) {
      try {
        const fileBuffer = await this.app.vault.adapter.readBinary(dbPath)
        const fileBlob = new Blob([fileBuffer], { type: 'application/x-gzip' })
        const { fsBundle, wasmModule, vectorExtensionBundlePath } =
          await this.loadPgliteResources()
        this.pgClient = await PGlite.create({
          loadDataDir: fileBlob,
          fsBundle,
          wasmModule,
          extensions: { vector: vectorExtensionBundlePath },
        })
      } catch (e) {
        console.error('[RAG] 加载数据库失败，将创建新库', e)
      }
    }

    if (!this.pgClient) {
      const { fsBundle, wasmModule, vectorExtensionBundlePath } =
        await this.loadPgliteResources()
      this.pgClient = await PGlite.create({
        fsBundle,
        wasmModule,
        extensions: { vector: vectorExtensionBundlePath },
      })
      await this.migrate()
      await this.save()
    }
  }

  /** 提供 pgClient 给外部使用 */
  getClient(): PGlite {
    if (!this.pgClient) throw new Error('Database not initialized')
    return this.pgClient
  }

  /** 执行迁移脚本 */
  private async migrate() {
    if (!this.pgClient) return
    try {
      await this.pgClient.query('CREATE EXTENSION IF NOT EXISTS vector;')
      // 略：其余建表 / 索引脚本原样迁移
      await this.pgClient.query(`CREATE TABLE IF NOT EXISTS embeddings (
        id serial PRIMARY KEY,
        path text NOT NULL,
        mtime bigint NOT NULL,
        content text NOT NULL,
        model text NOT NULL,
        dimension smallint NOT NULL,
        embedding vector,
        metadata jsonb NOT NULL);
      `)

      // 创建元数据表
      await this.pgClient.query(`
        CREATE TABLE IF NOT EXISTS rag_metadata (
          key text PRIMARY KEY,
          value text NOT NULL,
          updated_at bigint NOT NULL
        );
      `)

      // 普通索引
      await this.pgClient.query(
        `CREATE INDEX IF NOT EXISTS embeddings_path_idx ON embeddings(path);`
      )
      await this.pgClient.query(
        `CREATE INDEX IF NOT EXISTS embeddings_model_idx ON embeddings(model);`
      )
      await this.pgClient.query(
        `CREATE INDEX IF NOT EXISTS embeddings_dimension_idx ON embeddings(dimension);`
      )

      // HNSW 向量索引（分维度）
      for (const dim of SUPPORTED_DIMENSIONS) {
        // 注意：必须在 WHERE 子句中限制 dimension，否则 Cast 会失败
        // 语法参照 pgvector 官方建议：
        // CREATE INDEX IF NOT EXISTS ... USING hnsw ((embedding::vector(384)) vector_cosine_ops) WHERE dimension = 384;
        await this.pgClient.query(
          `CREATE INDEX IF NOT EXISTS embeddings_embedding_${dim}_hnsw_idx
             ON embeddings USING hnsw ((embedding::vector(${dim})) vector_cosine_ops)
             WITH (m=16, ef_construction=64) -- 降低构建参数，加快索引创建速度
             WHERE dimension = ${dim};`
        )
      }
    } catch (e) {
      console.error('[RAG] 数据库迁移失败', e)
    }
  }

  /**
   * 获取元数据值
   * @param key 元数据键名
   * @returns 元数据值，不存在则返回 null
   */
  async getMetadata(key: string): Promise<string | null> {
    if (!this.pgClient) return null;
    
    try {
      const result = await this.pgClient.query(
        'SELECT value FROM rag_metadata WHERE key = $1',
        [key]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // 修复类型问题，先转换为 Record<string, any>
      const row = result.rows[0] as Record<string, any>;
      return row.value as string;
    } catch (error) {
      console.error(`[RAG] 获取元数据失败: ${key}`, error);
      return null;
    }
  }
  
  /**
   * 设置元数据值
   * @param key 元数据键名
   * @param value 元数据值
   */
  async setMetadata(key: string, value: string): Promise<void> {
    if (!this.pgClient) return;
    
    try {
      const timestamp = Date.now();
      
      await this.pgClient.query(
        `INSERT INTO rag_metadata (key, value, updated_at) 
         VALUES ($1, $2, $3)
         ON CONFLICT (key) 
         DO UPDATE SET value = $2, updated_at = $3`,
        [key, value, timestamp]
      );
    } catch (error) {
      console.error(`[RAG] 设置元数据失败: ${key}`, error);
    }
  }

  /** 保存数据库到压缩包 */
  async save() {
    if (!this.pgClient) return
    try {
      const blob = await this.pgClient.dumpDataDir('gzip')
      const buf = await blob.arrayBuffer()
      await this.app.vault.adapter.writeBinary(DB_PATH, buf)
    } catch (e) {
      console.error('[RAG] 保存数据库失败', e)
      new Notice(t('save RAG database failed'))
    }
  }

  /** 从 unpkg 加载 wasm 等资源 */
  private async loadPgliteResources() {
    const ver = '0.2.12'
    const [fsRes, wasmRes] = await Promise.all([
      requestUrl(`https://unpkg.com/@electric-sql/pglite@${ver}/dist/postgres.data`),
      requestUrl(`https://unpkg.com/@electric-sql/pglite@${ver}/dist/postgres.wasm`),
    ])
    const fsBundle = new Blob([fsRes.arrayBuffer], { type: 'application/octet-stream' })
    const wasmModule = await WebAssembly.compile(wasmRes.arrayBuffer)
    const vectorExtensionBundlePath = new URL(`https://unpkg.com/@electric-sql/pglite@${ver}/dist/vector.tar.gz`)
    return { fsBundle, wasmModule, vectorExtensionBundlePath }
  }
} 