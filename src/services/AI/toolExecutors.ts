import BetterNotesPlugin from '../../main';

/**
 * 上下文类型：只暴露 plugin，以便访问 app / dataManager。
 */
export interface ExecutorContext {
  plugin: BetterNotesPlugin;
}

/**
 * 每个工具函数接收 context 与 args，返回可 JSON 序列化结果。
 */
export const TOOL_EXECUTORS: Record<string, (ctx: ExecutorContext, args: any)=>Promise<any>> = {
  async getCurFile({ plugin }) {
    const file = plugin.app.workspace.getActiveFile();
    if (!file) throw new Error('No active file');
    return {
      path: file.path,
      content: await plugin.app.vault.read(file)
    };
  },
  async getCurFileNotes({ plugin }) {
    const file = plugin.app.workspace.getActiveFile();
    if (!file) throw new Error('No active file');
    return plugin.dataManager.getEntriesBySourceFile(file.path);
  },
  async getAllNotes({ plugin }) {
    return plugin.dataManager.getAllEntries();
  },
  // ---------------------------
  // searchVault: semantic search over user vault via RAG engine
  // ---------------------------
  // notesSearch: semantic search over BetterNotes entries
  // ---------------------------
  /**
   * notesSearch
   * --------------------------------------------------
   * Perform vector-similarity search over every BetterNotes entry.
   * 参数同 searchVault。
   */
  async notesSearch({ plugin }, args: any) {
    const { query, top_k, min_similarity } = args || {};
    if (!query || typeof query !== 'string') {
      throw new Error('notesSearch: "query" is required and must be a string');
    }

    const maxResults = typeof top_k === 'number' && top_k > 0 ? Math.min(top_k, 20) : 8;
    const minSim = typeof min_similarity === 'number' && min_similarity >= 0 && min_similarity <= 1 ? min_similarity : undefined;

    const ragEngine = await plugin.ragService.getQueryEngine();
    const rawResults = await ragEngine.processNotesQuery({ query }, plugin.dataManager);
    
    // 过滤结果
    let filtered = rawResults;
    if (typeof minSim === 'number') {
      filtered = filtered.filter(r => r.similarity >= minSim);
    }
    if (filtered.length > maxResults) {
      filtered = filtered.slice(0, maxResults);
    }

    const snippets = filtered.map(r => {
      const metadata = (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) || {};

      return {
        hash: metadata.hash || '',
        value: metadata.value || '',
        comment: metadata.comment || '',
        similarity: Number(r.similarity.toFixed(3)),
        links: metadata.link || [],
        sourcepath: metadata.sourceFile || '',
      };
    });
    

    return { snippets };
  },
  /**
   * searchVault
   * --------------------------------------------------
   * Perform vector-similarity search over the whole vault.
   * @param args.query  Natural-language query (required)
   * @param args.scope  Optional scope restriction: { files?: string[]; folders?: string[] }
   * @param args.top_k  Max number of snippets to return (default 8)
   * @param args.min_similarity  Per-call similarity threshold (0-1). If provided, will further filter results.
   *
   * The executor reuses RagQueryEngine.processQuery() to ensure the latest incremental index,
   * then post-filters / truncates the snippets before returning a small, JSON-serialisable payload.
   */
  async searchVault({ plugin }, args: any) {
    const { query, scope, top_k, min_similarity } = args || {};
    if (!query || typeof query !== 'string') {
      throw new Error('searchVault: "query" is required and must be a string');
    }

    // Default params
    const maxResults = typeof top_k === 'number' && top_k > 0 ? Math.min(top_k, 20) : 8;
    const minSim = typeof min_similarity === 'number' && min_similarity >= 0 && min_similarity <= 1
      ? min_similarity
      : undefined;

    // Ensure RAG service is available
    const ragEngine = await plugin.ragService.getQueryEngine();

    // Step 1: perform query (includes incremental indexing internally)
    const rawResults = await ragEngine.processQuery({ query, scope });
    
    // Step 2: filter & slice results
    let filtered = rawResults.filter(r => !r.path.startsWith('note:'));
    if (typeof minSim === 'number') {
      filtered = filtered.filter(r => r.similarity >= minSim);
    }
    if (filtered.length > maxResults) {
      filtered = filtered.slice(0, maxResults);
    }

    // Step 3: map to lightweight snippets
    const snippets = filtered.map(r => ({
      content: r.content,
      sourcePath: r.path,
      similarity: Number(r.similarity.toFixed(3))
    }));
    
    return { snippets };
  }
}; 