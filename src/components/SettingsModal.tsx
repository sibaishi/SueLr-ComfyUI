// ============================================================
// Flow Studio - 设置弹窗
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSettings, testApiConnection, updateSettings } from '@/lib/api';
import { useWorkflowStore } from '@/lib/store';
import type { ProviderConfig } from '@/lib/providers/types';

interface SettingsModalProps {
  onClose: () => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

type SettingsResponse = {
  baseUrl?: string;
  apiKeySet?: boolean;
  apiKeyMasked?: string;
  tavilyApiKeySet?: boolean;
  tavilyApiKeyMasked?: string;
  defaultChatModel?: string;
  defaultImageModel?: string;
  defaultVideoModel?: string;
  providerConfig?: Partial<ProviderConfig>;
};

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const store = useWorkflowStore();
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [tavilyKeySet, setTavilyKeySet] = useState(false);
  const [tavilyKeyMasked, setTavilyKeyMasked] = useState('');
  const [defaultChatModel, setDefaultChatModel] = useState('');
  const [defaultImageModel, setDefaultImageModel] = useState('');
  const [defaultVideoModel, setDefaultVideoModel] = useState('');
  const [authType, setAuthType] = useState<'bearer' | 'api-key' | 'custom'>('bearer');
  const [customHeaderName, setCustomHeaderName] = useState('Authorization');
  const [customPrefix, setCustomPrefix] = useState('Bearer ');
  const [chatEndpoint, setChatEndpoint] = useState('/chat/completions');
  const [modelsEndpoint, setModelsEndpoint] = useState('/models');
  const [videoEndpoint, setVideoEndpoint] = useState('/video/generations');
  const [imageMode, setImageMode] = useState<'chat' | 'standalone' | 'none'>('chat');
  const [videoMode, setVideoMode] = useState<'poll' | 'none'>('poll');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');

  const providerConfig = useMemo<ProviderConfig>(() => {
    const config: ProviderConfig = {
      authType,
      imageMode,
      videoMode,
      chatEndpoint,
      modelsEndpoint,
      videoEndpoint,
    };
    if (authType === 'custom') {
      config.customHeaderName = customHeaderName;
      config.customPrefix = customPrefix;
    }
    return config;
  }, [
    authType,
    chatEndpoint,
    customHeaderName,
    customPrefix,
    imageMode,
    modelsEndpoint,
    videoEndpoint,
    videoMode,
  ]);

  const modelCountText = useMemo(() => {
    if (store.availableModels.all.length === 0) return '尚未获取模型列表';
    return `已加载 ${store.availableModels.all.length} 个模型`;
  }, [store.availableModels.all.length]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const result = await fetchSettings();
    if (result.success && result.data) {
      const settings = result.data as SettingsResponse;
      setBaseUrl(settings.baseUrl || 'https://api.openai.com/v1');
      setApiKeySet(Boolean(settings.apiKeySet));
      setApiKeyMasked(settings.apiKeyMasked || '');
      setTavilyKeySet(Boolean(settings.tavilyApiKeySet));
      setTavilyKeyMasked(settings.tavilyApiKeyMasked || '');
      setDefaultChatModel(settings.defaultChatModel || '');
      setDefaultImageModel(settings.defaultImageModel || '');
      setDefaultVideoModel(settings.defaultVideoModel || '');

      const config = settings.providerConfig || {};
      setAuthType((config.authType as ProviderConfig['authType']) || 'bearer');
      setCustomHeaderName(config.customHeaderName || 'Authorization');
      setCustomPrefix(config.customPrefix ?? 'Bearer ');
      setChatEndpoint(config.chatEndpoint || '/chat/completions');
      setModelsEndpoint(config.modelsEndpoint || '/models');
      setVideoEndpoint(config.videoEndpoint || '/video/generations');
      setImageMode((config.imageMode as ProviderConfig['imageMode']) || 'chat');
      setVideoMode((config.videoMode as ProviderConfig['videoMode']) || 'poll');
    } else if (result.error) {
      setTestStatus('error');
      setTestMessage(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const persistSettings = useCallback(async (overrideApiKey?: string) => {
    const payload: Record<string, unknown> = {
      baseUrl,
      defaultChatModel,
      defaultImageModel,
      defaultVideoModel,
      providerConfig,
    };

    if (overrideApiKey || apiKey) {
      payload.apiKey = overrideApiKey || apiKey;
    }
    if (tavilyKey) {
      payload.tavilyApiKey = tavilyKey;
    }

    return updateSettings(payload);
  }, [
    apiKey,
    baseUrl,
    defaultChatModel,
    defaultImageModel,
    defaultVideoModel,
    providerConfig,
    tavilyKey,
  ]);

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    const result = await persistSettings();
    if (result.success) {
      setSaveStatus('saved');
      setApiKey('');
      setTavilyKey('');
      setApiKeySet(true);
      await store.fetchModels();
      window.setTimeout(() => setSaveStatus('idle'), 1800);
      return;
    }

    setSaveStatus('idle');
    setTestStatus('error');
    setTestMessage(result.error || '保存失败');
  }, [persistSettings, store]);

  const handleTest = useCallback(async () => {
    if (!apiKey && !apiKeySet) {
      setTestStatus('error');
      setTestMessage('请先输入 API Key');
      return;
    }

    setTestStatus('testing');
    setTestMessage('正在测试连接并拉取模型列表...');

    const saveResult = await persistSettings(apiKey || undefined);
    if (!saveResult.success) {
      setTestStatus('error');
      setTestMessage(saveResult.error || '保存设置失败');
      return;
    }

    const result = await testApiConnection(apiKey || 'use-stored', baseUrl, providerConfig as unknown as Record<string, unknown>);
    if (!result.success || !result.data) {
      setTestStatus('error');
      setTestMessage(result.error || '连接测试失败');
      return;
    }

    const data = result.data as {
      message?: string;
      models?: string[];
      categorized?: {
        chat?: string[];
        image?: string[];
        video?: string[];
      };
    };

    const models = data.models || [];
    const categorized = data.categorized || {};
    store.setAvailableModels({
      all: models,
      chat: categorized.chat || [],
      image: categorized.image || [],
      video: categorized.video || [],
    });

    setTestStatus('success');
    setTestMessage(
      data.message ||
      `连接成功，已加载 ${models.length} 个模型（对话 ${categorized.chat?.length || 0} / 图像 ${categorized.image?.length || 0} / 视频 ${categorized.video?.length || 0}）`
    );
    setApiKeySet(true);
  }, [apiKey, apiKeySet, baseUrl, persistSettings, providerConfig, store]);

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
  };

  const modelOptions = store.availableModels.all;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="glass mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl shadow-2xl"
        style={{ border: '1px solid var(--color-border)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              API 与 Provider 设置
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {modelCountText}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              正在加载设置...
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    API Key
                    {apiKeySet && apiKeyMasked ? (
                      <span style={{ color: 'var(--color-text-tertiary)' }}> （当前: {apiKeyMasked}）</span>
                    ) : null}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={apiKeySet ? '留空表示继续使用当前 Key' : 'sk-...'}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Tavily Key（网页搜索，可选）
                    {tavilyKeySet && tavilyKeyMasked ? (
                      <span style={{ color: 'var(--color-text-tertiary)' }}> （当前: {tavilyKeyMasked}）</span>
                    ) : null}
                  </label>
                  <input
                    type="password"
                    value={tavilyKey}
                    onChange={(e) => setTavilyKey(e.target.value)}
                    placeholder={tavilyKeySet ? '留空表示继续使用当前 Tavily Key' : 'tvly-...'}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    默认模型
                  </h3>
                  <button
                    onClick={() => void store.fetchModels()}
                    className="rounded-lg px-2 py-1 text-xs"
                    style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                  >
                    刷新模型
                  </button>
                </div>

                <ModelSelect
                  label="默认对话模型"
                  value={defaultChatModel}
                  onChange={setDefaultChatModel}
                  options={store.availableModels.chat.length > 0 ? store.availableModels.chat : modelOptions}
                />
                <ModelSelect
                  label="默认图像模型"
                  value={defaultImageModel}
                  onChange={setDefaultImageModel}
                  options={store.availableModels.image.length > 0 ? store.availableModels.image : modelOptions}
                />
                <ModelSelect
                  label="默认视频模型"
                  value={defaultVideoModel}
                  onChange={setDefaultVideoModel}
                  options={store.availableModels.video.length > 0 ? store.availableModels.video : modelOptions}
                />
              </section>

              <section className="space-y-3">
                <button
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {showAdvanced ? '▼' : '▶'} 高级 Provider 配置
                </button>

                {showAdvanced && (
                  <div
                    className="space-y-3 rounded-xl p-4"
                    style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                  >
                    <div>
                      <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        认证方式
                      </label>
                      <select
                        value={authType}
                        onChange={(e) => setAuthType(e.target.value as ProviderConfig['authType'])}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value="bearer">Bearer Token</option>
                        <option value="api-key">X-API-Key</option>
                        <option value="custom">自定义 Header</option>
                      </select>
                    </div>

                    {authType === 'custom' && (
                      <>
                        <TextField label="Header 名称" value={customHeaderName} onChange={setCustomHeaderName} />
                        <TextField label="前缀" value={customPrefix} onChange={setCustomPrefix} />
                      </>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <TextField label="对话接口路径" value={chatEndpoint} onChange={setChatEndpoint} mono />
                      <TextField label="模型列表路径" value={modelsEndpoint} onChange={setModelsEndpoint} mono />
                      <TextField label="视频接口路径" value={videoEndpoint} onChange={setVideoEndpoint} mono />
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SelectField
                        label="图像生成方式"
                        value={imageMode}
                        onChange={(value) => setImageMode(value as ProviderConfig['imageMode'])}
                        options={[
                          { label: '对话接口', value: 'chat' },
                          { label: '专用接口', value: 'standalone' },
                          { label: '禁用', value: 'none' },
                        ]}
                      />
                      <SelectField
                        label="视频生成方式"
                        value={videoMode}
                        onChange={(value) => setVideoMode(value as ProviderConfig['videoMode'])}
                        options={[
                          { label: '轮询任务', value: 'poll' },
                          { label: '禁用', value: 'none' },
                        ]}
                      />
                    </div>
                  </div>
                )}
              </section>

              {testStatus !== 'idle' && testMessage && (
                <div
                  className="rounded-xl px-3 py-2 text-xs whitespace-pre-line"
                  style={{
                    background: testStatus === 'success'
                      ? 'rgba(48, 209, 88, 0.12)'
                      : testStatus === 'error'
                        ? 'rgba(255, 59, 48, 0.12)'
                        : 'rgba(0, 122, 255, 0.12)',
                    color: testStatus === 'success'
                      ? '#30D158'
                      : testStatus === 'error'
                        ? '#FF3B30'
                        : 'var(--color-accent)',
                  }}
                >
                  {testMessage}
                </div>
              )}
            </>
          )}
        </div>

        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            className="rounded-lg px-4 py-2 text-xs font-medium"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
              opacity: testStatus === 'testing' ? 0.6 : 1,
            }}
          >
            {testStatus === 'testing' ? '测试中...' : '测试连接并拉取模型'}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium"
              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
            >
              关闭
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg px-4 py-2 text-xs font-medium text-white"
              style={{ background: saveStatus === 'saved' ? '#30D158' : 'var(--color-accent)' }}
            >
              {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${mono ? 'font-mono' : ''}`}
        style={{
          background: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
        }}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{
          background: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ModelSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{
          background: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
        }}
      >
        <option value="">未设置</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
