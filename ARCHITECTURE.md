# 架构文档：划词翻译流程

> 按"概览 → 阅读建议 → 阶段详解"三层编排：先看整体在干什么，再决定去读哪些文件，
> 最后按需查每一步的细节。**协议部分的改动约定以 AGENTS.md 的"最容易踩的坑"为准**，
> 本文档只讲代码怎么串起来。

## 1. 概览

一次划词翻译的完整链路：

用户在网页上划词 → content 端弹出浮动按钮 → 点击后把**选区内的每个文本节点当作
一段**提取出来，每段后跟带序号的 `{{segN}}` 分隔标记（N 为绝对段序号，最后一段也
带），不译内容（未选中部分 / pre/code）换成固定占位符 `{{var}}`，拼成一段协议文本
经长连接端口发给 background → background 读配置、拼 system prompt、流式调用 LLM 并
逐 chunk 回传 → content 端按 `{{segN}}` 序号逐段删除占位符、把译文写回对应锚点，
实现原地流式替换。

项目只有三个入口：content（页面脚本，`app/content/index.ts`）、background
（`app/background/index.ts`）、options（设置页，`app/options/index.tsx`）——上面这条
链路只涉及前两个。

两个关键设计值得先记住：

- **段序号是地标**：`{{segN}}` 的 N 严格等于段下标 + 1，content 端靠它判断模型有没有
  拆段/并段；一旦错位，只重译"错位段之后"的后半段（断点重试），而不是全文重译。
- **占位符只占位**：`{{var}}` 只是告诉模型"这里有不译内容"，写回时整类删掉；未选中
  部分由 DOM 原文兜底，模型不用（也不该）翻译它们。

## 2. 阅读建议

想搞清"点击翻译按钮后发生了什么"，按这个顺序读，一次只读一层：

1. `app/content/index.ts` —— 交互入口：事件转发 + 当前会话的持有；
2. `app/content/TranslationSession.ts` —— **一次会话的编排**：发请求、按序号写回、
   错位重试、收尾/放弃都在这里，是整条流程的主干；
3. `app/content/InlineTranslator.ts` —— 段锚点怎么建、译文怎么按段写回 DOM；它下面
   的两层按需看：`segmentPlan.ts`（协议行怎么拼）、`domAnchor.ts`（选区遍历与锚点包裹）；
4. `app/utils/protocol.ts` + `app/types/messages.ts` —— 协议标记与端口消息契约；
5. `app/background/prompt.ts` + `app/background/StreamTranslator.ts` —— 模型侧契约与
   LLM 调用。

## 3. 阶段详解

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

- background 逐 chunk 发 `CHUNK` → `streamTranslate.ts` 的 `messageHandler` → `onChunk` → 会话持有的 `SegmentStreamParser.push`：
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
