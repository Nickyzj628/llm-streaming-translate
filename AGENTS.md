# AGENTS.md — LLM Streaming Translator

> **优先级**：先读 `.agents/skills/` 里的 Addfox 官方技能（addfox-best-practices / addfox-debugging / addfox-testing），再读本文档，最后参考 [addfox 文档](https://addfox.dev)。

## 项目概览

基于 **SolidJS + Addfox** 的 MV3 划词翻译扩展，支持 Chrome 和 Firefox。包管理器为 **pnpm**。**无测试框架/测试脚本**。

## 开发命令

| 命令 | 作用 | 备注 |
|---|---|---|
| `pnpm dev` | 启动 dev server（`addfox dev --no-open --cache`） | 不自动打开浏览器 |
| `pnpm typecheck` | `tsc --noEmit` | TS6 strict，唯一的类型检查方式 |
| `pnpm lint` / `pnpm lint:fix` | Biome 检查 `app/` | |
| `pnpm format` / `pnpm format:check` | Biome 格式化 `app/` | |
| `pnpm build` | 同时构建 firefox + chrome | 产物在 `.addfox/extension/` |
| `pnpm zip:source` | 打包源码 zip | **依赖本机安装 7z** |

提交前验证顺序：`pnpm lint` → `pnpm typecheck` → `pnpm build`。

## 架构要点

### 翻译流程（选词 → 流式原地替换）
1. `app/content/index.ts`：监听选区，弹出浮动按钮（`FloatingButton.ts`，Shadow DOM 注入）。
2. 点击后 `createInlineTranslator(range, shadowRoot)`（`app/content/InlineTranslator.ts`）提取选区内的文本节点，用 `‖`（U+2016）连接各段文本，经**长连接端口 `stream-translate`** 发给 background。
3. `app/background/StreamTranslator.ts` 用 `@nickyzj2023/utils` 的 `chatCompletions`（**不是** OpenAI 官方 SDK）流式请求，把 `CHUNK` / `REASONING` / `USAGE` / `DONE` / `ERROR` 经端口回传。
4. 内容脚本按 `‖` 拆分流式 chunk，逐段写回对应 DOM 文本节点，并切换 `llm-translating` / `llm-translated` CSS class。

### 最容易踩的坑
- **`‖`（U+2016）分段对齐协议**：`StreamTranslator.ts` 的系统提示要求模型输出含与输入**完全相同数量**的分隔符。改 prompt 或 `InlineTranslator.ts` 的分段逻辑必须两端同步，否则译文错位。
- **消息协议**：端口消息类型定义在 `app/types/messages.ts`（START/CHUNK/REASONING/USAGE/DONE/ERROR），改动需同步 background 与 content 两侧。
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