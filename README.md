# LLM Streaming Translator

基于大语言模型的网页划词翻译浏览器扩展。在网页上选中文本后，点击浮动按钮即可通过 LLM API 获得流式翻译结果。

## 功能

- 网页划词翻译：选中文本后显示浮动翻译按钮
- 流式响应：翻译结果逐字显示，无需等待完整响应
- 支持多种 LLM：通过 OpenAI 兼容 API 调用任意模型
- 自定义请求体：可添加 temperature、system prompt 等参数
- 配置导入导出：便于备份和迁移设置

## 技术栈

- **框架**: [WXT](https://wxt.dev/) + [SolidJS](https://www.solidjs.com/)
- **语言**: TypeScript
- **样式**: SCSS + CSS Modules
- **代码检查**: Biome

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev:chrome
pnpm dev:firefox

# 生产构建
pnpm build:chrome
pnpm build:firefox

# ZIP 打包
pnpm zip
```

## 加载扩展

- **Chrome**: 访问 `chrome://extensions`，开启开发者模式，点击"加载已解压的扩展程序"，选择 `extension/chrome-mv3-dev`（开发）或 `extension/chrome-mv3`（生产）
- **Firefox**: 访问 `about:debugging`，选择"此 Firefox"，点击"临时加载附加组件"，选择 `extension/firefox-mv2/manifest.json`

## 项目结构

```
src/
  entrypoints/         # WXT 入口文件
    background.ts      # 后台脚本
    content.ts         # 内容脚本
    options/           # 设置页面
  background/
    StreamTranslator.ts # 流式翻译核心逻辑
  content-script/
    FloatingButton.ts   # 浮动翻译按钮
    TranslatePopup.ts   # 翻译结果浮窗
  options/
    Options.tsx         # 设置页面组件
  components/           # 共享组件（default export，支持 auto-import）
  hooks/                # SolidJS 响应式 hooks（支持 auto-import）
  styles/               # 全局 SCSS 变量
  types/                # TypeScript 类型定义
  utils/                # 工具函数（支持 auto-import）
public/                 # 静态资源
```
