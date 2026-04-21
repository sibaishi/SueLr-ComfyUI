// 文本合并执行器 — 将多个文本输入用换行符拼接
export async function execute(node, inputs, apiConfig, onProgress) {
  onProgress('合并文本...');
  const values = Object.keys(inputs)
    .sort((a, b) => {
      const idxA = parseInt(a.replace('item', ''));
      const idxB = parseInt(b.replace('item', ''));
      return idxA - idxB;
    })
    .map(key => String(inputs[key] || ''))
    .filter(v => v.length > 0);

  return { merged: values.join('\n') };
}
