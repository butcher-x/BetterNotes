/**
 * ChatSessionManager
 * --------------------------------------------------
 * 管理单个 AI 对话会话的消息历史。
 * 它并不直接依赖 Obsidian API —— 纯粹的内存数据结构，
 * 便于在任何视图或服务中复用，且易于单元测试。
 */

/** OpenAI / Anthropic 通用角色类型 */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 发送给 LLM 的原始消息结构。
 */
export interface ChatCompletionMessage {
  /** 角色 */
  role: ChatRole;
  /** 消息正文；tool 调用时为 null */
  content: string | null;
  /** 调用工具时需要的 name 字段（可选） */
  name?: string;
  /** tool 消息返回结果时需要 */
  tool_call_id?: string;
  /** assistant tool_calls */
  tool_calls?: any;
}

// helper to generate simple unique id (不依赖外部库)
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * 会话：由若干条消息构成，并且提供重置能力。
 */
export class ChatSession {
  /** 会话唯一 ID —— 用于持久化或日志 */
  public readonly id: string;
  /** 消息数组，最新消息追加在末尾 */
  private readonly messages: ChatCompletionMessage[] = [];
  /** 创建时间戳 */
  public readonly createdAt: number;
  /** 最近更新时间戳 */
  public updatedAt: number;
  /** 最大 token 软阈值（仅用于示例，可在外部覆盖） */
  private tokenBudget: number;

  constructor(options: { systemPrompt?: string; tokenBudget?: number } = {}) {
    this.id = genId();
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.tokenBudget = options.tokenBudget ?? 12_000; // 针对 16k 上限模型预留

    // 如果提供了系统提示，则作为首条信息写入
    if (options.systemPrompt) {
      this.messages.push({ role: 'system', content: options.systemPrompt });
    }
  }

  /**
   * 追加一条新消息并刷新更新时间。
   */
  public addMessage(msg: ChatCompletionMessage): void {
    this.messages.push(msg);
    this.updatedAt = Date.now();
    // 这里可调用 countTokens() 裁剪旧消息；为简化仅保留接口
  }

  /**
   * 获取当前全部消息。
   */
  public getHistory(): ChatCompletionMessage[] {
    return [...this.messages];
  }

  /**
   * 清空上下文，仅保留可选的 system prompt。
   */
  public clear(): void {
    const systemPrompt = this.messages.find((m) => m.role === 'system');
    this.messages.length = 0;
    if (systemPrompt) this.messages.push(systemPrompt);
    this.updatedAt = Date.now();
  }
}

/**
 * ChatSessionManager 现在只是对单个 Session 的薄包装，但若以后
 * 需要多会话切换，只需在此维护 Map<id, ChatSession> 即可。
 */
export class ChatSessionManager {
  private readonly session: ChatSession;

  constructor(systemPrompt?: string) {
    this.session = new ChatSession({ systemPrompt });
  }

  public addUserMessage(content: string): void {
    this.session.addMessage({ role: 'user', content });
  }

  public addAssistantMessage(content: string): void {
    this.session.addMessage({ role: 'assistant', content });
  }

  public addToolMessage(name: string, content: string, tool_call_id?: string): void {
    this.session.addMessage({ role: 'tool', name, content, tool_call_id } as any);
  }

  /**
   * 直接写入一条自定义消息（用于复杂结构如 assistant tool_calls）。
   */
  public addRawMessage(msg: any): void {
    this.session.addMessage(msg as any);
  }

  public history(): ChatCompletionMessage[] {
    return this.session.getHistory();
  }

  public reset(): void {
    this.session.clear();
  }
} 