// ============================================================
// Flow Studio - 设置管理路由
// ============================================================

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '..', 'storage', 'settings.json');

const DEFAULT_SETTINGS = {
  theme: 'light',
  apiKey: '',
  tavilyApiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  defaultChatModel: '',
  defaultImageModel: '',
  defaultVideoModel: '',
  providerConfig: {
    authType: 'bearer',
    imageMode: 'chat',
    videoMode: 'poll',
    chatEndpoint: '/chat/completions',
    modelsEndpoint: '/models',
    videoEndpoint: '/video/generations',
  },
};

function ensureSettingsFile() {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
  }
}

function readSettings() {
  ensureSettingsFile();
  try {
    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(content),
      providerConfig: {
        ...DEFAULT_SETTINGS.providerConfig,
        ...(JSON.parse(content).providerConfig || {}),
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings) {
  ensureSettingsFile();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function maskSecret(secret) {
  if (!secret) return '';
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function buildMaskedSettings(settings) {
  return {
    ...settings,
    apiKeyMasked: maskSecret(settings.apiKey),
    apiKeySet: Boolean(settings.apiKey),
    tavilyApiKeyMasked: maskSecret(settings.tavilyApiKey),
    tavilyApiKeySet: Boolean(settings.tavilyApiKey),
    apiKey: undefined,
    tavilyApiKey: undefined,
  };
}

function buildApiUrl(baseUrl, endpoint) {
  const base = (baseUrl || '').replace(/\/+$/, '');
  if (!endpoint) return base;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;

  if (/\/v\d+$/.test(base) && /^\/v\d+\//.test(endpoint)) {
    return base + endpoint.replace(/^\/v\d+/, '');
  }
  return base + endpoint;
}

function catModel(id) {
  const lower = id.toLowerCase();
  if (/seedance|cogvideo|runway|sora|video|animate|kling/i.test(lower)) return 'video';
  if (/seedream|dall|stable.?diffusion|midjourney|sdxl|flux|cogview|image|banana|wanx/i.test(lower)) return 'image';
  return 'chat';
}

function buildAuthHeaders(apiKey, providerConfig) {
  const cfg = providerConfig || DEFAULT_SETTINGS.providerConfig;
  const key = String(apiKey || '').replace(/[^\x20-\x7E]/g, '').trim();
  const headers = { 'Content-Type': 'application/json' };

  switch (cfg.authType) {
    case 'api-key':
      headers['X-API-Key'] = key;
      break;
    case 'custom':
      headers[cfg.customHeaderName || 'Authorization'] = `${cfg.customPrefix ?? 'Bearer '}${key}`;
      break;
    default:
      headers.Authorization = `Bearer ${key}`;
      break;
  }

  return headers;
}

async function fetchModelsFromProvider({ apiKey, baseUrl, providerConfig }) {
  if (!apiKey) {
    throw new Error('请先配置 API Key');
  }

  const url = buildApiUrl(baseUrl || DEFAULT_SETTINGS.baseUrl, providerConfig.modelsEndpoint || '/models');
  const headers = buildAuthHeaders(apiKey, providerConfig);
  delete headers['Content-Type'];

  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`获取模型失败 (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const allModels = (data.data || [])
    .map((model) => model.id)
    .filter(Boolean)
    .sort((left, right) => String(left).localeCompare(String(right)));

  return {
    all: allModels,
    chat: allModels.filter((id) => catModel(String(id)) === 'chat'),
    image: allModels.filter((id) => catModel(String(id)) === 'image'),
    video: allModels.filter((id) => catModel(String(id)) === 'video'),
  };
}

const router = Router();

router.get('/', (_req, res) => {
  try {
    const settings = readSettings();
    res.json({ success: true, data: buildMaskedSettings(settings) });
  } catch {
    res.status(500).json({ success: false, error: '读取设置失败' });
  }
});

router.put('/', (req, res) => {
  try {
    const current = readSettings();
    const updates = { ...req.body };

    if (typeof updates.apiKey === 'string' && updates.apiKey.includes('...')) {
      delete updates.apiKey;
    }
    if (typeof updates.tavilyApiKey === 'string' && updates.tavilyApiKey.includes('...')) {
      delete updates.tavilyApiKey;
    }

    const updated = {
      ...current,
      ...updates,
      providerConfig: {
        ...current.providerConfig,
        ...(updates.providerConfig || {}),
      },
    };

    writeSettings(updated);
    res.json({ success: true, data: buildMaskedSettings(updated) });
  } catch {
    res.status(500).json({ success: false, error: '更新设置失败' });
  }
});

router.post('/test-api', async (req, res) => {
  try {
    const current = readSettings();
    const apiKey = req.body.apiKey && req.body.apiKey !== 'use-stored'
      ? req.body.apiKey
      : current.apiKey;
    const baseUrl = req.body.baseUrl || current.baseUrl;
    const providerConfig = {
      ...current.providerConfig,
      ...(req.body.providerConfig || {}),
    };

    const models = await fetchModelsFromProvider({ apiKey, baseUrl, providerConfig });
    res.json({
      success: true,
      message: `连接成功，已加载 ${models.all.length} 个模型`,
      models: models.all,
      categorized: {
        chat: models.chat,
        image: models.image,
        video: models.video,
      },
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      return res.json({ success: false, error: '连接超时，请检查 Base URL 与网络' });
    }
    res.json({ success: false, error: error instanceof Error ? error.message : '连接测试失败' });
  }
});

router.get('/models', async (_req, res) => {
  try {
    const settings = readSettings();
    const models = await fetchModelsFromProvider({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      providerConfig: settings.providerConfig,
    });

    res.json({
      success: true,
      data: {
        all: models.all,
        chat: models.chat,
        image: models.image,
        video: models.video,
      },
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      return res.json({ success: false, error: '获取模型列表超时' });
    }
    res.json({ success: false, error: error instanceof Error ? error.message : '获取模型列表失败' });
  }
});

export default router;
