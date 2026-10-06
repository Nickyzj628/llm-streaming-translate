---
version: "alpha"
name: "Minimal & Direct"
description: "浏览器扩展设置页（options）的设计规范：单列居中、大量留白、无装饰。"
colors:
  primary: "#171717"
  secondary: "#666666"
  tertiary: "#0066ff"
  success: "#0070f3"
  danger: "#ff5b4f"
  neutral: "#ffffff"
typography:
  h1:
    fontFamily: System UI stack
    fontSize: clamp(2rem, 5vw, 2.5rem)
    fontWeight: 700
  body:
    fontFamily: System UI stack
    fontSize: 1rem
    fontWeight: 400
  label:
    fontFamily: System UI stack
    fontSize: 0.875rem
    fontWeight: 500
  small:
    fontFamily: System UI stack
    fontSize: 0.875rem
    fontWeight: 400
---

## 适用范围

只管 `app/options/` 设置页——项目里唯一的 HTML 界面。content 端的浮动按钮是独立的
Shadow DOM UI（内联样式，随宿主页面混排），不走这套 token；background 没有界面。

颜色/间距/圆角/字体一律从 `app/styles/variables.css` 的 CSS 变量取，组件里不写死色值。

## 设计取向

三条规矩，都来自这套风格的核心：去掉东西比加上东西难。

1. 单列居中：正文最大宽度 640px，两侧留白 `clamp(3rem, 8vw, 6rem) 1.5rem`。
2. 大量留白：区块间距 24px 起跳，标题与表单之间 32px。
3. 无装饰：不加阴影层级、不做位移/缩放的 hover 动画、不用渐变色块与图标装饰。

## Colors

| 变量 | 值 | 用途 |
|---|---|---|
| `--black` / `--primary` | `#171717` | 正文文字、主按钮底色（不用纯黑） |
| `--grey` | `#666666` | 标签、提示文案等次要文字 |
| `--greyLight` | `#888888` | 输入框 placeholder |
| `--tertiary` | `#0066ff` | 唯一强调色：focus ring |
| `--success` | `#0070f3` | Toast 成功态底色 |
| `--danger` | `#ff5b4f` | Toast 失败态底色 |
| `--white` / `--bg` | `#ffffff` | 页面与控件底色 |
| `--bgSubtle` | `#fafafa` | 次要按钮的 hover/active 底色 |

边框统一用 `1px solid rgba(0, 0, 0, 0.12)`（不单列变量）。

## Typography

- 正文与界面一律系统字体栈（`--fontFamily`），不加载 web font。
- 标题：`clamp(2rem, 5vw, 2.5rem)`、700、`letter-spacing: -0.03em`。
- 正文 16px/400，标签 14px/500（`--grey`），提示文案 14px/400（`--grey`）。
- 中文与拉丁混排时字距统一收 `-0.01em`。

## Layout

- `body` 用 flex 水平居中，`min-height: 100vh`，页面级内边距 `clamp(3rem, 8vw, 6rem) 1.5rem`。
- 容器 `.options` 宽 100%、`max-width: 640px`；不设栅格，永远单列。
- 表单区 `.form` 下边距 32px；每个 `.section` 下边距 24px，最后一个 32px。
- 次要说明用 `.hint` 挂在控件下方 8px 处。
- 页面没有响应式断点：单列布局在窄屏自然成立，只靠 `clamp()` 缩放字号与留白。

## Elevation & Depth

**不用阴影表达层级。** 唯一的例外是 Toast——它是盖在页面上的浮层，用
`0 2px 8px rgba(0, 0, 0, 0.08)`；Combobox 候选列表这类浮层只用 1px 边框加白底区分。

`variables.css` 里定义了 `--shadowBorder` / `--shadowAmbient` / `--shadowElevated` /
`--shadowFocus` 四个"以阴影当边框"的 token，但当前**没有任何使用点**——留着给以后真需要
层级时用，不算本规范的一部分。

## Shapes

- 控件圆角统一 8px（`--radiusMd`）。
- 小圆角(6px)与大圆角(12px)两个 token 目前也没使用点。

## Components

### Input / Textarea / Select

- 1px 边框、圆角 8px、内边距 `12px 14px`、白底 `#171717` 字。
- `<select>` 隐藏原生箭头，右侧自绘 chevron（内联 SVG，`--grey` 描边）。
- `<textarea>` 允许 `resize: vertical`，其余控件尺寸固定。
- **唯一的交互反馈**：`:focus-visible` 时 `outline: 2px solid var(--tertiary); outline-offset: 2px`。
  没有边框变色、没有过渡动画。

### Button

- `primary`：黑底白字，hover 底色变暗 8%、active 12%（`color-mix`），无位移、无外发光。
- `secondary`：白底 + 1px 边框，hover/active 换 `--bgSubtle`。
- 尺寸：`small` `8px 12px` / 13px，`medium` `10px 16px` / 14px，`large` `12px 24px` / 14px。
- 键盘反馈同样只有 focus ring；按钮内文字禁止换行。

### Combobox（模型选择）

- 输入框规格同 Input，右侧留 40px 给展开箭头；箭头 32px 见方、透明底、`--grey` 图标。
- 候选列表绝对定位在输入框下方 4px，白底 + 1px 边框，最高 240px，超出滚动。
- 展开/收起不做淡入动画；hover 与键盘高亮统一用 `--bg` 底。
- 允许手动输入不与候选匹配的模型名（没有 `/models` 接口的供应商）。

### Toast

- 固定在视口顶部居中（`top: 20px`），白字，内边距 `12px 24px`，圆角 8px。
- 成功态 `--success`，失败态 `--danger`；自动消失，不做入场动画。

## Do's and Don'ts

- 只用 `variables.css` 里的 token，别在组件里硬编码色值。
- 交互反馈只保留 focus ring（2px accent + offset 2px）。
- hover / active 只改背景色或文字色，不做位移、缩放、外发光。
- 不用纯黑 `#000000`（用 `--black`）、不用渐变、不用装饰性图标。
- 浮层用 1px 边框加白底区分，不引入卡片阴影层级。
- 不做多列布局，不加响应式断点（`clamp()` 已覆盖缩放需求）。
