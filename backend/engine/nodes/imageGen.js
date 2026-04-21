// ============================================================
// Flow Studio - 图像生成节点执行器
// 调用 OpenAI 兼容的图像生成 API
// 支持两种模式：chat（通过对话接口生成）和 standalone（专用图像接口）
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fileToBase64 } from '../helpers/fileHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUTS_DIR = path.join(__dirname, '..', '..', 'storage', 'outputs');

// 确保输出目录存在
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
 * 将 base64 data URL 保存到文件
 * @returns {string} 可访问的 URL 路径
 */
function saveBase64Image(dataUrl, prefix = 'img') {
  const matches = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!matches) {
    // 可能是纯 base64 字符串
    const ext = 'png';
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(OUTPUTS_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(dataUrl, 'base64'));
    return `/api/outputs/${filename}`;
  }

  const mime = matches[1];
  const base64 = matches[2];
  const extMap = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
  };
  const ext = extMap[mime] || 'png';
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = path.join(OUTPUTS_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return `/api/outputs/${filename}`;
}

/**
 * 下载远程图片并保存到本地
 */
async function downloadAndSave(url, prefix = 'img') {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`);

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());

    const extMap = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
      'image/gif': 'gif', 'image/webp': 'webp',
    };
    const ext = extMap[contentType] || 'png';
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(OUTPUTS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return `/api/outputs/${filename}`;
  } catch (err) {
    console.error('下载图片失败:', err.message);
    return url; // 返回原始 URL 作为降级
  }
}

/**
 * 提取 AI 响应中的图片
 */
function extractImagesFromResponse(data) {
  const images = [];

  // DALL-E 格式：data: [{ url, b64_json }]
  if (data.data && Array.isArray(data.data)) {
    for (const item of data.data) {
      if (item.url) images.push(item.url);
      if (item.b64_json) images.push(`data:image/png;base64,${item.b64_json}`);
    }
  }

  // Chat completion 格式：content 中包含图片
  const content = data.choices?.[0]?.message?.content;
  if (content) {
    if (typeof content === 'string') {
      // Markdown 图片格式
      const mdImgRegex = /!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g;
      let match;
      while ((match = mdImgRegex.exec(content)) !== null) {
        images.push(match[1]);
      }
      // 裸 base64
      const b64Regex = /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/g;
      while ((match = b64Regex.exec(content)) !== null) {
        if (!images.includes(match[1])) images.push(match[1]);
      }
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'image_url' && part.image_url?.url) {
          images.push(part.image_url.url);
        }
      }
    }
  }

  return images;
}

/**
 * 通过 Chat Completion API 生成图片（非流式）
 * 图像生成是一次性输出结果，不需要流式
 */
async function generateViaChat(url, headers, model, messages, sendProgress) {
  sendProgress?.('正在通过对话模型生成图片...');

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: false,
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
    throw new Error(`图片生成 API 调用失败 (${response.status}): ${errorMsg}`);
  }

  return await response.json();
}

/**
 * 通过专用图像生成 API 生成图片（如 DALL-E）
 */
async function generateViaStandalone(baseUrl, headers, model, prompt, size, sendProgress) {
  // 推断图像生成端点
  const url = buildApiUrl(baseUrl, '/images/generations');
  sendProgress?.('正在调用图像生成接口...');

  const body = {
    model,
    prompt,
    n: 1,
    size: size || '1024x1024',
    response_format: 'url',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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
    throw new Error(`图像生成 API 调用失败 (${response.status}): ${errorMsg}`);
  }

  return await response.json();
}

/**
 * 执行图像生成节点
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

  const model = node.data?.model || apiConfig.defaultImageModel || 'dall-e-3';
  const ratio = node.data?.ratio || '1:1';
  // 优先使用节点配置的 imageMode，然后是全局 providerConfig，默认 standalone
  const imageMode = node.data?.imageMode || cfg?.imageMode || 'standalone';
  const headers = buildAuthHeaders(apiKey, cfg || {});

  // 处理参考图片
  let referencePart = '';
  if (inputs.reference) {
    sendProgress?.('正在处理参考图片...');
    const refUrls = Array.isArray(inputs.reference) ? inputs.reference : [inputs.reference];
    for (const refUrl of refUrls) {
      if (!refUrl) continue;
      const b64 = await fileToBase64(refUrl);
      referencePart += `\n参考图片: ${b64}`;
    }
  }

  // 尺寸映射
  const sizeMap = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '1536x1024',
    '3:4': '1024x1536',
  };
  const size = sizeMap[ratio] || '1024x1024';

  sendProgress?.(`正在生成图片 (${ratio})...`);
  console.log(`🎨 图像生成: model=${model}, ratio=${ratio}, mode=${imageMode}`);

  let data;

  if (imageMode === 'standalone') {
    // 专用图像生成接口（DALL-E 等）
    data = await generateViaStandalone(baseUrl, headers, model, prompt, size, sendProgress);
  } else {
    // 通过 Chat Completion 接口生成（大多数兼容 API）
    const chatEndpoint = cfg?.chatEndpoint || '/chat/completions';
    const chatUrl = buildApiUrl(baseUrl, chatEndpoint);

    const messages = [
      {
        role: 'system',
        content: '你是一个图像生成助手。请根据用户的描述生成图片。直接输出图片，不要文字描述。',
      },
      {
        role: 'user',
        content: prompt + referencePart,
      },
    ];

    data = await generateViaChat(chatUrl, headers, model, messages, sendProgress);
  }

  // 提取图片
  const rawImages = extractImagesFromResponse(data);
  if (rawImages.length === 0) {
    // 如果没有提取到图片，检查是否有文本内容
    const text = data.choices?.[0]?.message?.content || '';
    if (text && typeof text === 'string') {
      // 模型可能返回了文本而不是图片
      throw new Error(`模型未返回图片，返回了文本: ${text.slice(0, 200)}`);
    }
    throw new Error('API 未返回任何图片');
  }

  // 保存图片到本地
  sendProgress?.(`正在保存 ${rawImages.length} 张图片...`);
  const savedUrls = [];

  for (let i = 0; i < rawImages.length; i++) {
    const img = rawImages[i];
    if (img.startsWith('data:')) {
      // base64 → 保存到文件
      const url = saveBase64Image(img, `img_${i}`);
      savedUrls.push(url);
    } else if (img.startsWith('http')) {
      // 远程 URL → 下载并保存
      const url = await downloadAndSave(img, `img_${i}`);
      savedUrls.push(url);
    }
  }

  console.log(`🎨 图像生成完成: ${savedUrls.length} 张图片`);

  return { images: savedUrls };
}
