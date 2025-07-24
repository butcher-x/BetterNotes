/**
 * AiChatService
 * --------------------------------------------------
 * 负责与自定义 OpenAI 兼容接口通信。
 * 当前仅实现 /v1/models 测试功能，后续可扩展 chat、stream 等方法。
 */

import { Notice, requestUrl } from 'obsidian';

/** 用户在设置页填写的 AI 服务配置 */
export interface AiServiceConfig {
  enabled: boolean;
  baseUrl: string; // 结尾不带 '/'
  apiKey: string;
  model: string;  // 在其他功能中使用的默认模型名
}

/**
 * 与 OpenAI 兼容接口交互的轻量级客户端。
 */
export class AiChatService {
  private cfg: AiServiceConfig;

  constructor(cfg: AiServiceConfig) {
    this.cfg = { ...cfg };
  }

  /**
   * 用户保存设置后调用，刷新配置。
   */
  public updateConfig(cfg: AiServiceConfig): void {
    this.cfg = { ...cfg };
  }

  /**
   * 测试连通性：
   * 1. 拼接 `baseUrl` + `/v1/models`；
   * 2. 附带 `Authorization: Bearer <apiKey>` 头调用；
   * 3. 将返回的模型列表以 Notice 提示，并以数组形式返回。
   */
  public async testConnection(): Promise<string[]> {
    if (!this.cfg.enabled) {
      throw new Error('AI 服务未启用');
    }
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      throw new Error('AI 配置不完整');
    }
    const base = this.cfg.baseUrl.replace(/\/$/, '');
    const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
    const response = await requestUrl({
      url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status !== 200) {
      throw new Error(`请求失败，状态码：${response.status}`);
    }

    const list: string[] = (response.json?.data || []).map((m: any) => m.id);
    new Notice(`${list.join(', ')}`);
    return list;
  }

  /**
   * 发送 Chat Completion 请求。
   * @param messages   消息历史，需符合 OpenAI Chat schema
   * @param tools      （可选）工具 schema，用于 Function Calling
   * @returns          Assistant 返回的消息对象（包含 content / tool_calls)
   */
  public async chat(
    messages: Array<Record<string, any>>,
    tools?: any[]
  ): Promise<any> {
    if (!this.cfg.enabled) {
      throw new Error('AI 服务未启用');
    }
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      throw new Error('AI 配置不完整');
    }

    const base = this.cfg.baseUrl.replace(/\/$/, '');
    const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

    const body: Record<string, any> = {
      model: this.cfg.model,
      messages,
    };

    if (tools && tools.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await requestUrl({
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status !== 200) {
      throw new Error(`请求失败，状态码：${response.status}`);
    }

    const resJson = response.json;
    const assistantMsg = resJson?.choices?.[0]?.message;
    if (!assistantMsg) {
      throw new Error('AI 响应为空');
    }
    return assistantMsg;
  }

  
} 