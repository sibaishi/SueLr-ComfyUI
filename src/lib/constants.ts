// ============================================================
// Flow Studio - 常量 & 节点注册表
// ============================================================

import type { NodeTypeDef } from './types';

/** 节点类型注册表 - 定义所有可用的节点类型 */
export const NODE_REGISTRY: NodeTypeDef[] = [
  // ============ 输入节点 ============
  {
    type: 'textInput',
    label: '文本输入',
    icon: 'pen',
    color: '#007AFF',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'text', label: '文本', type: 'string' },
    ],
    params: [
      { id: 'text', label: '文本内容', type: 'textarea', default: '' },
    ],
  },
  {
    type: 'imageInput',
    label: '图片输入',
    icon: 'image',
    color: '#FF9500',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'image', label: '图片', type: 'image' },
    ],
    params: [
      { id: 'fileUrl', label: '图片文件', type: 'text', default: '' },
    ],
  },
  {
    type: 'videoInput',
    label: '视频输入',
    icon: 'film',
    color: '#AF52DE',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'video', label: '视频', type: 'video' },
    ],
    params: [
      { id: 'fileUrl', label: '视频文件', type: 'text', default: '' },
    ],
  },
  {
    type: 'audioInput',
    label: '音频输入',
    icon: 'music',
    color: '#FF375F',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'audio', label: '音频', type: 'audio' },
    ],
    params: [
      { id: 'fileUrl', label: '音频文件', type: 'text', default: '' },
    ],
  },
  // ============ 合并节点（动态端口） ============
  {
    type: 'textMerge',
    label: '文本合并',
    icon: 'merge',
    color: '#007AFF',
    category: 'merge',
    inputs: [
      { id: 'item', label: '文本', type: 'string', required: false },
    ],
    outputs: [
      { id: 'merged', label: '合并文本', type: 'string' },
    ],
    params: [],
    maxInputs: 9,
  },
  {
    type: 'imageMerge',
    label: '图片合并',
    icon: 'merge',
    color: '#FF9500',
    category: 'merge',
    inputs: [
      { id: 'item', label: '图片', type: 'image', required: false },
    ],
    outputs: [
      { id: 'merged', label: '合并图片', type: 'image[]' },
    ],
    params: [],
    maxInputs: 9,
  },
  {
    type: 'videoMerge',
    label: '视频合并',
    icon: 'merge',
    color: '#AF52DE',
    category: 'merge',
    inputs: [
      { id: 'item', label: '视频', type: 'video', required: false },
    ],
    outputs: [
      { id: 'merged', label: '合并视频', type: 'video' },
    ],
    params: [],
    maxInputs: 9,
  },
  {
    type: 'audioMerge',
    label: '音频合并',
    icon: 'merge',
    color: '#FF375F',
    category: 'merge',
    inputs: [
      { id: 'item', label: '音频', type: 'audio', required: false },
    ],
    outputs: [
      { id: 'merged', label: '合并音频', type: 'audio' },
    ],
    params: [],
    maxInputs: 9,
  },
  {
    type: 'universalMerge',
    label: '通用合并',
    icon: 'merge',
    color: '#64D2FF',
    category: 'merge',
    inputs: [
      { id: 'item', label: '素材', type: 'any', required: false },
    ],
    outputs: [
      { id: 'merged', label: '合并素材', type: 'any' },
    ],
    params: [],
    maxInputs: 9,
  },

  // ============ AI 能力节点 ============
  {
    type: 'aiChat',
    label: 'AI 对话',
    icon: 'bot',
    color: '#30D158',
    category: 'ai',
    inputs: [
      { id: 'prompt', label: '提示词', type: 'string', required: true },
      { id: 'image', label: '图片', type: 'image', required: false },
      { id: 'video', label: '视频', type: 'video', required: false },
      { id: 'audio', label: '音频', type: 'audio', required: false },
    ],
    outputs: [
      { id: 'response', label: '回复', type: 'string' },
    ],
    params: [
      {
        id: 'model', label: '模型', type: 'select',
        options: [], // 动态从 API 获取
        default: '',
      },
      { id: 'systemPrompt', label: '系统提示词', type: 'textarea', default: '' },
      { id: 'temperature', label: '温度', type: 'slider', min: 0, max: 2, step: 0.1, default: 0.7 },
      { id: 'maxTokens', label: '最大 Token', type: 'number', min: 1, max: 32000, default: 4096 },
    ],
  },
  {
    type: 'imageGen',
    label: '图像生成',
    icon: 'palette',
    color: '#FF9500',
    category: 'ai',
    inputs: [
      { id: 'prompt', label: '提示词', type: 'string', required: true },
      { id: 'reference', label: '参考图片', type: 'image', required: false },
      { id: 'video', label: '视频', type: 'video', required: false },
      { id: 'audio', label: '音频', type: 'audio', required: false },
    ],
    outputs: [
      { id: 'images', label: '生成图片', type: 'image[]' },
    ],
    params: [
      {
        id: 'model', label: '模型', type: 'select',
        options: [], // 动态从 API 获取
        default: '',
      },
      {
        id: 'ratio', label: '图片比例', type: 'select', default: '1:1',
        options: [
          { label: '1:1', value: '1:1' },
          { label: '16:9', value: '16:9' },
          { label: '9:16', value: '9:16' },
          { label: '4:3', value: '4:3' },
          { label: '3:4', value: '3:4' },
        ],
      },
      {
        id: 'imageMode', label: '生成方式', type: 'select', default: 'standalone',
        options: [
          { label: '专用接口（推荐）', value: 'standalone' },
          { label: '对话接口', value: 'chat' },
        ],
      },
    ],
  },
  {
    type: 'videoGen',
    label: '视频生成',
    icon: 'clapperboard',
    color: '#AF52DE',
    category: 'ai',
    inputs: [
      { id: 'prompt', label: '提示词', type: 'string', required: true },
      { id: 'reference', label: '参考图片', type: 'image', required: false },
      { id: 'video', label: '视频', type: 'video', required: false },
      { id: 'audio', label: '音频', type: 'audio', required: false },
    ],
    outputs: [
      { id: 'video', label: '生成视频', type: 'video' },
    ],
    params: [
      {
        id: 'model', label: '模型', type: 'select',
        options: [], // 动态从 API 获取
        default: '',
      },
      {
        id: 'duration', label: '时长(秒)', type: 'select', default: 5,
        options: [
          { label: '5秒', value: 5 },
          { label: '10秒', value: 10 },
        ],
      },
      {
        id: 'resolution', label: '分辨率', type: 'select', default: '720p',
        options: [
          { label: '720p', value: '720p' },
          { label: '1080p', value: '1080p' },
        ],
      },
      {
        id: 'ratio', label: '比例', type: 'select', default: '16:9',
        options: [
          { label: '16:9', value: '16:9' },
          { label: '9:16', value: '9:16' },
          { label: '1:1', value: '1:1' },
        ],
      },
    ],
  },
  {
    type: 'webSearch',
    label: '网页搜索',
    icon: 'search',
    color: '#5AC8FA',
    category: 'ai',
    inputs: [
      { id: 'query', label: '搜索词', type: 'string', required: true },
    ],
    outputs: [
      { id: 'results', label: '搜索结果', type: 'string' },
    ],
    params: [
      { id: 'maxResults', label: '最大结果数', type: 'number', min: 1, max: 10, default: 5 },
      { id: 'includeAnswer', label: '包含AI摘要', type: 'toggle', default: true },
    ],
  },

  // ============ 输出节点 ============
  {
    type: 'output',
    label: '输出展示',
    icon: 'eye',
    color: '#8E8E93',
    category: 'output',
    inputs: [
      { id: 'content', label: '内容', type: 'any', required: true },
    ],
    outputs: [],
    params: [],
  },
];

/** 根据节点类型获取节点定义 */
export function getNodeDef(type: string): NodeTypeDef | undefined {
  return NODE_REGISTRY.find(n => n.type === type);
}

/** 节点分类信息 */
export const NODE_CATEGORIES = [
  { id: 'input', label: '输入', icon: '📝' },
  { id: 'merge', label: '合并', icon: '🔀' },
  { id: 'ai', label: 'AI 能力', icon: '🤖' },
  { id: 'output', label: '输出', icon: '📤' },
] as const;

/**
 * 连线类型兼容矩阵
 * key = 源端口类型, value = 可连接的目标端口类型列表
 * 特殊：目标端口为 'any' 时接受所有源类型
 */
export const PORT_COMPATIBILITY: Record<string, string[]> = {
  string: ['string', 'image', 'image[]', 'video', 'audio', 'any'],
  image: ['image', 'image[]', 'video', 'any'],
  'image[]': ['image', 'image[]', 'video', 'any'],
  video: ['video', 'any'],
  audio: ['audio', 'any'],
  any: ['string', 'image', 'image[]', 'video', 'audio', 'any'],
};

/** 默认工作流名称 */
export const DEFAULT_WORKFLOW_NAME = '未命名工作流';

/** 应用版本 */
export const APP_VERSION = '0.2.0';
