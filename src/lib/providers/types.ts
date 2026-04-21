// ============================================================
// Flow Studio - Provider 接口定义（从 ai-assistant 复用）
// ============================================================

import type { ModelInfo } from '../types';

// ====== Provider Configuration ======

export interface ProviderConfig {
  /** 认证方式 */
  authType: 'bearer' | 'api-key' | 'custom';
  /** 自定义 Header 名（authType 为 custom 时使用） */
  customHeaderName?: string;
  /** 自定义前缀（authType 为 custom 时使用，如 'Key'、''） */
  customPrefix?: string;
  /** 图像生成方式 */
  imageMode: 'chat' | 'standalone' | 'none';
  /** 视频生成方式 */
  videoMode: 'poll' | 'none';
  /** 视频接口路径 */
  videoEndpoint?: string;
  /** 对话接口路径 */
  chatEndpoint?: string;
  /** 模型列表接口路径 */
  modelsEndpoint?: string;
}

/** 默认配置（端点路径不含 /v1 前缀，因为 baseUrl 通常已包含） */
export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  authType: 'bearer',
  imageMode: 'chat',
  videoMode: 'poll',
  chatEndpoint: '/chat/completions',
  modelsEndpoint: '/models',
  videoEndpoint: '/video/generations',
};

// ====== API 参数和返回类型 ======

export interface ChatCompletionParams {
  model: string;
  messages: Array<{ role: string; content: string | any[] }>;
  tools?: any[];
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls: any[] | null;
  finishReason: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onFinish: (result: ChatCompletionResult) => void;
  onError: (error: Error) => void;
}

// ====== AIProvider 统一接口 ======

export interface AIProvider {
  buildHeaders(): Record<string, string>;
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;
  chatCompletionStream(params: ChatCompletionParams, callbacks: StreamCallbacks): void;
  listModels(): Promise<ModelInfo[]>;
  readonly config: ProviderConfig;
}
