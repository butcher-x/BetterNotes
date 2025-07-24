# BetterNotes for Obsidian

BetterNotes is a powerful, all-in-one note-taking plugin for Obsidian that supercharges your workflow for learning, research, and knowledge management. It seamlessly integrates annotation, organization, spaced repetition, and AI-powered assistance into a single, cohesive system.

From annotating PDFs and videos to transforming your notes into reviewable flashcards with an advanced FSRS algorithm, BetterNotes provides a complete toolkit to turn your raw information into lasting knowledge.

## Features

### 1. Unified Annotation System
Capture information from anywhere without breaking your flow.
- **Markdown Annotation**: Simply select text in any Markdown file to instantly create a note entry.
- **PDF Annotation**: Highlight text or capture specific rectangular areas (like diagrams or images) in your PDFs. Each annotation is linked back to its precise location in the document.
- **Video Annotation**: Load local video files, import subtitles (e.g., `.srt`), and create timestamped annotations. Click on an entry to jump directly to the corresponding moment in the video.

### 2. Powerful Organization with Entries & Collections
All annotations are captured as **Entries**—atomic, reusable pieces of knowledge.
- **Rich Metadata**: Enhance each entry with tags, colors, notes, and even file attachments.
- **Collections**: Group related entries into **Collections** for structured organization. Think of them as smart folders or topic-specific notebooks.
- **Knowledge Graph**: Link entries together to build a network of your ideas, creating a personal knowledge graph that goes beyond simple backlinks.

### 3. Integrated Spaced Repetition (FSRS)
Master what you learn with a state-of-the-art spaced repetition system.
- **FSRS Algorithm**: Utilizes the advanced FSRS (Free Spaced Repetition Scheduler) algorithm for optimal review scheduling.
- **Review Plans**: Create custom review plans based on your collections.
- **Card-Style Review**: A dedicated review interface helps you efficiently go through your due cards (entries).
- **Customizable**: Advanced users can fine-tune the 17 FSRS weights to match their personal learning style.

### 4. AI-Powered Assistant & RAG
Leverage the power of AI to augment your thinking and research.
- **AI Chat**: An integrated chat view that connects to external AI services like OpenAI (GPT models) or local instances of Ollama.
- **Retrieval-Augmented Generation (RAG)**: Create a vector index of your entire vault or specific collections. This allows the AI to answer questions using the context of your own notes, providing highly relevant and personalized responses.

### 5. Robust Data Management
Your knowledge is safe and portable.
- **Backup & Restore**: Perform manual or automatic (hourly) backups of all your BetterNotes data (`data.json`). Easily restore from a backup file if needed.
- **Data Portability**: Your data is stored locally in a structured format.

### 6. Seamless Obsidian Integration
- **Dedicated Views**: Includes a main sidebar view for browsing collections, an AI Chat view, and a custom video player view.
- **Commands & Hotkeys**: Speed up your workflow with commands for opening views, toggling settings, and indexing your notes.
- **Customizable Link Formats**: Define your own templates for how links to annotations in PDFs, Markdown files, and videos are generated.

## Getting Started

1.  **Installation**: Install the plugin from the Obsidian Community Plugins browser (once it's published) or manually from the releases page.
2.  **Open the Sidebar**: Click the "BetterNotes" ribbon icon (a sparkles icon ✨) or use the command `BetterNotes: Open Sidebar` to launch the main view.
3.  **Create a Collection**: In the sidebar, create your first collection. This will be the destination for your annotations.
4.  **Start Annotating**:
    - **Markdown**: Open a `.md` file, select some text, and an annotation modal will pop up. Fill in the details and save.
    - **PDF**: Open a PDF file. Select text to highlight or use the rectangle selection tool.
    - **Video**: Use the command `BetterNotes: Open Local Video`, pick a file, and use the subtitle interface to create entries.
5.  **Review**: Once you have entries, create a Review Plan, and start your review session from the sidebar.
6.  **(Optional) Configure AI**: Go to the BetterNotes settings to configure your AI provider (API key, endpoint, etc.) to enable the AI Chat and RAG features.

---

# BetterNotes for Obsidian (中文介绍)

BetterNotes 是一款功能强大、一体化的 Obsidian 笔记插件，旨在为您的学习、研究和知识管理工作流提供全方位的支持。它将**标注、组织、间隔重复记忆和 AI 辅助**无缝整合到一个统一、连贯的系统中。

无论是在 PDF 和视频上做标注，还是利用先进的 FSRS 算法将您的笔记转化为可复习的知识卡片，BetterNotes 都提供了一套完整的工具集，帮助您将原始信息转化为持久的知识。

## 核心功能

### 1. 统一的标注系统
在不打断心流的情况下，从任何来源捕获信息。
- **Markdown 标注**: 在任意 Markdown 文件中选中文本，即可立即创建一条笔记条目。
- **PDF 标注**: 在 PDF 中高亮文本，或截取特定的矩形区域（如图表、公式或图片）。每条标注都精确链接回其在文档中的原始位置。
- **视频标注**: 加载本地视频文件，导入字幕（如 `.srt` 文件），并创建带时间戳的标注。点击条目即可直接跳转到视频中的相应时刻。

### 2. 强大的条目与集合组织能力
所有标注都被捕获为 **条目（Entries）**——原子化的、可复用的知识单元。
- **富文本元数据**: 为每条条目添加标签、颜色、注释甚至文件附件，丰富其内涵。
- **集合（Collections）**: 将相关的条目归入不同的**集合**中，进行结构化管理。您可以将其视为智能文件夹或专题笔记本。
- **知识网络**: 将条目互相链接，构建您自己的知识网络，其深度和广度远超简单的双向链接。

### 3. 集成的间隔重复系统 (FSRS)
借助顶尖的间隔重复算法，真正掌握您所学的知识。
- **FSRS 算法**: 采用先进的 FSRS (Free Spaced Repetition Scheduler) 算法，为您提供最优的复习计划。
- **复习计划**: 基于您的集合创建自定义的复习计划。
- **卡片式复习**: 在专用的复习视图中，您可以高效地回顾到期的卡片（条目）。
- **高度可定制**: 高级用户可以微调 FSRS 的 17 个权重参数，以匹配个人独特的记忆曲线。

### 4. AI 驱动的智能助手与 RAG
利用人工智能的力量，增强您的思考与研究能力。
- **AI 聊天**: 集成了一个聊天视图，可连接到外部 AI 服务（如 OpenAI 的 GPT 模型）或本地运行的 Ollama 实例。
- **检索增强生成 (RAG)**: 为您的整个 Obsidian 库或特定集合创建向量索引。这使得 AI 能够基于您自己的笔记内容来回答问题，提供高度相关和个性化的响应。

### 5. 稳健的数据管理
确保您的知识安全、可移植。
- **备份与恢复**: 可随时手动或自动（每小时）备份您所有的 BetterNotes 数据 (`data.json`)。在需要时，可以轻松地从备份文件中恢复。
- **数据可移植性**: 您的所有数据都以结构化格式存储在本地。

### 6. 无缝的 Obsidian 集成
- **专用视图**: 包含一个用于浏览集合的主侧边栏视图、一个 AI 聊天视图和一个自定义的视频播放器视图。
- **命令与热键**: 通过丰富的命令（如打开视图、切换设置、索引笔记等）和自定义热键，加速您的工作流程。
- **自定义链接格式**: 您可以为 PDF、Markdown 和视频的标注链接自定义生成模板。

## 快速上手

1.  **安装**: （当插件发布后）从 Obsidian 社区插件市场安装，或从发布页面手动安装。
2.  **打开侧边栏**: 点击功能区（Ribbon）的 “BetterNotes” 图标（闪烁的星星 ✨），或使用命令 `BetterNotes: Open Sidebar` 来启动主视图。
3.  **创建集合**: 在侧边栏中，创建您的第一个集合。它将作为您所有标注的归宿。
4.  **开始标注**:
    - **Markdown**: 打开一个 `.md` 文件，选中文本，标注窗口将自动弹出。填写详情并保存。
    - **PDF**: 打开一个 PDF 文件。选择文本以高亮，或使用矩形选择工具截图。
    - **视频**: 使用命令 `BetterNotes: Open Local Video` 选择一个视频文件，然后通过字幕界面创建条目。
5.  **复习**: 当您积累了一些条目后，创建一个复习计划，并从侧边栏开始您的复习。
6.  **(可选) 配置 AI**: 前往 BetterNotes 的设置页面，配置您的 AI 服务提供商（API 密钥、接口地址等），以启用 AI 聊天和 RAG 功能。
