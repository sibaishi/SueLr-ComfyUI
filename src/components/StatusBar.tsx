// ============================================================
// Flow Studio - 底部状态栏
// ============================================================

import { APP_VERSION } from '@/lib/constants';

interface StatusBarProps {
  nodeCount: number;
  edgeCount: number;
  isExecuting: boolean;
  executionMessage?: string | null;
  lastExecutionStatus?: 'success' | 'error' | null;
  lastExecutionTime?: number;
  lastExecutionError?: string | null;
  lastExecutionSummary?: {
    successCount: number;
    failCount: number;
    totalDuration: number;
  } | null;
  canUndo: boolean;
  canRedo: boolean;
}

export default function StatusBar({
  nodeCount,
  edgeCount,
  isExecuting,
  executionMessage,
  lastExecutionStatus,
  lastExecutionTime,
  lastExecutionError,
  lastExecutionSummary,
  canUndo,
  canRedo,
}: StatusBarProps) {
  return (
    <div
      className="glass flex items-center justify-between px-4 text-[11px] select-none"
      style={{
        height: 'var(--statusbar-height)',
        borderTop: '1px solid var(--color-border)',
        color: 'var(--color-text-tertiary)',
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span>节点: {nodeCount}</span>
        <span>连线: {edgeCount}</span>

        {isExecuting && (
          <span className="truncate" style={{ color: 'var(--color-accent)' }} title={executionMessage || undefined}>
            执行中: {executionMessage || '准备启动...'}
          </span>
        )}

        {!isExecuting && lastExecutionStatus === 'success' && (
          <span className="truncate" style={{ color: 'var(--color-success)' }}>
            最近执行成功
            {lastExecutionSummary
              ? ` · ${lastExecutionSummary.successCount} 成功 / ${lastExecutionSummary.failCount} 失败`
              : ''}
            {lastExecutionTime ? ` · ${lastExecutionTime}ms` : ''}
          </span>
        )}

        {!isExecuting && lastExecutionStatus === 'error' && (
          <span
            className="truncate"
            style={{ color: 'var(--color-danger)' }}
            title={lastExecutionError || undefined}
          >
            最近执行失败
            {lastExecutionSummary
              ? ` · ${lastExecutionSummary.successCount} 成功 / ${lastExecutionSummary.failCount} 失败`
              : ''}
            {lastExecutionError ? ` · ${lastExecutionError}` : ''}
          </span>
        )}
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-3">
        <span>撤销 {canUndo ? '可用' : '不可用'}</span>
        <span>重做 {canRedo ? '可用' : '不可用'}</span>
        <span>快捷键 Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z</span>
        <span>Flow Studio v{APP_VERSION}</span>
      </div>
    </div>
  );
}
