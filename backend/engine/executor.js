// ============================================================
// Flow Studio - 执行引擎（核心）
// 拓扑排序 + 逐节点执行 + SSE 进度推送
// ============================================================

import { execute as executeTextInput } from './nodes/textInput.js';
import { execute as executeAiChat } from './nodes/aiChat.js';
import { execute as executeOutput } from './nodes/output.js';
import { execute as executeImageInput } from './nodes/imageInput.js';
import { execute as executeVideoInput } from './nodes/videoInput.js';
import { execute as executeAudioInput } from './nodes/audioInput.js';
import { execute as executeTextMerge } from './nodes/textMerge.js';
import { execute as executeImageMerge } from './nodes/imageMerge.js';
import { execute as executeVideoMerge } from './nodes/videoMerge.js';
import { execute as executeAudioMerge } from './nodes/audioMerge.js';
import { execute as executeUniversalMerge } from './nodes/universalMerge.js';
import { execute as executeImageGen } from './nodes/imageGen.js';
import { execute as executeVideoGen } from './nodes/videoGen.js';
import { execute as executeWebSearch } from './nodes/webSearch.js';

// 节点执行器注册表
const NODE_EXECUTORS = {
  textInput: executeTextInput,
  imageInput: executeImageInput,
  videoInput: executeVideoInput,
  audioInput: executeAudioInput,
  textMerge: executeTextMerge,
  imageMerge: executeImageMerge,
  videoMerge: executeVideoMerge,
  audioMerge: executeAudioMerge,
  universalMerge: executeUniversalMerge,
  aiChat: executeAiChat,
  imageGen: executeImageGen,
  videoGen: executeVideoGen,
  webSearch: executeWebSearch,
  output: executeOutput,
};

const REQUIRED_INPUTS_BY_TYPE = {
  aiChat: ['prompt'],
  imageGen: ['prompt'],
  videoGen: ['prompt'],
  webSearch: ['query'],
  output: ['content'],
};

/**
 * 执行工作流
 * @param {Object} workflow - 工作流数据
 * @param {Object} apiConfig - API 配置
 * @param {Function} sendSSE - SSE 事件发送函数 (event, data) => void
 */
export async function executeWorkflow(workflow, apiConfig, sendSSE) {
  const { nodes, edges } = workflow;

  if (!nodes || nodes.length === 0) {
    sendSSE('workflow_error', { error: '工作流中没有节点' });
    return;
  }

  // 1. 校验工作流
  try {
    validateWorkflow(nodes, edges);
  } catch (err) {
    sendSSE('workflow_error', { error: err.message });
    return;
  }

  // 2. 拓扑排序
  let sorted;
  try {
    sorted = topoSort(nodes, edges);
  } catch (err) {
    sendSSE('workflow_error', { error: err.message });
    return;
  }

  // 3. 逐节点执行
  const outputs = {};
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i];

    // 检查节点是否有执行器
    const executor = NODE_EXECUTORS[node.type];
    if (!executor) {
      failCount++;
      sendSSE('node_start', {
        nodeId: node.id,
        nodeType: node.type,
        index: i,
        total: sorted.length,
      });
      sendSSE('node_error', {
        nodeId: node.id,
        error: `节点类型 "${node.type}" 暂未实现`,
      });
      continue;
    }

    sendSSE('node_start', {
      nodeId: node.id,
      nodeType: node.type,
      index: i,
      total: sorted.length,
    });

    try {
      // 收集输入
      const inputs = collectInputs(node, edges, outputs);

      const requiredInputs = REQUIRED_INPUTS_BY_TYPE[node.type] || [];
      const missingInputs = requiredInputs.filter((key) => {
        const value = inputs[key];
        return value === undefined || value === null || value === '';
      });

      if (missingInputs.length > 0) {
        failCount++;
        sendSSE('node_error', {
          nodeId: node.id,
          error: `节点缺少必填输入: ${missingInputs.join(', ')}`,
        });
        continue;
      }

      // 执行节点
      const result = await executor(node, inputs, apiConfig, (msg) => {
        sendSSE('node_progress', {
          nodeId: node.id,
          progress: -1,
          message: msg,
        });
      });

      outputs[node.id] = result;
      successCount++;

      sendSSE('node_complete', {
        nodeId: node.id,
        outputs: result,
        duration: Date.now() - startTime,
      });
    } catch (err) {
      failCount++;
      sendSSE('node_error', {
        nodeId: node.id,
        error: err.message || '节点执行失败',
      });

      // 检查下游是否有依赖于该节点的必填输入
      // 如果有，则跳过那些节点（它们会在 collectInputs 时发现缺少必要数据）
    }
  }

  sendSSE('workflow_complete', {
    totalDuration: Date.now() - startTime,
    successCount,
    failCount,
  });
}

/**
 * 校验工作流
 */
function validateWorkflow(nodes, edges) {
  // 检查是否有重复 ID
  const nodeIds = new Set(nodes.map(n => n.id));
  if (nodeIds.size !== nodes.length) {
    throw new Error('存在重复的节点 ID');
  }

  // 检查连线引用的节点是否存在
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      throw new Error(`连线引用了不存在的源节点: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`连线引用了不存在的目标节点: ${edge.target}`);
    }
  }

  // 检查是否有不支持类型的节点
  const supportedTypes = new Set(Object.keys(NODE_EXECUTORS));
  for (const node of nodes) {
    if (!supportedTypes.has(node.type)) {
      throw new Error(`不支持的节点类型: ${node.type}`);
    }
  }
}

/**
 * 拓扑排序（Kahn 算法）
 */
function topoSort(nodes, edges) {
  const inDegree = {};
  const adjacency = {};

  nodes.forEach(n => {
    inDegree[n.id] = 0;
    adjacency[n.id] = [];
  });

  edges.forEach(e => {
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    if (adjacency[e.source]) {
      adjacency[e.source].push(e.target);
    }
  });

  const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const result = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodes.find(n => n.id === nodeId);
    if (node) result.push(node);

    (adjacency[nodeId] || []).forEach(target => {
      inDegree[target]--;
      if (inDegree[target] === 0) {
        queue.push(target);
      }
    });
  }

  if (result.length !== nodes.length) {
    throw new Error('工作流中存在循环依赖，请检查节点连线');
  }

  return result;
}

/**
 * 收集节点输入
 * 从上游节点的输出中，根据连线关系收集当前节点的输入数据
 */
function collectInputs(node, edges, outputs) {
  const inputs = {};
  edges
    .filter(e => e.target === node.id)
    .forEach(e => {
      const sourceOutput = outputs[e.source];
      if (sourceOutput) {
        inputs[e.targetHandle] = sourceOutput[e.sourceHandle];
      }
    });
  return inputs;
}
