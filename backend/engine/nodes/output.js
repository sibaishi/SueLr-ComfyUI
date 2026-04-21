// ============================================================
// Flow Studio - 输出展示节点执行器
// ============================================================

/**
 * 执行输出展示节点
 * 将接收到的内容直接透传展示
 */
export async function execute(node, inputs) {
  const content = inputs.content || null;
  return { content };
}
