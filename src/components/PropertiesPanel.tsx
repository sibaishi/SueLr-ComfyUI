// ============================================================
// Flow Studio - 右侧属性面板
// 选中节点时显示完整参数配置、端口连接状态
// 未选中时显示帮助信息和快速入门
// ============================================================

import { useWorkflowStore } from '@/lib/store';
import { getNodeDef, NODE_REGISTRY } from '@/lib/constants';
import type { ParamDef } from '@/lib/types';

export default function PropertiesPanel() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);

  return (
    <div
      className="glass flex flex-col select-none overflow-hidden"
      style={{
        width: 'var(--panel-width)',
        borderLeft: '1px solid var(--color-border)',
      }}
    >
      {/* 标题 */}
      <div
        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider flex items-center justify-between"
        style={{
          color: 'var(--color-text-tertiary)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span>属性</span>
        {selectedNodeId && (
          <span className="text-[9px] font-mono normal-case" style={{ color: 'var(--color-text-tertiary)' }}>
            {selectedNodeId.slice(0, 12)}
          </span>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {selectedNodeId ? (
          <NodeProperties
            nodeId={selectedNodeId}
            node={nodes.find((n) => n.id === selectedNodeId)}
          />
        ) : (
          <EmptyPanel />
        )}
      </div>
    </div>
  );
}

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

/** 有选中节点时 — 显示属性编辑 */
function NodeProperties({
  nodeId,
  node,
}: {
  nodeId: string;
  node: { id: string; type?: string; data: Record<string, unknown> } | undefined;
}) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const execStatus = useWorkflowStore((s) => s.nodeExecStatus[nodeId] || 'idle');
  const execError = useWorkflowStore((s) => s.nodeErrors[nodeId]);

  if (!node) {
    return (
      <div className="p-4 text-xs text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
        节点不存在
      </div>
    );
  }

  const nodeType = node.type || '';
  const def = getNodeDef(nodeType);
  if (!def) {
    return (
      <div className="p-4 text-xs text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
        未知节点类型: {nodeType}
      </div>
    );
  }

  const icon = NODE_ICONS[def.icon] || '📦';

  /** 更新节点参数 */
  const handleParamChange = (paramId: string, value: unknown) => {
    updateNodeData(nodeId, { [paramId]: value });
  };

  // 查找连接到此节点的输入端口的上游节点
  const getConnectedSource = (targetHandle: string) => {
    const edge = edges.find((e) => e.target === nodeId && e.targetHandle === targetHandle);
    if (!edge) return null;
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (!sourceNode) return null;
    const sourceDef = getNodeDef(sourceNode.type || '');
    if (!sourceDef) return null;
    return {
      name: sourceDef.label,
      icon: NODE_ICONS[sourceDef.icon] || '📦',
      handle: edge.sourceHandle,
    };
  };

  const statusColors: Record<string, string> = {
    idle: 'var(--color-text-tertiary)',
    running: '#FF9500',
    success: '#30D158',
    error: '#FF3B30',
  };

  const statusLabels: Record<string, string> = {
    idle: '就绪',
    running: '执行中...',
    success: '成功',
    error: '失败',
  };

  return (
    <div className="animate-fade-in">
      {/* 节点标题区 */}
      <div
        className="px-4 py-3 flex items-center gap-2.5"
        style={{
          background: `${def.color}0A`,
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: def.color }}>
            {def.label}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-[10px] px-1.5 py-0 rounded-full"
              style={{
                color: statusColors[execStatus] || 'var(--color-text-tertiary)',
                background: execStatus !== 'idle' ? `${statusColors[execStatus] || '#8E8E93'}15` : 'transparent',
              }}
            >
              {statusLabels[execStatus] || '就绪'}
            </span>
          </div>
        </div>
      </div>

      {/* 参数编辑区 */}
      {def.params.length > 0 ? (
        <div className="p-4 space-y-4">
          <div
            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            参数配置
          </div>
          {def.params.map((param) => (
            <ParamEditor
              key={param.id}
              param={param}
              value={node.data[param.id]}
              onChange={(value) => handleParamChange(param.id, value)}
              nodeType={nodeType}
            />
          ))}
        </div>
      ) : (
        <div className="p-4 text-xs text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
          此节点无可配置参数
        </div>
      )}

      {/* 端口连接信息 */}
      <div
        className="px-4 py-3 space-y-2"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          端口连接
        </div>

        {/* 输入端口 */}
        {def.inputs.length > 0 && (
          <div>
            <div className="text-[10px] mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              输入端口
            </div>
            {def.inputs.map((input) => {
              const conn = getConnectedSource(input.id);
              const connected = conn !== null;
              return (
                <div
                  key={input.id}
                  className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg mb-1"
                  style={{
                    background: connected ? 'rgba(48, 209, 88, 0.06)' : 'var(--color-bg-tertiary)',
                    border: connected ? '1px solid rgba(48, 209, 88, 0.12)' : '1px solid var(--color-border)',
                  }}
                >
                  <span style={{ color: connected ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                    {connected ? '●' : '○'}
                  </span>
                  <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {input.label}
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                    {input.type}
                  </span>
                  {connected && (
                    <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-success)' }}>
                      ← {conn.icon} {conn.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 输出端口 */}
        {def.outputs.length > 0 && (
          <div>
            <div className="text-[10px] mb-1.5 mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              输出端口
            </div>
            {def.outputs.map((output) => {
              const downstreamEdges = edges.filter(
                (e) => e.source === nodeId && e.sourceHandle === output.id
              );
              const hasDownstream = downstreamEdges.length > 0;
              const downstreamLabels = downstreamEdges.map((e) => {
                const n = nodes.find((nd) => nd.id === e.target);
                if (!n) return '';
                const d = getNodeDef(n.type || '');
                return d ? `${NODE_ICONS[d.icon] || ''} ${d.label}` : '';
              }).filter(Boolean);

              return (
                <div
                  key={output.id}
                  className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg mb-1"
                  style={{
                    background: hasDownstream ? 'rgba(0, 122, 255, 0.06)' : 'var(--color-bg-tertiary)',
                    border: hasDownstream ? '1px solid rgba(0, 122, 255, 0.12)' : '1px solid var(--color-border)',
                  }}
                >
                  <span style={{ color: hasDownstream ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                    ●
                  </span>
                  <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {output.label}
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                    {output.type}
                  </span>
                  {hasDownstream && (
                    <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-accent)' }}>
                      → {downstreamLabels.join(', ')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 错误信息 */}
      {execStatus === 'error' && execError && (
        <div
          className="mx-4 mb-2 px-3 py-2 rounded-lg text-[11px] leading-4"
          style={{
            background: 'rgba(255, 59, 48, 0.08)',
            color: '#FF3B30',
            border: '1px solid rgba(255, 59, 48, 0.12)',
          }}
        >
          <div className="font-medium mb-0.5">错误信息</div>
          <div>{execError}</div>
        </div>
      )}

      {/* 操作按钮 */}
      <div
        className="px-4 py-3"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <button
          onClick={() => removeNode(nodeId)}
          className="w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          style={{
            color: 'var(--color-danger)',
            background: 'rgba(255, 59, 48, 0.08)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 59, 48, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 59, 48, 0.08)';
          }}
        >
          🗑️ 删除节点
        </button>
      </div>
    </div>
  );
}

/** 参数编辑器 - 根据参数类型渲染不同控件 */
function ParamEditor({
  param,
  value,
  onChange,
  nodeType,
}: {
  param: ParamDef;
  value: unknown;
  onChange: (value: unknown) => void;
  nodeType?: string;
}) {
  const availableModels = useWorkflowStore((s) => s.availableModels);
  const labelStyle: React.CSSProperties = {
    color: 'var(--color-text-secondary)',
    fontSize: 11,
    fontWeight: 500,
    marginBottom: 4,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
  };

  const handleFocus = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'var(--color-accent)';
  };
  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'var(--color-border)';
  };

  switch (param.type) {
    case 'textarea':
      return (
        <div>
          <label style={labelStyle}>{param.label}</label>
          <textarea
            value={(value as string) ?? (param.default as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none resize-y"
            style={inputStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={`请输入${param.label}...`}
          />
        </div>
      );

    case 'text':
      return (
        <div>
          <label style={labelStyle}>{param.label}</label>
          <input
            type="text"
            value={(value as string) ?? (param.default as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
            style={inputStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>
      );

    case 'select': {
      // 模型选择器 — 使用动态从 API 获取的模型列表
      const isModelParam = param.id === 'model';
      let selectOptions = param.options || [];

      if (isModelParam) {
        // 根据节点类型选择对应的模型分类
        let modelsForType: string[] = [];
        if (nodeType === 'aiChat') modelsForType = availableModels.chat;
        else if (nodeType === 'imageGen') modelsForType = availableModels.image;
        else if (nodeType === 'videoGen') modelsForType = availableModels.video;
        else modelsForType = availableModels.all;

        // 如果对应分类为空，回退到全部模型
        if (modelsForType.length === 0 && availableModels.all.length > 0) {
          modelsForType = availableModels.all;
        }

        if (modelsForType.length > 0) {
          selectOptions = modelsForType.map((id) => ({ label: id, value: id }));
        }
      }

      // 当前选中的值
      const currentValue = String(value ?? param.default ?? '');
      const hasValidOption = currentValue && selectOptions.some(
        (o) => String(o.value) === currentValue
      );

      return (
        <div>
          <label style={labelStyle}>
            {param.label}
            {isModelParam && availableModels.all.length === 0 && (
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, marginLeft: 4 }}>
                （请先配置 API）
              </span>
            )}
            {isModelParam && availableModels.all.length > 0 && (
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, marginLeft: 4 }}>
                （{
                  nodeType === 'aiChat' ? availableModels.chat.length :
                  nodeType === 'imageGen' ? availableModels.image.length :
                  nodeType === 'videoGen' ? availableModels.video.length :
                  availableModels.all.length
                } 个可用）
              </span>
            )}
          </label>
          <select
            value={hasValidOption ? currentValue : ''}
            onChange={(e) => {
              if (e.target.value) {
                onChange(e.target.value);
              }
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
            style={inputStyle}
          >
            {/* 占位提示 */}
            <option value="" disabled>
              {selectOptions.length === 0
                ? '请先在设置中配置 API 并测试连接'
                : '请选择模型...'}
            </option>
            {/* 当前值不在列表中时保留显示 */}
            {currentValue && !hasValidOption && (
              <option value={currentValue}>{currentValue}（当前值）</option>
            )}
            {selectOptions.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    case 'number':
      return (
        <div>
          <label style={labelStyle}>{param.label}</label>
          <input
            type="number"
            value={Number(value ?? param.default ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            min={param.min}
            max={param.max}
            step={param.step ?? 1}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
            style={inputStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>
      );

    case 'slider': {
      const sliderVal = Number(value ?? param.default ?? 0);
      const minVal = param.min ?? 0;
      const maxVal = param.max ?? 1;
      const pct = ((sliderVal - minVal) / (maxVal - minVal)) * 100;
      return (
        <div>
          <div className="flex items-center justify-between">
            <label style={labelStyle}>{param.label}</label>
            <span
              className="text-[11px] font-mono"
              style={{ color: 'var(--color-accent)' }}
            >
              {sliderVal.toFixed((param.step ?? 1) < 1 ? 1 : 0)}
            </span>
          </div>
          <input
            type="range"
            value={sliderVal}
            onChange={(e) => onChange(Number(e.target.value))}
            min={minVal}
            max={maxVal}
            step={param.step ?? 0.1}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-border) ${pct}%)`,
            }}
          />
        </div>
      );
    }

    case 'toggle': {
      const toggled = Boolean(value ?? param.default ?? false);
      return (
        <div className="flex items-center justify-between">
          <label style={{ ...labelStyle, marginBottom: 0 }}>
            {param.label}
          </label>
          <button
            onClick={() => onChange(!toggled)}
            className="relative w-10 h-6 rounded-full transition-colors cursor-pointer"
            style={{
              background: toggled
                ? 'var(--color-accent)'
                : 'var(--color-border-strong)',
            }}
          >
            <div
              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform"
              style={{
                left: toggled ? '22px' : '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}

/** 无选中节点时 — 显示帮助信息 */
function EmptyPanel() {
  return (
    <div className="p-4">
      <div
        className="text-sm font-medium mb-4"
        style={{ color: 'var(--color-text-primary)' }}
      >
        快速入门
      </div>

      <div className="space-y-3">
        <HelpItem step={1} text="从左侧节点库拖拽或点击添加节点" />
        <HelpItem step={2} text="从输出端口拖拽到输入端口创建连线" />
        <HelpItem step={3} text="点击节点在右侧配置参数" />
        <HelpItem step={4} text="双击文本输入节点可内嵌编辑" />
        <HelpItem step={5} text="点击 ▶ 执行按钮运行工作流" />
      </div>

      <div
        className="mt-6 p-3 rounded-lg text-xs leading-4"
        style={{
          background: 'rgba(0, 122, 255, 0.08)',
          color: 'var(--color-accent)',
        }}
      >
        💡 提示：滚轮缩放画布，空格+拖拽平移，Delete 删除选中
      </div>

      {/* 连线类型兼容表 */}
      <div className="mt-4">
        <div
          className="text-xs font-semibold mb-2"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          连线类型兼容规则
        </div>
        <div
          className="p-2.5 rounded-lg text-[10px] leading-5"
          style={{
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <div>✅ 文本 → 任何端口（文字可做提示词）</div>
          <div>✅ 图片 → 图片/视频端口</div>
          <div>✅ 图片组 → 图片/视频端口</div>
          <div>✅ 视频 → 视频端口</div>
          <div>❌ 图片 → 文本端口（不支持）</div>
        </div>
      </div>

      {/* 节点类型说明 */}
      <div className="mt-4">
        <div
          className="text-xs font-semibold mb-2"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          可用节点类型
        </div>
        <div className="space-y-1.5">
          {NODE_REGISTRY.map((nodeDef) => {
            const nodeIcon = NODE_ICONS[nodeDef.icon] || '📦';
            const catLabel = getCategoryLabel(nodeDef.category);
            return (
              <div
                key={nodeDef.type}
                className="flex items-center gap-2 text-xs"
              >
                <div
                  className="w-1 h-4 rounded-full flex-shrink-0"
                  style={{ background: nodeDef.color }}
                />
                <span>{nodeIcon}</span>
                <span style={{ color: 'var(--color-text-primary)' }}>
                  {nodeDef.label}
                </span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  — {catLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 分类标签 */
function getCategoryLabel(category: string): string {
  if (category === 'input') return '输入数据';
  if (category === 'ai') return 'AI 能力';
  if (category === 'output') return '结果输出';
  return category;
}

/** 帮助步骤 */
function HelpItem({ step, text }: { step: number; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
        style={{ background: 'var(--color-accent)', color: 'white' }}
      >
        {step}
      </div>
      <div
        className="text-xs leading-5 pt-0.5"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {text}
      </div>
    </div>
  );
}
