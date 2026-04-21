// ============================================================
// Flow Studio - 核心类型定义
// ============================================================

/** 模型信息 */
export interface ModelInfo { id: string; cat: 'chat' | 'image' | 'video'; }

/** 端口数据类型 */
export type PortDataType = 'string' | 'image' | 'image[]' | 'video' | 'audio' | 'any';

/** 端口定义 */
export interface PortDef {
  id: string;
  label: string;
  type: PortDataType;
  required?: boolean;
  default?: unknown;
}

/** 节点参数类型 */
export type ParamType = 'text' | 'textarea' | 'select' | 'number' | 'slider' | 'toggle';

/** 节点参数定义 */
export interface ParamDef {
  id: string;
  label: string;
  type: ParamType;
  default?: unknown;
  options?: { label: string; value: unknown }[];
  min?: number;
  max?: number;
  step?: number;
}

/** 节点类型定义 */
export interface NodeTypeDef {
  type: string;
  label: string;
  icon: string;
  color: string;
  category: 'input' | 'merge' | 'ai' | 'output';
  inputs: PortDef[];
  outputs: PortDef[];
  params: ParamDef[];
  /** 合并节点：最大输入端口数（动态端口），undefined 表示固定端口 */
  maxInputs?: number;
}

/** 工作流节点数据 */
export interface WorkflowNodeData {
  [key: string]: unknown;
}

/** 工作流中的节点 */
export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

/** 工作流中的连线 */
export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

/** 工作流设置 */
export interface WorkflowSettings {
  apiConfigId?: string;
  providerConfig?: {
    authType?: string;
    imageMode?: string;
    videoMode?: string;
  };
}

/** 工作流数据结构 */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
}

/** 节点执行状态 */
export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error';

/** SSE 事件数据类型 */
export interface SSENodeStart {
  nodeId: string;
  nodeType: string;
  index: number;
  total: number;
}

export interface SSENodeProgress {
  nodeId: string;
  progress: number;
  message: string;
}

export interface SSENodeComplete {
  nodeId: string;
  outputs: Record<string, unknown>;
  duration: number;
}

export interface SSENodeError {
  nodeId: string;
  error: string;
}

export interface SSEWorkflowComplete {
  totalDuration: number;
  successCount: number;
  failCount: number;
}

export interface SSEWorkflowError {
  error: string;
}

/** 主题类型 */
export type ThemeMode = 'light' | 'dark';
