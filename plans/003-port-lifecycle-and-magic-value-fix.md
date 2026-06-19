# Plan 003: 端口生命周期修复 + fetchModels 魔术值修复

> **Executor instructions**: 按步骤顺序执行。每步完成后运行验证命令。遇到 STOP 条件立即停止并报告，不要自行发挥。完成后不要更新 `plans/README.md`。
>
> **Drift check（首先运行）**: `git diff --stat 9584456..HEAD -- app/content/index.ts app/options/App.tsx`
> 如果以上文件自本计划编写后发生变化，对照 "Current state" 摘录对比实时代码；不匹配则视为 STOP 条件。

## Status

- **Priority**: P2（两个小缺陷，各自独立，均为 S 级工作量）
- **Effort**: S（1 小时）
- **Risk**: LOW（修改局限在端口生命周期管理和参数默认值，不改翻译逻辑）
- **Depends on**: 计划 001（lint + typecheck 基线）
- **Category**: bug
- **Planned at**: commit `9584456`, 2026-06-19

## Why this matters

两个小但真实的问题：

**问题 A：fetchModels 的魔术值 `'1'`**
`fetchModels` 的 `key` 参数默认值为 `'1'`。当用户未填写 API Key 但点击「刷新模型列表」时，请求带着 `Authorization: Bearer 1` 头发送，服务器返回 401。面向中文用户的 UI 显示含义不明的 HTTP 错误，体验差。不应有魔术值——应该在调用前判断 apiKey 是否有效。

**问题 B：port.onDisconnect 匿名监听器 + 级联调用**
`startTranslate()` 中 `port.onDisconnect` 注册了匿名函数。当 `finish()` 调用 `port.disconnect()` 时，触发 `onDisconnect` 再次调用 `finish()`。虽然 `isFinished` 标志阻止了重复执行，但：
- 匿名函数无法被移除，造成不必要的闭包引用（`currentPopup` 被捕获）
- `cleanup()` 函数无法清理 `port.onDisconnect` 和 `port.onMessage` 监听器
- 这是潜在的内存泄漏点

## Current state

### 问题 A：`app/options/App.tsx:73–80`

```ts
const fetchModels = async (
  url: string,
  key = '1',           // ← 魔术值默认
  currentModel: string,
): Promise<void> => {
```

调用点 1 — `onMount`（第 102 行）：
```ts
if (result.baseUrl && result.apiKey) {   // ← 此处有守护，没问题
  fetchModels(result.baseUrl, result.apiKey, result.model);
}
```

调用点 2 — `handleRefreshModels`（第 147–150 行）：
```ts
const handleRefreshModels = (): void => {
  if (!baseUrl()) {
    showToast('请先填写 API Base URL', 'error');
    return;
  }
  fetchModels(baseUrl(), apiKey(), model());  // ← 无 apiKey 守护！apiKey() 可能为 ''
};
```

当 `apiKey()` 返回空字符串时，`fetchModels` 的 `key` 参数收到 `''`（不是 `'1'`，因为调用方传了实参）。但 `''` 同样是没有意义的 token——发给 API 的请求头变成 `Authorization: Bearer `（注意末尾空格）。

### 问题 B：`app/content/index.ts:53–102`

完整 `startTranslate` 函数中与端口相关的代码：

```ts
// 第 53–102 行
function startTranslate(text: string): void {
  if (isTranslating) {
    currentPopup?.hide();
    currentPort?.disconnect();
    currentPort = null;
    isTranslating = false;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const targetRect = range.getBoundingClientRect();
  selection.removeAllRanges();

  isTranslating = true;
  hideButton();

  currentPopup = createTranslatePopup();
  currentPopup.show(targetRect);

  let isFinished = false;
  const port = browser.runtime.connect({ name: 'stream-translate' });
  currentPort = port;

  port.onMessage.addListener((message: unknown) => {   // ← 匿名监听器
    const msg = message as StreamTranslatePortMessage;
    if (msg.type === 'CHUNK' && msg.chunk) {
      currentPopup?.appendChunk(msg.chunk);
    } else if (msg.type === 'REASONING' && msg.reasoning) {
      currentPopup?.appendReasoning(msg.reasoning);
    } else if (msg.type === 'USAGE') {
      currentPopup?.setUsage(msg.usage);
    } else if (msg.type === 'DONE') {
      finish();
    } else if (msg.type === 'ERROR') {
      console.error('[LLM Translate] Translation failed:', msg.error);
      currentPopup?.setError(msg.error || '未知错误');
      finish();
    }
  });

  port.onDisconnect.addListener(() => {    // ← 匿名监听器，无法移除
    if (!isFinished) {
      finish();
      currentPopup?.setError('连接已断开');
    }
  });

  port.postMessage({ type: 'START', text });

  function finish(): void {
    if (isFinished) return;
    isFinished = true;
    isTranslating = false;
    currentPort = null;
    port.disconnect();     // ← 触发 onDisconnect 监听器
  }
}
```

`cleanup` 函数（第 104–111 行）：
```ts
function cleanup(): void {
  document.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('selectionchange', handleSelectionChange);
  hideButton();
  currentPopup?.hide();
  currentPort?.disconnect();
  currentPort = null;
}
```
注意：`cleanup()` 调用 `currentPort?.disconnect()` 但没有先移除监听器。在 `beforeunload` 场景下这通常不会造成实际问题，但不符合"先移除监听器再断开"的正确生命周期管理。

- **项目约定**：`app/background/index.ts:26–30` 展示了正确的端口生命周期模式——监听器被命名并显式移除：

  ```ts
  port.onMessage.addListener(messageHandler as ...);
  port.onDisconnect.addListener(() => {
    port.onMessage.removeListener(messageHandler as ...);
  });
  ```

## Commands you will need

| 用途 | 命令 | 预期成功 |
|------|------|----------|
| 类型检查 | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 构建 | `pnpm build` | exit 0 |

## Scope

**In scope**：
- `app/options/App.tsx` — 修改 `fetchModels` 去除魔术值默认，修改 `handleRefreshModels` 增加 apiKey 守护
- `app/content/index.ts` — 命名端口监听器并在 finish/cleanup 中正确移除

**Out of scope**：
- `app/background/index.ts` — 其端口管理已经正确，无需改动
- `app/background/StreamTranslator.ts` — 翻译逻辑不变
- 翻译流程的 UX/UI 改动

## Steps

### Step 1: 修复 fetchModels 的魔术值默认

编辑 `app/options/App.tsx`。

**修改 1**：`fetchModels` 函数签名（约第 73–76 行），将 `key = '1'` 改为 `key: string`（必填，不设默认值）：

```ts
const fetchModels = async (
  url: string,
  key: string,
  currentModel: string,
): Promise<void> => {
```

**修改 2**：`handleRefreshModels` 函数（约第 147–150 行），在调用 `fetchModels` 前增加 apiKey 非空守护：

```ts
const handleRefreshModels = (): void => {
  if (!baseUrl()) {
    showToast('请先填写 API Base URL', 'error');
    return;
  }
  if (!apiKey()) {
    showToast('请先填写 API Key', 'error');
    return;
  }
  fetchModels(baseUrl(), apiKey(), model());
};
```

**Verify**: `pnpm typecheck` → exit 0，确认 `fetchModels` 调用处全部有 `key` 参数传入且类型匹配。

### Step 2: 修复端口监听器生命周期

编辑 `app/content/index.ts` 中的 `startTranslate` 函数。

**修改**：将两个匿名监听器改为命名变量，在 `finish()` 和 `cleanup()` 中显式移除。

将 `startTranslate` 函数体（约第 53–102 行）替换为：

```ts
function startTranslate(text: string): void {
  if (isTranslating) {
    currentPopup?.hide();
    currentPort?.disconnect();
    currentPort = null;
    isTranslating = false;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const targetRect = range.getBoundingClientRect();
  selection.removeAllRanges();

  isTranslating = true;
  hideButton();

  currentPopup = createTranslatePopup();
  currentPopup.show(targetRect);

  let isFinished = false;
  const port = browser.runtime.connect({ name: 'stream-translate' });
  currentPort = port;

  const messageHandler = (message: unknown): void => {
    const msg = message as StreamTranslatePortMessage;
    if (msg.type === 'CHUNK' && msg.chunk) {
      currentPopup?.appendChunk(msg.chunk);
    } else if (msg.type === 'REASONING' && msg.reasoning) {
      currentPopup?.appendReasoning(msg.reasoning);
    } else if (msg.type === 'USAGE') {
      currentPopup?.setUsage(msg.usage);
    } else if (msg.type === 'DONE') {
      finish();
    } else if (msg.type === 'ERROR') {
      console.error('[LLM Translate] Translation failed:', msg.error);
      currentPopup?.setError(msg.error || '未知错误');
      finish();
    }
  };

  const disconnectHandler = (): void => {
    if (!isFinished) {
      finish();
      currentPopup?.setError('连接已断开');
    }
  };

  port.onMessage.addListener(messageHandler);
  port.onDisconnect.addListener(disconnectHandler);

  port.postMessage({ type: 'START', text });

  function finish(): void {
    if (isFinished) return;
    isFinished = true;
    isTranslating = false;
    // 先移除监听器，再断开端口，避免 onDisconnect 再次触发 finish
    port.onMessage.removeListener(messageHandler);
    port.onDisconnect.removeListener(disconnectHandler);
    currentPort = null;
    port.disconnect();
  }
}
```

关键变更：
- `messageHandler` 和 `disconnectHandler` 都声明为命名常量
- `finish()` 中先 `removeListener` 再 `disconnect()`，与 `app/background/index.ts` 的模式一致
- `addListener` 调用不再需要 `as (message: unknown) => void` 类型断言（因为 `messageHandler` 的类型签名已匹配）

**Verify**: `pnpm typecheck` → exit 0；`pnpm lint` → exit 0

### Step 3: 最终验证

```bash
pnpm typecheck   # exit 0
pnpm lint        # exit 0
pnpm build       # exit 0
```

## Test plan

- 手动测试 fetchModels：在选项页中，不填 API Key，点击「刷新」按钮，应显示 toast "请先填写 API Key"。
- 手动测试翻译流程：划词翻译，确认翻译正常完成，弹窗正确关闭。
- 手动测试翻译中断：发起翻译后，在结果返回前再次划词，确认旧翻译被中断、新翻译正常启动。
- 手动测试页面关闭：翻译进行中关闭标签页（`beforeunload` 触发），确认控制台无未清理的监听器报错。

## Done criteria

- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint` exit 0
- [ ] `pnpm build` exit 0
- [ ] `fetchModels` 的 `key` 参数不再有默认值 `'1'`
- [ ] `handleRefreshModels` 在 apiKey 为空时显示 toast 并提前返回
- [ ] `startTranslate` 中的 `messageHandler` 和 `disconnectHandler` 为命名变量
- [ ] `finish()` 在调用 `port.disconnect()` 之前先移除两个监听器
- [ ] 仅 `app/options/App.tsx` 和 `app/content/index.ts` 被修改

## STOP conditions

- TypeScript 报 `messageHandler` 类型不兼容（如果 `browser.Runtime.Port.onMessage.addListener` 的类型签名与我们的函数签名不匹配）
- 移除监听器后翻译功能异常（如 DONE 消息未被处理）
- `finish()` 中先 removeListener 再 disconnect 导致 onDisconnect 不触发（这是预期行为——如果 `isFinished` 已为 true 就不需要触发）

## Maintenance notes

- 端口监听器命名模式（`const handler = (...) => {...}; port.onXxx.addListener(handler)`）应在所有端口使用处保持一致。如果未来新增其他 `browser.runtime.connect` 调用，参考 `startTranslate` 的新写法。
- `fetchModels` 现在要求调用方保证 `key` 参数有效。任何新增的调用点都需要先做 apiKey 非空检查。
