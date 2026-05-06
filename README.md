# LLM 流式划词翻译

一款基于大语言模型的浏览器扩展，支持在任意网页上划词后一键翻译，译文通过流式响应实时呈现，无需离开当前页面。

支持 Chrome（Manifest V3）和 Firefox（Manifest V2）。

![演示动画](/public/demo.gif)

## 使用方式

1. **划词** — 在网页中选中需要翻译的文本
2. **点击按钮** — 选区旁会浮现翻译图标，点击即可发起翻译
3. **实时查看** — 翻译结果通过流式响应逐字呈现，无需等待整段返回

## 核心特点

- **流式输出**：基于 SSE 实时推送，译文逐字显现，响应迅速
- **不离开当前页**：翻译结果以浮窗形式展示在原文附近，阅读连贯不中断
- **LLM 级翻译质量**：支持任意 OpenAI 兼容格式的 API（如 DeepSeek、OpenAI 等），利用大模型理解上下文，翻译更自然准确
- **完全可配置**：自定义 API 地址、模型名称、API Key，还可附加自定义请求参数
- **配置导入导出**：便于备份和迁移设置

## 配置说明

点击浏览器工具栏上的扩展图标，进入设置页面：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Base URL | 你的 API 端点地址 | `https://api.deepseek.com` |
| 模型 | 模型名称 | `deepseek-chat` |
| API Key | 你的访问密钥 | — |
| 自定义请求体 | 可选，附加到 `/chat/completions` 请求的 JSON 参数 | — |

## 隐私说明

- 扩展仅在你主动点击翻译按钮时，才会将选中的文本发送到你配置的 API
- 所有 API 请求直接由浏览器后台脚本发起，不经过任何第三方中转服务
- 你的 API Key 仅存储在本地浏览器中

---

## 开发

### 技术栈

- [SolidJS](https://www.solidjs.com/) — 响应式 UI 框架
- [TypeScript](https://www.typescriptlang.org/)
- [WXT](https://wxt.dev/) — 基于 Vite 的 Web 扩展构建框架
- [Biome](https://biomejs.dev/) — Lint 和代码格式化
- [SCSS](https://sass-lang.com/) + CSS Modules — 样式方案

### 环境要求

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 默认浏览器（Chrome）
pnpm dev

# Chrome
pnpm dev:chrome

# Firefox
pnpm dev:firefox
```

开发模式下，WXT 会启用 HMR 和自动扩展重载。

### 生产构建

```bash
# 同时构建 Chrome 和 Firefox
pnpm build

# 单独构建
pnpm build:chrome   # 输出到 extension/chrome-mv3/
pnpm build:firefox  # 输出到 extension/firefox-mv2/
```

### ZIP 打包（用于应用商店提交）

```bash
pnpm zip        # 同时打包
pnpm zip:chrome
pnpm zip:firefox
```

### 代码检查

```bash
pnpm lint       # 检查
pnpm lint:fix   # 自动修复
```

### 发布前完整流程

```bash
pnpm prepublish   # lint:fix → lint → build → zip
```

### 加载扩展进行调试

- **Chrome**：访问 `chrome://extensions`，开启开发者模式，点击"加载已解压的扩展程序"，选择 `extension/chrome-mv3-dev`（开发）或 `extension/chrome-mv3`（生产）
- **Firefox**：访问 `about:debugging`，选择"此 Firefox"，点击"临时加载附加组件"，选择 `extension/firefox-mv2/manifest.json`

## 项目结构

```
src/
  entrypoints/            # WXT 入口文件
    background.ts         # 后台脚本
    content.ts            # 内容脚本（注入网页）
    options/              # 设置页面
      index.html
  background/
    StreamTranslator.ts   # 流式翻译核心逻辑
  content-script/
    FloatingButton.ts     # 浮动翻译按钮
    TranslatePopup.ts     # 翻译结果浮窗
  options/
    Options.tsx           # 设置页面组件
  components/             # 共享 SolidJS 组件（default export，支持 auto-import）
  hooks/                  # SolidJS 响应式 hooks（支持 auto-import）
  styles/                 # 全局 SCSS 变量和重置样式
  types/                  # TypeScript 类型定义
  utils/                  # 工具函数（支持 auto-import）
public/                   # 静态资源（图标等，直接复制到输出目录）
```

### 浏览器兼容性

- **Chrome**：Manifest V3（`service_worker`、`action`、`host_permissions`）
- **Firefox**：Manifest V2（`scripts`、`browser_action`、`permissions` 包含 host）

代码使用 `webextension-polyfill` 获取跨浏览器兼容的 `browser` 对象。`browser_specific_settings`（Firefox 扩展 ID）在 Chrome 构建时会自动移除。

## License

[MIT](LICENSE)
