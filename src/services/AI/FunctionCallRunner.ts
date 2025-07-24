import { ChatSessionManager } from './ChatSessionManager';
import { FUNCTION_SCHEMAS } from './functionSchemas';
import { TOOL_EXECUTORS, ExecutorContext } from './toolExecutors';
import BetterNotesPlugin from '../../main';

/**
 * 控制一次用户消息的函数调用循环。
 * 简化版本：最多循环 3 次；不做流式；执行完返回最终 assistant content。
 */
export class FunctionCallRunner {
  private plugin: BetterNotesPlugin;
  private session: ChatSessionManager;

  /**
   * 当 assistant 返回需要调用工具时，可通过回调通知 UI 以便在界面中展示进度气泡。
   */
  private readonly onToolCall?: (name: string, args: any) => void;

  constructor(
    plugin: BetterNotesPlugin,
    session: ChatSessionManager,
    callbacks: { onToolCall?: (name: string, args: any) => void } = {}
  ) {
    this.plugin = plugin;
    this.session = session;
    this.onToolCall = callbacks.onToolCall;
  }

  /**
   * 处理一条用户输入：可能触发多轮函数调用。
   * @returns 最终 assistant.content
   */
  public async run(): Promise<string> {
    const ctx: ExecutorContext = { plugin: this.plugin };
    const ai = this.plugin.aiService;

    let withTools = true;
    for (let round = 0; round < 3; round++) {
      const resp = await ai.chat(this.session.history(), withTools ? FUNCTION_SCHEMAS : undefined);
      withTools = false;

      // 普通文本回复，结束
      if (resp.content) {
        return resp.content as string;
      }

      const calls = resp.tool_calls || [];
      if (!Array.isArray(calls) || !calls.length) {
        // 无 content 且无 tool_calls，返回空
        return '[empty response]';
      }

      // 1) 记录 assistant 的调用意图
      this.session.addRawMessage({ role: 'assistant', content: null, tool_calls: calls });

      // 2) 执行每个函数并记录结果
      for (const call of calls) {
        try {
          const name = call.function.name;
          const rawArgs = call.function.arguments || '{}';
          const args = JSON.parse(rawArgs);

          // UI 进度通知
          if (this.onToolCall) {
            try {
              this.onToolCall(name, args);
            } catch (cbErr) {
              // 界面回调错误不影响后续逻辑
              console.error('onToolCall callback error', cbErr);
            }
          }

          const exec = TOOL_EXECUTORS[name];
          if (!exec) {
            this.session.addToolMessage(name, JSON.stringify({ error: 'Unknown function' }), call.id);
            continue;
          }
          const result = await exec(ctx, args);
          this.session.addToolMessage(name, JSON.stringify(result), call.id);
        } catch (err: any) {
          this.session.addToolMessage('error', JSON.stringify({ message: err.message || String(err) }), call.id);
        }
      }
    }
    return 'Function call loop exceeded limit.';
  }
} 