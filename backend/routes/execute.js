// ============================================================
// Flow Studio - 工作流执行路由（SSE 进度推送）
// ============================================================

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeWorkflow } from '../engine/executor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 存储路径
const WORKFLOWS_DIR = path.join(__dirname, '..', 'storage', 'workflows');
const SETTINGS_FILE = path.join(__dirname, '..', 'storage', 'settings.json');

// 当前正在执行的工作流（用于取消）
const runningExecutions = new Map();

const router = Router();

/** 执行工作流（返回 SSE 流） */
router.post('/:id', async (req, res) => {
  const { id } = req.params;

  // 设置 SSE 头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲
  });

  // 发送 SSE 事件的辅助函数
  const sendSSE = (event, data) => {
    if (res.writableEnded) return false;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  };

  // 心跳保活
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    res.write(': heartbeat\n\n');
  }, 15000);

  // 客户端断开时清理
  req.on('close', () => {
    clearInterval(heartbeat);
    runningExecutions.delete(id);
  });

  // 读取工作流
  const filePath = path.join(WORKFLOWS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    sendSSE('workflow_error', { error: `工作流不存在: ${id}` });
    clearInterval(heartbeat);
    res.end();
    return;
  }

  let workflow;
  try {
    workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    sendSSE('workflow_error', { error: '工作流数据格式错误' });
    clearInterval(heartbeat);
    res.end();
    return;
  }

  // 如果请求体中包含工作流数据（前端可能直接发送），优先使用
  if (req.body?.nodes) {
    workflow.nodes = req.body.nodes;
    workflow.edges = req.body.edges || [];
  }

  // 读取 API 配置
  let apiConfig = {};
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      apiConfig = {
        apiKey: settings.apiKey || '',
        baseUrl: settings.baseUrl || 'https://api.openai.com/v1',
        defaultChatModel: settings.defaultChatModel || 'gpt-4o-mini',
        defaultImageModel: settings.defaultImageModel || '',
        defaultVideoModel: settings.defaultVideoModel || '',
        providerConfig: settings.providerConfig || {},
      };
    }
  } catch {
    // 忽略设置读取错误
  }

  // 允许前端在请求体中覆盖 API 配置
  if (req.body?.apiConfig) {
    apiConfig = { ...apiConfig, ...req.body.apiConfig };
  }

  // 标记执行中
  const abortController = new AbortController();
  runningExecutions.set(id, abortController);

  try {
    await executeWorkflow(workflow, apiConfig, sendSSE);
  } catch (err) {
    sendSSE('workflow_error', { error: err.message || '执行引擎内部错误' });
  }

  // 清理
  clearInterval(heartbeat);
  runningExecutions.delete(id);

  if (!res.writableEnded) {
    res.end();
  }
});

/** 查询执行状态 */
router.get('/:id/status', (req, res) => {
  const isRunning = runningExecutions.has(req.params.id);
  res.json({
    success: true,
    status: isRunning ? 'running' : 'idle',
  });
});

/** 取消执行 */
router.post('/:id/cancel', (req, res) => {
  const controller = runningExecutions.get(req.params.id);
  if (controller) {
    controller.abort();
    runningExecutions.delete(req.params.id);
    res.json({ success: true, message: '已取消执行' });
  } else {
    res.json({ success: true, message: '没有正在执行的任务' });
  }
});

export default router;
