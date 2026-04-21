// ============================================================
// Flow Studio - 通用 Provider 实现（从 ai-assistant 复用）
// 通过配置适配绝大多数 OpenAI 兼容 API
// ============================================================

import type { AIProvider, ProviderConfig, ChatCompletionParams, ChatCompletionResult, StreamCallbacks } from './types';
import type { ModelInfo } from '../types';
import { DEFAULT_PROVIDER_CONFIG } from './types';
import { cleanKey, catModel } from '../utils';

export function createProvider(base: string, apiKey: string, config?: Partial<ProviderConfig>): AIProvider {
  const cfg: ProviderConfig = { ...DEFAULT_PROVIDER_CONFIG, ...config };

  // ====== 构建认证请求头 ======
  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = cleanKey(apiKey);
    switch (cfg.authType) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${key}`;
        break;
      case 'api-key':
        headers['X-API-Key'] = key;
        break;
      case 'custom':
        headers[cfg.customHeaderName || 'Authorization'] = `${cfg.customPrefix ?? 'Bearer '}${key}`;
        break;
    }
    return headers;
  }

  // ====== Chat Completion（非流式） ======
  async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const endpoint = cfg.chatEndpoint || '/v1/chat/completions';
    const body: Record<string, any> = { model: params.model, messages: params.messages };
    if (params.tools && params.tools.length > 0) body.tools = params.tools;
    const res = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: params.signal,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
      throw new Error(e.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    return {
      content: typeof msg?.content === 'string' ? msg.content : '',
      toolCalls: msg?.tool_calls || null,
      finishReason: data.choices?.[0]?.finish_reason || 'stop',
    };
  }

  // ====== Streaming Chat Completion (SSE) ======
  function chatCompletionStream(params: ChatCompletionParams, callbacks: StreamCallbacks): void {
    const endpoint = cfg.chatEndpoint || '/v1/chat/completions';
    const body: Record<string, any> = { model: params.model, messages: params.messages, stream: true };
    if (params.tools && params.tools.length > 0) body.tools = params.tools;
    let aborted = false;

    (async () => {
      try {
        const res = await fetch(`${base}${endpoint}`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify(body),
          signal: params.signal,
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
          throw new Error(e.error?.message || `HTTP ${res.status}`);
        }
        if (!res.body) {
          const data = await res.json();
          const msg = data.choices?.[0]?.message;
          const result: ChatCompletionResult = {
            content: typeof msg?.content === 'string' ? msg.content : '',
            toolCalls: msg?.tool_calls || null,
            finishReason: data.choices?.[0]?.finish_reason || 'stop',
          };
          if (result.content) callbacks.onToken(result.content);
          if (!aborted) callbacks.onFinish(result);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let toolCalls: any[] | null = null;
        let finishReason = 'stop';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              if (choice) {
                if (choice.delta?.content) {
                  fullContent += choice.delta.content;
                  if (!aborted) callbacks.onToken(choice.delta.content);
                }
                if (choice.delta?.tool_calls) {
                  toolCalls = choice.delta.tool_calls;
                }
                if (choice.message?.content && !choice.delta) {
                  fullContent = choice.message.content;
                  if (!aborted) callbacks.onToken(fullContent);
                }
                if (choice.message?.tool_calls && !choice.delta) {
                  toolCalls = choice.message.tool_calls;
                }
                if (choice.finish_reason) finishReason = choice.finish_reason;
              }
            } catch { /* 忽略解析错误 */ }
          }
        }
        if (!aborted) {
          callbacks.onFinish({ content: fullContent, toolCalls, finishReason });
        }
      } catch (err: any) {
        if (!aborted) callbacks.onError(err);
      }
    })();
  }

  // ====== List Models ======
  async function listModels(): Promise<ModelInfo[]> {
    const endpoint = cfg.modelsEndpoint || '/v1/models';
    const res = await fetch(`${base}${endpoint}`, {
      headers: buildHeaders(),
    });
    const data = await res.json();
    return (data.data || []).map((m: any) => ({ id: m.id, cat: catModel(m.id) }));
  }

  return {
    buildHeaders,
    chatCompletion,
    chatCompletionStream,
    listModels,
    get config() { return cfg; },
  };
}
