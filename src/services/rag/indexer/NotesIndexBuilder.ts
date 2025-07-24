import { Database } from '../db/Database';
import { EmbeddingHelper } from '../embedding/EmbeddingHelper';
import { DataManager } from '../../DataManager';
import { MAX_CONCURRENCY, NOTES_LAST_INDEX_TIME } from '../constants';
import { Entry } from '../../../models/Entry';

export type ProgressCb = (done: number, total: number) => void;

/**
 * NotesIndexBuilder
 * -----------------
 * 将 BetterNotes 条目写入 embeddings 表。
 * path 字段使用 `note:<hash>`，metadata 保存 set / tag 等信息。
 * 增量更新时比较条目的 mtime 和上次索引时间，仅处理变更的条目。
 */
export class NotesIndexBuilder {
  constructor(private db: Database, private embedder: EmbeddingHelper) {}

  /**
   * 构建索引
   * @param dm           DataManager 实例（提供条目）
   * @param reindexAll   是否强制重建（删除全部 note: 记录）
   * @param progress     进度回调
   */
  async buildIndex(
    dm: DataManager,
    reindexAll: boolean,
    progress: ProgressCb = () => {},
  ) {
    const pg = this.db.getClient();
    const currentTime = Date.now();

    // 全量重建模式：清空所有 note 记录
    if (reindexAll) {
      await pg.query(`DELETE FROM embeddings WHERE path LIKE 'note:%'`);
    }

    // 获取所有条目
    const entries = dm.getAllEntries();

    // 如果是增量更新，获取上次索引时间，并筛选出需要更新的条目
    let targetEntries: Entry[] = entries;
    if (!reindexAll) {
      try {
        // 获取上次索引时间
        const lastIndexTimeStr = await this.db.getMetadata(NOTES_LAST_INDEX_TIME);
        const lastIndexTime = lastIndexTimeStr ? parseInt(lastIndexTimeStr, 10) : 0;
        
        if (lastIndexTime > 0) {
          // 筛选出 mtime 大于上次索引时间的条目
          targetEntries = entries.filter(entry => {
            const entryMtime = entry.mtime || 0;
            return entryMtime > lastIndexTime;
          });
        }
      } catch (error) {
        console.error('获取上次索引时间失败，将执行全量索引', error);
        // 出错时降级为全量索引
        targetEntries = entries;
      }
    }

    // 无需处理的条目时，直接返回
    const total = targetEntries.length;
    if (total === 0) {
      // 即使没有需要更新的条目，也更新索引时间
      await this.db.setMetadata(NOTES_LAST_INDEX_TIME, currentTime.toString());
      progress(1, 1);
      return;
    }

    let done = 0;
    const update = () => progress(++done, total);

    // 采用并发 worker 处理
    const indexRef = { value: 0 };
    const worker = async () => {
      while (true) {
        const idx = indexRef.value++;
        if (idx >= targetEntries.length) break;
        const entry = targetEntries[idx];

        try {
          // 组合条目内容和批注
          const content = [entry.value, entry.comment].filter(Boolean).join('\n\n');
          
          // 获取向量嵌入
          const emb = await this.embedder.embed(content);

          // 删除旧记录（确保幂等）
          await pg.query('DELETE FROM embeddings WHERE path=$1', [
            `note:${entry.hash}`,
          ]);

          // 使用条目的 mtime，如果没有则使用当前时间
          const mtime = entry.mtime || currentTime;

          // 插入新记录
          await pg.query(
            `INSERT INTO embeddings(path, mtime, content, model, dimension, embedding, metadata)
             VALUES($1,$2,$3,$4,$5,$6::vector,$7)`,
            [
              `note:${entry.hash}`,
              mtime,
              content,
              this.embedder.getModelId(),
              emb.length,
              `[${emb.join(',')}]`,
              JSON.stringify({ 
                hash: entry.hash, 
                set: entry.set, 
                tag: entry.tag || [], 
                sourceFile: entry.sourceFile,
                value: entry.value,
                comment: entry.comment,
                link: entry.link || [],
              }),
            ]
          );
          update();
        } catch (error) {
          // 单条失败不中断整个流程
          console.error(`索引条目失败: ${entry.hash}`, error);
          update(); // 即使失败也更新进度
        }
      }
    };

    // 根据处理条目数量和最大并发限制创建 workers
    const workerCount = Math.min(MAX_CONCURRENCY, total);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
    
    // 索引完成后，更新上次索引时间
    await this.db.setMetadata(NOTES_LAST_INDEX_TIME, currentTime.toString());
  }
} 