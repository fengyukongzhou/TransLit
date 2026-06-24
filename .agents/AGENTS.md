# TransLit 项目背景与架构分析

本项目是一个纯前端实现的 EPUB 电子书 AI 翻译与术语优化工具。

## 核心技术架构

### 1. 核心流程与主要组件
- **解析 EPUB (`services/epubService.ts`)**: 
  - 使用 `jszip` 解压 EPUB，提取并解析 `content.opf` 以及 XHTML 章节内容。
  - 使用 `turndown` 将 HTML 转换成 Markdown，方便 AI 进行翻译和文本处理。
- **持久化方案 (`services/persistenceService.ts`)**:
  - 使用浏览器的 `IndexedDB` 存储会话状态、章节提取内容、解析出的图片、生成的日志以及术语库（Glossary）。
  - 这保证了即使页面刷新或网络中断，翻译进度和已生成的术语也不会丢失，能随时断点续传。
- **AI 翻译服务 (`services/geminiService.ts`)**:
  - 包装了 AI 服务，支持按约 3000 字（可调）将 Markdown 进行智能拆包翻译。
  - 支持单Pass翻译或双Pass翻译与润色（结合 `enableProofreading` 配置项）。
  - 内置了智能术语库抽取与过滤（Smart Glossary Cleanup），根据后续章节的内容动态筛选和保留在未来文本中出现频次高、AI 优化过的术语，避免术语库冗余。
- **UI 部分 (`App.tsx` / `components/`)**:
  - `FileUpload.tsx`: 用于拖拽上传 EPUB 文件，触发自动解析并写入 IndexedDB。
  - `SettingsPanel.tsx`: 允许用户配置 API Key、Base URL、翻译语言、额外上下文等。
  - 主页面 `App.tsx` 整合所有状态并控制章节列表预览、日志输出和术语库管理。

## 部署与定位
- 本项目被定位为支持独立部署、纯前端 **BYOK (Bring Your Own Key)** 模式运行的 Web 翻译工具。
- 所有 AI 接口调用均在浏览器端直连发送，无需单独中转的后端服务。
