// ============================================================
// Flow Studio - 顶部工具栏
// ============================================================

import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import type { WorkflowListItem } from '@/lib/api';

interface ToolbarProps {
  workflowId: string;
  workflowName: string;
  workflows: WorkflowListItem[];
  onWorkflowNameChange: (name: string) => void;
  onNewWorkflow: () => void;
  onSelectWorkflow: (workflowId: string) => void;
  onDuplicateWorkflow: () => void;
  onDeleteWorkflow: () => void;
  onImportWorkflow: () => void;
  onExportWorkflow: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onExecute: () => void;
  onSettings: () => void;
  isExecuting: boolean;
  isSavingWorkflow: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  executionMessage?: string;
  executionProgress?: { current: number; total: number };
}

function formatSaveStatus(isSavingWorkflow: boolean, hasUnsavedChanges: boolean, lastSavedAt: number | null) {
  if (isSavingWorkflow) return '保存中...';
  if (hasUnsavedChanges) return '未保存';
  if (!lastSavedAt) return '未保存到云端';

  const time = new Date(lastSavedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `已保存 ${time}`;
}

export default function Toolbar({
  workflowId,
  workflowName,
  workflows,
  onWorkflowNameChange,
  onNewWorkflow,
  onSelectWorkflow,
  onDuplicateWorkflow,
  onDeleteWorkflow,
  onImportWorkflow,
  onExportWorkflow,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSave,
  onExecute,
  onSettings,
  isExecuting,
  isSavingWorkflow,
  hasUnsavedChanges,
  lastSavedAt,
  executionMessage,
  executionProgress,
}: ToolbarProps) {
  const { theme, toggleTheme } = useTheme();

  const currentWorkflowValue = useMemo(() => {
    return workflows.some((workflow) => workflow.id === workflowId) ? workflowId : '';
  }, [workflowId, workflows]);

  const saveStatus = formatSaveStatus(isSavingWorkflow, hasUnsavedChanges, lastSavedAt);

  return (
    <div
      className="glass flex items-center gap-1 px-3 select-none"
      style={{ height: 'var(--toolbar-height)', zIndex: 100 }}
    >
      <div className="mr-3 flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #007AFF, #5856D6)' }}
        >
          FS
        </div>
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Flow Studio
        </span>
      </div>

      <div className="mx-1 h-6 w-px" style={{ background: 'var(--color-border-strong)' }} />

      <select
        value={currentWorkflowValue}
        onChange={(e) => onSelectWorkflow(e.target.value)}
        className="w-44 rounded-md px-2 py-1 text-xs outline-none"
        style={{
          background: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
        }}
        title="切换工作流"
      >
        <option value="">当前工作流未保存</option>
        {workflows.map((workflow) => (
          <option key={workflow.id} value={workflow.id}>
            {workflow.name}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={workflowName}
        onChange={(e) => onWorkflowNameChange(e.target.value)}
        className="w-44 truncate rounded-md px-2 py-1 text-sm outline-none"
        style={{
          background: 'transparent',
          color: 'var(--color-text-primary)',
          border: '1px solid transparent',
        }}
        onFocus={(e) => {
          e.target.style.border = '1px solid var(--color-accent)';
          e.target.style.background = 'var(--color-bg-tertiary)';
        }}
        onBlur={(e) => {
          e.target.style.border = '1px solid transparent';
          e.target.style.background = 'transparent';
        }}
      />

      <ToolbarButton icon="+" label="新建" onClick={onNewWorkflow} />
      <ToolbarButton icon="⧉" label="复制" onClick={onDuplicateWorkflow} />
      <ToolbarButton icon="🗑" label="删除" onClick={onDeleteWorkflow} />
      <ToolbarButton icon="⇪" label="导入" onClick={onImportWorkflow} />
      <ToolbarButton icon="⇩" label="导出" onClick={onExportWorkflow} />
      <ToolbarButton icon="↶" label="撤销" onClick={onUndo} disabled={!canUndo} />
      <ToolbarButton icon="↷" label="重做" onClick={onRedo} disabled={!canRedo} />
      <ToolbarButton icon="💾" label="保存" onClick={onSave} />

      <div className="ml-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {saveStatus}
      </div>

      <div className="mx-1 h-6 w-px" style={{ background: 'var(--color-border-strong)' }} />

      {isExecuting ? (
        <div
          className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
          style={{ background: 'rgba(0, 122, 255, 0.15)', color: 'var(--color-accent)' }}
        >
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="truncate">
            {executionMessage || (
              executionProgress
                ? `执行中 ${executionProgress.current}/${executionProgress.total}...`
                : '执行中...'
            )}
          </span>
        </div>
      ) : (
        <button
          onClick={onExecute}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all"
          style={{ background: 'var(--color-accent)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-accent-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-accent)';
          }}
        >
          <span>▶</span>
          执行
        </button>
      )}

      <div className="flex-1" />

      {isExecuting && executionProgress && (
        <div className="mr-3 flex items-center gap-2">
          <div
            className="h-1.5 w-32 overflow-hidden rounded-full"
            style={{ background: 'var(--color-border)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(executionProgress.current / executionProgress.total) * 100}%`,
                background: 'var(--color-accent)',
              }}
            />
          </div>
        </div>
      )}

      <ToolbarButton icon="⚙" label="设置" onClick={onSettings} />

      <button
        onClick={toggleTheme}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--glass-bg-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
      style={{
        color: disabled ? 'var(--color-text-quaternary)' : 'var(--color-text-secondary)',
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = 'var(--glass-bg-hover)';
        e.currentTarget.style.color = 'var(--color-text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = disabled
          ? 'var(--color-text-quaternary)'
          : 'var(--color-text-secondary)';
      }}
      title={label}
    >
      <span className="text-sm">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
