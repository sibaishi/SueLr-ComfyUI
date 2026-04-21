// ============================================================
// Flow Studio - ReactFlow 画布封装
// ============================================================

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type Node as FlowNodeType,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { getNodeDef, NODE_REGISTRY, PORT_COMPATIBILITY } from '@/lib/constants';
import { useWorkflowStore } from '@/lib/store';
import FlowNode from './nodes/FlowNode';

const nodeTypes = {
  textInput: FlowNode,
  imageInput: FlowNode,
  videoInput: FlowNode,
  audioInput: FlowNode,
  textMerge: FlowNode,
  imageMerge: FlowNode,
  videoMerge: FlowNode,
  audioMerge: FlowNode,
  universalMerge: FlowNode,
  aiChat: FlowNode,
  imageGen: FlowNode,
  videoGen: FlowNode,
  webSearch: FlowNode,
  output: FlowNode,
};

const NODE_COLORS: Record<string, string> = {
  textInput: '#007AFF',
  imageInput: '#FF9500',
  videoInput: '#AF52DE',
  audioInput: '#FF375F',
  textMerge: '#007AFF',
  imageMerge: '#FF9500',
  videoMerge: '#AF52DE',
  audioMerge: '#FF375F',
  universalMerge: '#64D2FF',
  aiChat: '#30D158',
  imageGen: '#FF9500',
  videoGen: '#AF52DE',
  webSearch: '#5AC8FA',
  output: '#8E8E93',
};

const CATEGORY_LABELS = {
  input: '输入',
  merge: '合并',
  ai: 'AI能力',
  output: '输出',
} as const;

const CATEGORY_ORDER = ['input', 'merge', 'ai', 'output'] as const;

const NODE_MIN_SIZES: Record<string, { w: number; h: number }> = {
  textInput: { w: 218, h: 128 },
  imageInput: { w: 218, h: 150 },
  videoInput: { w: 218, h: 150 },
  audioInput: { w: 218, h: 150 },
  textMerge: { w: 218, h: 120 },
  imageMerge: { w: 218, h: 120 },
  videoMerge: { w: 218, h: 120 },
  audioMerge: { w: 218, h: 120 },
  universalMerge: { w: 218, h: 120 },
  aiChat: { w: 238, h: 215 },
  imageGen: { w: 238, h: 215 },
  videoGen: { w: 238, h: 215 },
  webSearch: { w: 218, h: 143 },
  output: { w: 218, h: 104 },
};

type ClipboardNode = {
  type: string;
  data: Record<string, unknown>;
};

type PendingConnection =
  | {
      handleType: 'source';
      sourceId: string;
      sourceHandle: string;
      sourceType: string;
    }
  | {
      handleType: 'target';
      targetId: string;
      targetHandle: string;
      targetType: string;
    };

type ContextMenuKind = 'pane' | 'node' | 'connect';

type ContextMenuState = {
  kind: ContextMenuKind;
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
  nodeId?: string;
  sourceConnection?: PendingConnection;
};

function buildDefaultData(nodeType: string) {
  const def = getNodeDef(nodeType);
  if (!def) return {};

  const defaultData: Record<string, unknown> = {};
  for (const param of def.params) {
    if (param.default !== undefined) {
      defaultData[param.id] = param.default;
    }
  }
  if (def.maxInputs) {
    defaultData.inputCount = 1;
  }
  return defaultData;
}

function getDefaultNodeSize(nodeType: string) {
  return NODE_MIN_SIZES[nodeType] || { w: 220, h: 140 };
}

function getCenteredPosition(nodeType: string, flowPosition: { x: number; y: number }) {
  const size = getDefaultNodeSize(nodeType);
  return {
    x: flowPosition.x - size.w / 2,
    y: flowPosition.y - size.h / 2,
  };
}

function getLocalPoint(
  event: MouseEvent | TouchEvent | ReactMouseEvent,
  container: HTMLDivElement | null
) {
  const rect = container?.getBoundingClientRect();
  const touch = 'touches' in event ? event.touches[0] || event.changedTouches[0] : null;
  const clientX = touch ? touch.clientX : ('clientX' in event ? event.clientX : 0);
  const clientY = touch ? touch.clientY : ('clientY' in event ? event.clientY : 0);

  return {
    clientX,
    clientY,
    localX: rect ? clientX - rect.left + 6 : clientX,
    localY: rect ? clientY - rect.top + 6 : clientY,
  };
}

function FlowCanvasInner() {
  const store = useWorkflowStore();
  const reactFlow = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeRootAction, setActiveRootAction] = useState<'new' | 'connect' | null>(null);
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORY_ORDER)[number] | null>(null);
  const [clipboardNode, setClipboardNode] = useState<ClipboardNode | null>(null);
  const pendingConnectionRef = useRef<PendingConnection | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpaceHeld(false);
      }
    };

    const handleBlur = () => {
      setSpaceHeld(false);
    };

    const closeContextMenu = () => {
      setContextMenu(null);
      setActiveRootAction(null);
      setActiveCategory(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('click', closeContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('click', closeContextMenu);
    };
  }, []);

  const renderNodes = useMemo(() => {
    return store.nodes.map((node) => {
      const size = getDefaultNodeSize(node.type || '');
      const width = typeof node.width === 'number' ? node.width : size.w;
      const height = typeof node.height === 'number' ? node.height : size.h;

      return {
        ...node,
        style: {
          ...(node.style || {}),
          width,
          height,
          minWidth: size.w,
          minHeight: size.h,
        },
      } as FlowNodeType;
    });
  }, [store.nodes]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setActiveRootAction(null);
    setActiveCategory(null);
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    store.onNodesChange(changes);
  }, [store]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    store.onEdgesChange(changes);

    const hasRemoval = changes.some((change) => change.type === 'remove');
    if (!hasRemoval) return;

    const state = useWorkflowStore.getState();
    for (const node of state.nodes) {
      const nodeDef = getNodeDef(node.type || '');
      if (!nodeDef?.maxInputs) continue;

      const currentCount = (node.data.inputCount as number) || 1;
      if (currentCount <= 1) continue;

      let maxConnectedIdx = 0;
      for (const edge of state.edges) {
        if (edge.target === node.id && edge.targetHandle) {
          const idx = Number.parseInt(edge.targetHandle.replace('item', ''), 10);
          if (idx > maxConnectedIdx) maxConnectedIdx = idx;
        }
      }

      const newCount = Math.max(1, maxConnectedIdx + 1);
      if (newCount < currentCount) {
        state.updateNodeData(node.id, { inputCount: newCount });
      }
    }
  }, [store]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;

    store.addEdge(connection.source, connection.sourceHandle, connection.target, connection.targetHandle);

    const targetNode = store.nodes.find((node) => node.id === connection.target);
    if (!targetNode) return;

    const targetDef = getNodeDef(targetNode.type || '');
    if (!targetDef?.maxInputs) return;

    const currentCount = (targetNode.data.inputCount as number) || 1;
    const handleIdx = Number.parseInt(connection.targetHandle.replace('item', ''), 10);
    if (handleIdx >= currentCount && currentCount < targetDef.maxInputs) {
      store.updateNodeData(targetNode.id, { inputCount: currentCount + 1 });
    }
  }, [store]);

  const isValidConnection = useCallback((connection: {
    source: string | null;
    target: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;

    const sourceNode = store.nodes.find((node) => node.id === connection.source);
    const targetNode = store.nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return false;

    const sourceDef = getNodeDef(sourceNode.type || '');
    const targetDef = getNodeDef(targetNode.type || '');
    if (!sourceDef || !targetDef) return false;

    const sourcePort = sourceDef.outputs.find((port) => port.id === connection.sourceHandle);
    const targetPort = targetDef.maxInputs
      ? targetDef.inputs[0]
        ? { ...targetDef.inputs[0], id: connection.targetHandle }
        : undefined
      : targetDef.inputs.find((port) => port.id === connection.targetHandle);

    if (!sourcePort || !targetPort) return false;

    const compatibleTargets = PORT_COMPATIBILITY[sourcePort.type];
    return compatibleTargets?.includes(targetPort.type) ?? false;
  }, [store.nodes]);

  const onNodeClick = useCallback((_: ReactMouseEvent, node: { id: string }) => {
    store.selectNode(node.id);
    closeContextMenu();
  }, [closeContextMenu, store]);

  const onPaneClick = useCallback(() => {
    store.selectNode(null);
    closeContextMenu();
  }, [closeContextMenu, store]);

  const openContextMenuAtPoint = useCallback((
    kind: ContextMenuKind,
    event: MouseEvent | TouchEvent | ReactMouseEvent,
    extras?: Partial<ContextMenuState>
  ) => {
    const point = getLocalPoint(event, containerRef.current);
    const flowPosition = reactFlow.screenToFlowPosition({ x: point.clientX, y: point.clientY });
    setContextMenu({
      kind,
      x: point.localX,
      y: point.localY,
      flowPosition,
      ...extras,
    });
    setActiveRootAction(kind === 'connect' ? 'connect' : null);
    setActiveCategory(null);
  }, [reactFlow]);

  const onNodeContextMenu = useCallback<NodeMouseHandler>((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    store.selectNode(node.id);
    openContextMenuAtPoint('node', event, { nodeId: node.id });
  }, [openContextMenuAtPoint, store]);

  const onPaneContextMenu = useCallback((event: MouseEvent | ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    store.selectNode(null);
    openContextMenuAtPoint('pane', event);
  }, [openContextMenuAtPoint, store]);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();

    const nodeType = event.dataTransfer.getData('application/reactflow');
    if (!nodeType) return;

    const position = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    store.addNode(nodeType, position, buildDefaultData(nodeType));
  }, [reactFlow, store]);

  const onConnectStart = useCallback((_: unknown, params: {
    nodeId?: string | null;
    handleId?: string | null;
    handleType?: 'source' | 'target' | null;
  }) => {
    if (!params.handleType || !params.nodeId || !params.handleId) {
      pendingConnectionRef.current = null;
      return;
    }

    const node = store.nodes.find((item) => item.id === params.nodeId);
    const def = getNodeDef(node?.type || '');
    if (!node || !def) {
      pendingConnectionRef.current = null;
      return;
    }

    if (params.handleType === 'source') {
      const port = def.outputs.find((output) => output.id === params.handleId);
      if (!port) {
        pendingConnectionRef.current = null;
        return;
      }

      pendingConnectionRef.current = {
        handleType: 'source',
        sourceId: params.nodeId,
        sourceHandle: params.handleId,
        sourceType: port.type,
      };
      return;
    }

    const port = def.maxInputs
      ? def.inputs[0]
      : def.inputs.find((input) => input.id === params.handleId);
    if (!port) {
      pendingConnectionRef.current = null;
      return;
    }

    pendingConnectionRef.current = {
      handleType: 'target',
      targetId: params.nodeId,
      targetHandle: params.handleId,
      targetType: port.type,
    };
  }, [store.nodes]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: { isValid: boolean | null }) => {
    const pending = pendingConnectionRef.current;
    pendingConnectionRef.current = null;

    if (!pending || state.isValid) return;
    openContextMenuAtPoint('connect', event, { sourceConnection: pending });
  }, [openContextMenuAtPoint]);

  const copySelectedNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    const node = store.nodes.find((item) => item.id === contextMenu.nodeId);
    if (!node) return;

    setClipboardNode({
      type: node.type || 'textInput',
      data: { ...node.data },
    });
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.nodeId, store.nodes]);

  const pasteNodeAtContext = useCallback(() => {
    if (!contextMenu || !clipboardNode) return;
    const position = getCenteredPosition(clipboardNode.type, contextMenu.flowPosition);
    store.addNode(clipboardNode.type, position, { ...clipboardNode.data });
    closeContextMenu();
  }, [clipboardNode, closeContextMenu, contextMenu, store]);

  const deleteContextNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    store.removeNode(contextMenu.nodeId);
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.nodeId, store]);

  const resolveTargetHandle = useCallback((nodeType: string, sourceType?: string) => {
    const def = getNodeDef(nodeType);
    if (!def) return null;
    if (def.maxInputs) return 'item1';

    if (!sourceType) {
      return def.inputs[0]?.id || null;
    }

    const matchingInput = def.inputs.find((input) => {
      const compatibleTargets = PORT_COMPATIBILITY[sourceType];
      return compatibleTargets?.includes(input.type) ?? false;
    });
    return matchingInput?.id || null;
  }, []);

  const resolveSourceHandle = useCallback((nodeType: string, targetType?: string) => {
    const def = getNodeDef(nodeType);
    if (!def) return null;

    if (!targetType) {
      return def.outputs[0]?.id || null;
    }

    const matchingOutput = def.outputs.find((output) => {
      const compatibleTargets = PORT_COMPATIBILITY[output.type];
      return compatibleTargets?.includes(targetType) ?? false;
    });
    return matchingOutput?.id || null;
  }, []);

  const addNodeFromMenu = useCallback((nodeType: string) => {
    if (!contextMenu) return;

    const position = getCenteredPosition(nodeType, contextMenu.flowPosition);
    const newNodeId = store.addNode(nodeType, position, buildDefaultData(nodeType));

    if (contextMenu.kind === 'connect' && contextMenu.sourceConnection) {
      if (contextMenu.sourceConnection.handleType === 'source') {
        const targetHandle = resolveTargetHandle(nodeType, contextMenu.sourceConnection.sourceType);
        if (targetHandle) {
          store.addEdge(
            contextMenu.sourceConnection.sourceId,
            contextMenu.sourceConnection.sourceHandle,
            newNodeId,
            targetHandle
          );
        }
      } else {
        const sourceHandle = resolveSourceHandle(nodeType, contextMenu.sourceConnection.targetType);
        if (sourceHandle) {
          store.addEdge(
            newNodeId,
            sourceHandle,
            contextMenu.sourceConnection.targetId,
            contextMenu.sourceConnection.targetHandle
          );
        }
      }
    }

    closeContextMenu();
  }, [closeContextMenu, contextMenu, resolveSourceHandle, resolveTargetHandle, store]);

  const availableNodeDefs = useMemo(() => {
    if (!contextMenu) return [];

    if (contextMenu.kind !== 'connect' || !contextMenu.sourceConnection) {
      return NODE_REGISTRY;
    }

    const pending = contextMenu.sourceConnection;

    return NODE_REGISTRY.filter((nodeDef) => {
      if (pending.handleType === 'source') {
        if (nodeDef.inputs.length === 0) return false;
        const sourceType = pending.sourceType;
        const sampleInput = nodeDef.maxInputs
          ? nodeDef.inputs[0]
          : nodeDef.inputs.find((input) => {
              const compatibleTargets = PORT_COMPATIBILITY[sourceType];
              return compatibleTargets?.includes(input.type) ?? false;
            });
        if (!sampleInput) return false;
        const compatibleTargets = PORT_COMPATIBILITY[sourceType];
        return compatibleTargets?.includes(sampleInput.type) ?? false;
      }

      if (nodeDef.outputs.length === 0) return false;
      return nodeDef.outputs.some((output) => {
        const compatibleTargets = PORT_COMPATIBILITY[output.type];
        return compatibleTargets?.includes(pending.targetType) ?? false;
      });
    });
  }, [contextMenu]);

  const groupedNodeDefs = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      items: availableNodeDefs.filter((nodeDef) => nodeDef.category === category),
    })).filter((group) => group.items.length > 0);
  }, [availableNodeDefs]);

  const miniMapNodeColor = useCallback((node: { type?: string | null }) => {
    return NODE_COLORS[node.type || ''] || '#8E8E93';
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={renderNodes}
        edges={store.edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: 'var(--color-text-tertiary)', strokeWidth: 2 },
        }}
        connectionLineStyle={{
          stroke: 'var(--color-accent)',
          strokeWidth: 2,
        }}
        fitView
        fitViewOptions={{
          padding: 0.32,
          minZoom: 0.45,
          maxZoom: 0.62,
        }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.58 }}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        style={{
          background: 'var(--color-bg-canvas)',
          cursor: spaceHeld ? 'grab' : undefined,
        }}
        panOnDrag={spaceHeld ? [0, 1] : [1]}
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag={!spaceHeld}
        selectNodesOnDrag={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--color-text-tertiary)"
          style={{ opacity: 0.3 }}
        />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          nodeColor={miniMapNodeColor}
          maskColor="rgba(0, 0, 0, 0.15)"
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
          }}
          pannable
          zoomable
        />
      </ReactFlow>

      {contextMenu && (
        <div
          className="absolute z-50 min-w-44 rounded-xl p-1.5"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--glass-bg)',
            border: '1px solid var(--color-border)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            boxShadow: 'var(--glass-shadow-lg)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === 'node' ? (
            <>
              <ContextMenuButton label="复制节点" onClick={copySelectedNode} />
              <ContextMenuButton label="删除节点" onClick={deleteContextNode} danger />
            </>
          ) : (
            <>
              {clipboardNode && (
                <ContextMenuButton label="粘贴节点" onClick={pasteNodeAtContext} />
              )}
              <ContextMenuButton
                label={contextMenu.kind === 'connect' ? '连接到新节点 ▸' : '新建节点 ▸'}
                onClick={() => undefined}
                active={activeRootAction === (contextMenu.kind === 'connect' ? 'connect' : 'new')}
                onHover={() => {
                  setActiveRootAction(contextMenu.kind === 'connect' ? 'connect' : 'new');
                  if (!activeCategory) {
                    setActiveCategory(groupedNodeDefs[0]?.category || null);
                  }
                }}
              />
            </>
          )}

          {activeRootAction && groupedNodeDefs.length > 0 && contextMenu.kind !== 'node' && (
            <div
              className="absolute top-0 min-w-36 rounded-xl p-1.5"
              style={{
                left: 'calc(100% + 6px)',
                background: 'var(--glass-bg)',
                border: '1px solid var(--color-border)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                boxShadow: 'var(--glass-shadow-lg)',
              }}
            >
              {groupedNodeDefs.map((group) => (
                <ContextMenuButton
                  key={group.category}
                  label={`${group.label} ▸`}
                  onClick={() => undefined}
                  active={activeCategory === group.category}
                  onHover={() => setActiveCategory(group.category)}
                />
              ))}

              {activeCategory && (
                <div
                  className="absolute top-0 min-w-40 rounded-xl p-1.5"
                  style={{
                    left: 'calc(100% + 6px)',
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--color-border)',
                    backdropFilter: 'var(--glass-blur)',
                    WebkitBackdropFilter: 'var(--glass-blur)',
                    boxShadow: 'var(--glass-shadow-lg)',
                  }}
                >
                  {groupedNodeDefs
                    .find((group) => group.category === activeCategory)
                    ?.items.map((nodeDef) => (
                      <ContextMenuButton
                        key={nodeDef.type}
                        label={nodeDef.label}
                        onClick={() => addNodeFromMenu(nodeDef.type)}
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContextMenuButton({
  label,
  onClick,
  danger = false,
  active = false,
  onHover,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  onHover?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      className="block w-full rounded-lg px-3 py-2 text-left text-xs transition-colors"
      style={{
        color: danger ? 'var(--color-danger)' : 'var(--color-text-primary)',
        background: active ? 'var(--glass-bg-hover)' : 'transparent',
      }}
      onMouseLeave={(event) => {
        if (!active) {
          event.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {label}
    </button>
  );
}

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
