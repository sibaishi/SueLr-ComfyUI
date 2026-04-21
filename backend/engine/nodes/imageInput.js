// ============================================================
// Flow Studio - 图片输入节点执行器
// 返回服务器文件 URL（节点之间传递轻量 URL）
// ============================================================

export async function execute(node, inputs, apiConfig, sendProgress) {
  const fileUrl = node.data?.fileUrl || '';
  const fileName = node.data?.fileName || '';

  if (!fileUrl) {
    throw new Error('未选择图片文件');
  }

  sendProgress?.('读取图片文件...');
  return { image: fileUrl };
}
