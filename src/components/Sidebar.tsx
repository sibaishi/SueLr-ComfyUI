// ============================================================
// Flow Studio - 左侧节点库
// 支持点击添加 + 拖拽添加节点
// ============================================================

import { type DragEvent } from 'react';
import { NODE_REGISTRY, NODE_CATEGORIES } from '@/lib/constants';
import type { NodeTypeDef } from '@/lib/types';

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

interface SidebarProps {
  onAddNode: (nodeType: NodeTypeDef) => void;
}

export default function Sidebar({ onAddNode }: SidebarProps) {
  /** 处理拖拽开始 — 设置拖拽数据 */
  const handleDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className="glass flex flex-col select-none overflow-hidden"
      style={{
        width: 'var(--sidebar-width)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* 标题 */}
      <div
        className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider"
        style={{
          color: 'var(--color-text-tertiary)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        节点库
      </div>

      {/* 按分类展示节点 */}
      <div className="flex-1 overflow-y-auto py-1">
        {NODE_CATEGORIES.map((category) => {
          const nodes = NODE_REGISTRY.filter((n) => n.category === category.id);
          return (
            <div key={category.id} className="mb-1">
              {/* 分类标题 */}
              <div
                className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {category.icon} {category.label}
              </div>

              {/* 节点列表 */}
              {nodes.map((nodeType) => (
                <NodeItem
                  key={nodeType.type}
                  nodeType={nodeType}
                  onClick={() => onAddNode(nodeType)}
                  onDragStart={(e) => handleDragStart(e, nodeType.type)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* 底部帮助提示 */}
      <div
        className="px-3 py-2 text-[10px] border-t"
        style={{
          color: 'var(--color-text-tertiary)',
          borderColor: 'var(--color-border)',
        }}
      >
        💡 拖拽节点到画布添加，或直接点击
      </div>
    </div>
  );
}

/** 单个节点项 */
function NodeItem({
  nodeType,
  onClick,
  onDragStart,
}: {
  nodeType: NodeTypeDef;
  onClick: () => void;
  onDragStart: (e: DragEvent) => void;
}) {
  const icon = NODE_ICONS[nodeType.icon] || '📦';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-grab active:cursor-grabbing"
      style={{ background: 'transparent' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--glass-bg-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* 节点颜色指示条 */}
      <div
        className="w-1 h-6 rounded-full flex-shrink-0"
        style={{ background: nodeType.color }}
      />

      {/* 图标 */}
      <span className="text-base flex-shrink-0">{icon}</span>

      {/* 名称和端口信息 */}
      <div className="min-w-0">
        <div
          className="text-xs font-medium truncate"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {nodeType.label}
        </div>
        <div
          className="text-[10px] truncate"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {nodeType.inputs.length > 0 && (
            <span>入{nodeType.inputs.length} </span>
          )}
          {nodeType.outputs.length > 0 && (
            <span>出{nodeType.outputs.length}</span>
          )}
          {nodeType.inputs.length === 0 &&
            nodeType.outputs.length === 0 && (
              <span>终端节点</span>
            )}
        </div>
      </div>
    </div>
  );
}
