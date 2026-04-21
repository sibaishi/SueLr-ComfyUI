// ============================================================
// Flow Studio - 自定义节点组件（毛玻璃风格）
// 所有节点共用此组件，通过 type 区分视觉和内容
// 支持 NodeResizer 自由调整大小
// ============================================================

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, NodeResizer, useStore } from '@xyflow/react';
import { getNodeDef } from '@/lib/constants';
import { useWorkflowStore, type NodeExecStatus } from '@/lib/store';
import type { PortDef } from '@/lib/types';

// 🔧 调试开关：新增节点类型时，在 Store 中设置 showDebugSizes = true 开启
// 使用方式：拖出节点 → 记录右上角数值 → 填入 NODE_MIN_SIZES → 关闭开关

/** AI 能力节点类型 */
const AI_TYPES = ['aiChat', 'imageGen', 'videoGen', 'webSearch'];

/** 节点图标映射 */
const NODE_ICONS: Record<string, string> = {
  pen: '📝',
  image: '🖼️',
  film: '🎬',
  music: '🎵',
  merge: '🔀',
  bot: '🤖',
  palette: '🎨',
  clapperboard: '🎬',
  search: '🔍',
  eye: '👁️',
};

/** 端口类型颜色 */
const PORT_TYPE_COLORS: Record<string, string> = {
  string: '#007AFF',
  image: '#FF9500',
  'image[]': '#FF9500',
  video: '#AF52DE',
  audio: '#FF375F',
  any: '#8E8E93',
};

/** 端口类型标签 */
const PORT_TYPE_LABELS: Record<string, string> = {
  string: 'TEXT',
  image: 'IMG',
  'image[]': 'IMG[]',
  video: 'VID',
  audio: 'AUD',
  any: 'ANY',
};

/**
 * 每种节点类型的最小尺寸（= 默认展示完整内容的精确尺寸）
 * 新增节点类型时：开启 Store.showDebugSizes → 拖出节点 → 记录右上角数值 → 填入此处
 */
const NODE_MIN_SIZES: Record<string, { w: number; h: number }> = {
  textInput:    { w: 218, h: 128 },
  imageInput:   { w: 218, h: 150 },
  videoInput:   { w: 218, h: 150 },
  audioInput:   { w: 218, h: 150 },
  textMerge:    { w: 218, h: 120 },
  imageMerge:   { w: 218, h: 120 },
  videoMerge:   { w: 218, h: 120 },
  audioMerge:   { w: 218, h: 120 },
  universalMerge: { w: 218, h: 120 },
  aiChat:       { w: 238, h: 215 },
  imageGen:     { w: 238, h: 215 },
  videoGen:     { w: 238, h: 215 },
  webSearch:    { w: 218, h: 143 },
  output:       { w: 218, h: 104 },
};

/** 执行状态角标 */
const STATUS_BADGE: Record<NodeExecStatus, { icon: string; color: string; label: string }> = {
  idle: { icon: '', color: '', label: '' },
  running: { icon: '⏳', color: '#FF9500', label: '执行中' },
  success: { icon: '✅', color: '#30D158', label: '成功' },
  error: { icon: '❌', color: '#FF3B30', label: '失败' },
};

interface FlowNodeProps {
  id: string;
  type: string;
  data: Record<string, unknown>;
  selected: boolean;
  isConnectable: boolean;
}

function FlowNode({ id, type, data, selected, isConnectable }: FlowNodeProps) {
  const def = getNodeDef(type);
  const execStatus = useWorkflowStore((s) => s.nodeExecStatus[id] || 'idle');
  const execError = useWorkflowStore((s) => s.nodeErrors[id]);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs[id]);
  const edges = useWorkflowStore((s) => s.edges);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const showDebugSizes = useWorkflowStore((s) => s.showDebugSizes);

  // 从 ReactFlow 内部 store 读取节点尺寸
  // NodeResizer 通过 NodeDimensionChange 更新 node.width/node.height
  // v12 中这些值会作为 CSS inline style 应用到 wrapper 上
  // 我们读取后显式应用到容器，确保 width:100% 的子元素能跟随缩放
  const rfNodeSize = useStore(
    useCallback((s: any) => {
      const n = s.nodeLookup?.get(id);
      return { w: n?.width ?? null, h: n?.height ?? null };
    }, [id])
  );

  // 🔧 调试：测量节点实际尺寸（新增节点类型时使用）
  void rfNodeSize;
  const debugRef = useRef<HTMLDivElement>(null);
  const [debugSize, setDebugSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!showDebugSizes || !debugRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDebugSize({ w: Math.round(width), h: Math.round(height) });
      }
    });
    observer.observe(debugRef.current);
    return () => observer.disconnect();
  }, [showDebugSizes]);

  if (!def) return <div className="p-3 text-xs">未知节点类型: {type}</div>;

  // 获取该节点类型的最小尺寸，未注册的类型使用默认值
  const minSize = NODE_MIN_SIZES[type] || { w: 200, h: 100 };

  const icon = NODE_ICONS[def.icon] || '📦';
  const hasOutputs = def.outputs.length > 0;
  const isRunning = execStatus === 'running';
  const badge = STATUS_BADGE[execStatus];

  // 合并节点动态端口：根据 inputCount 生成实际输入列表
  const isMergeNode = def.maxInputs !== undefined;
  const inputCount = isMergeNode ? ((data.inputCount as number) || 1) : 0;
  const effectiveInputs: PortDef[] = isMergeNode
    ? Array.from({ length: inputCount }, (_, i) => ({
        id: `item${i + 1}`,
        label: `${def.inputs[0].label}${i + 1}`,
        type: def.inputs[0].type,
        required: false,
      }))
    : def.inputs;
  const hasInputs = effectiveInputs.length > 0;

  // 判断各输入端口是否已连接
  const connectedInputs = new Set<string>();
  for (const edge of edges) {
    if (edge.target === id && edge.targetHandle) {
      connectedInputs.add(edge.targetHandle);
    }
  }

  // 判断是否需要底部边框（内容区后面还有输出端口或错误条）
  const needsContentBorder = hasOutputs || execStatus === 'error';

  return (
    <div
      ref={debugRef}
      className="flow-node"
      style={{
        // 初始宽高使用节点最小尺寸，拖拽调整后再切换到 ReactFlow 实际尺寸
        width: '100%',
        height: '100%',
        minWidth: minSize.w,
        minHeight: minSize.h,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: selected
          ? `2px solid ${def.color}`
          : `1px solid var(--glass-border)`,
        boxShadow: selected
          ? `0 0 0 3px ${def.color}25, var(--glass-shadow-lg)`
          : 'var(--glass-shadow)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        animation: isRunning ? 'pulse-border 1.5s ease-in-out infinite' : undefined,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* 🔧 调试：右上角尺寸标签（新增节点时通过 Store.showDebugSizes 开启） */}
      {showDebugSizes && debugSize && (
        <div
          style={{
            position: 'absolute',
            top: -20,
            right: 0,
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 4,
            zIndex: 100,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {debugSize.w} × {debugSize.h}
        </div>
      )}

      {/* ---- 节点大小调整手柄 ---- */}
      <NodeResizer
        isVisible={selected}
        minWidth={minSize.w}
        minHeight={minSize.h}
        lineStyle={{
          borderColor: def.color,
          borderWidth: 1,
          borderStyle: 'dashed',
          opacity: 0.3,
        }}
        handleStyle={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: def.color,
          border: '2px solid var(--color-bg-primary)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
      />

      {/* ---- 标题栏 ---- */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{
          flexShrink: 0,
          background: `linear-gradient(135deg, ${def.color}18, ${def.color}08)`,
          borderBottom: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        }}
      >
        <span
          className="text-base flex-shrink-0"
          style={{
            filter: isRunning ? 'drop-shadow(0 0 4px rgba(255,149,0,0.5))' : undefined,
          }}
        >
          {icon}
        </span>
        <span
          className="text-xs font-semibold flex-1"
          style={{ color: def.color }}
        >
          {def.label}
        </span>
        {execStatus !== 'idle' && (
          <span
            className="text-xs flex-shrink-0"
            title={badge.label + (execError ? `: ${execError}` : '')}
            style={{
              filter: isRunning ? 'drop-shadow(0 0 4px rgba(255,149,0,0.6))' : undefined,
            }}
          >
            {badge.icon}
          </span>
        )}
        {AI_TYPES.includes(type) && !edges.some(e => e.source === id) && (
          <span className="text-xs flex-shrink-0" title="输出端未连接，请连接到其他节点">
            ⚠️
          </span>
        )}
      </div>

      {/* ---- 输入端口区域 ---- */}
      {hasInputs && (
        <div className="py-1" style={{ flexShrink: 0 }}>
          {effectiveInputs.map((input: PortDef) => {
            const isConnected = connectedInputs.has(input.id);
            return (
              <div
                key={input.id}
                className="flex items-center gap-2 px-3 py-0.5"
                style={{ minHeight: 24, position: 'relative' }}
              >
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  isConnectable={isConnectable}
                  style={{
                    background: isConnected ? def.color : 'var(--color-border-strong)',
                    width: 11,
                    height: 11,
                    border: `2px solid ${isConnected ? def.color : 'var(--color-bg-secondary)'}`,
                    left: -6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    transition: 'background 0.2s, border-color 0.2s',
                  }}
                />
                <span
                  className="text-[11px]"
                  style={{
                    color: isConnected ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {input.label}
                </span>
                {input.required && (
                  <span className="text-[9px] text-red-400">*</span>
                )}
                <span
                  className="text-[8px] font-mono ml-auto px-1 py-0 rounded"
                  style={{
                    color: PORT_TYPE_COLORS[input.type] || '#8E8E93',
                    background: `${PORT_TYPE_COLORS[input.type] || '#8E8E93'}15`,
                  }}
                >
                  {PORT_TYPE_LABELS[input.type] || input.type}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- 节点内容区 ---- */}
      <NodeContent
        type={type}
        data={data}
        nodeId={id}
        def={def}
        updateNodeData={updateNodeData}
        outputs={nodeOutputs}
        showBottomBorder={needsContentBorder}
        inputCount={inputCount}
      />

      {/* ---- 输出端口区域 ---- */}
      {hasOutputs && (
        <div
          className="py-1"
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--color-border)',
            borderRadius: execStatus !== 'error' ? '0 0 var(--radius-lg) var(--radius-lg)' : undefined,
          }}
        >
          {def.outputs.map((output: PortDef) => (
            <div
              key={output.id}
              className="flex items-center justify-end gap-2 px-3 py-0.5"
              style={{ minHeight: 24, position: 'relative' }}
            >
              <span
                className="text-[8px] font-mono mr-1 px-1 py-0 rounded"
                style={{
                  color: PORT_TYPE_COLORS[output.type] || '#8E8E93',
                  background: `${PORT_TYPE_COLORS[output.type] || '#8E8E93'}15`,
                }}
              >
                {PORT_TYPE_LABELS[output.type] || output.type}
              </span>
              <span
                className="text-[11px]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {output.label}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.id}
                isConnectable={isConnectable}
                style={{
                  background: def.color,
                  width: 11,
                  height: 11,
                  border: '2px solid var(--color-bg-secondary)',
                  right: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  transition: 'background 0.2s',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* ---- 错误提示条 ---- */}
      {execStatus === 'error' && execError && (
        <div
          className="px-3 py-1.5 text-[10px] leading-tight"
          style={{
            flexShrink: 0,
            background: 'rgba(255, 59, 48, 0.1)',
            color: '#FF3B30',
            borderTop: '1px solid rgba(255, 59, 48, 0.15)',
            borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
          }}
        >
          {execError.slice(0, 80)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 节点内容区 - 每种节点类型显示不同的内嵌信息
// ============================================================

interface NodeContentProps {
  type: string;
  data: Record<string, unknown>;
  nodeId: string;
  def: ReturnType<typeof getNodeDef>;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outputs?: Record<string, unknown>;
  showBottomBorder: boolean;
  inputCount?: number;
}

function NodeContent({
  type,
  data,
  nodeId,
  updateNodeData,
  outputs,
  showBottomBorder,
  inputCount,
  def: contentDef,
}: NodeContentProps) {
  const borderStyle = showBottomBorder
    ? { borderBottom: '1px solid var(--color-border)' }
    : {};

  // 节点内容区的通用外层样式
  // flex: '1 1 auto' — 自动大小时按内容高度，手动调大时填充空间
  const outerStyle: React.CSSProperties = {
    flex: '1 1 auto',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...borderStyle,
  };

  switch (type) {
    case 'textInput':
      return <TextInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />;
    case 'imageInput':
      return <FileInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} accept="image/*" placeholder="拖拽或粘贴图片" label="图片" />;
    case 'videoInput':
      return <FileInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} accept="video/*" placeholder="拖拽或粘贴视频" label="视频" />;
    case 'audioInput':
      return <FileInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} accept="audio/*" placeholder="拖拽或粘贴音频" label="音频" />;
    case 'textMerge':
    case 'imageMerge':
    case 'videoMerge':
    case 'audioMerge':
    case 'universalMerge':
      return <MergeContent inputCount={inputCount || 1} maxInputs={contentDef?.maxInputs || 9} outerStyle={outerStyle} />;
    case 'aiChat':
      return <AiChatContent data={data} outputs={outputs} outerStyle={outerStyle} />;
    case 'imageGen':
      return <ImageGenContent data={data} outputs={outputs} outerStyle={outerStyle} />;
    case 'videoGen':
      return <VideoGenContent data={data} outputs={outputs} outerStyle={outerStyle} />;
    case 'webSearch':
      return <WebSearchContent data={data} outputs={outputs} outerStyle={outerStyle} />;
    case 'output':
      return <OutputContent outputs={outputs} outerStyle={outerStyle} isLastSection={!showBottomBorder} />;
    default:
      return null;
  }
}

// ============================================================
// 文本输入节点：内嵌可编辑文本
// ============================================================
function TextInputContent({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: React.CSSProperties;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const text = (data.text as string) || '';

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(nodeId, { text: e.target.value });
    },
    [nodeId, updateNodeData]
  );

  return (
    <div className="px-3 py-1.5" style={outerStyle}>
      {isEditing ? (
        <textarea
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          autoFocus
          className="w-full px-2 py-1 rounded text-[11px] leading-[1.5] outline-none resize-none"
          style={{
            minHeight: 60,
            maxHeight: 300,
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-accent)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'auto',
          }}
          placeholder="在此输入文本..."
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          onDoubleClick={handleDoubleClick}
          className="px-2 py-1 rounded text-[11px] leading-[1.5] cursor-text"
          style={{
            minHeight: 40,
            maxHeight: 300,
            color: text ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
            background: 'var(--color-bg-tertiary)',
            border: '1px solid transparent',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
          title="双击编辑文本"
        >
          {text || '双击编辑文本内容...'}
        </div>
      )}
      {text && (
        <div className="flex justify-end mt-0.5" style={{ flexShrink: 0 }}>
          <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {text.length} 字符
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 文件输入节点（图片/视频/音频共用）
// ============================================================
function FileInputContent({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
  accept,
  placeholder,
  label,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: React.CSSProperties;
  accept: string;
  placeholder: string;
  label: string;
}) {
  const fileUrl = (data.fileUrl as string) || '';
  const fileName = (data.fileName as string) || '';
  const uploading = (data._uploading as boolean) || false;
  const uploadError = (data._uploadError as string) || '';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 先本地预览
      const localPreview = URL.createObjectURL(file);
      updateNodeData(nodeId, {
        fileUrl: localPreview,
        fileName: file.name,
        fileSize: file.size,
        _uploading: true,
        _uploadError: '',
      });

      // 上传到后端
      try {
        const { uploadFile } = await import('../../lib/api');
        const result = await uploadFile(file);
        if (result.success && result.url) {
          updateNodeData(nodeId, {
            fileUrl: result.url,
            fileName: result.fileName || file.name,
            fileSize: result.fileSize || file.size,
            _uploading: false,
            _uploadError: '',
          });
        } else {
          // 上传失败，保留本地预览，标记错误
          updateNodeData(nodeId, {
            _uploading: false,
            _uploadError: result.error || '上传失败',
          });
        }
      } catch (err: any) {
        updateNodeData(nodeId, {
          _uploading: false,
          _uploadError: err.message || '上传失败',
        });
      }

      // 重置 input 以便重复选择同一文件
      e.target.value = '';
    },
    [nodeId, updateNodeData]
  );

  // 判断是否为图片类型
  const isImage = accept.startsWith('image');
  // 判断是否为视频类型
  const isVideo = accept.startsWith('video');
  // 判断是否为音频类型
  const isAudio = accept.startsWith('audio');

  return (
    <div className="px-3 py-2" style={{ ...outerStyle, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
      {uploading && (
        <div className="text-[10px] text-center py-1" style={{ color: 'var(--color-accent)' }}>
          ⏳ 上传中...
        </div>
      )}
      {uploadError && (
        <div className="text-[9px] px-2 py-1 rounded" style={{ color: '#FF3B30', background: 'rgba(255,59,48,0.1)' }}>
          ⚠️ {uploadError}
        </div>
      )}
      {fileUrl && isImage ? (
        <div style={{
          width: '100%',
          flex: '1 1 auto',
          minHeight: 60,
          backgroundImage: `url(${fileUrl})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          borderRadius: 'var(--radius-sm)',
        }} />
      ) : fileUrl && isVideo ? (
        <div style={{
          width: '100%',
          flex: '1 1 auto',
          minHeight: 60,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--radius-sm)',
        }}>
          <video
            src={fileUrl}
            controls
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </div>
      ) : fileUrl && isAudio ? (
        <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
          <audio src={fileUrl} controls style={{ width: '100%' }} />
          {fileName && (
            <div className="text-[9px] truncate text-center" style={{ color: 'var(--color-text-tertiary)' }}>
              {fileName}
            </div>
          )}
        </div>
      ) : !uploading ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full text-[11px] px-3 py-3 rounded-md cursor-pointer"
          style={{
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-tertiary)',
            border: '1px dashed var(--color-border-strong)',
            transition: 'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-accent)';
            e.currentTarget.style.color = 'var(--color-accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-strong)';
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
        >
          📎 点击选择{label}
          <br />
          <span className="text-[9px]">{placeholder}</span>
        </button>
      ) : null}
    </div>
  );
}

// ============================================================
// 合并节点：显示输入端口计数
// ============================================================
function MergeContent({ inputCount, maxInputs, outerStyle }: {
  inputCount: number;
  maxInputs: number;
  outerStyle: React.CSSProperties;
}) {
  return (
    <div className="px-3 py-2 text-center" style={{ ...outerStyle, alignItems: 'center', justifyContent: 'center' }}>
      <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
        🔀 {inputCount}/{maxInputs} 个输入位
      </span>
    </div>
  );
}

// ============================================================
// AI 对话节点：显示模型 + 系统提示词（不显示执行结果）
// ============================================================
function AiChatContent({ data, outerStyle }: { data: Record<string, unknown>; outputs?: Record<string, unknown>; outerStyle: React.CSSProperties }) {
  const model = (data.model as string) || '';
  const temp = data.temperature ?? 0.7;
  const systemPrompt = (data.systemPrompt as string) || '';

  return (
    <div className="px-3 py-2" style={{ ...outerStyle, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="flex items-center gap-1.5 flex-wrap" style={{ flexShrink: 0 }}>
        {model ? (
          <ParamBadge color="#30D158" label={model} />
        ) : (
          <ParamBadge color="#8E8E93" label="未选模型" />
        )}
        <ParamBadge color="#007AFF" label={`T:${Number(temp).toFixed(1)}`} />
      </div>
      <div
        className="text-[10px] leading-[1.5] px-2 py-1.5 rounded"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'auto',
          color: systemPrompt ? 'var(--color-text-tertiary)' : 'var(--color-text-quaternary)',
          background: 'var(--color-bg-tertiary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {systemPrompt || '在属性面板中设置系统提示词...'}
      </div>
    </div>
  );
}

// ============================================================
// 图像生成节点：只显示参数（不显示执行结果）
// ============================================================
function ImageGenContent({ data, outerStyle }: { data: Record<string, unknown>; outputs?: Record<string, unknown>; outerStyle: React.CSSProperties }) {
  const model = (data.model as string) || '';
  const ratio = (data.ratio as string) || '1:1';
  const imageMode = (data.imageMode as string) || 'standalone';

  return (
    <div className="px-3 py-2" style={outerStyle}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {model ? (
          <ParamBadge color="#FF9500" label={model} />
        ) : (
          <ParamBadge color="#8E8E93" label="未选模型" />
        )}
        <ParamBadge color="#FF9500" label={ratio} />
        <ParamBadge
          color={imageMode === 'standalone' ? '#30D158' : '#5AC8FA'}
          label={imageMode === 'standalone' ? '专用接口' : '对话接口'}
        />
      </div>
    </div>
  );
}

// ============================================================
// 视频生成节点：只显示参数（不显示执行结果）
// ============================================================
function VideoGenContent({ data, outerStyle }: { data: Record<string, unknown>; outputs?: Record<string, unknown>; outerStyle: React.CSSProperties }) {
  const model = (data.model as string) || '';
  const duration = data.duration ?? 5;
  const resolution = (data.resolution as string) || '720p';
  const ratio = (data.ratio as string) || '16:9';

  return (
    <div className="px-3 py-2" style={outerStyle}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {model ? (
          <ParamBadge color="#AF52DE" label={model} />
        ) : (
          <ParamBadge color="#8E8E93" label="未选模型" />
        )}
        <ParamBadge color="#AF52DE" label={`${duration}s`} />
        <ParamBadge color="#AF52DE" label={resolution} />
        <ParamBadge color="#AF52DE" label={ratio} />
      </div>
    </div>
  );
}

// ============================================================
// 网页搜索节点：只显示参数（不显示执行结果）
// ============================================================
function WebSearchContent({ data, outerStyle }: { data: Record<string, unknown>; outputs?: Record<string, unknown>; outerStyle: React.CSSProperties }) {
  const maxResults = data.maxResults ?? 5;
  const includeAnswer = data.includeAnswer ?? true;

  return (
    <div className="px-3 py-2" style={outerStyle}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <ParamBadge color="#5AC8FA" label={`最多${maxResults}条`} />
        {includeAnswer && <ParamBadge color="#5AC8FA" label="含AI摘要" />}
      </div>
    </div>
  );
}

// ============================================================
// 输出展示节点：支持文本/图片/视频/音频展示
// 图片/视频使用 flex 填充方式，跟随节点缩放
// ============================================================
function OutputContent({
  outputs,
  outerStyle,
  isLastSection,
}: {
  outputs?: Record<string, unknown>;
  outerStyle: React.CSSProperties;
  isLastSection: boolean;
}) {
  const content = outputs?.content;

  // 如果是最后一段（没有输出端口），需要底部圆角
  const lastRadius = isLastSection ? { borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' } : {};

  // 有内容时展示
  if (content !== undefined && content !== null) {
    // 字符串内容
    if (typeof content === 'string') {
      // 检测是否为图片 URL — 使用 background-image + flex 填充
      if (content.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) || content.startsWith('data:image/')) {
        return (
          <div className="px-3 py-2" style={{ ...outerStyle, ...lastRadius }}>
            <div style={{
              width: '100%',
              flex: '1 1 auto',
              minHeight: 60,
              backgroundImage: `url(${content})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              borderRadius: 'var(--radius-sm)',
            }} />
          </div>
        );
      }
      // 检测是否为视频 URL — 使用绝对定位 + flex 填充
      if (content.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i) || content.startsWith('data:video/')) {
        return (
          <div className="px-3 py-2" style={{ ...outerStyle, ...lastRadius }}>
            <div style={{ width: '100%', flex: '1 1 auto', minHeight: 60, position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <video
                src={content}
                controls
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>
        );
      }
      // 检测是否为音频 URL
      if (content.match(/\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i) || content.startsWith('data:audio/')) {
        return (
          <div className="px-3 py-2" style={{ ...outerStyle, ...lastRadius, justifyContent: 'center' }}>
            <audio src={content} controls style={{ width: '100%' }} />
          </div>
        );
      }
      // 普通文本
      return (
        <div className="px-3 py-2" style={{ ...outerStyle, overflow: 'auto', ...lastRadius }}>
          <div
            className="text-[11px] leading-[1.6] px-2 py-1.5 rounded-md"
            style={{
              color: 'var(--color-text-secondary)',
              background: 'var(--color-bg-tertiary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {content || '(空内容)'}
          </div>
        </div>
      );
    }

    // 数组内容（可能是图片数组）
    if (Array.isArray(content)) {
      // 检测是否全部为图片 URL
      const allImages = content.every(
        (item) => typeof item === 'string' && (item.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || item.startsWith('data:image/'))
      );
      if (allImages && content.length > 0) {
        return (
          <div className="px-3 py-2" style={{ ...outerStyle, ...lastRadius, overflow: 'auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: '100%' }}>
              {content.map((url, i) => (
                <div
                  key={i}
                  style={{
                    width: content.length === 1 ? '100%' : '48%',
                    aspectRatio: '1',
                    backgroundImage: `url(${url})`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
              ))}
            </div>
          </div>
        );
      }

      // 其他数组 → 格式化 JSON
      return (
        <div className="px-3 py-2" style={{ ...outerStyle, overflow: 'auto', ...lastRadius }}>
          <div
            className="text-[10px] leading-[1.5] px-2 py-1.5 rounded-md font-mono"
            style={{
              color: 'var(--color-text-secondary)',
              background: 'var(--color-bg-tertiary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {JSON.stringify(content, null, 2).slice(0, 500)}
          </div>
        </div>
      );
    }

    // 其他类型 → JSON 展示
    return (
      <div className="px-3 py-2" style={{ ...outerStyle, overflow: 'auto', ...lastRadius }}>
        <div
          className="text-[10px] leading-[1.5] px-2 py-1.5 rounded-md font-mono"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-tertiary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify(content, null, 2).slice(0, 500)}
        </div>
      </div>
    );
  }

  // 无内容 — 简洁提示
  return (
    <div
      className="px-3 py-2 text-center"
      style={{
        ...outerStyle,
        alignItems: 'center',
        justifyContent: 'center',
        ...lastRadius,
        background: 'none',
        border: 'none',
      }}
    >
      <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
        等待输入内容...
      </span>
    </div>
  );
}

// ============================================================
// 参数徽章组件
// ============================================================
function ParamBadge({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
      style={{
        color,
        background: `${color}15`,
        border: `1px solid ${color}25`,
      }}
    >
      {label}
    </span>
  );
}

export default memo(FlowNode);
