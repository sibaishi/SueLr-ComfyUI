// ============================================================
// Flow Studio - AI 对话节点执行器
// 调用 OpenAI 兼容的 Chat Completion API
// 支持：多模态输入（图片/视频/音频）+ Provider 配置
// ============================================================

import { fileToBase64, isLocalFileUrl } from '../helpers/fileHelper.js';

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
 * 构建 OpenAI Vision 格式的消息内容
 * 文本 + 图片/视频/音频 → ContentPart[]
 */
async function buildMessageContent(text, inputs) {
  const parts = [];

  // 添加文本
  if (text) {
    parts.push({ type: 'text', text });
  }

  // 添加图片（可能是单个 URL 或 URL 数组）
  const images = inputs.image
    ? Array.isArray(inputs.image) ? inputs.image : [inputs.image]
    : [];
  for (const imgUrl of images) {
    if (!imgUrl) continue;
    const b64 = await fileToBase64(imgUrl);
    parts.push({ type: 'image_url', image_url: { url: b64 } });
  }

  // 添加视频（大多数 API 通过 image_url 方式传递视频帧）
  const videos = inputs.video
    ? Array.isArray(inputs.video) ? inputs.video : [inputs.video]
    : [];
  for (const vidUrl of videos) {
    if (!vidUrl) continue;
    const b64 = await fileToBase64(vidUrl);
    parts.push({ type: 'image_url', image_url: { url: b64 } });
  }

  // 添加音频（大多数 API 通过 input_audio 格式传递）
  const audios = inputs.audio
    ? Array.isArray(inputs.audio) ? inputs.audio : [inputs.audio]
    : [];
  for (const audUrl of audios) {
    if (!audUrl) continue;
    const b64 = await fileToBase64(audUrl);
    // OpenAI audio 格式
    const mimeMatch = b64.match(/^data:(audio\/[^;]+);/);
    const format = mimeMatch ? mimeMatch[1].split('/')[1] : 'mp3';
    parts.push({ type: 'input_audio', input_audio: { data: b64.split(',')[1], format } });
  }

  // 如果只有文本，返回纯字符串（兼容性更好）
  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text;
  }

  return parts;
}

/**
 * 执行 AI 对话节点
 * @param {Object} node - 节点数据
 * @param {Object} inputs - 上游输入 { prompt, image, video, audio }
 * @param {Object} apiConfig - API 配置 { apiKey, baseUrl, providerConfig }
 * @param {Function} sendProgress - 进度回调
 */
export async function execute(node, inputs, apiConfig, sendProgress) {
  const { apiKey, baseUrl } = apiConfig;

  if (!apiKey) {
    throw new Error('未配置 API Key，请在设置中配置');
  }

  // 获取提示词：优先使用连线传入的
  const prompt = inputs.prompt || '';
  if (!prompt && !inputs.image && !inputs.video && !inputs.audio) {
    throw new Error('未提供任何输入，请连接输入节点');
  }

  const model = node.data?.model || apiConfig.defaultChatModel || 'gpt-4o-mini';
  const systemPrompt = node.data?.systemPrompt || '你是一个有帮助的AI助手。';
  const temperature = node.data?.temperature ?? 0.7;
  const maxTokens = node.data?.maxTokens ?? 4096;

  // 构建 API URL
  const providerConfig = apiConfig.providerConfig || {};
  const chatEndpoint = providerConfig.chatEndpoint || '/chat/completions';
  const url = buildApiUrl(baseUrl, chatEndpoint);

  const headers = buildAuthHeaders(apiKey, providerConfig);

  // 构建用户消息内容（支持多模态）
  sendProgress?.('正在准备输入内容...');
  const userContent = await buildMessageContent(prompt, inputs);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  sendProgress?.('正在调用 AI 模型...');
  console.log(`🤖 AI 对话: model=${model}, multimodal=${Array.isArray(userContent)}`);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '未知错误');
    let errorMsg;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = errorJson.error?.message || errorJson.message || errorText;
    } catch {
      errorMsg = errorText;
    }
    throw new Error(`API 调用失败 (${response.status}): ${errorMsg}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  if (!content) {
    throw new Error('AI 返回了空内容');
  }

  return { response: content };
}
