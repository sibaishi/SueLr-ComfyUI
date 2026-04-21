// ============================================================
// Flow Studio - 主应用入口
// ============================================================

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Toolbar from '@/components/Toolbar';
import Sidebar from '@/components/Sidebar';
import PropertiesPanel from '@/components/PropertiesPanel';
import StatusBar from '@/components/StatusBar';
import FlowCanvas from '@/components/FlowCanvas';
import SettingsModal from '@/components/SettingsModal';
import {
  useWorkflowStore,
  type WorkflowEditorSnapshot,
} from '@/lib/store';
import type { NodeTypeDef } from '@/lib/types';

function buildSnapshot(store: ReturnType<typeof useWorkflowStore.getState>): WorkflowEditorSnapshot {
  return {
    workflowId: store.workflowId,
    workflowName: store.workflowName,
    nodes: store.nodes,
    edges: store.edges,
    selectedNodeId: store.selectedNodeId,
  };
}

function snapshotSignature(snapshot: WorkflowEditorSnapshot) {
  return JSON.stringify({
    workflowId: snapshot.workflowId,
    workflowName: snapshot.workflowName,
    selectedNodeId: snapshot.selectedNodeId,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
  });
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const store = useWorkflowStore();
  const [showSettings, setShowSettings] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const historyPastRef = useRef<WorkflowEditorSnapshot[]>([]);
  const historyFutureRef = useRef<WorkflowEditorSnapshot[]>([]);
  const currentSnapshotRef = useRef<WorkflowEditorSnapshot | null>(null);
  const historyTimerRef = useRef<number | null>(null);
  const isApplyingHistoryRef = useRef(false);

  const syncHistoryState = useCallback(() => {
    setCanUndo(historyPastRef.current.length > 0);
    setCanRedo(historyFutureRef.current.length > 0);
  }, []);

  useEffect(() => {
    void useWorkflowStore.getState().initializeWorkflowPersistence();
    void useWorkflowStore.getState().fetchModels();
  }, []);

  useEffect(() => {
    store.persistLocalDraft();
  }, [store.workflowId, store.workflowName, store.nodes, store.edges]);

  useEffect(() => {
    if (store.isHydratingWorkflow || isApplyingHistoryRef.current) return;

    const nextSnapshot = buildSnapshot(store);
    if (!currentSnapshotRef.current) {
      currentSnapshotRef.current = nextSnapshot;
      syncHistoryState();
      return;
    }

    if (historyTimerRef.current) {
      window.clearTimeout(historyTimerRef.current);
    }

    historyTimerRef.current = window.setTimeout(() => {
      const current = currentSnapshotRef.current;
      if (!current) {
        currentSnapshotRef.current = nextSnapshot;
        syncHistoryState();
        return;
      }

      if (snapshotSignature(current) === snapshotSignature(nextSnapshot)) {
        return;
      }

      historyPastRef.current.push(current);
      if (historyPastRef.current.length > 80) {
        historyPastRef.current.shift();
      }
      historyFutureRef.current = [];
      currentSnapshotRef.current = nextSnapshot;
      syncHistoryState();
    }, 180);

    return () => {
      if (historyTimerRef.current) {
        window.clearTimeout(historyTimerRef.current);
      }
    };
  }, [
    store.workflowId,
    store.workflowName,
    store.nodes,
    store.edges,
    store.selectedNodeId,
    store.isHydratingWorkflow,
    syncHistoryState,
  ]);

  const applyHistorySnapshot = useCallback((snapshot: WorkflowEditorSnapshot) => {
    isApplyingHistoryRef.current = true;
    store.applyEditorSnapshot(snapshot, true);
    store.persistLocalDraft();
    currentSnapshotRef.current = snapshot;
    window.setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  }, [store]);

  const handleUndo = useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;

    const current = currentSnapshotRef.current || buildSnapshot(store);
    historyFutureRef.current.unshift(current);
    applyHistorySnapshot(previous);
    syncHistoryState();
  }, [applyHistorySnapshot, store, syncHistoryState]);

  const handleRedo = useCallback(() => {
    const next = historyFutureRef.current.shift();
    if (!next) return;

    const current = currentSnapshotRef.current || buildSnapshot(store);
    historyPastRef.current.push(current);
    applyHistorySnapshot(next);
    syncHistoryState();
  }, [applyHistorySnapshot, store, syncHistoryState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) return;

      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRedo, handleUndo]);

  const confirmDiscardChanges = useCallback((actionLabel: string) => {
    if (!store.hasUnsavedChanges) return true;

    return window.confirm(
      `当前工作流还有未保存修改，确定要继续${actionLabel}吗？未保存的更改会保留在本地草稿中。`
    );
  }, [store.hasUnsavedChanges]);

  const handleAddNode = useCallback((nodeTypeDef: NodeTypeDef) => {
    const offsetX = (Math.random() - 0.5) * 200;
    const offsetY = (Math.random() - 0.5) * 200;
    store.addNode(nodeTypeDef.type, { x: 300 + offsetX, y: 200 + offsetY });
  }, [store]);

  const handleSave = useCallback(async () => {
    const success = await store.saveWorkflow();
    if (!success) {
      console.error('保存工作流失败');
    }
  }, [store]);

  const handleExecute = useCallback(async () => {
    await store.executeWorkflow();
  }, [store]);

  const handleNewWorkflow = useCallback(() => {
    if (!confirmDiscardChanges('新建工作流')) return;
    store.newWorkflow();
    currentSnapshotRef.current = null;
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryState();
  }, [confirmDiscardChanges, store, syncHistoryState]);

  const handleSelectWorkflow = useCallback(async (workflowId: string) => {
    if (!workflowId || workflowId === store.workflowId) return;
    if (!confirmDiscardChanges('切换工作流')) return;

    const success = await store.loadWorkflow(workflowId);
    if (!success) {
      console.error('加载工作流失败');
      return;
    }

    currentSnapshotRef.current = null;
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryState();
  }, [confirmDiscardChanges, store, syncHistoryState]);

  const handleDuplicateWorkflow = useCallback(async () => {
    const success = await store.duplicateCurrentWorkflow();
    if (!success) {
      console.error('复制工作流失败');
      return;
    }

    currentSnapshotRef.current = null;
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryState();
  }, [store, syncHistoryState]);

  const handleDeleteWorkflow = useCallback(async () => {
    const workflowLabel = store.workflowName || '当前工作流';
    const confirmed = window.confirm(`确定要删除“${workflowLabel}”吗？此操作不可撤销。`);
    if (!confirmed) return;

    const success = await store.deleteCurrentWorkflow();
    if (!success) {
      console.error('删除工作流失败');
      return;
    }

    currentSnapshotRef.current = null;
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryState();
  }, [store, syncHistoryState]);

  const handleExportWorkflow = useCallback(() => {
    const payload = store.exportCurrentWorkflow();
    const safeName = (payload.name || 'workflow').replace(/[\\/:*?"<>|]/g, '-').trim() || 'workflow';
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }, [store]);

  const handleImportClick = useCallback(() => {
    if (!confirmDiscardChanges('导入工作流')) return;
    importInputRef.current?.click();
  }, [confirmDiscardChanges]);

  const handleImportWorkflow = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const success = store.importWorkflowData(parsed, file.name.replace(/\.json$/i, ''));
      if (!success) {
        window.alert('导入失败：文件格式不正确。');
        return;
      }

      currentSnapshotRef.current = null;
      historyPastRef.current = [];
      historyFutureRef.current = [];
      syncHistoryState();
    } catch {
      window.alert('导入失败：无法读取或解析 JSON 文件。');
    }
  }, [store, syncHistoryState]);

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--color-bg-primary)' }}>
      <Toolbar
        workflowId={store.workflowId}
        workflowName={store.workflowName}
        workflows={store.workflowList}
        onWorkflowNameChange={store.setWorkflowName}
        onNewWorkflow={handleNewWorkflow}
        onSelectWorkflow={handleSelectWorkflow}
        onDuplicateWorkflow={handleDuplicateWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
        onImportWorkflow={handleImportClick}
        onExportWorkflow={handleExportWorkflow}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onSave={handleSave}
        onExecute={handleExecute}
        onSettings={() => setShowSettings(true)}
        isExecuting={store.isExecuting}
        isSavingWorkflow={store.isSavingWorkflow}
        hasUnsavedChanges={store.hasUnsavedChanges}
        lastSavedAt={store.lastSavedAt}
        executionMessage={store.executionMessage ?? undefined}
        executionProgress={store.executionProgress ?? undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar onAddNode={handleAddNode} />

        <div className="relative flex-1">
          <FlowCanvas />
          {!store.isHydratingWorkflow && store.nodes.length === 0 && <EmptyCanvasHint />}
        </div>

        <PropertiesPanel />
      </div>

      <StatusBar
        nodeCount={store.nodes.length}
        edgeCount={store.edges.length}
        isExecuting={store.isExecuting}
        executionMessage={store.executionMessage}
        lastExecutionStatus={store.lastExecutionStatus}
        lastExecutionTime={store.lastExecutionTime ?? undefined}
        lastExecutionError={store.lastExecutionError}
        lastExecutionSummary={store.lastExecutionSummary}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportWorkflow}
      />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function EmptyCanvasHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="animate-fade-in text-center" style={{ color: 'var(--color-text-tertiary)' }}>
        <div className="mb-4 text-5xl opacity-40">🧩</div>
        <div className="mb-2 text-base font-medium">开始搭建你的 AI 工作流</div>
        <div className="text-sm">从左侧拖拽节点到画布，用连线把它们组合起来</div>
      </div>
    </div>
  );
}
