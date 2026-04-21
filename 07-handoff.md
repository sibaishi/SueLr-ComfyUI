# Flow Studio — 项目交接文档

> 最后更新：2026-04-21  
> 当前版本：0.2.0  
> 项目状态：批次 1-5 已完成，批次 6-10 + 高级功能待完成

---

## 一、项目概述

Flow Studio 是一个可视化的 AI 工作流编辑器（类似 ComfyUI），用户通过拖拽节点、连线组合的方式，自定义 AI 任务的执行流程。支持对话、图像生成、视频生成、网页搜索等多种 AI 能力的编排。

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React + Vite + TypeScript | React 19 / Vite 7 / TS 5.9 |
| 画布引擎 | @xyflow/react | v12（注意：API 与 v11 差异很大） |
| 状态管理 | Zustand | v5 |
| 样式 | Tailwind CSS | v4 |
| 后端 | Node.js + Express | ESM 模块 |
| 文件存储 | 文件系统 JSON | MVP 阶段 |

### 启动方式

```bash
# 一键启动（推荐，自动安装依赖 + 清理端口）
./start.sh

# 或手动启动
npm run dev          # 同时启动前端(5173) + 后端(3001)
```

---

## 二、项目文件结构

```
根目录/（= 前端项目根目录）
├── index.html                    ← 入口 HTML
├── package.json                  ← 前端依赖 + 启动脚本
├── vite.config.ts                ← Vite 配置（含代理 /api → localhost:3001）
├── tsconfig.json
├── start.sh                      ← 一键启动脚本（Mac/Linux/Windows Git Bash）
├── start.bat                     ← Windows 批处理（有问题，暂不用）
├── docs/                         ← 项目文档
│   ├── 01-overview.md
│   ├── 02-frontend-design.md
│   ├── 03-backend-design.md
│   ├── 04-node-types.md
│   ├── 05-reusable-code.md
│   ├── 06-implementation-plan.md
│   └── 07-handoff.md             ← 本文件
│
├── src/                          ← 前端源码
│   ├── main.tsx                  ← 入口
│   ├── App.tsx                   ← 主布局（5区布局）
│   ├── index.css                 ← CSS 变量 + 毛玻璃效果 + ReactFlow 样式覆盖
│   ├── vite-env.d.ts
│   ├── lib/
│   │   ├── types.ts              ← 核心类型定义（节点、端口、工作流、SSE 事件等）
│   │   ├── constants.ts          ← NODE_REGISTRY（14种节点）+ PORT_COMPATIBILITY（连线兼容矩阵）
│   │   ├── store.ts              ← Zustand Store（节点/连线 CRUD、执行状态、模型列表等）
│   │   ├── api.ts                ← API 客户端（工作流 CRUD + SSE 执行 + 设置 + 文件上传）
│   │   ├── utils.ts              ← 工具函数（gid、cleanKey、catModel 等）
│   │   ├── image.ts              ← 图片压缩工具
│   │   ├── imageStore.ts         ← IndexedDB 图片存储
│   │   └── providers/            ← Provider 体系（AI API 适配层）
│   │       ├── types.ts          ← Provider 接口定义
│   │       ├── generic.ts        ← 通用 Provider（支持多种认证/端点）
│   │       ├── openai.ts         ← OpenAI 函数式调用
│   │       └── index.ts          ← 统一导出
│   ├── hooks/
│   │   └── index.ts              ← useProvider 等 React Hooks
│   ├── contexts/
│   │   └── ThemeContext.tsx       ← 主题上下文（dark/light 切换）
│   ├── components/
│   │   ├── App.tsx               ← 主布局组件
│   │   ├── FlowCanvas.tsx        ← ReactFlow 画布（DnD、连线校验、动态端口）
│   │   ├── Toolbar.tsx           ← 顶部工具栏
│   │   ├── Sidebar.tsx           ← 左侧节点库
│   │   ├── PropertiesPanel.tsx   ← 右侧属性面板（参数编辑器）
│   │   ├── StatusBar.tsx         ← 底部状态栏
│   │   ├── SettingsModal.tsx     ← API 设置弹窗
│   │   └── nodes/
│   │       └── FlowNode.tsx      ← 自定义节点组件（所有节点共用，毛玻璃风格）
│   └── utils/
│       └── cn.ts                 ← clsx + tailwind-merge
│
└── backend/                      ← 后端源码
    ├── server.js                 ← Express 入口（动态导入各路由模块）
    ├── package.json
    ├── routes/
    │   ├── workflows.js          ← 工作流 CRUD API
    │   ├── execute.js            ← 工作流执行 API + SSE
    │   ├── settings.js           ← 设置管理（API 配置 + 模型列表 + 测试连接）
    │   └── storage.js            ← 文件上传/下载（multer）
    ├── engine/
    │   ├── executor.js           ← 执行引擎（拓扑排序 + 逐节点执行 + SSE 推送）
    │   ├── validator.js          ← 工作流校验（环检测 + AI 节点输出连接校验）
    │   ├── helpers/
    │   │   └── fileHelper.js     ← 文件 URL → base64 转换
    │   └── nodes/                ← 各节点的执行逻辑
    │       ├── textInput.js
    │       ├── imageInput.js
    │       ├── videoInput.js
    │       ├── audioInput.js
    │       ├── textMerge.js
    │       ├── imageMerge.js
    │       ├── videoMerge.js
    │       ├── audioMerge.js
    │       ├── universalMerge.js
    │       ├── aiChat.js         ← 支持多模态输入（图片/视频/音频 → base64）
    │       ├── imageGen.js       ← 支持专用接口(standalone)和对话接口(chat)
    │       ├── videoGen.js       ← 支持任务提交 + 轮询等待
    │       ├── webSearch.js      ← 调用 Tavily API
    │       └── output.js
    ├── middleware/
    │   ├── errorHandler.js
    │   └── sse.js
    └── storage/                  ← 运行时自动创建
        ├── workflows/            ← 工作流 JSON
        ├── outputs/              ← 生成的图片/视频
        ├── uploads/              ← 用户上传的文件
        └── settings.json         ← API 配置
```

---

## 三、已完成功能清单

### 批次 1：项目初始化 + 前后端目录搭建 ✅

- [x] 前端 React + Vite + TypeScript 项目初始化
- [x] 后端 Express 项目初始化（ESM 模块）
- [x] 安装所有依赖（前后端）
- [x] 一键启动脚本 `start.sh`
- [x] Vite 代理配置（`/api` → `localhost:3001`）

### 批次 2：@xyflow/react 集成 + 基础布局 ✅

- [x] ReactFlow v12 画布集成
- [x] 5 区布局（工具栏 + 节点库 + 画布 + 属性面板 + 状态栏）
- [x] 毛玻璃（glassmorphism）风格 UI
- [x] 深色/浅色主题切换
- [x] 节点从侧边栏拖拽/点击添加到画布
- [x] 画布交互：空格+左键平移，中键平移，滚轮缩放
- [x] MiniMap 小地图

### 批次 3：节点类型系统 + 自定义节点渲染 ✅

- [x] 完整的 TypeScript 类型系统（PortDef、ParamDef、NodeTypeDef）
- [x] NODE_REGISTRY 节点注册表（14 种节点）
- [x] 自定义节点组件 FlowNode（毛玻璃卡片风格）
- [x] NodeResizer 自由调整节点大小
- [x] 节点执行状态角标（⏳/✅/❌）
- [x] 节点尺寸调试工具（Store.showDebugSizes）
- [x] NODE_MIN_SIZES 精确测量值（每种节点专属）

### 批次 4：AI 对话节点 + 连线数据传递 ✅

- [x] 后端执行引擎（拓扑排序 + 逐节点执行）
- [x] SSE 实时进度推送
- [x] AI 对话节点执行器（支持 providerConfig）
- [x] 前端 API 客户端 + SSE 解析
- [x] Zustand Store 执行状态管理
- [x] 设置弹窗（API URL + Key + 测试连接 + 高级配置）
- [x] 动态模型列表（测试连接后自动获取并分类）
- [x] 模型下拉框动态填充（按 chat/image/video 分类）

### 批次 5：图像生成 + 视频生成 + 网页搜索 ✅

- [x] 图像生成执行器（standalone/chat 双模式）
- [x] 视频生成执行器（任务提交 + 轮询等待）
- [x] 网页搜索执行器（Tavily API）
- [x] 输出展示节点增强（文本/图片/视频/音频展示）
- [x] 文件上传系统（前端上传 → 后端保存 → URL 传递）
- [x] AI 对话节点多模态输入（图片/视频/音频 → base64）
- [x] Tavily API Key 配置

### 额外完成（不在原计划中）

- [x] 5 种合并节点（文本/图片/视频/音频/通用）+ 动态端口（1~9 个）
- [x] 文件输入节点（图片/视频/音频）+ 本地上传 + 预览
- [x] 严格连线类型校验（同类型才能连接，any 例外）
- [x] AI 节点输出端连接校验（未连接则无法执行）
- [x] Provider 体系集成（支持 bearer/api-key/custom 认证）
- [x] 图片/视频预览不撑宽节点（background-image 方案）
- [x] 预览跟随节点缩放
- [x] 系统提示词自动换行不撑宽节点
- [x] AI 能力节点不在卡片内显示执行结果（统一在输出展示节点显示）

---

## 四、14 种节点类型一览

### 输入组（4 个）

| 类型 | 标签 | 颜色 | 输出端口 | 功能 |
|------|------|------|---------|------|
| textInput | 📝 文本输入 | #007AFF | text(string) | 输入文本，可双击编辑 |
| imageInput | 🖼️ 图片输入 | #FF9500 | image(image) | 上传图片，节点内预览 |
| videoInput | 🎬 视频输入 | #AF52DE | video(video) | 上传视频，节点内预览 |
| audioInput | 🎵 音频输入 | #FF375F | audio(audio) | 上传音频，节点内播放 |

### 合并组（5 个，动态端口 1~9）

| 类型 | 标签 | 颜色 | 输入→输出 | 功能 |
|------|------|------|----------|------|
| textMerge | 🔀 文本合并 | #007AFF | string[] → string | 换行符拼接多段文本 |
| imageMerge | 🔀 图片合并 | #FF9500 | image[] → image[] | 合并多张图片为数组 |
| videoMerge | 🔀 视频合并 | #AF52DE | video[] → video[] | 合并多个视频为数组 |
| audioMerge | 🔀 音频合并 | #FF375F | audio[] → audio[] | 合并多个音频为数组 |
| universalMerge | 🔀 通用合并 | #64D2FF | any[] → any[] | 混合类型合并 |

### AI 能力组（4 个）

| 类型 | 标签 | 颜色 | 输入端口 | 输出端口 | 功能 |
|------|------|------|---------|---------|------|
| aiChat | 🤖 AI 对话 | #30D158 | prompt(string) + image/video/audio | response(string) | 调用对话模型，支持多模态 |
| imageGen | 🎨 图像生成 | #FF9500 | prompt(string) + reference(image) + video/audio | images(image[]) | 支持专用接口/对话接口双模式 |
| videoGen | 🎬 视频生成 | #AF52DE | prompt(string) + reference(image) + video/audio | video(video) | 任务提交+轮询等待 |
| webSearch | 🔍 网页搜索 | #5AC8FA | query(string) | results(string) | 调用 Tavily API |

### 输出组（1 个）

| 类型 | 标签 | 颜色 | 输入端口 | 功能 |
|------|------|------|---------|------|
| output | 👁️ 输出展示 | #8E8E93 | content(any) | 展示文本/图片/视频/音频 |

---

## 五、连线类型兼容矩阵

```
源 → 目标      string  image  image[]  video  audio  any
string           ✅      ❌      ❌       ❌      ❌     ✅
image            ❌      ✅      ✅       ❌      ❌     ✅
image[]          ❌      ✅      ✅       ❌      ❌     ✅
video            ❌      ❌      ❌       ✅      ❌     ✅
audio            ❌      ❌      ❌       ❌      ✅     ✅
any              ✅      ✅      ✅       ✅      ✅     ✅
```

规则：同类型才能连接，`image → image[]` 和 `image[] → image` 允许，`any` 接受所有类型。

---

## 六、后端 API 清单

### 工作流 CRUD

```
GET    /api/workflows              ← 列出所有工作流
GET    /api/workflows/:id          ← 获取单个工作流
POST   /api/workflows              ← 创建工作流
PUT    /api/workflows/:id          ← 更新工作流
DELETE /api/workflows/:id          ← 删除工作流
POST   /api/workflows/:id/duplicate ← 复制工作流
```

### 工作流执行

```
POST   /api/execute/:id            ← 开始执行（返回 SSE 流）
GET    /api/execute/:id/status     ← 查询执行状态
POST   /api/execute/:id/cancel     ← 取消执行
```

### SSE 事件类型

```
node_start       ← 节点开始执行
node_progress    ← 节点执行进度
node_complete    ← 节点执行完成（含输出数据）
node_error       ← 节点执行失败（含错误信息）
workflow_complete ← 工作流执行完成
workflow_error    ← 工作流执行失败
```

### 设置

```
GET    /api/settings               ← 获取设置（API Key 等）
PUT    /api/settings               ← 更新设置
POST   /api/settings/test-api      ← 测试 API 连接（同时获取模型列表）
GET    /api/settings/models         ← 获取已缓存的模型列表
```

### 文件

```
POST   /api/files/upload            ← 上传文件（multer，100MB 限制）
GET    /api/files/:filename         ← 获取上传的文件
GET    /api/outputs/:filename       ← 获取生成的图片/视频
```

---

## 七、关键设计决策 & 踩坑记录

> ⚠️ 这些是开发过程中遇到的坑，后续开发务必注意！

### 1. @xyflow/react v12 API 变化

- 不再是 `reactflow` 包名，是 `@xyflow/react`
- `useNodesState` / `useEdgesState` 已弃用，用 Zustand + `applyNodeChanges` / `applyEdgeChanges`
- `nodeTypes` 必须定义在组件外部（或用 `useMemo`），否则每次渲染都重新创建导致性能问题
- Handle 的 `isConnectable` prop 需要正确传递

### 2. 节点尺寸 & 调整大小

- **NodeResizer** 更新 `node.width` / `node.height`（内部数据），ReactFlow v12 会将其作为 CSS 应用到 wrapper
- 节点容器用 `minSize.w`（精确测量值）而非 `width: '100%'`，避免 `fit-content` 循环撑宽
- **图片预览用 `background-image`** 而不是 `<img>` 标签 — `<img>` 的固有宽度在 flex 布局中无法完全消除
- **视频预览用绝对定位** — 同理脱离文档流
- `NODE_MIN_SIZES` 的值是通过调试工具精确测量的，新增节点时需要重新测量

### 3. 画布交互

- 平移：空格+左键 或 中键拖拽
- 缩放：滚轮滚动
- 非空格状态下左键拖拽不会平移画布（避免与节点操作冲突）
- `panOnDrag` 动态切换：空格按下时 `[0, 1]`，未按下时 `[1]`（仅中键）

### 4. 端口定位

- Handle 使用 `position: absolute` + `top: 50%` + `transform: translateY(-50%)`
- **`position: relative` 必须在每个端口行（row）上**，不能在 section 上，否则多个 Handle 会堆叠
- 不能给 `.flow-node` 加 `overflow: hidden`（会裁掉端口圆点和调整手柄）

### 5. API 配置

- 测试连接时自动获取模型列表并分类（catModel 函数）
- 后端使用 `buildApiUrl()` 智能拼接 URL，自动去除重复的 `/v1`
- 支持 providerConfig（认证方式、自定义端点等）
- 图像生成默认使用 `standalone` 模式（`/images/generations`），不用流式

### 6. 文件上传流程

```
前端选择文件 → uploadFile() → POST /api/files/upload → multer 保存到 storage/uploads/
→ 返回 URL (/api/files/xxx.ext) → 节点间传递轻量 URL → AI API 调用时后端读文件转 base64
```

### 7. 执行校验

- 前端 + 后端双重校验：AI 能力节点的输出端必须连接到其他节点
- 未连接的 AI 节点标题栏显示 ⚠️ 警告
- 后端 `validator.js` 负责环检测 + 类型检查 + 输出连接检查

### 8. 后端模块加载

- `server.js` 使用动态 `await import()` 加载各路由模块，每个模块独立 try/catch
- 单个模块报错不会拖垮整个后端服务
- 启动时终端显示每个模块的加载状态 ✅/❌

---

## 八、待完成工作清单

### 🔴 高优先级（核心功能缺失）

| 编号 | 任务 | 说明 |
|------|------|------|
| H1 | **工作流保存/加载** | 目前每次刷新页面工作流丢失。需要：保存按钮 → 后端存储、页面加载时恢复上次工作流、工作流列表切换、新建/删除/重命名 |
| H2 | **工作流导入/导出** | JSON 文件导入导出，方便分享工作流 |
| H3 | **合并节点动态端口完善** | 5 种合并节点的动态端口（1~9）已实现前端逻辑，但后端执行器可能需要完善。需要实际测试连线和执行 |
| H4 | **文件输入节点实际测试** | 图片/视频/音频输入节点的上传 → 传递 → AI 识别完整链路需要实际测试 |
| H5 | **图像生成 standalone 模式测试** | 改为非流式后的实际生成效果需要验证 |

### 🟡 中优先级（体验优化）

| 编号 | 任务 | 说明 |
|------|------|------|
| M1 | **执行进度条** | 顶部工具栏显示 `[████░░░] 正在执行 3/6 节点...` 的进度条 |
| M2 | **执行中节点脉冲动画** | CSS `pulse-border` 动画已写好但需要验证是否生效 |
| M3 | **撤销/重做** | 工具栏按钮已占位但功能未实现 |
| M4 | **右键菜单** | 节点右键菜单（删除、复制、断开连线等） |
| M5 | **节点工具提示** | hover 显示节点说明 |
| M6 | **设置页面完善** | 多 API 配置管理、Provider 配置持久化完善 |
| M7 | **输出展示节点跟随缩放** | 图片/视频预览需确认跟随节点缩放是否正常工作 |
| M8 | **视频生成完整测试** | 需要支持视频的 API（如 Sora、CogVideoX）才能测试 |

### 🟢 低优先级（锦上添花）

| 编号 | 任务 | 说明 |
|------|------|------|
| L1 | **节点分组** | 将多个节点编组，折叠/展开 |
| L2 | **条件判断节点** | IF/ELSE 分支逻辑 |
| L3 | **循环节点** | 循环执行子工作流 |
| L4 | **定时执行** | 后端定时触发工作流 |
| L5 | **工作流模板市场** | 预置常用工作流模板 |
| L6 | **MiniMap 优化** | 当前有基础 MiniMap，可优化样式和交互 |
| L7 | **手机/平板适配** | 触摸操作优化、侧边栏折叠为底部抽屉 |

---

## 九、已知 Bug & 待验证项

| 编号 | 描述 | 状态 |
|------|------|------|
| B1 | 端口 `PORT_COMPATIBILITY` 中 `string → image/video/audio` 目前为 ❌，但 `aiChat` 的 `prompt` 端口类型是 `string`，而 `imageGen` 的 `prompt` 端口也是 `string`，两者之间 string→string 连接没问题。但如果用户想用 string 直接连到 image 类型的端口则不行——这是设计意图还是限制？需要确认 | 待讨论 |
| B2 | `inputMerge`（旧合并节点）的后端执行器 `backend/engine/nodes/inputMerge.js` 仍存在，应清理 | 待清理 |
| B3 | 合并节点的 `NODE_MIN_SIZES` 值（218×120）可能不准确（没有实测过动态端口展开后的尺寸） | 待测量 |
| B4 | `start.bat` Windows 批处理脚本有编码问题无法使用，目前只能用 `start.sh`（需要 Git Bash） | 已知问题 |

---

## 十、重要文件说明

### 前端核心文件

| 文件 | 行数 | 重要程度 | 说明 |
|------|------|---------|------|
| `src/components/nodes/FlowNode.tsx` | ~1040 | ⭐⭐⭐ | 所有 14 种节点的渲染逻辑，最复杂的组件。包含端口渲染、内容渲染、调整大小、调试标签、执行状态等 |
| `src/lib/store.ts` | ~520 | ⭐⭐⭐ | 全局状态管理。节点/连线 CRUD、执行状态、模型列表、异步操作 |
| `src/lib/constants.ts` | ~320 | ⭐⭐⭐ | NODE_REGISTRY（14 种节点定义）、PORT_COMPATIBILITY（连线兼容矩阵） |
| `src/components/FlowCanvas.tsx` | ~350 | ⭐⭐⭐ | ReactFlow 画布封装。DnD 添加节点、连线校验、动态端口逻辑、空格键平移 |
| `src/lib/types.ts` | ~134 | ⭐⭐⭐ | 核心类型定义 |
| `src/components/PropertiesPanel.tsx` | ~400 | ⭐⭐ | 属性面板。参数编辑器（6 种控件类型）、端口连接状态 |
| `src/components/SettingsModal.tsx` | ~350 | ⭐⭐ | API 设置弹窗。API Key、URL、Tavily Key、高级配置、测试连接 |
| `src/lib/api.ts` | ~200 | ⭐⭐ | API 客户端。工作流 CRUD、SSE 执行、设置、文件上传 |

### 后端核心文件

| 文件 | 重要程度 | 说明 |
|------|---------|------|
| `backend/engine/executor.js` | ⭐⭐⭐ | 执行引擎核心。拓扑排序 + 逐节点执行 + SSE 推送 |
| `backend/engine/nodes/aiChat.js` | ⭐⭐⭐ | AI 对话执行器。支持多模态输入、providerConfig |
| `backend/engine/nodes/imageGen.js` | ⭐⭐⭐ | 图像生成执行器。standalone/chat 双模式 |
| `backend/routes/execute.js` | ⭐⭐⭐ | 执行 API + SSE 流 |
| `backend/routes/settings.js` | ⭐⭐ | 设置管理。buildApiUrl 智能拼接、buildAuthHeaders 多认证 |
| `backend/server.js` | ⭐⭐ | Express 入口。动态导入路由、自动创建目录 |

---

## 十一、新增节点类型的步骤

如果后续需要新增节点类型，请按以下步骤操作：

### 1. 前端

```
a. src/lib/constants.ts
   - 在 NODE_REGISTRY 中添加节点定义
   - 在 PORT_COMPATIBILITY 中添加新类型的连线规则（如果是新端口类型）
   - 更新 NODE_CATEGORIES（如果是新分类）

b. src/components/nodes/FlowNode.tsx
   - 在 NODE_ICONS 中添加图标映射
   - 在 NODE_MIN_SIZES 中添加占位值（如 { w: 220, h: 120 }）
   - 如果有特殊内容渲染，在 NodeContent switch 中添加 case
   - 确保文件输入节点的图片/视频预览用 background-image 方案

c. src/components/FlowCanvas.tsx
   - 在 nodeTypes 中注册新类型
   - 在 MINIMAP_COLOR_MAP 中添加颜色
   - 如果是合并节点（动态端口），在 onConnect/onEdgesChange 中处理

d. src/components/PropertiesPanel.tsx
   - 如果需要特殊的参数编辑器，在 ParamEditor 中添加逻辑

e. 测量精确的 NODE_MIN_SIZES
   - 在浏览器控制台执行：useWorkflowStore.setState({ showDebugSizes: true })
   - 拖出新节点，记录右上角显示的宽×高
   - 填入 NODE_MIN_SIZES
   - 执行：useWorkflowStore.setState({ showDebugSizes: false })
```

### 2. 后端

```
a. backend/engine/nodes/
   - 创建 xxx.js 执行器，导出 async function execute(node, inputs, apiConfig)

b. backend/engine/executor.js
   - import 新执行器
   - 在 NODE_EXECUTORS 中注册

c. backend/engine/validator.js（如需要）
   - 添加特定校验逻辑
```

---

## 十二、环境依赖

### 前端依赖

```json
{
  "@xyflow/react": "^12.10.2",
  "clsx": "2.1.1",
  "concurrently": "^9.2.1",
  "lucide-react": "^1.8.0",
  "react": "19.2.3",
  "react-dom": "19.2.3",
  "react-markdown": "^10.1.0",
  "tailwind-merge": "3.4.0",
  "zustand": "^5.0.12"
}
```

### 后端依赖

```json
{
  "express": "^4.21.0",
  "cors": "^2.8.5",
  "multer": "^1.4.5-lts.1",
  "uuid": "^10.0.0"
}
```

### 系统要求

- Node.js >= 18
- npm >= 8
- Git Bash（Windows 用户，用于 start.sh）
