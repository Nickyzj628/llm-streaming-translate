# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 **React 19 + TypeScript + Vite** 的跨浏览器 Web 扩展（Chrome / Firefox）项目，使用 Manifest V3。项目基于 `web-extension-starter` 模板构建。

## 常用命令

```bash
# 开发模式（带 watch）
npm run dev:chrome    # Chrome 扩展开发模式
npm run dev:firefox   # Firefox 扩展开发模式

# 生产构建
npm run build:chrome   # 构建 Chrome 扩展，输出到 extension/chrome/
npm run build:firefox  # 构建 Firefox 扩展，输出到 extension/firefox/
npm run build          # 同时构建所有浏览器版本

# 代码检查
npm run lint           # ESLint 检查
npm run lint:fix       # ESLint 自动修复
```

**注意**：本项目没有配置测试框架。

### 加载扩展进行调试

- **Chrome**：访问 `chrome://extensions`，开启开发者模式，点击"加载已解压的扩展程序"，选择 `extension/chrome` 目录
- **Firefox**：访问 `about:debugging`，选择"此 Firefox"，点击"临时加载附加组件"，选择 `extension/firefox/manifest.json`

## 构建系统架构

### 多入口构建（Vite）

构建配置在 [vite.config.ts](vite.config.ts) 中定义，采用**多入口**策略：

| 入口 | 类型 | 输出格式 | 说明 |
|------|------|----------|------|
| `Popup/popup.html` | HTML 入口 | ES Module | 点击扩展图标弹出的界面 |
| `Options/options.html` | HTML 入口 | ES Module | 扩展设置页面 |
| `Background/index.ts` | TS 入口 | ES Module | Chrome Service Worker / Firefox Background Script |
| `ContentScript/index.ts` | 自定义 IIFE 构建 | IIFE | 注入到网页的脚本 |

**关键区别**：Content Script 通过自定义的 `buildIIFEScripts` 插件单独构建为 **IIFE 格式**（不是 ES Module），因为浏览器通过 manifest 注入 content script 时不支持 ES 模块。Popup 和 Options 是标准 Vite HTML 入口，Background 使用 ES Module（MV3 支持）。

### 路径别名

- `@/` → `source/` 目录
- `~/` → `node_modules/` 目录

### 环境变量

- `__DEV__`：开发模式时为 `true`
- `__TARGET_BROWSER__`：当前目标浏览器（`'chrome'` 或 `'firefox'`）

### 浏览器特定配置

[source/manifest.json](source/manifest.json) 使用 `vite-plugin-wext-manifest` 插件支持浏览器前缀：

- `__chrome__key`：仅 Chrome 生效
- `__firefox__key`：仅 Firefox 生效
- `__chrome\|firefox__key`：两者都生效

例如 Chrome 使用 `service_worker`，Firefox 使用 `scripts` 来配置后台脚本。

## 扩展运行时架构

### 通信模型

扩展的三个主要部分通过消息传递进行通信（使用 `webextension-polyfill`）：

```
Content Script  ──PAGE_VISITED──►  Background Script
       ▲                                ▲
       │ GET_PAGE_INFO                   │ GET_VISIT_COUNT
       │ PAGE_INFO_RESPONSE              │ VISIT_COUNT_RESPONSE
       │                                 │
       └────────────  Popup  ────────────┘
```

- **Popup → Content Script**：通过 `browser.tabs.sendMessage(tabId, ...)` 发送到当前标签页
- **Popup → Background**：通过 `browser.runtime.sendMessage(...)` 发送
- **Content Script → Background**：通过 `browser.runtime.sendMessage(...)` 发送

所有消息类型定义在 [source/types/messages.ts](source/types/messages.ts) 中。

### 存储层

使用 `browser.storage.local` 进行持久化存储，通过 [source/utils/storage.ts](source/utils/storage.ts) 封装：

```typescript
import {getStorage, setStorage} from '@/utils/storage';

// 类型安全的存储接口定义在 source/types/storage.ts
const {username, visitCount} = await getStorage(['username', 'visitCount']);
await setStorage({username: 'new name'});
```

存储 Schema 定义在 [source/types/storage.ts](source/types/storage.ts) 中，所有键都有默认值。

### 目录结构约定

```
source/
  Background/        # 后台脚本（事件驱动，无 DOM 访问权限）
  ContentScript/     # 内容脚本（可访问页面 DOM，通过 manifest 配置注入范围）
  Popup/             # 弹出界面（标准 React 组件，通过 browser.tabs 与内容脚本通信）
  Options/           # 设置页面（标准 React 组件，读写 storage）
  components/        # 共享 React 组件（含 SCSS Modules）
  styles/            # 全局 SCSS 变量和重置样式
  types/             # TypeScript 类型定义（消息类型、存储 Schema）
  utils/             # 工具函数（storage 封装等）
  public/            # 静态资源（图标等，直接复制到输出目录）
```

### 样式

使用 **SCSS + CSS Modules**。组件样式文件命名为 `ComponentName.module.scss`，导入后得到一个类名映射对象。全局样式在 [source/styles/](source/styles/) 中定义。

### TypeScript 配置

- `tsconfig.json` 继承 `@abhijithvijayan/tsconfig`
- JSX 转换：`"jsx": "react-jsx"`（React 19 自动运行时，无需手动导入 React）
- 模块解析：`"moduleResolution": "bundler"`
- 仅包含 `source` 目录

### ESLint 配置

使用 ESLint 9 flat config（[eslint.config.mjs](eslint.config.mjs)），继承 `@abhijithvijayan/eslint-config` 的 node、typescript、react 预设。部分规则已覆盖：

- `no-console`：关闭（扩展开发中需要日志）
- `react/react-in-jsx-scope`：关闭（使用 React 19 自动运行时）
- `react/jsx-props-no-spreading`：关闭
