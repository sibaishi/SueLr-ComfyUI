// ============================================================
// Flow Studio - Workflow Store
// ============================================================

import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { DEFAULT_WORKFLOW_NAME, NODE_REGISTRY } from '@/lib/constants';
import * as api from '@/lib/api';
import type { WorkflowListItem } from '@/lib/api';

function gid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const LOCAL_DRAFT_KEY = 'flow-studio-local-draft';
const AI_TYPES = ['aiChat', 'imageGen', 'videoGen', 'webSearch'];
const FILE_INPUT_TYPES = ['imageInput', 'videoInput', 'audioInput'];

type WorkflowDraftSnapshot = {
  workflowId: string;
  workflowName: string;
  nodes: Node[];
  edges: Edge[];
};

export type WorkflowEditorSnapshot = {
  workflowId: string;
  workflowName: string;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
};

type WorkflowExportData = {
  id: string;
  name: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  nodes: Node[];
  edges: Edge[];
  settings?: Record<string, unknown>;
};

function loadLocalDraft(): WorkflowDraftSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WorkflowDraftSnapshot>;
    if (
      !parsed ||
      typeof parsed.workflowId !== 'string' ||
      typeof parsed.workflowName !== 'string' ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }

    return {
      workflowId: parsed.workflowId,
      workflowName: parsed.workflowName,
      nodes: parsed.nodes as Node[],
      edges: parsed.edges as Edge[],
    };
  } catch {
    return null;
  }
}

function saveLocalDraft(snapshot: WorkflowDraftSnapshot) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore local draft persistence failures.
  }
}

function getDefaultData(nodeType: string): Record<string, unknown> {
  const def = NODE_REGISTRY.find((nodeDef) => nodeDef.type === nodeType);
  if (!def) return {};

  const data: Record<string, unknown> = {};
  for (const param of def.params) {
    if (param.default !== undefined) {
      data[param.id] = param.default;
    }
  }
  return data;
}

function normalizeNodes(input: unknown): Node[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.type !== 'string') return [];

    const positionRecord = record.position as Record<string, unknown> | undefined;
    const x = typeof positionRecord?.x === 'number' ? positionRecord.x : 0;
    const y = typeof positionRecord?.y === 'number' ? positionRecord.y : 0;

    return [{
      id: record.id,
      type: record.type,
      position: { x, y },
      data: {
        ...getDefaultData(record.type),
        ...(record.data && typeof record.data === 'object' ? record.data : {}),
      },
    }];
  });
}

function normalizeEdges(input: unknown, validNodeIds: Set<string>): Edge[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    if (typeof record.source !== 'string' || typeof record.target !== 'string') return [];
    if (!validNodeIds.has(record.source) || !validNodeIds.has(record.target)) return [];

    return [{
      id: typeof record.id === 'string' ? record.id : `edge_${gid()}`,
      source: record.source,
      sourceHandle: typeof record.sourceHandle === 'string' ? record.sourceHandle : null,
      target: record.target,
      targetHandle: typeof record.targetHandle === 'string' ? record.targetHandle : null,
      type: 'smoothstep',
      animated: false,
      style: { strokeWidth: 2 },
    }];
  });
}

function buildWorkflowPayload(
  workflowId: string,
  workflowName: string,
  nodes: Node[],
  edges: Edge[]
): WorkflowExportData {
  return {
    id: workflowId,
    name: workflowName,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      target: edge.target,
      targetHandle: edge.targetHandle ?? null,
      type: 'smoothstep',
      animated: false,
      style: { strokeWidth: 2 },
    })),
    settings: {},
  };
}

function hasPathToAi(nodeId: string, nodes: Node[], edges: Edge[]) {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const current = adjacency.get(edge.source) || [];
    current.push(edge.target);
    adjacency.set(edge.source, current);
  }

  const typeById = new Map(nodes.map((node) => [node.id, node.type || '']));
  const visited = new Set<string>();
  const queue = [...(adjacency.get(nodeId) || [])];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);

    const currentType = typeById.get(currentId) || '';
    if (AI_TYPES.includes(currentType)) return true;

    for (const nextId of adjacency.get(currentId) || []) {
      queue.push(nextId);
    }
  }

  return false;
}

export type NodeExecStatus = 'idle' | 'running' | 'success' | 'error';

interface WorkflowState {
  workflowId: string;
  workflowName: string;
  workflowList: WorkflowListItem[];
  isHydratingWorkflow: boolean;
  isSavingWorkflow: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  isExecuting: boolean;
  executionProgress: { current: number; total: number } | null;
  executionMessage: string | null;
  executingNodeId: string | null;
  lastExecutionStatus: 'success' | 'error' | null;
  lastExecutionTime: number | null;
  lastExecutionError: string | null;
  lastExecutionSummary: { successCount: number; failCount: number; totalDuration: number } | null;
  nodeExecStatus: Record<string, NodeExecStatus>;
  nodeErrors: Record<string, string>;
  nodeOutputs: Record<string, Record<string, unknown>>;
  availableModels: {
    all: string[];
    chat: string[];
    image: string[];
    video: string[];
  };
  showDebugSizes: boolean;

  setWorkflowName: (name: string) => void;
  addNode: (type: string, position: { x: number; y: number }, data?: Record<string, unknown>) => string;
  duplicateNode: (nodeId: string) => string | null;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  removeNode: (nodeId: string) => void;
  addEdge: (source: string, sourceHandle: string, target: string, targetHandle: string) => void;
  removeEdge: (edgeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setNodeExecStatus: (nodeId: string, status: NodeExecStatus, error?: string) => void;
  clearAllExecStatus: () => void;
  setExecuting: (executing: boolean, progress?: { current: number; total: number }) => void;
  setExecutionResult: (status: 'success' | 'error', time?: number, error?: string) => void;
  applyEditorSnapshot: (snapshot: WorkflowEditorSnapshot, markDirty?: boolean) => void;
  newWorkflow: () => void;
  markWorkflowDirty: () => void;
  setShowDebugSizes: (show: boolean) => void;

  executeWorkflow: () => Promise<void>;
  saveWorkflow: () => Promise<boolean>;
  loadWorkflow: (id: string) => Promise<boolean>;
  fetchWorkflowList: () => Promise<void>;
  initializeWorkflowPersistence: () => Promise<void>;
  duplicateCurrentWorkflow: () => Promise<boolean>;
  deleteCurrentWorkflow: () => Promise<boolean>;
  exportCurrentWorkflow: () => WorkflowExportData;
  importWorkflowData: (payload: unknown, fallbackName?: string) => boolean;
  fetchModels: () => Promise<void>;
  setAvailableModels: (models: { all: string[]; chat: string[]; image: string[]; video: string[] }) => void;
  persistLocalDraft: () => void;
}

const initialDraft = loadLocalDraft();

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: initialDraft?.workflowId || gid(),
  workflowName: initialDraft?.workflowName || DEFAULT_WORKFLOW_NAME,
  workflowList: [],
  isHydratingWorkflow: false,
  isSavingWorkflow: false,
  hasUnsavedChanges: false,
  lastSavedAt: null,
  nodes: initialDraft?.nodes || [],
  edges: initialDraft?.edges || [],
  selectedNodeId: null,
  isExecuting: false,
  executionProgress: null,
  executionMessage: null,
  executingNodeId: null,
  lastExecutionStatus: null,
  lastExecutionTime: null,
  lastExecutionError: null,
  lastExecutionSummary: null,
  nodeExecStatus: {},
  nodeErrors: {},
  nodeOutputs: {},
  availableModels: { all: [], chat: [], image: [], video: [] },
  showDebugSizes: false,

  setWorkflowName: (name) => set({ workflowName: name, hasUnsavedChanges: true }),

  addNode: (type, position, data) => {
    const nodeId = `node_${gid()}`;
    const newNode: Node = {
      id: nodeId,
      type,
      position,
      data: { ...getDefaultData(type), ...data },
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
      selectedNodeId: nodeId,
      hasUnsavedChanges: true,
    }));

    return nodeId;
  },

  duplicateNode: (nodeId) => {
    const sourceNode = get().nodes.find((node) => node.id === nodeId);
    if (!sourceNode) return null;

    const duplicatedNodeId = `node_${gid()}`;
    const duplicatedNode: Node = {
      ...sourceNode,
      id: duplicatedNodeId,
      position: {
        x: sourceNode.position.x + 48,
        y: sourceNode.position.y + 48,
      },
      selected: false,
    };

    set((state) => ({
      nodes: [...state.nodes, duplicatedNode],
      selectedNodeId: duplicatedNodeId,
      hasUnsavedChanges: true,
    }));

    return duplicatedNodeId;
  },

  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) => (
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )),
      hasUnsavedChanges: true,
    }));
  },

  removeNode: (nodeId) => {
    set((state) => {
      const nodeExecStatus = { ...state.nodeExecStatus };
      const nodeErrors = { ...state.nodeErrors };
      const nodeOutputs = { ...state.nodeOutputs };
      delete nodeExecStatus[nodeId];
      delete nodeErrors[nodeId];
      delete nodeOutputs[nodeId];

      return {
        nodes: state.nodes.filter((node) => node.id !== nodeId),
        edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        nodeExecStatus,
        nodeErrors,
        nodeOutputs,
        hasUnsavedChanges: true,
      };
    });
  },

  addEdge: (source, sourceHandle, target, targetHandle) => {
    const edges = get().edges;
    const exists = edges.some((edge) => (
      edge.source === source &&
      edge.sourceHandle === sourceHandle &&
      edge.target === target &&
      edge.targetHandle === targetHandle
    ));
    if (exists) return;

    const filteredEdges = edges.filter((edge) => !(
      edge.target === target && edge.targetHandle === targetHandle
    ));

    const newEdge: Edge = {
      id: `edge_${gid()}`,
      source,
      sourceHandle,
      target,
      targetHandle,
      type: 'smoothstep',
      animated: false,
      style: { strokeWidth: 2 },
    };

    set({
      edges: [...filteredEdges, newEdge],
      hasUnsavedChanges: true,
    });
  },

  removeEdge: (edgeId) => {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== edgeId),
      hasUnsavedChanges: true,
    }));
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  onNodesChange: (changes) => {
    set((state) => {
      const nodes = applyNodeChanges(changes, state.nodes);
      const removedIds = changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id);

      if (removedIds.length === 0) {
        return { nodes, hasUnsavedChanges: true };
      }

      const removedSet = new Set(removedIds);
      const nodeExecStatus = { ...state.nodeExecStatus };
      const nodeErrors = { ...state.nodeErrors };
      const nodeOutputs = { ...state.nodeOutputs };

      for (const id of removedIds) {
        delete nodeExecStatus[id];
        delete nodeErrors[id];
        delete nodeOutputs[id];
      }

      return {
        nodes,
        edges: state.edges.filter((edge) => (
          !removedSet.has(edge.source) && !removedSet.has(edge.target)
        )),
        selectedNodeId: removedSet.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
        nodeExecStatus,
        nodeErrors,
        nodeOutputs,
        hasUnsavedChanges: true,
      };
    });
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      hasUnsavedChanges: true,
    }));
  },

  setNodeExecStatus: (nodeId, status, error) => {
    set((state) => ({
      nodeExecStatus: { ...state.nodeExecStatus, [nodeId]: status },
      nodeErrors: error ? { ...state.nodeErrors, [nodeId]: error } : state.nodeErrors,
    }));
  },

  clearAllExecStatus: () => set({ nodeExecStatus: {}, nodeErrors: {}, nodeOutputs: {} }),

  setExecuting: (executing, progress) => {
    set({
      isExecuting: executing,
      executionProgress: progress || null,
      executionMessage: executing ? '准备执行工作流...' : null,
      executingNodeId: executing ? get().executingNodeId : null,
    });
  },

  setExecutionResult: (status, time, error) => {
    set({
      isExecuting: false,
      executionProgress: null,
      executionMessage: null,
      executingNodeId: null,
      lastExecutionStatus: status,
      lastExecutionTime: time ?? null,
      lastExecutionError: error ?? null,
    });
  },

  applyEditorSnapshot: (snapshot, markDirty = true) => {
    set({
      workflowId: snapshot.workflowId,
      workflowName: snapshot.workflowName,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      selectedNodeId: snapshot.selectedNodeId,
      hasUnsavedChanges: markDirty,
      isExecuting: false,
      executionProgress: null,
      executionMessage: null,
      executingNodeId: null,
      lastExecutionStatus: null,
      lastExecutionTime: null,
      lastExecutionError: null,
      lastExecutionSummary: null,
      nodeExecStatus: {},
      nodeErrors: {},
      nodeOutputs: {},
    });
  },

  newWorkflow: () => {
    set({
      workflowId: gid(),
      workflowName: DEFAULT_WORKFLOW_NAME,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isExecuting: false,
      executionProgress: null,
      executionMessage: null,
      executingNodeId: null,
      lastExecutionStatus: null,
      lastExecutionTime: null,
      lastExecutionError: null,
      lastExecutionSummary: null,
      nodeExecStatus: {},
      nodeErrors: {},
      nodeOutputs: {},
      hasUnsavedChanges: false,
      lastSavedAt: null,
    });
  },

  markWorkflowDirty: () => set({ hasUnsavedChanges: true }),

  setShowDebugSizes: (show) => set({ showDebugSizes: show }),

  executeWorkflow: async () => {
    const state = get();
    if (state.isExecuting || state.nodes.length === 0) return;

    const fileInputNodes = state.nodes.filter((node) => FILE_INPUT_TYPES.includes(node.type || ''));
    for (const fileNode of fileInputNodes) {
      const fileLabel = NODE_REGISTRY.find((nodeDef) => nodeDef.type === fileNode.type)?.label || fileNode.type;
      const fileUrl = typeof fileNode.data.fileUrl === 'string' ? fileNode.data.fileUrl : '';
      const isUploading = Boolean(fileNode.data._uploading);
      const uploadError = typeof fileNode.data._uploadError === 'string' ? fileNode.data._uploadError : '';

      if (isUploading) {
        set({
          lastExecutionStatus: 'error',
          lastExecutionError: `「${fileLabel}」节点的文件仍在上传中，请等待上传完成后再执行。`,
        });
        return;
      }

      if (uploadError) {
        set({
          lastExecutionStatus: 'error',
          lastExecutionError: `「${fileLabel}」节点的文件上传失败，请重新选择文件后再执行。`,
        });
        return;
      }

      if (fileUrl.startsWith('blob:') && hasPathToAi(fileNode.id, state.nodes, state.edges)) {
        set({
          lastExecutionStatus: 'error',
          lastExecutionError: `「${fileLabel}」节点当前仍是本地预览文件，尚未同步到后端，无法作为 AI 节点输入执行。请重新上传或等待上传完成。`,
        });
        return;
      }
    }

    const aiNodes = state.nodes.filter((node) => AI_TYPES.includes(node.type || ''));
    for (const aiNode of aiNodes) {
      const hasOutgoingEdge = state.edges.some((edge) => edge.source === aiNode.id);
      if (!hasOutgoingEdge) {
        const def = NODE_REGISTRY.find((nodeDef) => nodeDef.type === aiNode.type);
        set({
          lastExecutionStatus: 'error',
          lastExecutionError: `「${def?.label || aiNode.type}」节点的输出端未连接到任何节点，请连接到输出展示节点或其他节点。`,
        });
        return;
      }
    }

    set({
      isExecuting: true,
      executionProgress: null,
      executionMessage: '准备执行工作流...',
      executingNodeId: null,
      nodeExecStatus: {},
      nodeErrors: {},
      nodeOutputs: {},
      lastExecutionStatus: null,
      lastExecutionTime: null,
      lastExecutionError: null,
      lastExecutionSummary: null,
    });

    const payload = buildWorkflowPayload(
      state.workflowId,
      state.workflowName,
      state.nodes,
      state.edges
    );

    await get().saveWorkflow();

    await api.executeWorkflow(state.workflowId, payload.nodes, payload.edges, {
      onNodeStart: (data) => {
        set((currentState) => ({
          executionProgress: { current: data.index + 1, total: data.total },
          executionMessage: `正在执行 ${data.nodeType} (${data.index + 1}/${data.total})`,
          executingNodeId: data.nodeId,
          nodeExecStatus: {
            ...currentState.nodeExecStatus,
            [data.nodeId]: 'running',
          },
        }));
      },
      onNodeProgress: (data) => {
        set({
          executionMessage: data.message || '正在执行节点...',
          executingNodeId: data.nodeId,
        });
      },
      onNodeComplete: (data) => {
        set((currentState) => ({
          executionMessage: `节点 ${data.nodeId} 执行完成`,
          nodeExecStatus: {
            ...currentState.nodeExecStatus,
            [data.nodeId]: 'success',
          },
          nodeOutputs: {
            ...currentState.nodeOutputs,
            [data.nodeId]: data.outputs,
          },
        }));
      },
      onNodeError: (data) => {
        set((currentState) => ({
          executionMessage: `节点 ${data.nodeId} 执行失败`,
          nodeExecStatus: {
            ...currentState.nodeExecStatus,
            [data.nodeId]: 'error',
          },
          nodeErrors: {
            ...currentState.nodeErrors,
            [data.nodeId]: data.error,
          },
        }));
      },
      onWorkflowComplete: (data) => {
        set({
          isExecuting: false,
          executionProgress: null,
          executionMessage: data.failCount > 0 ? '工作流执行完成，但有节点失败' : '工作流执行完成',
          executingNodeId: null,
          lastExecutionStatus: data.failCount > 0 ? 'error' : 'success',
          lastExecutionTime: data.totalDuration,
          lastExecutionSummary: {
            successCount: data.successCount,
            failCount: data.failCount,
            totalDuration: data.totalDuration,
          },
        });
      },
      onWorkflowError: (data) => {
        set({
          isExecuting: false,
          executionProgress: null,
          executionMessage: '工作流执行失败',
          executingNodeId: null,
          lastExecutionStatus: 'error',
          lastExecutionError: data.error || '未知错误',
          lastExecutionSummary: null,
        });
      },
    });
  },

  saveWorkflow: async () => {
    const state = get();
    set({ isSavingWorkflow: true });

    const workflowData = buildWorkflowPayload(
      state.workflowId,
      state.workflowName,
      state.nodes,
      state.edges
    );

    const updateResult = await api.updateWorkflow(state.workflowId, workflowData);
    if (updateResult.success) {
      await get().fetchWorkflowList();
      set({
        isSavingWorkflow: false,
        hasUnsavedChanges: false,
        lastSavedAt: Date.now(),
      });
      get().persistLocalDraft();
      return true;
    }

    const createResult = await api.createWorkflow(workflowData);
    if (createResult.success && createResult.data) {
      const savedWorkflow = createResult.data as Record<string, unknown>;
      const savedId = typeof savedWorkflow.id === 'string' ? savedWorkflow.id : state.workflowId;

      set({
        workflowId: savedId,
        isSavingWorkflow: false,
        hasUnsavedChanges: false,
        lastSavedAt: Date.now(),
      });
      await get().fetchWorkflowList();
      get().persistLocalDraft();
      return true;
    }

    set({ isSavingWorkflow: false });
    return false;
  },

  loadWorkflow: async (id) => {
    const result = await api.fetchWorkflow(id);
    if (!result.success || !result.data) return false;

    const workflow = result.data as Record<string, unknown>;
    const nodes = normalizeNodes(workflow.nodes);
    const edges = normalizeEdges(workflow.edges, new Set(nodes.map((node) => node.id)));

    set({
      workflowId: id,
      workflowName: typeof workflow.name === 'string' ? workflow.name : DEFAULT_WORKFLOW_NAME,
      nodes,
      edges,
      selectedNodeId: null,
      isExecuting: false,
      executionProgress: null,
      executionMessage: null,
      executingNodeId: null,
      lastExecutionStatus: null,
      lastExecutionTime: null,
      lastExecutionError: null,
      lastExecutionSummary: null,
      nodeExecStatus: {},
      nodeErrors: {},
      nodeOutputs: {},
      hasUnsavedChanges: false,
      lastSavedAt: typeof workflow.updatedAt === 'number' ? workflow.updatedAt : Date.now(),
    });

    get().persistLocalDraft();
    return true;
  },

  fetchWorkflowList: async () => {
    const result = await api.fetchWorkflows();
    if (result.success && result.data) {
      set({ workflowList: result.data });
    }
  },

  initializeWorkflowPersistence: async () => {
    set({ isHydratingWorkflow: true });
    await get().fetchWorkflowList();

    const workflowList = get().workflowList;
    if (!initialDraft && workflowList.length > 0) {
      await get().loadWorkflow(workflowList[0].id);
    }

    set({ isHydratingWorkflow: false });
  },

  duplicateCurrentWorkflow: async () => {
    const state = get();
    const existsInList = state.workflowList.some((workflow) => workflow.id === state.workflowId);

    if (!existsInList) {
      const result = await api.createWorkflow({
        ...buildWorkflowPayload(
          `wf_${Date.now()}`,
          `${state.workflowName} (副本)`,
          state.nodes,
          state.edges
        ),
      });

      if (!result.success || !result.data) return false;

      const newId = (result.data as Record<string, unknown>).id as string;
      await get().fetchWorkflowList();
      return get().loadWorkflow(newId);
    }

    const result = await api.duplicateWorkflow(state.workflowId);
    if (!result.success || !result.data) return false;

    const newId = (result.data as Record<string, unknown>).id as string;
    await get().fetchWorkflowList();
    return get().loadWorkflow(newId);
  },

  deleteCurrentWorkflow: async () => {
    const state = get();
    const existsInList = state.workflowList.some((workflow) => workflow.id === state.workflowId);

    if (existsInList) {
      const result = await api.deleteWorkflow(state.workflowId);
      if (!result.success) return false;
    }

    await get().fetchWorkflowList();
    const nextWorkflow = get().workflowList[0];

    if (nextWorkflow) {
      return get().loadWorkflow(nextWorkflow.id);
    }

    get().newWorkflow();
    get().persistLocalDraft();
    return true;
  },

  exportCurrentWorkflow: () => {
    const state = get();
    return buildWorkflowPayload(state.workflowId, state.workflowName, state.nodes, state.edges);
  },

  importWorkflowData: (payload, fallbackName) => {
    if (!payload || typeof payload !== 'object') return false;

    const record = payload as Record<string, unknown>;
    const nodes = normalizeNodes(record.nodes);
    const edges = normalizeEdges(record.edges, new Set(nodes.map((node) => node.id)));
    const importedName = typeof record.name === 'string'
      ? record.name
      : fallbackName || DEFAULT_WORKFLOW_NAME;

    set({
      workflowId: gid(),
      workflowName: importedName,
      nodes,
      edges,
      selectedNodeId: null,
      isExecuting: false,
      executionProgress: null,
      executionMessage: null,
      executingNodeId: null,
      lastExecutionStatus: null,
      lastExecutionTime: null,
      lastExecutionError: null,
      lastExecutionSummary: null,
      nodeExecStatus: {},
      nodeErrors: {},
      nodeOutputs: {},
      hasUnsavedChanges: true,
      lastSavedAt: null,
    });

    get().persistLocalDraft();
    return true;
  },

  fetchModels: async () => {
    const result = await api.fetchAvailableModels();
    if (result.success && result.data) {
      const data = result.data as {
        all?: string[];
        chat?: string[];
        image?: string[];
        video?: string[];
        categorized?: {
          chat?: string[];
          image?: string[];
          video?: string[];
        };
      };

      set({
        availableModels: {
          all: data.all || [],
          chat: data.chat || data.categorized?.chat || [],
          image: data.image || data.categorized?.image || [],
          video: data.video || data.categorized?.video || [],
        },
      });
    }
  },

  setAvailableModels: (models) => set({ availableModels: models }),

  persistLocalDraft: () => {
    const state = get();
    saveLocalDraft({
      workflowId: state.workflowId,
      workflowName: state.workflowName,
      nodes: state.nodes,
      edges: state.edges,
    });
  },
}));
