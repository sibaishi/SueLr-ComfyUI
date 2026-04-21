// ============================================================
// Flow Studio - Express 服务器入口
// 使用动态导入隔离模块，防止单个模块崩溃拖垮整个服务
// ============================================================

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- 确保存储目录存在 ----
const STORAGE_DIR = path.join(__dirname, 'storage');
const WORKFLOWS_DIR = path.join(STORAGE_DIR, 'workflows');
const OUTPUTS_DIR = path.join(STORAGE_DIR, 'outputs');
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
[STORAGE_DIR, WORKFLOWS_DIR, OUTPUTS_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const app = express();
const PORT = process.env.PORT || 3001;

// ---- 中间件 ----
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- 静态文件服务 ----
app.use('/api/outputs', express.static(path.join(__dirname, 'storage', 'outputs')));
app.use('/api/files', express.static(path.join(__dirname, 'storage', 'uploads')));

// ---- API 路由（动态导入，互不影响） ----
async function loadRoutes() {
  try {
    const { default: workflowRoutes } = await import('./routes/workflows.js');
    app.use('/api/workflows', workflowRoutes);
    console.log('   ✅ 工作流路由已加载');
  } catch (err) {
    console.error('   ❌ 工作流路由加载失败:', err.message);
  }

  try {
    const { default: executeRoutes } = await import('./routes/execute.js');
    app.use('/api/execute', executeRoutes);
    console.log('   ✅ 执行路由已加载');
  } catch (err) {
    console.error('   ❌ 执行路由加载失败:', err.message);
    app.post('/api/execute/:id', (_req, res) => {
      res.status(503).json({ success: false, error: '执行引擎加载失败，请检查后端日志' });
    });
  }

  try {
    const { default: settingsRoutes } = await import('./routes/settings.js');
    app.use('/api/settings', settingsRoutes);
    console.log('   ✅ 设置路由已加载');
  } catch (err) {
    console.error('   ❌ 设置路由加载失败:', err.message);
  }

  try {
    const { default: storageRoutes } = await import('./routes/storage.js');
    app.use('/api', storageRoutes);
    console.log('   ✅ 文件存储路由已加载');
  } catch (err) {
    console.error('   ❌ 文件存储路由加载失败:', err.message);
  }
}

// ---- 健康检查 ----
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', timestamp: Date.now() });
});

// ---- 启动服务器 ----
async function start() {
  await loadRoutes();

  app.listen(PORT, () => {
    console.log(`🚀 Flow Studio 后端已启动`);
    console.log(`   地址: http://localhost:${PORT}`);
    console.log(`   API:  http://localhost:${PORT}/api`);
    console.log(`   健康检查: http://localhost:${PORT}/api/health`);
  });
}

start().catch(err => {
  console.error('❌ 服务器启动失败:', err);
  process.exit(1);
});
