# AGENTS.md — LLM Streaming Translator

> **优先级**：先读 `.agents/skills/` 里的 Addfox 官方技能（addfox-best-practices / addfox-debugging / addfox-testing），再读本文档，最后参考 [addfox 文档](https://addfox.dev)。

## 项目概览

基于 **SolidJS + Addfox** 的 MV3 划词翻译扩展，支持 Chrome 和 Firefox。包管理器为 **pnpm**。单测用 **Rstest**（`pnpm test`，目前覆盖段对齐协议）。

## 开发命令

| 命令 | 作用 | 备注 |
|---|---|---|
| `pnpm dev` | 启动 dev server（`addfox dev --no-open --cache`） | 不自动打开浏览器 |
| `pnpm typecheck` | `tsc --noEmit` | TS7 strict，唯一的类型检查方式 |
| `pnpm test` | `rstest run` | 单测在 `__tests__/`，覆盖 `app/utils/protocol.ts` 的段对齐协议 |
| `pnpm lint` / `pnpm lint:fix` | Biome 检查（`biome.json` 的 includes 决定范围：app/、配置与测试） | |
| `pnpm format` / `pnpm format:check` | Biome 格式化（范围同上） | |
| `pnpm build` | 同时构建 firefox + chrome | 产物在 `.addfox/extension/` |
| `pnpm zip:source` | 打包源码 zip | **依赖本机安装 7z** |

提交前验证顺序：`pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`。

## 架构要点

> 完整调用链、文件职责表与协议说明见 **`ARCHITECTURE.md`**（新人阅读入口，避免多文件跳转）。

### 翻译流程（选词 → 流式原地替换）
1. `app/content/index.ts`：监听选区，弹出浮动按钮（`FloatingButton.ts`，Shadow DOM 注入）。
2. 点击后 `createInlineTranslator(range)`（`app/content/InlineTranslator.ts`，内部三步：`domAnchor` 收集 → `segmentPlan` 定编号 → 建锚点）提取选区内的文本节点，**每个文本节点一段，段间用 `{{segN}}` 分隔**构造协议文本（不译内容用 `{{varN}}` 占位符，见下方坑位说明），经**长连接端口 `stream-translate`** 发给 background。
3. `app/background/prompt.ts` 提供 system prompt（模型侧协议契约），`app/background/StreamTranslator.ts` 用 `@nickyzj2023/ai` 的 `stream`（内部就是 fetcher + parseSSE，**不是** OpenAI 官方 SDK）流式请求，把 `CHUNK` / `DONE` / `ERROR` 经端口回传；持有 `AbortController`，端口断开（content 打断/页面卸载）时立即中止请求，避免为已放弃的会话继续消耗 token。
4. 内容脚本按 `{{segN}}` 分隔拆分流式 chunk，逐段写回对应锚点（**删除占位符后写译文**，preserve 段保持原文）。译文直接替换原文，**无任何高亮/样式标记**。

### 最容易踩的坑
- **`{{varN}}` 占位符 + `{{segN}}` 段对齐协议**：content 端每个文本节点 = 一段（段数 = 节点数；分段决策在 `segmentPlan.ts`、DOM 操作在 `domAnchor.ts`），段间用 `{{segN}}` 分隔（**不用换行**——段内允许模型自由换行而不破坏段数对齐）；`pre/code` 等 preserve 块以**最外层 preserve 元素为粒度整体折叠成一段**（整块只占一个占位符，块内几十个文本节点不会刷屏 prompt），未选中部分与 preserve 块统一替换为 `{{varN}}` 占位符，模型只需**原样照抄占位符**、翻译其余部分，无需理解任何标签结构（降低本地小模型负担）。`background/prompt.ts` 的 system prompt 要求模型输出**段数与输入完全相同**、段间用 `{{segN}}` 分隔（prompt 含成功+失败示例，见 `buildSystemPrompt`）。写回时**删除占位符**得到纯译文写入选中锚点，未选中部分由 DOM 原文兜底；preserve 段写回原文、不依赖模型。语境信息来自网页元数据：content 端读取 `document.title` + meta description 随 START 消息的 `pageMeta` 字段发送，background 注入 system prompt 帮助模型理解页面主题（pageMeta 缺失时不注入）。标记形态（`{{segN}}` / `{{varN}}`）的唯一定义在 `app/utils/protocol.ts`：content 构造、流式解析与 prompt 说明全部由它的标记常量派生，改形态只动那一处（与字面字符强耦合的拆段/截断前缀正则需一并手改）。改分段构造（`segmentPlan.ts`）、写回（`InlineTranslator.ts`）或提示词（`prompt.ts`）后必须确认模型侧仍描述同一协议，否则译文错位；协议与段计划的纯逻辑有 `pnpm test`（`__tests__/`）钉住。
- **消息协议**：端口消息类型定义在 `app/types/messages.ts`（START/CHUNK/DONE/ERROR），改动需同步 background 与 content 两侧。
- **设置存储**：`browser.storage.local`，schema 在 `app/types/storage.ts`（baseUrl/model/apiKey/body/targetLang）。`body` 是任意 JSON，会被合并进 `/chat/completions` 请求体，修改时需保证 JSON 合法。
- **模型列表**：选项页从 `{baseUrl}/models` 拉取，请求头 `Authorization: Bearer <apiKey>`。
- **manifest 权限**：只有 `activeTab` + `storage`，通过 `optional_host_permissions`（http/https）访问 LLM 端点；新增 API 域名时沿用该模式。

## 编码约定

- **Biome**：tab 缩进、**CRLF** 行尾、双引号、分号、尾逗号、80 列宽。提交前跑 `pnpm format`。
- **别名**：`@/*` → `app/*`（tsconfig 与 addfox.config.ts 均已配置）。
- **注释**：跟随现有代码风格，用中文注释解释"为什么"。
- **commit message**：中文 + conventional 前缀（feat/fix/chore/docs），见 git log。
- **样式**：组件用 `Component.module.css`（如 `Button.module.css`）。

## 目录与入口

- 入口仅三个：`app/background/index.ts`、`app/content/index.ts`、`app/options/index.tsx`（无 popup/sidepanel）。addfox 自动发现入口目录，新增/重命名入口目录需保证结构一致。
- `.addfox/llms.txt`、`.addfox/meta.md` 为 addfox 自动生成（勿手改），可用来查入口映射与构建产物。
- `addfox.config.ts` 的 `browserPath` 指向本机浏览器路径（Chromium / LibreWolf），是机器相关的，换机器需调整。