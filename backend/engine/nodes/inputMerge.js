// ============================================================
// Flow Studio - 输入合并节点执行器
// 将所有输入合并为一个对象输出
// ============================================================

export async function execute(node, inputs, apiConfig, sendProgress) {
  sendProgress?.('合并输入数据...');

  // inputs 是一个对象，key 是输入端口 ID，value 是上游传来的数据
  // 合并为数组输出（保持顺序）
  const merged = [];
  for (const key of Object.keys(inputs)) {
    if (inputs[key] !== undefined && inputs[key] !== null) {
      merged.push(inputs[key]);
    }
  }

  return { merged };
}
