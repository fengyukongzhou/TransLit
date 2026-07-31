# TransLit 📖

[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg?style=flat-square&logo=vite)](https://vite.dev/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB.svg?style=flat-square&logo=react)](https://react.dev/)
[![CSS](https://img.shields.io/badge/CSS-Vanilla-blue.svg?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![License](https://img.shields.io/badge/License-MIT-black.svg?style=flat-square)](LICENSE)

* [中文版](#中文说明) | [English Version](#english-description)

---

# 中文说明

**TransLit** 是一款完全基于纯前端实现的、**专门用于将 EPUB 电子书翻译成中文的 AI 翻译与术语优化工具**。它支持直接在浏览器中解析、翻译、校对和重新打包 EPUB 电子书，支持 BYOK (Bring Your Own Key) 直连模式，全程无需任何中转后端服务，100% 保护您的书籍隐私。

应用界面采用了独树一帜的 **Swiss Monochrome (极致黑白 e-ink 极简风)** 设计语言，旨在为文学翻译创作者提供专注、沉浸、纯粹的交互体验。

## ✍️ 博客与设计思想

关于 TransLit 的开发思考与 AI 翻译演进记录，欢迎阅读作者的相关博客：
- 📑 [TransLit：AI 翻译电子书之我见](https://joffoo.pages.dev/2026/05/02/translit-ai-translation-ebook/)
- 📑 [TransLit：AI 翻译，多人一步](https://joffoo.pages.dev/2026/05/10/translit-evolution-two-step/)

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
  - **双 Pass 润色**：除常规单 Pass 翻译外，支持开启 “Proofreading (校对与润色)” 双阶段流式处理。结合您输入的额外翻译上下文，产出信达雅的中文译文。
- 🗂️ **智能术语库与强一致性 (Smart Glossary & Strict Consistency)**
  - 自动抽取、记录章节中的生僻词与虚构专有实体。
  - **强一致性铁律**：从系统底层施加了最严苛的一致性对齐指令，彻底解决大模型在长文翻译中的“人名/术语漂移”问题。
  - 支持结合后文语境自动清理、动态过滤只出现一次的“跑龙套”术语，保证术语库的极致紧凑。

## 📖 电子书脚注预处理 (AI Agent 工作流)

如果您的 EPUB 书籍含有非常复杂的脚注（例如跨文件链接、非标准跳转或特殊排版），建议在翻译前使用配套的 AI Agent 技能进行一键洗排。
- **Agent 预处理技能仓库**：[translit-epub-prep](https://github.com/fengyukongzhou/translit-epub-prep)
- **洗排原理**：该技能指导 AI Agent 将跨文件的复杂脚注自动抽取并挂载到对应正文段落下方，重构为符合标准的 EPUB3 同页脚注格式。TransLit 会自动将其转换为原生 Markdown 脚注进行翻译，翻译后将完美保留双向跳转链接。

## 🎨 设计美学：Swiss Monochrome

项目整体界面致敬了经典的瑞士现代主义排版与 e-ink 电子墨水屏美学：
- **极致留白与黑白对比**：使用粗体无衬线等宽字体（Geist Mono）与清晰的网格线条。
- **纯粹的二进制交互**：抛弃了任何色彩发光、软阴影与圆角。所有输入框、开关按钮、标签和控制台均由黑白两色高对比度直接呈现。
- **无感无边框 Logo**：左上角使用从 `logo.png` 自动提取并高精度裁剪的黑白软盘剪影 SVG 矢量 Logo，与页面自然融合。

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

# English Description

**TransLit** is a fully client-side **EPUB AI translation and glossary optimization tool, dedicated to translating books into Chinese**. It supports parsing, translating, proofreading, and packaging EPUB e-books directly inside the browser. By adopting the BYOK (Bring Your Own Key) model, it communicates directly with AI APIs without any intermediate back-end servers, ensuring 100% privacy for your books.

The user interface implements a unique **Swiss Monochrome (e-ink minimalist style)** design language, providing literary translators with a focused, immersive, and pure interactive workspace.

## ✍️ Blogs & Design Philosophy

For the author's thoughts on TransLit's development and the evolution of AI translation, check out the following blog posts (in Chinese):
- 📑 [TransLit: My Take on AI Translation of E-books](https://joffoo.pages.dev/2026/05/02/translit-ai-translation-ebook/)
- 📑 [TransLit: AI Translation, One Step Ahead](https://joffoo.pages.dev/2026/05/10/translit-evolution-two-step/)

## ✨ Key Features

- 🔌 **BYOK (Bring Your Own Key) Mode**
  - No server-side setup required; API calls are sent directly from the browser.
  - User settings (API Key, Base URL, etc.) are cached in the browser's `localStorage` in real-time. Resetting the translation progress **will not clear** your personal API keys.
- 📖 **EPUB Parsing & Re-packaging**
  - Unzips and parses EPUB using the `jszip` library to extract XHTML chapters and metadata.
  - Converts XHTML to Markdown using `turndown` before sending it to LLMs, ensuring formatting (bold, links, lists, notes) is fully preserved in the translated Chinese output.
- 💾 **Robust Persistence (Resumable Progress)**
  - Stores session states, chapter extractions, images, logs, and generated glossary terms in the browser's `IndexedDB`.
  - Resumes translation progress seamlessly even after network disconnections, browser crashes, or page reloads.
- 🤖 **Smart Two-Pass Translation & Proofreading**
  - **Chunk Splitter**: Automatically splits chapters into chunks of ~3000 words.
  - **Two-Pass Polish**: Supports an optional "Proofreading" stage following the initial translation pass. Combines user-specified context to deliver natural, polished Chinese translations.
- 🗂️ **Smart Glossary & Strict Consistency**
  - Automatically extracts and logs rare words and fictional proper nouns during translation.
  - **Strict Alignment Rule**: Applies strict consistency rules at the system prompt level to completely eliminate the "term drift" issue (e.g., inconsistent character names) commonly seen in LLM long-context translation.
  - Evaluates terms against future text, dynamically filtering out redundant glossary records to keep the database clean and efficient.

## 📖 EPUB Footnote Preprocessing (AI Agent Workflow)

If your EPUB book contains highly complex footnotes (e.g., cross-file links, non-standard redirects, or irregular typesetting), we recommend preprocessing it using our dedicated AI Agent Skill before translating.
- **Agent Preprocessing Repository**: [translit-epub-prep](https://github.com/fengyukongzhou/translit-epub-prep)
- **How it works**: The Skill instructs the AI Agent to automatically extract cross-file footnotes and append them to the bottom of the referring chapters, restructuring them into standard EPUB3 same-page footnotes. TransLit then automatically converts these into standard Markdown footnotes during translation, maintaining perfect bidirectional jumps.

## 🎨 Design Philosophy: Swiss Monochrome

The interface pays tribute to Swiss typography and e-ink aesthetics:
- **High Contrast Grid Layout**: Uses bold monospace typography (Geist Mono) and sharp border lines.
- **Pure Binary Interaction**: Rejects glows, soft shadows, and rounded borders (`rounded-none`). All inputs, switches, badges, and consoles are rendered in pure black and white.
- **Borderless Logo**: Incorporates a vectorized, borderless floppy disk SVG logo (automatically processed from `logo.png` to crop empty space), blending seamlessly into the header.

## 🛠️ Local Setup Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended) installed locally.

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables (Optional)
You can create a `.env.local` file in the root directory to auto-fill your default API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```
*Note: Keys entered in the Web UI have higher priority and are stored in LocalStorage.*

### 3. Run Development Server
```bash
npm run dev
```
Open the local URL (default: `http://localhost:3000`) shown in your terminal.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
