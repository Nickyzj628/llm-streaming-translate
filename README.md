# 流式划词翻译

> 本项目全程通过Vibe Coding实现，人工部分只有README和代码审查，请谨慎使用

一个基于大模型的划词翻译插件，特点有几个：

1. **流式+分块**地把原文替换成译文
2. 最低兼容Q4量化+2B参数量的**小模型**
3. 支持在翻译失误的位置**断点重试**
3. 支持Chrome和Firefox（Manifest V3）

# DEMO
![演示动画](./demo.gif)

图中为使用本地Hy-MT2-1.8B-Q4_K_M模型进行划词翻译的效果
## 安装方式

### Firefox

[点我直达插件页](https://addons.mozilla.org/zh-CN/firefox/addon/llm-streaming-translator/)

### Chrome

由于成为开发者需要支付5刀乐，本人家境贫寒，故无法提供提供Google Chrome应用商店的插件下载地址

但是可以在本仓库的[发布页](https://github.com/Nickyzj628/llm-streaming-translate/releases)下到插件压缩包，解压后在 chrome://extensions/ 点击“加载已解压的扩展程序”（需先开启右上角的开发者模式）完成安装
