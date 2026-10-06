# 架构文档：划词翻译流程

> 本文档集中描述 content 端"划词 → 点击翻译 → 流式覆盖原文"的完整链路，以及它
> 与 background / 共享协议的关系。用于新人快速建立全局认知，避免在多个文件间来回
> 跳转。**协议部分的改动约定请以 AGENTS.md 的"最容易踩的坑"为准。**

## 1. 一句话概览

用户在网页上划词，content 端把**选中的每个文本节点当作一段**、每段后跟带序号的
`{{segN}}` 分隔标记（含最后一段，N 为绝对段序号）、不译内容（未选中部分 / pre/code）
用 `{{var}}` 占位符替代，拼成一段协议文本经长连接端口发给 background，background
流式调用 LLM 后逐 chunk 回传，content 端再按 `{{segN}}` 的序号逐段「删除占位符」把
译文写回对应的锚点 span，实现原地流式替换。若模型发生拆/并段错位，还能**精确定位
错位段并从该段起重译（断点重试）**，而不是全文重译。

## 2. 完整调用链（流程图）

> 交互式流程图：打开 [docs/diagrams/translation-flow.html](docs/diagrams/translation-flow.html)
> （archify 生成，支持主题切换/缩放/聚焦，含断点重试分支、协议要点与模块分工卡片）
>
> 图源：`docs/diagrams/translation-flow.json`（archify 规格，schema v2）。改动后按
> archify skill 的流程重新生成：先
> `node <archify>/bin/archify.mjs validate workflow docs/diagrams/translation-flow.json --quality showcase`，
> 通过后再 `deliver workflow` 同名参数输出到 `docs/diagrams/translation-flow.html`
> （9/9 showcase 检查），勿手改 HTML。

**回传方向**：`CHUNK` 逐 chunk 沿端口回到 `streamTranslate.ts` 的 `messageHandler`，
再触发 `onChunk` → `TranslationSession` 持有的 `SegmentStreamParser` 逐段写回。

## 3. 文件职责表

| 文件 | 职责 | 一句话 |
|---|---|---|
| `app/content/index.ts` | content 入口、事件编排、活跃会话持有 | 事件转发 + start/abort 两个动作，点击后流程的阅读入口 |
| `app/content/TranslationSession.ts` | 一次会话的编排 | 协议文本拼接、流式解析写回、错位重试、收尾/放弃都在这；端口客户端由入口注入（纯逻辑可单测） |
| `app/content/InlineTranslator.ts` | 段锚点建立 + 按段写回 | 编排"收集 → 计划 → 锚点"，对外只给段数/协议行与 writeSegment/restoreSegment/finish/destroy |
| `app/content/segmentPlan.ts` | 段计划纯逻辑 | 协议行怎么拼（哪里插 `{{var}}`，与 DOM 解耦，有单测） |
| `app/content/domAnchor.ts` | DOM 锚点层 | 选区遍历、锚点包裹与恢复（只做 DOM，不做决策） |
| `app/content/FloatingButton.ts` | 浮动按钮的 DOM/样式/点击回传 | 纯 UI，无业务逻辑 |
| `app/utils/streamTranslate.ts` | 端口客户端（content 端使用） | 统一管理端口生命周期，回调给消费方 |
| `app/utils/protocol.ts` | 段分隔/占位符/流式解析 | **标记形态的唯一来源**，content 构造、解析、正则与 prompt 说明都由它派生 |
| `app/background/index.ts` | background 入口、端口监听 | 收到连接转发给 PortListener |
| `app/background/PortListener.ts` | 端口级生命周期 | 重复 START 打断、断开中止 |
| `app/background/prompt.ts` | 模型侧协议契约 | system prompt（规则 + 成功/失败示例），标记由 protocol.ts 派生 |
| `app/background/StreamTranslator.ts` | 读配置、流式调 LLM、回传 chunk | 只做传输（提示词已独立成模块） |
| `app/types/messages.ts` | 端口消息类型 | 消息契约（START/CHUNK/DONE/ERROR） |

## 4. 四阶段详解

### 阶段一：划词 → 显示浮动按钮
- `content/index.ts`：`handleMouseUp` → `getSelectedText()` 读选区文本。
- 有文字 → `showButton(x, y)` + `onClick(() => startTranslation(range))`。
- 按钮 DOM 全在 `FloatingButton.ts`（每次点击都 `show()` 重建，`onClick` 注册点击回调）。

### 阶段二：点击按钮 → 建立段目标
- `index.ts` 的 `startTranslation(range)`：先打断旧会话，再 `createInlineTranslator(range)`。
- `InlineTranslator.buildSegments(range)` 分三步：
  - `domAnchor.collectTextNodes(range)`：`TreeWalker` 遍历选区，收集相交文本节点及其选中范围与所属 preserve 块。**只收集、不改 DOM**——TreeWalker 是 live 的，先改会让遍历位置漂移；
  - `segmentPlan.planSegments(inputs)`：纯逻辑产出**段计划**（协议行）。preserve 块整块折叠为一段（同一块内后续节点跳过），普通节点 before/after 各换成一个 `{{var}}`（为空则省略）；协议行内的连续换行折叠为空格，而 `originalText` 保留原始换行（回滚要逐字恢复）；
  - 回到 DOM 层建立锚点：普通节点包 `<span class="llm-selected">`（只包选中部分），preserve 块包整个最外层元素。协议行直接存在段目标里（不再用平行数组靠下标对应）。
- `translator.getRows()` 给会话：协议文本由会话用 `joinSegmentRows(rows, 0)` 拼出，每段后跟 `{{segN}}`。

### 阶段三：发出 LLM 请求（端口通信）
- `TranslationSession.runStream(text)` 内调用注入的 `transport`（入口传的是 `streamTranslate`）：
  `{ text, pageMeta, onChunk/onDone/onError/onDisconnect }`。
- `streamTranslate.ts`：`browser.runtime.connect("stream-translate")`，post `START`，监听 `CHUNK/DONE/ERROR`，统一管理端口生命周期（清理/disconnect 兜底）。
- `background/index.ts` → `PortListener.ts`：收到 `START` 先打断同端口上一会话，再 `startStreamTranslation`；端口断开时 `abort()` 中止在途请求。
- `StreamTranslator.ts`：读 storage 配置 → `prompt.buildSystemPrompt`（注入网页元数据 + 段对齐规则）→ `@nickyzj2023/ai` 的 `stream`（内部即 fetcher + parseSSE）流式请求，`AbortSignal` 经 options 传入、打断时立即硬中止，逐 chunk `postMessage(CHUNK)`。

### 阶段四：流式写回原文 + 断点重试

> 协议解析与对齐状态都在 `TranslationSession`（一次会话的事）；`InlineTranslator`
> 只剩「按段写/恢复」的纯 DOM 方法，会话单向往下调，不再互相注入回调。

- background 逐 chunk 发 `CHUNK` → `streamTranslate.ts` → `onChunk` → 会话持有的 `SegmentStreamParser.push`：
  - `push` 累积 buffer，按 `{{segN}}` 拆段，对每个完整段回调 `onSegment(segment, segmentNumber)`；
  - **序号对齐检测**：第 `cursor` 个输出段应结束于 `{{seg(cursor+1)}}`，序号不符说明模型在之前发生了拆/并段错位 → 立即 `handleMisalign(cursor)` 触发断点重试；
  - 序号正确 → **删除占位符后** `translator.writeSegment(cursor, 译文)` 写回对应 span 锚点（preserve 段保持原文）。
- 收到 `DONE` → 会话 flush 缓冲、段数兜底（模型输出段数 < 期望段数即视为末尾吞段，从 `cursor` 起续译）；对齐则 `translator.finish()` unwrap 锚点恢复 DOM（译文直接替换原文，无样式标记）。
- `ERROR` / 异常断开 → `translator.destroy()`：**回滚原文**、移除锚点与样式。

**断点重试（错位恢复）**：全收在 `TranslationSession.handleMisalign(fromSegment)` 里：
- 达到 `MAX_ATTEMPTS`（默认 5）则回滚原文放弃；否则 `abort` 旧流；
- 逐段 `translator.restoreSegment(i)` 把错位段及之后的锚点恢复成原文（前半段已写回的译文保留不动），再把 `cursor` 挪回错位段、重建解析器；
- 用 `joinSegmentRows(rows.slice(fromSegment), fromSegment)` 按**绝对序号**拼出"从错位段起的协议子文本"重新发起。
- 为什么能精确定位错位段：`{{segN}}` 序号是**每段都有的地标**，长文多段纯文本之间即使没有 `{{var}}` 占位符，也能靠序号判断"从哪一段开始错位"，从而只重译后半段、节省 token 并随错位段前进而收敛。

## 5. 协议与共享边界

> **标记形态的唯一来源是 `app/utils/protocol.ts`**：`MARKER_PREFIX`/`MARKER_SUFFIX`
> 与 `SEGMENT_MARKER`/`PLACEHOLDER_MARKER` 常量派生出拼接函数、`{{var}}` 字面、
> 三个正则与 prompt 示例。改标记形态只需动那几行——正则也是拼出来的，不用手改。

| 协议 | 定义处 | 说明 |
|---|---|---|
| 标记常量 `SEGMENT_MARKER` / `PLACEHOLDER_MARKER` | `utils/protocol.ts` | 标记名与前后缀的唯一来源，拼接函数、正则与 prompt 说明都由它派生 |
| `segmentSeparator(n)` → `{{segN}}` | `utils/protocol.ts` | 段分隔标记，N 为绝对段序号（1 起），每段含最后一段都带——对齐检测与断点重试的地标 |
| `PLACEHOLDER_TOKEN` → `{{var}}` | `utils/protocol.ts` | 不译内容占位，固定形态不带编号；模型照抄，写回时整类删除 |
| `joinSegmentRows(rows, startIndex)` | `utils/protocol.ts` | 按绝对序号拼接协议行（初始 startIndex=0；断点重试 startIndex=fromSegment） |
| 未完成前缀剥离 | `utils/protocol.ts` | `stripIncompleteSegmentPrefix`（模块内）剥离流式中未完成的标记前缀（如 `{{seg`/`{{s`/`{{va`/`{{var`） |
| `SegmentStreamParser` | `utils/protocol.ts` | 段流解析器（`{{segN}}` 拆分 / 空段对齐 / 前缀剥离），`onSegment` 回调带序号 |
| `extractTranslatedContent` | `utils/protocol.ts` | 删除占位符得到纯译文 |
| 段计划拼行规则 | `content/segmentPlan.ts` | 每行哪里插 `{{var}}`（preserve 整块一个 / before / after 为空则省略），有单测钉住 |
| 端口消息协议 | `types/messages.ts` | START/CHUNK/DONE/ERROR，content + background 两端一致 |
| 端口名 `stream-translate` | `types/messages.ts` | 两端一致 |

> ⚠️ 模型侧契约在 `background/prompt.ts`（提示词文案与示例），它引用 protocol.ts 的
> 标记常量。改动分段构造（`segmentPlan.ts`）、写回与对齐（`InlineTranslator.ts` /
> `TranslationSession.ts`）或标记形态时，必须确认 prompt 侧仍在描述同一个协议
> （详见 AGENTS.md"最容易踩的坑"）。

## 6. 阅读建议（给新人）

想理解"点击翻译按钮后发生了什么"，按这个顺序读：

1. `content/index.ts` —— 看交互入口、事件转发与活跃会话的持有；
2. **`content/TranslationSession.ts`** —— 看一次会话的编排与断点重试；
3. **`InlineTranslator.ts`** —— 看段锚点如何建立、译文如何按段写回 DOM；协议行看 `segmentPlan.ts`、DOM 操作看 `domAnchor.ts`；
4. `utils/protocol.ts` + `types/messages.ts` —— 看协议常量与消息契约；
5. `background/prompt.ts` + `background/StreamTranslator.ts` —— 看模型侧契约与 LLM 调用。
