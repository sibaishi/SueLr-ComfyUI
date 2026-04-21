// ============================================================
// Flow Studio - 工作流 CRUD 路由
// ============================================================

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKFLOWS_DIR = path.join(__dirname, '..', 'storage', 'workflows');

// 确保目录存在
if (!fs.existsSync(WORKFLOWS_DIR)) {
  fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
}

const router = Router();

/** 读取所有工作流 */
router.get('/', (_req, res) => {
  try {
    const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
    const workflows = files.map(f => {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf-8');
      const wf = JSON.parse(content);
      // 列表只返回基本信息
      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        nodeCount: wf.nodes?.length || 0,
        updatedAt: wf.updatedAt,
      };
    }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json({ success: true, data: workflows });
  } catch (err) {
    res.status(500).json({ success: false, error: '读取工作流列表失败' });
  }
});

/** 获取单个工作流 */
router.get('/:id', (req, res) => {
  try {
    const filePath = path.join(WORKFLOWS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '工作流不存在' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ success: true, data: JSON.parse(content) });
  } catch (err) {
    res.status(500).json({ success: false, error: '读取工作流失败' });
  }
});

/** 创建工作流 */
router.post('/', (req, res) => {
  try {
    // 优先使用前端传来的 ID，否则生成新的
    const id = req.body.id || `wf_${Date.now()}`;
    const workflow = {
      id,
      name: req.body.name || '未命名工作流',
      description: req.body.description || '',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nodes: req.body.nodes || [],
      edges: req.body.edges || [],
      settings: req.body.settings || {},
    };
    fs.writeFileSync(
      path.join(WORKFLOWS_DIR, `${id}.json`),
      JSON.stringify(workflow, null, 2)
    );
    res.json({ success: true, data: workflow });
  } catch (err) {
    res.status(500).json({ success: false, error: '创建工作流失败' });
  }
});

/** 更新工作流 */
router.put('/:id', (req, res) => {
  try {
    const filePath = path.join(WORKFLOWS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '工作流不存在' });
    }
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const updated = {
      ...existing,
      ...req.body,
      id: existing.id,
      updatedAt: Date.now(),
    };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: '更新工作流失败' });
  }
});

/** 删除工作流 */
router.delete('/:id', (req, res) => {
  try {
    const filePath = path.join(WORKFLOWS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '工作流不存在' });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: '删除工作流失败' });
  }
});

/** 复制工作流 */
router.post('/:id/duplicate', (req, res) => {
  try {
    const filePath = path.join(WORKFLOWS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '源工作流不存在' });
    }
    const source = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const newId = `wf_${Date.now()}`;
    const duplicated = {
      ...source,
      id: newId,
      name: `${source.name} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    fs.writeFileSync(
      path.join(WORKFLOWS_DIR, `${newId}.json`),
      JSON.stringify(duplicated, null, 2)
    );
    res.json({ success: true, data: duplicated });
  } catch (err) {
    res.status(500).json({ success: false, error: '复制工作流失败' });
  }
});

export default router;
