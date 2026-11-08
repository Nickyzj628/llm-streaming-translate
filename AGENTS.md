# AGENTS.md

> 本文是**给写代码的 agent 的约束清单**，不是教程。人类向的流程说明在 `ARCHITECTURE.md`。
> 读序：`.agents/skills/`（addfox-best-practices → addfox-debugging → addfox-testing）→ 本文件 → `ARCHITECTURE.md`（只在要改流程时）→ https://addfox.dev

## 栈 / 命令 / 门禁

栈：SolidJS + Addfox，MV3，Chrome + Firefox，pnpm，Rstest，Biome，TS7 strict。

| 命令 | 语义 |
|---|---|
| `pnpm dev` | `addfox dev --no-open --cache`，不自动开浏览器 |
| `pnpm typecheck` | `tsc --noEmit`，**唯一**类型检查 |
| `pnpm test` | `rstest run`，测试在 `__tests__/` |
| `pnpm lint` / `lint:fix` | Biome check（范围见 `biome.json` includes：`app/`、配置、`__tests__/`） |
| `pnpm format` / `format:check` | Biome format（同范围） |
| `pnpm build` | firefox + chrome，产物 `.addfox/extension/` |
| `pnpm zip:source` | 需本机 7z |

**提交门禁（顺序执行，全绿才算完成）**：`pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`。

## 入口 / 文件地图

入口仅 3 个（addfox 自动发现目录，新增/改名须保持结构）：`app/background/index.ts`、`app/content/index.ts`、`app/options/index.tsx`。无 popup/sidepanel。

| 路径 | 职责 | 改它连带 |
|---|---|---|
| `content/index.ts` | 事件、按钮、持有 `activeSession`、历史/toast 接线 | 会话 options 变化时同步 |
| `content/selectionFilter.ts` + `utils/textFilter.ts` | 同步预筛（纯 URL / 纯数字符号 / 整块 `pre`/`code` → 不弹） | 判据须与 `domAnchor` 一致 |
| `content/selectionLanguage.ts` + `utils/language.ts` | CLD 语言判定 vs `targetLang` | — |
| `content/FloatingButton.ts` | Shadow DOM 按钮 | `setParent(shadowRoot)` |
| `content/domAnchor.ts` | TreeWalker 收集、包/拆锚点、preserve 判定 | 不改 DOM 的时机 |
| `content/segmentPlan.ts` | 段计划纯逻辑（协议行、换行策略） | 有单测 |
| `content/InlineTranslator.ts` | 建锚点 + `writeSegment/restoreSegment/finish/destroy/getResultRows` | 不碰协议解析 |
| `content/TranslationSession.ts` | 会话主干：发请求、对齐、重试、收尾 | 有单测；状态全在闭包 |
| `content/pageContext.ts` | 页级历史 + `pageMeta`（标题变化即整份上下文重置） | 单例，模块级状态 |
| `content/toast.ts` | toast 纯 DOM 渲染（进 Shadow DOM） | 禁引 Solid/CSS module |
| `background/prompt.ts` | system prompt（模型侧协议契约 + 两条固定规则） | 与 protocol 文案一致 |
| `background/StreamTranslator.ts` | messages 组装 + `stream()` + AbortController | START 字段变化时同步 |
| `background/PortListener.ts` | 端口生命周期、重复 START 打断、断开 abort | — |
| `utils/protocol.ts` | **协议唯一定义**：标记形态、拼接、解析、正则 | 改形态只动这里 |
| `utils/streamTranslate.ts` | 端口客户端，透传 history/retry | 与 `types/messages.ts` 同步 |
| `utils/retryReminder.ts` | 重试诊断文案（`<system-reminder>`） | 禁止写 `{{segN}}` 字面 |
| `utils/toast.ts` | toast 状态单例（纯 TS，options+content 共用） | options hook 只是薄封装 |
| `types/messages.ts` | 端口消息契约 | 两端同步 |
| `types/storage.ts` + `utils/storage.ts` | 配置 schema / 读写 | — |

`.addfox/llms.txt`、`.addfox/meta.md` 自动生成，禁手改。`addfox.config.ts` 的 `browserPath` 机器相关。

## 协议规格（硬约束）

- 形态：段分隔 `{{segN}}`、不译内容占位 `{{var}}`。唯一定义 `utils/protocol.ts`；content 构造/解析/正则与 prompt 说明全部由它的常量派生。
- 每**文本节点** = 一段；preserve 块（`pre`/`code` **最外层元素**）= 一段。段数 = 段目标数。
- 段号 N = 下标 + 1，**绝对序号**；重试子文本沿用绝对号，不重置。
- 未选中部分 / preserve 块 → `{{var}}`（固定形态、无编号）；写回时**删掉**，preserve 段一个字符都不写。
- 段间只用 `{{segN}}`，**不用换行**：段内允许模型自由换行。但容器 `white-space` ∈ {pre, pre-wrap, pre-line, break-spaces} 时协议行保留原始换行（否则推文类内容被压成一段）；其他容器连续换行折叠为空格。
- `originalText` 恒存原始换行（回滚逐字恢复）。
- prompt：输出段数 == 输入段数、段号只来自输入、不许因段内换行补号；含成功/失败示例。改协议必须同步 prompt，否则译文错位。

## 请求 / 上下文规格（前缀稳定性是硬性目标）

- messages：`[system] [...history] [user text]`；重试时在末条 user 前插 `[user previousInput][assistant previousOutput][user reminder]`。
- `pageMeta`：首次翻译时快照；**每次开新会话先比一次归一化标题**（`readPageMeta`），标题变了就当换页 → 清历史 + 重读元数据（system 跟着换）。比较基准与写进 prompt 的标题必须是同一份 `readDocumentMeta()` 返回值，禁止另算一份（trim/截断口径不一致会让长标题永远"变化"）。只比 `title`，`description` 单独变不重置。禁止监听 DOM mutation / 路由来重置：SPA 常常每 tick 重设同一个标题，按事件清会把上下文清成筛子。
- 会话内**不重取** `pageMeta` 与 `history`：两者在 `startTranslationSession` 开头各取一次（顺序是 pageMeta 在前，它可能清空历史），整场会话含重试都用同一份，否则重试会换 system、前缀稳定性直接破。
- history：append-only；只在**请求失败**时清空（`onFailed` → `clearHistory`+`showToast`）。禁止加条数/字符预算、禁止按 URL/路由清（换页只认标题变化这一条信号，见上）。`abort()`（只在页面卸载时发生）不清历史、不提示；新的一次翻译请求不 abort 当前会话，而是排队等它收尾。
- 成功一次追加一对：`user = joinSegmentRows(rows,0)`，`assistant = joinSegmentRows(getResultRows(),0)`（重拼，非原始流）。失败分支不入历史。
- prompt 里关于「历史编号与本次无关」「`<system-reminder>` 非待译内容」的两条规则**无条件存在**（条件化会让首次/重试 system 不同 → 前缀失效）。
- `StreamTranslator` 用 `@nickyzj2023/ai` 的 `stream(model, messages, [], { signal, body })`（内部 fetcher + parseSSE，**不是** openai SDK）；`options.body` 平铺进 `/chat/completions`。错误已被 `extractErrorMessage` 归一（fetcher 丢弃 HTTP 状态码，只留 `statusText || body`）。

## 会话状态机（`TranslationSession`）

- 对齐判定：`segmentNumber < cursor+1` → 丢弃（模型重述已译部分）；`==` → 写回、`cursor+1`；`>` → `handleMisalign`。
- 溢出：`cursor >= totalSegments` 仍有段号 → 按空行拼回最后一段，不重试。
- `DONE`：`parser.flush()`；`aligned < attemptExpected` → 视为末尾吞段续译；否则 `finish()`（unwrap + 写历史）。
- 失败三路（`onError` / `onDisconnect` / `MAX_ATTEMPTS=5` 耗尽）统一 `fail()`：`destroy()` → `onFailed(msg)` → `end()`。
- 重试：恢复 `fromSegment..` 锚点原文（保留已译前半段）、`cursor` 回退、重建 parser、子文本用绝对号、带 `retry`；`streamSeq` 让旧流的 chunk/DONE/ERROR 全部作废；`fromSegment >= totalSegments` 直接收尾（禁发空请求）。
- 每轮流维护 `aligned` / `attemptExpected`；`lastInput` / `lastRawOutput` 在 `runStream` 重置，取 retry 参数必须在调用前。

## 存储 / 权限 / 设置页

- `browser.storage.local`，schema `baseUrl/model/apiKey/body/targetLang`；`body` 是任意 JSON，须合法，会被合并进请求体。
- `targetLang` = 逗号分隔 i18n 代码（`zh, zh-CN, zh-Hans`）；options 保存时用配置的模型标准化（`options/utils/normalizeLang.ts`），失败则原样存。
- 模型列表：`GET {baseUrl}/models`，头 `Authorization: Bearer <apiKey>`。
- manifest 权限仅 `activeTab` + `storage`；LLM 端点走 `optional_host_permissions`（http/https）。新增域名沿用该模式。

## 编码约定

- Biome：tab、**CRLF**、双引号、分号、尾逗号、80 列。写完跑 `pnpm format`。
- 别名 `@/*` → `app/*`（tsconfig + addfox.config.ts 已配）。
- 注释中文，只写"为什么"（非常规做法/踩坑原因）；不复述代码。
- 组件样式 `Component.module.css`。
- commit：中文 + conventional 前缀（feat/fix/chore/docs）。

## 禁忌（踩过的坑）

- 禁把段间分隔写成换行（只用 `{{segN}}`）；禁手写 `{{segN}}`/`{{var}}` 字面（只从 `protocol.ts` 派生）。
- 禁在 content bundle 引 Solid 组件 / CSS module（toast 走 `utils/toast.ts` + 纯 DOM）。
- 禁用 `defineShadowContentUI` 或自定义元素挂 UI（Firefox 内容脚本与页面共享 `customElements`，升级后的宿主原型链会触发 Xray 报错；用普通 `div` + `attachShadow`）。
- 禁在 content 里 monkey-patch `history.pushState` 做路由检测（隔离世界拦不到页面调用）。
- 禁给 `range`/锚点做「先改 DOM 再遍历」：TreeWalker 是 live 的，先收集后改。
- 禁把 `prompt.ts` 的两条规则改成条件注入；禁让 `messages` 以 assistant 结尾；reminder 用 `role: "user"`（不插中间 system）。
- 禁在 `mouseup`/`mousedown`/`selectionchange` 里调 `abortCurrent()`：任意点击都会触发 mouseup，等于"点一下回滚整场翻译"。
- 禁并行会话：锚点、页级历史、toast 都是单例，并行会互踩（重叠选区时后建的锚点会被先建的 `textContent` 写回整块删掉）。点按钮只走 `requestTranslation`：空闲即开跑，忙则排队（latest-wins 只留一单），由 `onEnded` → `startQueuedTranslation` 接力；建新锚点前 DOM 里必须没有别人的锚点。
- 排队的 Range 睡过等待期，开跑前必须验 `isConnected` + 非 collapsed + `range.toString()` 与排队时的文本一致，对不上就丢弃并提示重划（禁替用户翻变了样的文本）。
- 锚点（`span.llm-selected`）必须带 `user-select: none`：锚点里的文本会被 `textContent` 整体替换、被打断时整块回滚，选区落在里面活不过一次写入。靠 CSS 让"翻译中的文本暂时选不中"，就省掉了在 `mouseup` 里判"选区压在不在旧会话上"这类状态判断（踩过：靠 JS 判，跨锚点选区仍会带进半死的节点）。


## 测试覆盖（改什么就跑什么）

`__tests__/`：`protocol.test.ts`（标记/解析）、`segmentPlan.test.ts`（段计划/换行）、`textFilter.test.ts`（预筛）、`translationSession.test.ts`（对齐/宽容丢弃/重试/失败/历史交接）、`retryReminder.test.ts`（诊断文案）、`pageContext.test.ts`（冻结/累积）、`language.test.ts`、`normalizeLang.test.ts`。

改 `protocol` / `segmentPlan` / `TranslationSession` / `InlineTranslator.getResultRows` / `retryReminder` / `pageContext` 必须同步补测；`InlineTranslatorController` 新增方法会让测试里的 fake 编译失败（预期行为）。
