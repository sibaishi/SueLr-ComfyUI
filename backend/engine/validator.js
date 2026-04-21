// ============================================================
// Flow Studio - 工作流校验器
// ============================================================

/** AI 能力节点类型 */
const AI_TYPES = ['aiChat', 'imageGen', 'videoGen', 'webSearch'];

/** 节点类型中文名 */
const NODE_LABELS = {
  textInput: '文本输入',
  imageInput: '图片输入',
  videoInput: '视频输入',
  audioInput: '音频输入',
  textMerge: '文本合并',
  imageMerge: '图片合并',
  videoMerge: '视频合并',
  audioMerge: '音频合并',
  universalMerge: '通用合并',
  aiChat: 'AI 对话',
  imageGen: '图像生成',
  videoGen: '视频生成',
  webSearch: '网页搜索',
  output: '输出展示',
};

/**
 * 校验工作流
 * @param {Object} workflow - 工作流数据
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWorkflow(workflow) {
  const errors = [];

  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push('工作流中没有节点');
  }

  if (!workflow.edges) {
    errors.push('工作流缺少连线数据');
  }

  // 检查 AI 能力节点的输出端是否都连接了下游节点
  const edges = workflow.edges || [];
  const nodes = workflow.nodes || [];
  for (const node of nodes) {
    if (AI_TYPES.includes(node.type)) {
      const hasOutgoing = edges.some(e => e.source === node.id);
      if (!hasOutgoing) {
        const label = NODE_LABELS[node.type] || node.type;
        errors.push(`「${label}」节点的输出端未连接到任何节点，请连接到输出展示节点或其他节点`);
      }
    }
  }

  // TODO: 类型兼容性检查
  // TODO: 必填输入端口检查

  // 检查环
  if (hasCycle(nodes, edges)) {
    errors.push('工作流中存在循环依赖');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 检测工作流中是否有环（DFS）
 */
function hasCycle(nodes, edges) {
  const visited = new Set();
  const recursionStack = new Set();
  const adjacency = {};

  nodes.forEach(n => { adjacency[n.id] = []; });
  edges.forEach(e => {
    if (adjacency[e.source]) {
      adjacency[e.source].push(e.target);
    }
  });

  function dfs(nodeId) {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    for (const neighbor of (adjacency[nodeId] || [])) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true;
    }
  }

  return false;
}
