// ============================================================
// Flow Studio - OpenAI 兼容 Provider（函数式调用，向后兼容）
// ============================================================

import type { ChatCompletionParams, ChatCompletionResult } from './types';
import type { ModelInfo } from '../types';
import { cleanKey, catModel } from '../utils';

/** Chat Completion（非流式） */
export async function chatCompletion(base: string, apiKey: string, params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const body: Record<string, any> = { model: params.model, messages: params.messages };
  if (params.tools && params.tools.length > 0) body.tools = params.tools;
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cleanKey(apiKey)}` },
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

/** 获取模型列表 */
export async function listModels(base: string, apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(`${base}/v1/models`, {
    headers: { 'Authorization': `Bearer ${cleanKey(apiKey)}` },
  });
  const data = await res.json();
  return (data.data || []).map((m: any) => ({ id: m.id, cat: catModel(m.id) }));
}

/** Tavily 搜索 */
export async function tavilySearch(apiKey: string, query: string, maxResults = 5) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults, include_answer: true }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  return await res.json();
}
