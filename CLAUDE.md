# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 **SolidJS + TypeScript + WXT** 的跨浏览器 Web 扩展（Chrome / Firefox）项目，使用 Manifest V3（Chrome）/ Manifest V2（Firefox）。

**功能**：网页划词翻译扩展。用户在网页上选中文本后，会出现一个浮动翻译按钮，点击后通过 LLM API 进行流式翻译，结果以浮窗形式显示在页面上。

**工具链**：

- 包管理器：**pnpm**
- 构建框架：**WXT** 0.20.x（基于 Vite）
- 代码检查：**Biome** 2.x（同时处理 lint 和 format）
- 已移除 `eslint.config.mjs`、PostCSS、Popup 页面
- 没有配置测试框架

## 常用命令

```bash
# 开发模式（带 HMR 和自动重载）
pnpm dev           # 默认浏览器（Chrome）
pnpm dev:chrome    # Chrome 扩展开发模式
pnpm dev:firefox   # Firefox 扩展开发模式

# 生产构建
pnpm build:chrome   # 构建 Chrome 扩展，输出到 extension/chrome-mv3/
pnpm build:firefox  # 构建 Firefox 扩展，输出到 extension/firefox-mv2/
pnpm build          # 默认构建（Chrome）

# ZIP 打包（用于应用商店提交）
pnpm zip            # 打包为 extension/*.zip

# 代码检查
pnpm lint           # Biome 检查（lint + format）
pnpm lint:fix       # Biome 自动修复
```

### 加载扩展进行调试

- **Chrome**：访问 `chrome://extensions`，开启开发者模式，点击"加载已解压的扩展程序"，选择 `extension/chrome-mv3-dev`（开发）或 `extension/chrome-mv3`（生产）
- **Firefox**：访问 `about:debugging`，选择"此 Firefox"，点击"临时加载附加组件"，选择 `extension/firefox-mv2/manifest.json`

## 构建系统架构（WXT）

### 入口文件约定

WXT 基于文件约定自动发现入口：

| 入口 | 路径 | 说明 |
|------|------|------|
| Background | `entrypoints/background.ts` | 后台脚本（Chrome Service Worker / Firefox Background Script） |
| Content Script | `entrypoints/content.ts` | 注入到网页的脚本 |
| Options | `entrypoints/options/index.html` | 扩展设置页面（配置 API、模型、Key 等） |

入口文件必须使用 WXT 的导出函数：

```typescript
// background.ts
export default defineBackground(() => { ... });

// content.ts
export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  main() { ... }
});
```

### 目录结构

```
src/
  entrypoints/            # WXT 入口文件（background.ts / content.ts / options/）
  background/
    StreamTranslator.ts   # 流式翻译核心逻辑（调用 API、解析 SSE）
  content-script/
    FloatingButton.ts     # 浮动翻译按钮（超椭圆形状 SVG）
    TranslatePopup.ts     # 翻译结果浮窗（使用 Popover API，带自动定位）
  options/
    Options.tsx           # 设置页面主组件
  components/             # 共享 SolidJS 组件（含 SCSS Modules），default export 供 auto-import
  hooks/                  # SolidJS 响应式 hooks（auto-import 扫描）
  styles/                 # 全局 SCSS 变量和重置样式
  types/                  # TypeScript 类型定义
  utils/                  # 工具函数（storage 封装等，auto-import 扫描）
public/                   # 静态资源（图标等，直接复制到输出目录）
```

### 路径别名

- `@/` → `src/` 目录

### Auto-imports

WXT 通过 `unimport` 自动扫描 `src/components/`、`src/hooks/`、`src/utils/` 目录。组件、hooks 和工具函数使用 **default export** 时无需手动 `import` 即可直接使用（类型提示由 `.wxt/types/imports.d.ts` 提供）。目前项目已启用此机制，组件均改为 default export。

### Manifest 配置

Manifest 完全由 WXT 自动生成，配置在 [`wxt.config.ts`](wxt.config.ts) 的 `manifest` 字段中。WXT 会自动处理 Chrome/Firefox 差异：

- Chrome：生成 MV3（`service_worker`、`action`、`host_permissions`）
- Firefox：生成 MV2（`scripts`、`browser_action`、`permissions` 包含 host）

**注意**：`browser_specific_settings`（Firefox 扩展 ID）通过 wxt.config.ts 配置，但会通过 `build:manifestGenerated` hook 在 Chrome 构建时自动移除，避免 Chrome 报未知字段警告。

### WXT 配置要点

```typescript
// wxt.config.ts
export default defineConfig({
  srcDir: 'src',
  manifest: { /* ... */ },
  vite: () => ({
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
  }),
});
```

## 扩展运行时架构

### 整体交互流程

```
用户选中文本 ──► ContentScript 显示浮动按钮 ──► 点击按钮
                                                    │
                    翻译结果浮窗 ◄──CHUNK/DONE/ERROR─┤
                         ▲                          │
                         │      START (via Port)    ▼
                    ContentScript ──────────────► Background
                                                  StreamTranslator
                                                    │
                                                    ▼
                                               LLM API (SSE)
```

1. **ContentScript** 监听网页上的 `mouseup` 和 `selectionchange` 事件，检测到文本选中后显示浮动翻译按钮（[`FloatingButton.ts`](src/content-script/FloatingButton.ts)）
2. 用户点击按钮后，ContentScript 创建翻译结果浮窗（[`TranslatePopup.ts`](src/content-script/TranslatePopup.ts)），并通过 `browser.runtime.connect({ name: 'stream-translate' })` 建立长连接 Port
3. **Background** 的 [`StreamTranslator.ts`](src/background/StreamTranslator.ts) 接收 `START` 消息，调用 LLM API（OpenAI 兼容格式，使用 SSE 流式响应），通过 `parse-sse` 库解析事件流，将翻译片段通过 Port 回传
4. ContentScript 接收 `CHUNK` 消息逐字显示，接收 `DONE` 或 `ERROR` 结束翻译
5. 点击扩展图标打开 **Options** 选项页面，用于配置 API Base URL、模型、API Key、自定义请求体等

### 通信模型

扩展的唯一通信通道是**流式翻译的长连接 Port**：

- **ContentScript → Background**：通过 `browser.runtime.connect({ name: 'stream-translate' })` 建立 Port，发送 `START` 消息（含待翻译文本）
- **Background → ContentScript**：通过同一 Port 发送 `CHUNK`（翻译片段）、`DONE`（完成）、`ERROR`（错误）消息
- **Options 页面**：也使用同一 Port 机制进行"测试翻译"，验证配置是否正确

所有消息类型定义在 [`src/types/messages.ts`](src/types/messages.ts) 中。

### 浏览器 API 兼容性

代码使用 `webextension-polyfill` 获取跨浏览器兼容的 `browser` 对象。但有一个例外：

**Firefox MV2 使用 `browser.browserAction`，Chrome MV3 使用 `browser.action`**。`webextension-polyfill` 不会自动做这个映射，需要在代码中手动兼容：

```typescript
// entrypoints/background.ts
const actionApi = browser.action || browser.browserAction;
actionApi?.onClicked?.addListener(() => {
  void browser.runtime.openOptionsPage();
});
```

### 存储层

使用 `browser.storage.local` 进行持久化存储，通过 [`src/utils/storage.ts`](src/utils/storage.ts) 封装：

```typescript
import { getStorage, setStorage, getAllStorage } from '@/utils/storage';

const { baseUrl, model, apiKey, body } = await getStorage(['baseUrl', 'model', 'apiKey', 'body']);
await setStorage({ apiKey: 'new key' });
```

存储 Schema 定义在 [`src/types/storage.ts`](src/types/storage.ts) 中。核心配置字段：

- `baseUrl`：API 端点（默认 `https://api.deepseek.com`）
- `model`：模型名称（默认 `deepseek-chat`）
- `apiKey`：API Key
- `body`：自定义请求体（JSON 字符串，会合并到 `/chat/completions` 请求中）

遗留字段 `username`、`enableLogging`、`visitCount` 仍在 schema 中但已不再使用。

### 样式

使用 **SCSS + CSS Modules**。组件样式文件命名为 `ComponentName.module.scss`，导入后得到一个类名映射对象。全局样式在 [`src/styles/`](src/styles/) 中定义。

全局 CSS reset 已内联至 [`src/styles/_reset.scss`](src/styles/_reset.scss)。

### TypeScript 配置

- `tsconfig.json` 独立配置（已内联原继承配置）
- JSX 转换：`"jsx": "preserve"` + `"jsxImportSource": "solid-js"`（由 `vite-plugin-solid` 编译）
- 模块解析：`"moduleResolution": "bundler"`
- 包含 `src`、`globals.d.ts`

### Biome 配置

使用 Biome 2.x（[`biome.json`](biome.json)）：

- `suspicious/noConsole`：`off`（扩展开发中需要日志）
- `a11y/noSvgWithoutTitle`：`off`
- 引号风格：单引号
- 缩进：2 spaces
- 忽略 `.gitignore` 中的文件，以及 `*.js`、`.wxt/`

**注意**：Biome 的规则集小于 ESLint，缺失的规则包括 `jsx-a11y`、`import-x`、 `@typescript-eslint/no-explicit-any` 等。
