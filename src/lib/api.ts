// ============================================================
// Flow Studio - API 客户端
// 前端与后端通信的统一接口
// ============================================================

// 开发模式使用 Vite 代理（/api → http://localhost:3001/api）
// 生产模式可设置 VITE_API_BASE 环境变量指向后端地址
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/** 通用 fetch 封装 */
async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '未知错误');
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }

    const data = await response.json();
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '网络请求失败';
    return { success: false, error: message };
  }
}

// ---- 工作流 API ----

/** 工作流列表项 */
export interface WorkflowListItem {
  id: string;
  name: string;
  description?: string;
  nodeCount: number;
  updatedAt: number;
}

/** 获取工作流列表 */
export async function fetchWorkflows() {
  return apiFetch<WorkflowListItem[]>('/workflows');
}

/** 获取单个工作流 */
export async function fetchWorkflow(id: string) {
  return apiFetch(`/workflows/${id}`);
}

/** 创建工作流 */
export async function createWorkflow(data: Record<string, unknown>) {
  return apiFetch('/workflows', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 更新工作流 */
export async function updateWorkflow(id: string, data: Record<string, unknown>) {
  return apiFetch(`/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** 删除工作流 */
export async function deleteWorkflow(id: string) {
  return apiFetch(`/workflows/${id}`, { method: 'DELETE' });
}

/** 复制工作流 */
export async function duplicateWorkflow(id: string) {
  return apiFetch(`/workflows/${id}/duplicate`, { method: 'POST' });
}

// ---- 执行 API ----

/** SSE 事件回调 */
export interface SSECallbacks {
  onNodeStart?: (data: { nodeId: string; nodeType: string; index: number; total: number }) => void;
  onNodeProgress?: (data: { nodeId: string; progress: number; message: string }) => void;
  onNodeComplete?: (data: { nodeId: string; outputs: Record<string, unknown>; duration: number }) => void;
  onNodeError?: (data: { nodeId: string; error: string }) => void;
  onWorkflowComplete?: (data: { totalDuration: number; successCount: number; failCount: number }) => void;
  onWorkflowError?: (data: { error: string }) => void;
}

/**
 * 执行工作流（通过 SSE 接收进度）
 * 直接将工作流数据发送到后端执行
 */
export async function executeWorkflow(
  workflowId: string,
  nodes: unknown[],
  edges: unknown[],
  callbacks: SSECallbacks,
  apiConfig?: Record<string, unknown>
): Promise<void> {
  const url = `${API_BASE}/execute/${workflowId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, edges, apiConfig }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '执行失败');
    callbacks.onWorkflowError?.({ error: text });
    return;
  }

  // 读取 SSE 流
  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onWorkflowError?.({ error: '无法读取执行流' });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 解析 SSE 事件
      const lines = buffer.split('\n');
      buffer = ''; // 重置 buffer

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          // 空行 = 事件结束
          try {
            const data = JSON.parse(currentData);
            switch (currentEvent) {
              case 'node_start':
                callbacks.onNodeStart?.(data);
                break;
              case 'node_progress':
                callbacks.onNodeProgress?.(data);
                break;
              case 'node_complete':
                callbacks.onNodeComplete?.(data);
                break;
              case 'node_error':
                callbacks.onNodeError?.(data);
                break;
              case 'workflow_complete':
                callbacks.onWorkflowComplete?.(data);
                break;
              case 'workflow_error':
                callbacks.onWorkflowError?.(data);
                break;
            }
          } catch {
            // JSON 解析失败，忽略
          }
          currentEvent = '';
          currentData = '';
        } else if (line.startsWith(': ')) {
          // 注释行（心跳），忽略
          continue;
        } else if (line !== '') {
          // 不完整的行，放回 buffer
          buffer = line + '\n';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** 取消执行 */
export async function cancelExecution(workflowId: string) {
  return apiFetch(`/execute/${workflowId}/cancel`, { method: 'POST' });
}

// ---- 设置 API ----

/** 获取设置 */
export async function fetchSettings() {
  return apiFetch('/settings');
}

/** 更新设置 */
export async function updateSettings(data: Record<string, unknown>) {
  return apiFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** 测试 API 连接（成功时返回模型列表） */
export async function testApiConnection(apiKey: string, baseUrl: string, providerConfig?: Record<string, unknown>) {
  return apiFetch<{
    message: string;
    models: string[];
    categorized: { chat: string[]; image: string[]; video: string[] };
  }>('/settings/test-api', {
    method: 'POST',
    body: JSON.stringify({ apiKey, baseUrl, providerConfig }),
  });
}

/** 模型分类数据 */
export interface CategorizedModels {
  all: string[];
  chat: string[];
  image: string[];
  video: string[];
}

/** 从后端获取可用模型列表 */
export async function fetchAvailableModels() {
  return apiFetch<CategorizedModels>('/settings/models');
}

/** 上传文件返回 */
export interface UploadResult {
  success: boolean;
  url?: string;      // 服务器 URL: /api/files/xxx.jpg
  fileName?: string;
  fileSize?: number;
  error?: string;
}

/**
 * 上传文件到后端
 * @param file - 用户选择的文件
 * @returns UploadResult 包含服务器 URL
 */
export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const url = `${API_BASE}/files/upload`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      // 不设 Content-Type，让浏览器自动设 multipart/form-data
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '上传失败');
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }

    const data = await response.json();
    return data;
  } catch (err: any) {
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      return { success: false, error: '无法连接到后端服务，请确保后端已启动' };
    }
    return { success: false, error: err.message || '上传失败' };
  }
}
