// ============================================================
// Flow Studio - 视频生成节点执行器
// 调用 OpenAI 兼容的视频生成 API
// 支持两种模式：poll（提交任务 → 轮询结果）和 sync（同步返回）
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fileToBase64 } from '../helpers/fileHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUTS_DIR = path.join(__dirname, '..', '..', 'storage', 'outputs');

if (!fs.existsSync(OUTPUTS_DIR)) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}

/**
 * 根据 providerConfig 构建认证请求头
 */
function buildAuthHeaders(apiKey, providerConfig) {
  const cfg = providerConfig || {};
  const authType = cfg.authType || 'bearer';
  const key = apiKey.replace(/[^\x20-\x7E]/g, '').trim();
  const headers = { 'Content-Type': 'application/json' };

  switch (authType) {
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

/**
 * 智能拼接 API URL，避免 /v1 重复
 */
function buildApiUrl(base, endpoint) {
  base = (base || '').replace(/\/+$/, '');
  if (!base) return '';
  if (/\/v\d+$/.test(base) && /^\/v\d+\//.test(endpoint)) {
    return base + endpoint.replace(/^\/v\d+/, '');
  }
  return base + endpoint;
}

/**
 * 下载视频并保存到本地
 */
async function downloadAndSaveVideo(url, prefix = 'vid') {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`);

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const buffer = Buffer.from(await response.arrayBuffer());

    const extMap = {
      'video/mp4': 'mp4', 'video/webm': 'webm',
      'video/quicktime': 'mov', 'video/x-matroska': 'mkv',
    };
    const ext = extMap[contentType] || 'mp4';
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(OUTPUTS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return `/api/outputs/${filename}`;
  } catch (err) {
    console.error('下载视频失败:', err.message);
    return url;
  }
}

/**
 * 提交视频生成任务
 */
async function submitVideoTask(baseUrl, headers, model, prompt, params, sendProgress) {
  const videoEndpoint = params.videoEndpoint || '/video/generations';
  const url = buildApiUrl(baseUrl, videoEndpoint);

  sendProgress?.('正在提交视频生成任务...');

  const body = {
    model,
    prompt,
  };

  // 添加可选参数
  if (params.duration) body.duration = params.duration;
  if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
  if (params.resolution) body.resolution = params.resolution;
  if (params.image_url) body.image_url = params.image_url;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `视频生成 API 失败 (${response.status})`);
  }

  // 提取任务 ID
  const taskId = data.id || data.task_id || data.data?.id;
  if (!taskId) {
    // 可能是同步返回的视频（某些 API 直接返回结果）
    const videoUrl = data.video_url || data.output?.video_url ||
                     data.data?.video_url || data.data?.output?.video_url;
    if (videoUrl) {
      return { mode: 'sync', videoUrl };
    }
    throw new Error('未获得任务ID，也未返回视频: ' + JSON.stringify(data).slice(0, 200));
  }

  return { mode: 'poll', taskId };
}

/**
 * 轮询视频生成任务状态
 */
async function pollVideoStatus(baseUrl, headers, taskId, params, sendProgress) {
  const videoEndpoint = params.videoEndpoint || '/video/generations';
  const pollUrl = buildApiUrl(baseUrl, `${videoEndpoint}/${taskId}`);

  const maxAttempts = 120; // 最多轮询 120 次
  const intervalMs = 5000; // 每 5 秒一次
  let lastProgress = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    sendProgress?.(`正在等待视频生成... (${attempt * 5}s)`);

    try {
      const response = await fetch(pollUrl, { headers });
      const data = await response.json();

      const status = data.status || data.data?.status;

      if (status === 'succeeded' || status === 'complete' || status === 'completed' || status === 'done') {
        // 成功
        const videoUrl = data.video_url || data.output?.video_url ||
                        data.data?.video_url || data.data?.output?.video_url;
        return videoUrl;
      }

      if (status === 'failed' || status === 'error') {
        const error = data.error || data.data?.error || '视频生成失败';
        throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
      }

      // 处理进度
      if (data.progress || data.data?.progress) {
        const progress = data.progress || data.data?.progress;
        if (typeof progress === 'number' && progress > lastProgress) {
          lastProgress = progress;
          sendProgress?.(`视频生成进度: ${Math.round(progress * 100)}%`);
        }
      }

    } catch (err) {
      if (err.message.includes('视频生成失败') || err.message.includes('error')) {
        throw err;
      }
      // 网络错误，继续重试
      console.warn(`轮询视频状态失败 (attempt ${attempt}):`, err.message);
    }

    // 等待下一次轮询
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('视频生成超时（超过 10 分钟），请检查任务状态');
}

/**
 * 执行视频生成节点
 */
export async function execute(node, inputs, apiConfig, sendProgress) {
  const { apiKey, baseUrl, providerConfig: cfg } = apiConfig;

  if (!apiKey) {
    throw new Error('未配置 API Key，请在设置中配置');
  }

  // 获取提示词
  const prompt = inputs.prompt || '';
  if (!prompt) {
    throw new Error('未提供提示词，请连接文本输入节点');
  }

  const model = node.data?.model || apiConfig.defaultVideoModel || 'cogvideox';
  const duration = node.data?.duration || 5;
  const resolution = node.data?.resolution || '720p';
  const ratio = node.data?.ratio || '16:9';
  const headers = buildAuthHeaders(apiKey, cfg || {});
  const videoMode = cfg?.videoMode || 'poll';

  // 处理参考图片
  let imageUrl = null;
  if (inputs.reference) {
    sendProgress?.('正在处理参考图片...');
    const refUrls = Array.isArray(inputs.reference) ? inputs.reference : [inputs.reference];
    if (refUrls.length > 0 && refUrls[0]) {
      imageUrl = await fileToBase64(refUrls[0]);
    }
  }

  console.log(`🎬 视频生成: model=${model}, duration=${duration}s, ratio=${ratio}, resolution=${resolution}`);

  const params = {
    duration,
    aspect_ratio: ratio,
    resolution,
    image_url: imageUrl,
    videoEndpoint: cfg?.videoEndpoint || '/video/generations',
  };

  let videoUrl;

  if (videoMode === 'poll') {
    // 提交任务 → 轮询结果
    const result = await submitVideoTask(baseUrl, headers, model, prompt, params, sendProgress);

    if (result.mode === 'sync') {
      // 同步返回了视频
      videoUrl = result.videoUrl;
    } else {
      // 需要轮询
      videoUrl = await pollVideoStatus(baseUrl, headers, result.taskId, params, sendProgress);
    }
  } else {
    // 同步模式（某些 API 直接返回结果）
    const result = await submitVideoTask(baseUrl, headers, model, prompt, params, sendProgress);
    videoUrl = result.videoUrl || result;
  }

  if (!videoUrl) {
    throw new Error('视频生成完成但未获得视频 URL');
  }

  // 下载并保存视频到本地
  sendProgress?.('正在下载并保存视频...');
  let savedUrl;

  if (videoUrl.startsWith('data:')) {
    // base64 视频（罕见但可能）
    const matches = videoUrl.match(/^data:video\/([^;]+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'quicktime' ? 'mov' : matches[1];
      const filename = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = path.join(OUTPUTS_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
      savedUrl = `/api/outputs/${filename}`;
    } else {
      savedUrl = videoUrl;
    }
  } else if (videoUrl.startsWith('http')) {
    savedUrl = await downloadAndSaveVideo(videoUrl);
  } else if (videoUrl.startsWith('/api/')) {
    // 已经是本地 URL（不太可能，但做兜底）
    savedUrl = videoUrl;
  } else {
    savedUrl = videoUrl;
  }

  console.log(`🎬 视频生成完成: ${savedUrl}`);

  return { video: savedUrl };
}
