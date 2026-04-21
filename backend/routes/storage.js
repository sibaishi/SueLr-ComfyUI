// ============================================================
// Flow Studio - 文件存储路由
// 支持图片/视频/音频上传，返回服务器 URL
// ============================================================

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'storage', 'uploads');

// 确保目录存在
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const router = Router();

// ---- multer 配置 ----
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    const id = uuidv4();
    cb(null, `${id}${ext}`);
  },
});

// 文件大小限制
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

/**
 * POST /api/files/upload
 * 上传文件（图片/视频/音频）
 * 返回：{ success, url, fileName, fileSize }
 */
router.post('/files/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '未选择文件' });
  }

  const { file } = req;
  // 生成服务器 URL
  const url = `/api/files/${file.filename}`;

  console.log(`📁 文件上传: ${file.originalname} → ${file.filename} (${(file.size / 1024).toFixed(1)}KB)`);

  res.json({
    success: true,
    url,
    fileName: file.originalname,
    fileSize: file.size,
  });
});

/**
 * DELETE /api/files/:filename
 * 删除上传的文件
 */
router.delete('/files/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);

  // 安全检查：防止路径遍历
  if (!filePath.startsWith(UPLOADS_DIR)) {
    return res.status(403).json({ success: false, error: '非法路径' });
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: '文件不存在' });
  }
});

export default router;
