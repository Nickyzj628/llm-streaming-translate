# Plan 001: 译文从浮窗改为逐字原地替换原文 DOM 节点

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2f00065..HEAD -- app/content/index.ts app/content/TranslatePopup.ts app/content/FloatingButton.ts app/background/StreamTranslator.ts app/types/messages.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction (feature rewrite)
- **Planned at**: commit `2f00065`, 2026-06-21

## Why this matters

当前译文通过一个固定定位的浮窗（popover）显示在选中文字附近，与页面内容脱节。用户视线在原文和译文间切换，阅读割裂。本次重写将译文直接写入原文所在的 DOM 文本节点中，流式逐字替换 —— 原文"变成"译文。

与第一版方案不同：不采用按字符数比例分配译文（那只能近似、无法精确对齐），而是让 LLM 感知 DOM 分段结构，输出时自带分段标记，由内容脚本解析后精确写回每个文本节点。翻译完成后译文保留在页面中，无恢复原文的动作 —— 刷新页面即可还原。

核心价值：去掉 TranslatePopup 浮窗，改用 LLM 感知的逐节点精确替换。

## Current state

项目是基于 SolidJS + Addfox 的浏览器扩展，核心文件：

- `app/content/index.ts` — 内容脚本入口，选区监听 → 浮动按钮 → 启动翻译 → 浮窗展示
- `app/content/FloatingButton.ts` — 浮动按钮（`show/hide/onClick/setParent/isButtonElement`）
- `app/content/TranslatePopup.ts` — 译文 popover 浮窗，创建/定位/流式追文/关闭
- `app/background/index.ts` — Service Worker，端口监听，转发翻译请求
- `app/background/StreamTranslator.ts` — 流式 LLM 翻译，构造 prompt 调用 `chatCompletions`
- `app/types/messages.ts` — 端口消息类型定义

### 内容脚本核心流程 (`app/content/index.ts:61-104`)

```ts
function startTranslate(text: string): void {
  // ...
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const targetRect = range.getBoundingClientRect();
  selection.removeAllRanges();            // ← 立即清除选区，丢失 DOM 位置

  currentPopup = createTranslatePopup();
  currentPopup.show(targetRect);          // ← 译文在独立浮窗中渲染

  const port = browser.runtime.connect({ name: "stream-translate" });
  // CHUNK → popup.appendChunk(chunk)     ← 译文写入浮窗 DOM，不触及原文
  // DONE → finish()
}
```

### 背景翻译 prompt (`app/background/StreamTranslator.ts:48-56`)

```ts
{
  role: "system",
  content: `You are a concise translation model.\nTask:\n- Translate the user's text into ${targetLang}.\n- Think briefly before translating.\n- Never copy the source text unless it is a proper noun.\n- Do not explain.\n- Do not summarize.\n- Output translation only.`,
},
```

用户消息就是选中文本的纯字符串，没有 DOM 结构信息。

### 选区跨多节点的场景

选中 `<p>Hello <b>world</b> today</p>` → 三个文本节点：`"Hello "`、`"world"`、`" today"`。当前 `selection.toString()` 得到 `"Hello world today"`，LLM 只看到这一个扁平字符串。

### 项目代码约定

- 纯 TypeScript（无 JSX），内容脚本用 DOM API 创建/操作元素
- 缩进 tab，双引号，分号必选，尾逗号必选（`biome.json`）
- 事件监听使用 `requestAnimationFrame` 延迟（`index.ts:38`）
- 元素通过 ID 查找、`currentParent`（ShadowRoot）挂载（`TranslatePopup.ts` 模式）
- 工厂函数模式：`createXxx()` 返回 controller 对象（`createTranslatePopup` 为范本）
- 背景-内容通过 `browser.runtime.Port` 通信，消息类型定义在 `app/types/messages.ts`

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Lint      | `pnpm lint`              | exit 0              |
| Build     | `pnpm build`             | exit 0, outputs in `.addfox/` |

## Scope

**In scope** (the only files you should modify):
- `app/content/index.ts` — 重写 `startTranslate`，移除浮窗，接入分段替换
- `app/content/InlineTranslator.ts` — **新建**，分段解析与 DOM 写入模块
- `app/content/TranslatePopup.ts` — **删除**
- `app/background/StreamTranslator.ts` — 修改 system prompt，教 LLM 理解 `‖` 分隔符
- `app/types/messages.ts` — `StreamTranslateStart` 新增 `segments` 字段（可选，用于内容→背景传递分段信息）

**Out of scope** (do NOT touch):
- `app/background/index.ts` — 端口路由逻辑不变
- `app/options/` — 设置页面不变
- `app/components/`、`app/styles/` — UI 层不变
- `app/content/FloatingButton.ts` — 浮动按钮行为不变（仅调用方变）
- `addfox.config.ts`、`tsconfig.json`、`biome.json` — 构建/格式化配置不变
- 不引入新的 npm 依赖

## Design: LLM 分段对齐方案

### 分隔符选择

使用 `‖`（U+2016 DOUBLE VERTICAL LINE）作为文本节点间的分隔符。理由：
- 在自然语言文本中几乎不会出现（它是排版/数学符号）
- 单字符、易于在流式输出中解析
- Unicode 基本多文种平面，LLM tokenizer 将其视为单独 token

### 内容脚本侧处理

1. 从 Range 遍历所有文本节点，收集每个节点的文本内容 → `segments: string[]`
2. 将各段用 `‖` 拼接发送给 LLM：`"Hello ‖world‖ today"`
3. 流式接收 CHUNK，累积到缓冲区，按 `‖` 切分
4. 完整段 → 写入对应索引的文本节点；未完成的最后一段 → 写入当前节点
5. DONE 时 flush 缓冲区，剩余内容写入最后一个节点

### 流式分段解析器设计

```ts
// 伪代码，具体实现在 InlineTranslator.ts 中
class SegmentBuffer {
  private buf = "";
  private nodeIndex = 0;

  feed(chunk: string): void {
    this.buf += chunk;
    const parts = this.buf.split("‖");
    // parts[0..N-2] 是完整段，写入对应节点
    for (let i = 0; i < parts.length - 1; i++) {
      writeToNode(this.nodeIndex, parts[i]);
      this.nodeIndex++;
    }
    // 最后一部分是未完成段，写入当前节点
    this.buf = parts[parts.length - 1] ?? "";
    writeToNode(this.nodeIndex, this.buf);
  }

  flush(): void {
    // DONE 时 buf 中剩余内容即为最后一个完整段
    writeToNode(this.nodeIndex, this.buf);
    this.buf = "";
  }
}
```

**边缘情况**：
- LLM 输出的 `‖` 数量少于文本节点数 → 所有剩余节点置空（极端情况）
- LLM 输出的 `‖` 数量多于文本节点数 → 多余的段拼接到最后一个节点
- 连续 `‖`（空段）→ 对应文本节点置空字符串（正常）

### 背景 prompt 设计

重写 `StreamTranslator.ts` 中的 system prompt，让 LLM 理解并遵守分段协议：

```
You are a concise translation model.

Task:
- Translate the user's text into {targetLang}.
- The user's input contains text segments separated by the "‖" character.
  Each segment is an independent piece of text that must be translated
  separately.
- Your output MUST contain exactly the same number of "‖" separators in
  the exact same order. Translate each segment and join them with "‖".
- The "‖" character itself is a structural delimiter — do NOT translate or
  modify it. Reproduce it verbatim between segments.
- If a segment is empty, output an empty segment (consecutive "‖").
- Think briefly before translating.
- Do not explain or summarize.
- Output translation only.

Example 1:
Input:  "Hello ‖world‖ today"
Output: "你好‖世界‖今天"

Example 2:
Input:  "She said:‖hello world‖and smiled."
Output: "她说：‖你好世界‖然后笑了。"
```

用户消息保持不变 —— 仅字符串拼接，内容脚本已在发送前用 `‖` 连接好了各段。

### 为什么不 ESC 恢复原文

决策：翻译是单向操作，完成后译文即页面内容。不保存原文、不提供恢复。理由：
- 保持代码简单，无需维护原文快照
- 用户刷新页面即可还原（扩展不会持久化 DOM 修改）
- 移除了大量边界处理代码（节点被外部修改、快照的一致性等）

## Git workflow

- Branch: `advisor/001-inline-translation-replace`
- Commit per step; conventional commits: `feat(content): ...`, `feat(background): ...`
- Do NOT push or open a PR unless instructed

## Steps

### Step 1: 修改 `app/types/messages.ts` — `StreamTranslateStart` 新增可选字段

翻译开始消息需要携带分段信息（文本节点数量），供后续校验（虽然背景不处理它，但类型层面标注清楚有助于理解数据流）。

**修改 `app/types/messages.ts`**：

将：
```ts
export interface StreamTranslateStart {
  type: "START";
  text: string;
}
```

改为：
```ts
export interface StreamTranslateStart {
  type: "START";
  text: string;
  /** 文本节点段数，用于 LLM 分段对齐；为空时退化为普通翻译 */
  segmentCount?: number;
}
```

联合类型 `StreamTranslatePortMessage` 不变（`StreamTranslateStart` 本身已在其中）。

**Verify**: `pnpm typecheck` → exit 0

---

### Step 2: 修改 `app/background/StreamTranslator.ts` — 重写 system prompt

**修改 `app/background/StreamTranslator.ts`**，替换 system prompt（约第 48-56 行）。

将：
```ts
{
  role: "system",
  content: `You are a concise translation model.\nTask:\n- Translate the user's text into ${targetLang}.\n- Think briefly before translating.\n- Never copy the source text unless it is a proper noun.\n- Do not explain.\n- Do not summarize.\n- Output translation only.`,
},
```

改为：
```ts
{
  role: "system",
  content: `You are a concise translation model.

Task:
- Translate the user's text into ${targetLang}.
- The user's input contains text segments separated by the "\u2016" character. Each segment is an independent piece of text to translate separately.
- Your output MUST contain exactly the same number of "\u2016" separators in the exact same order. Translate each segment and join them with "\u2016".
- The "\u2016" character is a structural delimiter — do NOT translate or modify it. Reproduce it verbatim between translated segments.
- If a segment appears empty, output an empty segment (consecutive "\u2016").
- Think briefly before translating.
- Do not explain or summarize.
- Output translation only.

Example 1:
Input:  "Hello \u2016world\u2016 today"
Output: "你好\u2016世界\u2016今天"

Example 2:
Input:  "She said:\u2016hello world\u2016and smiled."
Output: "她说：\u2016你好世界\u2016然后笑了。"`,
},
```

> **注意**：使用 `\u2016` 转义而非直接写 `‖` 字符，避免编辑器/终端显示问题和 biome 格式化干扰。JavaScript 字符串中 `"\u2016"` 等价于 `"‖"`。

由于 system prompt 引用了 `targetLang` 变量（模板字符串），保持该插值不变。

**Verify**: `pnpm typecheck` → exit 0
**Verify**: `pnpm lint` → exit 0

---

### Step 3: 新建 `app/content/InlineTranslator.ts`

创建核心模块，负责：
1. 接收 Range，遍历文本节点，收集 segment 列表
2. 用 `‖` 连接各段，提供 `buildPromptText()` 返回发给 LLM 的字符串
3. 提供分段解析器，流式处理 CHUNK，精确写入各文本节点
4. 注入/移除翻译状态样式

**完整文件内容**：

```ts
const DELIMITER = "\u2016";

export interface InlineTranslatorController {
  /** 追加译文 chunk，流式解析分隔符并写入对应文本节点 */
  appendChunk: (chunk: string) => void;
  /** 翻译完成：flush 缓冲区，移除 "翻译中" 标记，添加 "翻译完成" 标记 */
  finish: () => void;
  /** 清理所有引用和辅助元素 */
  destroy: () => void;
}

interface TextNodeInfo {
  node: Text;
  parent: Element;
}

/**
 * 从 Range 中提取所有文本节点信息，并计算每段的原始文本。
 * 返回 { nodes, segments, joinedText }：
 * - nodes: 文本节点及其父元素的快照
 * - segments: 每个文本节点在选区内的文本片段
 * - joinedText: 用分隔符连接后的完整文本，供发送给 LLM
 */
function extractTextNodes(
  range: Range,
): { nodes: TextNodeInfo[]; segments: string[]; joinedText: string } {
  const nodes: TextNodeInfo[] = [];
  const segments: string[] = [];

  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  );

  let node = walker.nextNode() as Text | null;

  while (node) {
    if (range.intersectsNode(node)) {
      const text = node.textContent ?? "";
      let segment: string;

      if (node === range.startContainer && node === range.endContainer) {
        // 选区在同一节点内
        segment = text.slice(range.startOffset, range.endOffset);
      } else if (node === range.startContainer) {
        segment = text.slice(range.startOffset);
      } else if (node === range.endContainer) {
        segment = text.slice(0, range.endOffset);
      } else {
        segment = text;
      }

      nodes.push({ node, parent: node.parentElement! });
      segments.push(segment);
    }

    node = walker.nextNode() as Text | null;
  }

  const joinedText = segments.join(DELIMITER);

  return { nodes, segments, joinedText };
}

function injectStyles(parent: ShadowRoot | HTMLElement): void {
  const styleId = "llm-inline-translate-styles";
  if (parent.querySelector(`#${styleId}`)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .llm-translating {
      opacity: 0.6;
      transition: opacity 150ms ease;
    }
    .llm-translated {
      opacity: 1;
      background: linear-gradient(90deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.04) 100%);
      border-radius: 2px;
      transition: opacity 150ms ease, background 300ms ease;
    }
  `;
  parent.appendChild(style);
}

function removeStyles(parent: ShadowRoot | HTMLElement): void {
  const style = parent.querySelector("#llm-inline-translate-styles");
  if (style) style.remove();
}

export function createInlineTranslator(
  range: Range,
  parent: ShadowRoot | HTMLElement,
): InlineTranslatorController {
  const { nodes, segments, joinedText } = extractTextNodes(range);

  if (nodes.length === 0) {
    // 无文本节点，返回空操作 controller
    return {
      appendChunk: () => {},
      finish: () => {},
      destroy: () => {},
    };
  }

  injectStyles(parent);

  let buffer = "";
  let currentNodeIndex = 0;
  let hasReceivedFirstChunk = false;

  function writeToNode(index: number, text: string): void {
    if (index >= nodes.length) return;
    const info = nodes[index];
    if (!info || !info.node.isConnected) return;

    // 替换整段文本节点的内容（因为浏览器不允许在 Text 节点内部分替换）
    info.node.textContent = text;
  }

  return {
    appendChunk(chunk: string): void {
      if (!hasReceivedFirstChunk) {
        hasReceivedFirstChunk = true;
        // 首个 chunk：给所有涉及文本节点的父元素加 "翻译中" class
        for (const info of nodes) {
          if (info.parent) {
            info.parent.classList.add("llm-translating");
          }
        }
      }

      buffer += chunk;
      const parts = buffer.split(DELIMITER);

      // 除最后一段外，都是完整段
      for (let i = 0; i < parts.length - 1; i++) {
        writeToNode(currentNodeIndex, parts[i]);
        currentNodeIndex++;
      }

      // 最后一段是未完成段，写入当前节点
      buffer = parts[parts.length - 1] ?? "";
      writeToNode(currentNodeIndex, buffer);
    },

    finish(): void {
      // flush 缓冲区：剩余内容写入当前节点
      if (buffer.length > 0) {
        writeToNode(currentNodeIndex, buffer);
      }

      // 如果 LLM 输出的段数少于节点数，把剩余节点清空
      for (let i = currentNodeIndex + 1; i < nodes.length; i++) {
        writeToNode(i, "");
      }

      // 移除 "翻译中" class，添加 "翻译完成" class
      for (const info of nodes) {
        if (info.parent) {
          info.parent.classList.remove("llm-translating");
          info.parent.classList.add("llm-translated");
        }
      }

      buffer = "";
    },

    destroy(): void {
      // 移除样式和 class
      for (const info of nodes) {
        if (info.parent) {
          info.parent.classList.remove("llm-translating", "llm-translated");
        }
      }
      // 检查是否还有其他翻译中的元素决定是否移除 style
      const hasTranslating =
        parent.querySelector(".llm-translating") !== null;
      const hasTranslated =
        parent.querySelector(".llm-translated") !== null;
      if (!hasTranslating && !hasTranslated) {
        removeStyles(parent);
      }
    },
  };
}

/** 获取拼接后的文本，供发送给 LLM */
export function getTranslationText(
  controller: InlineTranslatorController & { _joinedText?: string },
): string {
  // 这是一个便捷导出，实际 joinedText 在闭包内
  // 调用方通过 createInlineTranslator 返回的扩展对象获取
  return "";
}
```

> **重要**：上述 `getTranslationText` 是伪代码占位。实际上 `joinedText` 在 `createInlineTranslator` 闭包内。需要在 controller 中暴露一个 `getText(): string` 方法，或让 `createInlineTranslator` 返回扩展接口。下面是修正：

**修正后的接口和工厂返回值**：

```ts
export interface InlineTranslatorController {
  appendChunk: (chunk: string) => void;
  finish: () => void;
  destroy: () => void;
  /** 返回拼接好分隔符的文本，供发送给 LLM */
  getText: () => string;
}
```

在工厂返回对象中添加：
```ts
getText: () => joinedText,
```

**约定**：遵循现有代码风格 —— 工厂函数返回 controller 对象（对照 `createTranslatePopup` 模式）；DOM 操作用原生 API（对照 `TranslatePopup.ts` 的 `createPopupElement`）；类名前缀 `llm-` 与现有生态一致。

**Verify**: `pnpm typecheck` → exit 0（文件类型正确）
**Verify**: `pnpm lint` → exit 0

---

### Step 4: 重写 `app/content/index.ts`

改动集中在 `app/content/index.ts`。

**4a. 替换导入和变量**

删除：
```ts
import {
  createTranslatePopup,
  setPopupParent,
  type TranslatePopupController,
} from "@/content/TranslatePopup";
```

新增：
```ts
import {
  createInlineTranslator,
  type InlineTranslatorController,
} from "@/content/InlineTranslator";
```

将：
```ts
let currentPopup: TranslatePopupController | null = null;
```

改为：
```ts
let currentTranslator: InlineTranslatorController | null = null;
```

**4b. 删除 `setPopupParent` 调用**

删除：
```ts
setPopupParent(shadowRoot);
```

保留：
```ts
setParent(shadowRoot);
```

**4c. `handleMouseUp` 中不再调用 `currentPopup?.hide()`**

将：
```ts
if (isTranslating) {
  currentPopup?.hide();
  isTranslating = false;
}
```

改为：
```ts
if (isTranslating) {
  currentTranslator?.destroy();
  currentTranslator = null;
  isTranslating = false;
}
```

**4d. 重写 `startTranslate` 函数**（替换约第 61-104 行）

```ts
function startTranslate(text: string): void {
  // 若已有翻译进行中，先取消前一个
  if (isTranslating) {
    currentTranslator?.destroy();
    currentPort?.disconnect();
    currentPort = null;
    currentTranslator = null;
    isTranslating = false;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  // 保留 Range，仅清除高亮
  const range = selection.getRangeAt(0);
  selection.removeAllRanges();

  // 创建原地翻译器，提取文本节点和分段信息
  const translator = createInlineTranslator(range, shadowRoot);
  currentTranslator = translator;
  const segmentedText = translator.getText();

  isTranslating = true;
  hideButton();

  let isFinished = false;
  const port = browser.runtime.connect({ name: "stream-translate" });
  currentPort = port;

  const messageHandler = (message: unknown): void => {
    const msg = message as StreamTranslatePortMessage;
    if (msg.type === "CHUNK" && msg.chunk) {
      currentTranslator?.appendChunk(msg.chunk);
    } else if (msg.type === "REASONING" && msg.reasoning) {
      // 原地替换模式下忽略推理过程
    } else if (msg.type === "USAGE") {
      // 原地替换模式下忽略 token 计数
    } else if (msg.type === "DONE") {
      currentTranslator?.finish();
      finish();
    } else if (msg.type === "ERROR") {
      console.error("[LLM Translate] Translation failed:", msg.error);
      currentTranslator?.destroy();
      currentTranslator = null;
      finish();
    }
  };

  const disconnectHandler = (): void => {
    if (!isFinished) {
      currentTranslator?.destroy();
      currentTranslator = null;
      finish();
    }
  };

  port.onMessage.addListener(messageHandler);
  port.onDisconnect.addListener(disconnectHandler);

  port.postMessage({ type: "START", text: segmentedText });

  function finish(): void {
    if (isFinished) return;
    isFinished = true;
    isTranslating = false;
    port.onMessage.removeListener(messageHandler);
    port.onDisconnect.removeListener(disconnectHandler);
    currentPort = null;
    port.disconnect();
  }
}
```

**4e. 更新 `cleanup` 函数**

将：
```ts
currentPopup?.hide();
```

改为：
```ts
currentTranslator?.destroy();
currentTranslator = null;
```

**Verify**: `pnpm typecheck` → exit 0
**Verify**: `pnpm lint` → exit 0

---

### Step 5: 删除 `app/content/TranslatePopup.ts`

```bash
rm app/content/TranslatePopup.ts
```

**Verify**: `pnpm typecheck` → exit 0（确认无未解析导入）
**Verify**: `pnpm lint` → exit 0
**Verify**: `grep -rn "TranslatePopup" app/` → 无匹配

---

### Step 6: 端到端构建与手动验证

```bash
pnpm build
```

**Verify**: exit 0，`.addfox/` 下有 chrome 和 firefox 产物。

**手动验证场景**：

1. **单文本节点**：选中 `<p>Hello world</p>` → 译文在原 `<p>` 内流式替换 "Hello world"
2. **跨内联元素**：选中 `<p>Hello <b>world</b> today</p>` → 三个节点分别被替换，`<b>` 内的译文保留粗体样式
3. **跨块级元素**：选中一个 `<h2>` + 一个 `<p>` → 各节点分别按段替换
4. **译文完成后**：文本节点有浅蓝底色（`.llm-translated`），样式融入页面
5. **翻译异常断开**：端口断开后 `destroy()` 清理 class，无残留样式
6. **重复触发**：翻译中再划词，前一个被 `destroy()`，新翻译启动

---

## Test plan

本项目无自动化测试（`package.json` 无 test 脚本），全部手动验证（见步骤 6 的 6 个场景）。建议在以下页面现场测试：
- 简单的英文段落页（如 Wikipedia 英文）
- 包含 `<b>`/`<i>`/`<a>` 的富文本页
- 代码块内文本（确认 `‖` 不出现在正常内容中）

---

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` exits 0，chrome + firefox 产物均生成
- [ ] `grep -rn "TranslatePopup" app/` 无匹配
- [ ] `grep -rn "setPopupParent\|TranslatePopupController" app/` 无匹配
- [ ] `app/content/InlineTranslator.ts` 存在且导出 `createInlineTranslator`
- [ ] `app/background/StreamTranslator.ts` 中 system prompt 包含 `\u2016` 分隔符说明
- [ ] 手动测试全部 6 个场景通过

## STOP conditions

Stop and report back (do not improvise) if:

- `app/content/index.ts` 的结构与 "Current state" 摘录不匹配（代码已漂移）
- `app/background/StreamTranslator.ts` 的 system prompt 结构与摘录不同
- `app/types/messages.ts` 的 `StreamTranslateStart` 结构与摘录不同
- 任何 step 的 typecheck 两次修复后仍失败
- 改动需要触碰 `app/background/index.ts`（端口路由层不在范围内）
- 需要新增 npm 依赖
- LLM 在流式翻译中从未输出 `‖` 分隔符（即 LLM 不遵守分段协议）→ 此时需评估是否回退到比例分配方案
- 页面使用 Shadow DOM 且选区跨 Shadow boundary 导致 Range 文本遍历失败

## Maintenance notes

- **LLM 不遵守分段协议**：如果某个模型始终不输出 `‖`，当前实现会退化为把所有译文写入第一个节点。观察 3-5 个模型的实际表现再决定是否需要按比例分配的 fallback 方案。fallback 不应内联在此文件，应作为 `InlineTranslator.ts` 的 v2 策略。
- **`REASONING` / `USAGE` 消息被忽略**：原地替换模式无展示空间。未来若要展示，在 `finish()` 末尾的译文节点后插入一个小 tooltip 元素。
- **`‖` 分隔符安全性**：代码中用 `\u2016` 转义防止显示问题。如果 LLM 输出的 `‖` 两侧有额外空格（LLM 自行添加的），当前 `split` 会产生含空格的段。建议测试后评估是否需要在 `appendChunk` 中 trim 各段。
- **翻译后文本节点被替换的幂等性**：`destroy()` 清理 class 但不清除译文内容（译文永久留在 DOM）。重复对同一选区发起翻译时，`extractTextNodes` 会提取到已翻译的文本，将其发送给 LLM 做二次翻译。这是预期行为（"以译文为源再翻译"），如果不想要此行为，需额外维护一个"已翻译区域"标记。
