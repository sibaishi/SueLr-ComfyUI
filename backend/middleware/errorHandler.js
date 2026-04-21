// ============================================================
// Flow Studio - 统一错误处理中间件
// ============================================================

export default function errorHandler(err, req, res, _next) {
  console.error('[错误]', err.message || err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || '服务器内部错误',
  });
}
