// ============================================================
// Flow Studio - SSE 中间件
// ============================================================

/**
 * 设置 SSE 响应头的中间件
 * 使用方法：app.use('/api/execute', sseMiddleware, executeRoutes)
 */
export default function sseMiddleware(req, res, next) {
  // 只对 SSE 请求设置头
  if (req.headers.accept?.includes('text/event-stream')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
  }
  next();
}
