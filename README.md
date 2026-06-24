# TransLit 📖

[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg?style=flat-square&logo=vite)](https://vite.dev/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB.svg?style=flat-square&logo=react)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/CSS-Vanilla-blue.svg?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![License](https://img.shields.io/badge/License-MIT-black.svg?style=flat-square)](LICENSE)

**TransLit** 是一款完全基于纯前端实现的 **EPUB 电子书 AI 翻译与术语优化工具**。它支持直接在浏览器中解析、翻译、校对和重新打包 EPUB 电子书，支持 BYOK (Bring Your Own Key) 直连模式，全程无需任何中转后端服务，100% 保护您的书籍隐私。

应用界面采用了独树一帜的 **Swiss Monochrome (极致黑白 e-ink 极简风)** 设计语言，旨在为文学翻译创作者提供专注、沉浸、纯粹的交互体验。

---

## ✨ 核心特性

- 🔌 **BYOK (Bring Your Own Key) 模式**
  - 无需搭建中转服务器，API 接口由浏览器直连调用。
  - 用户的 API Key、Base URL 等配置会实时安全缓存到浏览器的 `localStorage` 中。在点击 “Reset” 重置书籍和日志进度时，个人的 API 密钥等配置**极不会被清理**，免去反复填写的烦恼。
- 📖 **EPUB 自动解析与重新打包**
  - 基于 `jszip` 库解压并解析 EPUB，提取 `content.opf` 以及 XHTML 章节内容。
  - 使用 `turndown` 库将 XHTML 精准转换为 Markdown 格式投喂给大模型，保证格式、加粗、排版及注释等在翻译后完美保留。
- 💾 **强力持久化 (断点续传)**
  - 基于浏览器 `IndexedDB` 存储当前的会话状态、所有章节解析内容、图片资产、运行中的日志，以及已生成的术语表。
  - 即使网络意外中断、电脑死机或页面误刷新，也能随时断点恢复，继续之前的翻译进度。
- 🤖 **智能双 Pass 翻译与校对**
  - **分包处理**：自动按约 3000 字（大小可灵活调节）进行智能拆包。
  - **双 Pass 润色**：除常规单 Pass 翻译外，支持开启 “Proofreading (校对与润色)” 双阶段流式处理。结合您输入的额外翻译上下文，产出信达雅的译文。
- 🗂️ **智能术语库与自动清理 (Smart Glossary Cleanup)**
  - 自动抽取、记录章节中的生僻词与专有名词。
  - 支持按需翻译，同时结合上下文对未来文本进行词频和重要度匹配，动态过滤冗余术语，保证术语库的紧凑与精准。

---

## 🎨 设计美学：Swiss Monochrome

项目整体界面致敬了经典的瑞士现代主义排版与 e-ink 电子墨水屏美学：
- **极致留白与黑白对比**：使用粗体无衬线等宽字体（Geist Mono）与清晰的网格线条。
- **纯粹的二进制交互**：抛弃了任何色彩发光、软阴影与圆角。所有输入框、开关按钮、标签和控制台均由黑白两色高对比度直接呈现。
- **无感无边框 Logo**：左上角使用精细裁剪的黑白软盘剪影 SVG 矢量 Logo，与页面自然融合。

---

## 🛠️ 本地运行指南

### 前提条件
- 本地需要安装 [Node.js](https://nodejs.org/) (推荐 v18+)

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量 (可选)
您可以在项目根目录中复制或创建 `.env.local` 文件来预填您的默认 API Key：
```env
GEMINI_API_KEY=您的Gemini密钥
```
*注：在 UI 界面中输入的 Key 优先级最高，且会自动记录至 LocalStorage。*

### 3. 运行开发服务器
```bash
npm run dev
```
启动后在浏览器打开终端提示的地址（默认 `http://localhost:3000`）即可。

### 🚀 Windows 专属一键启动
双击项目根目录下的 `启动翻译应用TransLit.bat`（或桌面上的快捷方式），会自动为您配置 Node 环境并直接拉起服务、打开浏览器进入翻译界面。

---

## 📦 项目架构简析

```
TransLit/
├── components/
│   ├── FileUpload.tsx      # 电子书拖拽上传组件 (极致黑白大卡片)
│   └── SettingsPanel.tsx   # 平铺式 API 与翻译策略配置面板
├── services/
│   ├── epubService.ts      # 负责 EPUB 解压、Markdown 转换与重新封包
│   ├── geminiService.ts    # 包装大模型 API 调用，处理分包、翻译与校对流程
│   └── persistenceService.ts # IndexedDB 持久化读写服务
├── App.tsx                 # 主程序框架，控制核心状态流转与双面板布局
├── index.html              # HTML 骨架，配置全局 Geist Mono 字体与滚动条样式
├── logo.svg                # 经自动高精度裁剪的扁平化软盘矢量 Logo
└── package.json            # 项目依赖声明
```

---

## 📜 许可证

本项目遵循 [MIT License](LICENSE) 许可协议。
