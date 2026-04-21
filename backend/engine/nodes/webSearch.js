// ============================================================
// Flow Studio - 网页搜索节点执行器
// 调用 Tavily Search API
// ============================================================

/**
 * 执行网页搜索节点
 * @param {Object} node - 节点数据
 * @param {Object} inputs - 上游输入 { query }
 * @param {Object} apiConfig - API 配置 { tavilyApiKey }
 * @param {Function} sendProgress - 进度回调
 */
export async function execute(node, inputs, apiConfig, sendProgress) {
  // 获取搜索词
  const query = inputs.query || '';
  if (!query) {
    throw new Error('未提供搜索词，请连接文本输入节点');
  }

  const maxResults = node.data?.maxResults || 5;
  const includeAnswer = node.data?.includeAnswer !== false; // 默认 true

  // Tavily API Key（从设置中获取，与 AI API Key 分开存储）
  const tavilyKey = apiConfig.tavilyApiKey || apiConfig.apiKey;

  if (!tavilyKey) {
    throw new Error('未配置 Tavily API Key，请在设置中配置');
  }

  sendProgress?.(`正在搜索: "${query}"...`);
  console.log(`🔍 网页搜索: query="${query}", max=${maxResults}`);

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      max_results: maxResults,
      include_answer: includeAnswer,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '未知错误');
    throw new Error(`搜索 API 调用失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // 格式化搜索结果为文本
  const parts = [];

  if (data.answer) {
    parts.push(`【AI 摘要】\n${data.answer}`);
  }

  if (data.results && data.results.length > 0) {
    parts.push(`【搜索结果】`);
    for (let i = 0; i < data.results.length; i++) {
      const r = data.results[i];
      parts.push(`${i + 1}. ${r.title}\n   ${r.content}\n   链接: ${r.url}`);
    }
  }

  const resultText = parts.join('\n\n');

  if (!resultText) {
    throw new Error('搜索未返回任何结果');
  }

  console.log(`🔍 搜索完成: ${data.results?.length || 0} 条结果`);

  return { results: resultText };
}
