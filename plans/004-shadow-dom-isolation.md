# Plan 004: Content Script Shadow DOM 隔离

> **Executor instructions**: 按步骤顺序执行。每步完成后运行验证命令。遇到 STOP 条件立即停止并报告，不要自行发挥。完成后不要更新 `plans/README.md`。
>
> **Drift check（首先运行）**: `git diff --stat 9584456..HEAD -- app/content/FloatingButton.ts app/content/TranslatePopup.ts app/content/index.ts package.json`
> 如果以上文件自本计划编写后发生变化，对照 "Current state" 摘录对比实时代码；不匹配则视为 STOP 条件。

## Status

- **Priority**: P2
- **Effort**: M（半天）
- **Risk**: MED（`position: fixed` 在 Shadow DOM 中的行为因浏览器而异；Firefox strict_min_version 142 应支持规范行为，但需手动验证）
- **Depends on**: 计划 001（lint + typecheck 基线）和计划 000（`@addfox/utils` 已升级到 0.2.4）
- **Category**: security
- **Planned at**: commit `9584456`, 2026-06-19

## Why this matters

当前 content script 直接将浮动按钮和翻译弹窗注入到宿主页面的 `document.body` 中。这导致两个方向上的样式污染：

1. **宿主页面的 CSS 影响扩展 UI**：页面的全局样式（`* { box-sizing }`, `div { font-family }`, `body { color }` 等）可能覆盖弹窗的字体、颜色、间距，导致翻译结果不可读或布局错乱。
2. **扩展的 UI 影响宿主页面**：扩展注入的全局 SVG（`#llm-squircle` clip-path）、CSS 类名（如 `#llm-translate-btn`、`#llm-translate-popup`）可能与页面中同名 ID 冲突。

项目 AGENTS.md（现 CLAUDE.md）明确要求："Content scripts: use `@addfox/utils` with Shadow DOM"。`@addfox/utils@0.2.4` 提供了 `defineShadowContentUI()` 函数，专门用于在内容脚本中创建 Shadow DOM 隔离的 UI 挂载点。计划 000 已将 `@addfox/utils` 升级到 0.2.4，现在可以使用该 API。

## Current state

### 文件架构

- **`app/content/index.ts`**（124 行）— 入口：监听划词事件，管理翻译生命周期，调用 `FloatingButton` 和 `TranslatePopup` 的导出函数
- **`app/content/FloatingButton.ts`**（148 行）— 浮动翻译按钮：创建 DOM 元素、SVG clip-path、点击事件，全部直接操作 `document.body`
- **`app/content/TranslatePopup.ts`**（273 行）— 翻译弹窗：创建 popover 元素、reasoning/content/usage 区域、定位逻辑，全部直接操作 `document.body`

### `FloatingButton.ts` 的 DOM 注入点

```ts
// FloatingButton.ts:74 — SVG clip-path 注入到 body
document.body.appendChild(svg);

// FloatingButton.ts:109 — 按钮 wrapper 注入到 body
document.body.appendChild(wrapper);
```

### `TranslatePopup.ts` 的 DOM 注入点

```ts
// TranslatePopup.ts:168 — 弹窗元素注入到 body
document.body.appendChild(popup);
```

### 事件监听器挂载位置

- `content/index.ts:107–109` — `document.addEventListener('mousedown', ...)` 等全局事件
- `content/index.ts:113` — `window.addEventListener('beforeunload', cleanup)`
- `TranslatePopup.ts:180–182` — `document.addEventListener('click', outsideClickHandler)`
- `TranslatePopup.ts:198` — `document.addEventListener('keydown', keydownHandler)`

事件监听器挂载在 `document` 上目前是正确的（Shadow DOM 中的点击事件会冒泡到 document），不需要迁移。

### `@addfox/utils` 的 `defineShadowContentUI` API（来自 plan 000 升级后的版本 0.2.4）

```ts
// 类型声明（来自 node_modules/@addfox/utils/dist/content-ui.d.ts）
export declare function defineShadowContentUI(
  options: DefineShadowContentUIOptions
): ContentUIMount;

// DefineShadowContentUIOptions:
// {
//   name: string;          // 自定义元素标签名，如 "my-content-ui"
//   target: string | Element;  // 挂载目标（CSS 选择器或 Element）
//   attr?: Record<string, string>;  // 宿主元素属性
//   injectMode?: 'append' | 'prepend';  // 插入方式
// }

// ContentUIMount = () => Element | ShadowRoot
// 调用返回的 mount 函数会创建 shadow host，注入到 target 中，返回 shadowRoot
```

- **项目约定**：`app/options/App.tsx` 中组件的引用路径如 `../components/Button/Button`、`../hooks/useToast`。Content script 的导入使用 `@/content/FloatingButton`、`@/content/TranslatePopup`。本计划应保持此模式。

## Commands you will need

| 用途 | 命令 | 预期成功 |
|------|------|----------|
| 类型检查 | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 构建 | `pnpm build` | exit 0 |

## Scope

**In scope**：
- `app/content/index.ts` — 创建 shadow host，将 `shadowRoot` 传递给按钮和弹窗模块
- `app/content/FloatingButton.ts` — 修改为接收 `parent: ShadowRoot | HTMLElement` 参数，向 shadowRoot 中注入元素
- `app/content/TranslatePopup.ts` — 修改为接收 `parent: ShadowRoot | HTMLElement` 参数，向 shadowRoot 中注入元素

**Out of scope**：
- `app/options/`、`app/background/` — 这些不在 content script 上下文中运行，不需要 Shadow DOM
- 事件监听器迁移 — `document.addEventListener` 的监听器保持在 document 上（Shadow DOM 事件冒泡正确）
- CSS 样式整理 — 只迁移 DOM 创建位置，不重写样式规则

## Steps

### Step 1: 在 content/index.ts 中创建 shadow host

编辑 `app/content/index.ts`，在顶部导入区域添加 `@addfox/utils` 的导入：

```ts
import { defineShadowContentUI } from '@addfox/utils';
```

在模块顶层（`startTranslate` 之前，与其他 `let` 声明平级）创建 shadow mount 函数并调用：

```ts
const mountUI = defineShadowContentUI({
  name: 'llm-translate-ui',
  target: document.body,
  injectMode: 'append',
});

const shadowRoot = mountUI() as ShadowRoot;
```

注意：`mountUI()` 返回的是 `ShadowRoot`（因为 `defineShadowContentUI` 创建的是 shadow host 并 attach shadow root）。

**Verify**: `pnpm typecheck` → exit 0（确认 `@addfox/utils` 的导出类型正确导入）

### Step 2: 修改 FloatingButton 模块，接收 parent 参数

编辑 `app/content/FloatingButton.ts`。当前 `show()` 函数直接使用 `document.body`：

```ts
// 当前：第 109 行
document.body.appendChild(wrapper);
```

修改方案：在模块顶层添加一个模块级变量 `currentParent: ShadowRoot | HTMLElement = document.body`，并导出 `setParent` 函数：

```ts
let currentParent: ShadowRoot | HTMLElement = document.body;

export function setParent(parent: ShadowRoot | HTMLElement): void {
  currentParent = parent;
}
```

然后修改两处 `document.body.appendChild`：

1. **第 74 行**（`ensureClipPath` 中的 SVG 注入）：
   ```ts
   // 旧：document.body.appendChild(svg);
   currentParent.appendChild(svg);
   ```

2. **第 109 行**（`show` 中的按钮 wrapper 注入）：
   ```ts
   // 旧：document.body.appendChild(wrapper);
   currentParent.appendChild(wrapper);
   ```

**Verify**: `pnpm typecheck` → exit 0

### Step 3: 修改 TranslatePopup 模块，接收 parent 参数

编辑 `app/content/TranslatePopup.ts`。当前在 `createPopupElement`（第 168 行）中直接操作 `document.body`：

```ts
// 当前：第 168 行
document.body.appendChild(popup);
```

修改方案：在模块顶层添加变量和 setter（与 FloatingButton 相同模式）：

```ts
let currentParent: ShadowRoot | HTMLElement = document.body;

export function setPopupParent(parent: ShadowRoot | HTMLElement): void {
  currentParent = parent;
}
```

修改 `createTranslatePopup` 中的 `ensureElements` 函数（约第 156–166 行），将 `document.body.appendChild(popup)` 改为：

```ts
currentParent.appendChild(popup);
```

**Verify**: `pnpm typecheck` → exit 0

### Step 4: 在 content/index.ts 中连接 parent

编辑 `app/content/index.ts`，在 `shadowRoot` 创建之后，调用 setter：

```ts
import {
  hide as hideButton,
  isButtonElement,
  onClick,
  setParent,
  show as showButton,
} from '@/content/FloatingButton';
import {
  createTranslatePopup,
  setPopupParent,
  type TranslatePopupController,
} from '@/content/TranslatePopup';

// ... 在 shadowRoot 创建之后
setParent(shadowRoot);
setPopupParent(shadowRoot);
```

**Verify**: `pnpm typecheck` → exit 0；`pnpm lint` → exit 0

### Step 5: 验证构建和手动测试

```bash
pnpm build
```

**Verify**: exit 0，两个扩展均成功构建。

手动测试清单：
1. 加载扩展，打开任意网页
2. 划词选中文本 → 浮动按钮应正常出现在鼠标附近
3. 点击按钮 → 翻译弹窗应正常出现并显示流式结果
4. 点击弹窗外部 → 弹窗应关闭
5. 按 Escape → 弹窗应关闭
6. 在翻译进行中再次划词 → 旧弹窗关闭，新翻译开始
7. 打开浏览器 DevTools，检查 Elements 面板 → 应看到 `<llm-translate-ui>` 标签，其 `#shadow-root` 内包含按钮和弹窗

**→ STOP 条件**：如果浮动按钮或弹窗的 `position: fixed` 定位不正确（例如元素相对于页面左上角偏移、或按钮出现在错误位置），停止并报告。这是 Shadow DOM 中 `position: fixed` 的浏览器兼容性问题。

## Test plan

（手动测试，与 Step 5 相同）

## Done criteria

- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint` exit 0
- [ ] `pnpm build` exit 0
- [ ] DevTools 显示 `<llm-translate-ui>` 标签包裹 `#shadow-root`
- [ ] 浮动按钮和翻译弹窗的 DOM 元素在 `#shadow-root` 内（不在 `document.body` 直接子级）
- [ ] 浮动按钮定位正常（按住鼠标坐标）
- [ ] 翻译弹窗定位正常（相对于选中文本的 bounding rect）
- [ ] 点击外部关闭和 Escape 关闭功能正常
- [ ] 仅 `app/content/index.ts`、`app/content/FloatingButton.ts`、`app/content/TranslatePopup.ts` 被修改

## STOP conditions

- `position: fixed` 在 Shadow DOM 内定位错误（元素未出现在预期位置）
- `browser.runtime.getURL()` 在 Shadow DOM 内无法加载图标
- `popover` API 在 Shadow DOM 内行为异常（弹窗不显示或无法关闭）
- 点击弹窗外部的关闭逻辑失效（Shadow DOM 的 `contains()` 检查边界问题）
- TypeScript 报 `@addfox/utils` 的 `defineShadowContentUI` 类型不存在（说明 plan 000 的依赖升级未正确完成）

## Escape hatch

如果 Shadow DOM 中的 `position: fixed` 定位出现兼容性问题：

修改 `app/content/index.ts`，将 `shadowRoot` 换回 `document.body`：
```ts
const shadowRoot = document.body;  // fallback: skip Shadow DOM
```

这样所有后续逻辑不变（`setParent` 和 `setPopupParent` 接收 `document.body`），但失去了样式隔离。

## Maintenance notes

- 如果新增 content script UI 元素（如设置面板、快捷键提示），必须挂载到 `currentParent`（通过 `setParent` 设置的 shadowRoot），不能直接 append 到 `document.body`。
- `position: fixed` 在 Shadow DOM 中的行为是 Web 标准中较新的修复。如果未来遇到旧版浏览器用户报告定位问题，可考虑 iframe 方案（`@addfox/utils` 的 `defineIframeContentUI`）作为替代。
- SVG clip-path `url(#llm-squircle)` 现在在 Shadow DOM 内，因为 SVG 和引用它的元素都在同一个 shadow root 中，引用可以正确解析。如果未来将 SVG 移出 shadow root，clip-path 引用会断裂。
