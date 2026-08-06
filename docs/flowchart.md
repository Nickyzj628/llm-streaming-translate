# LLM Streaming Translator 业务流程图（Mermaid）

> 使用 Mermaid 语法描述核心业务「划词 → 翻译 → 原地替换」的协作流程。
> 在支持 Mermaid 的编辑器或 GitHub/GitLab 中可直接渲染。
> 技术与协议细节（行对齐协议、端口消息、存储 schema、权限、入口文件）见 AGENTS.md「架构要点 / 最容易踩的坑」。

---

## 1. 整体业务流程图（面向项目干系人）

```mermaid
flowchart TB
    subgraph User["用户"]
        U1[划选文本]
        U2[点击翻译按钮]
    end

    subgraph Content["页面内脚本"]
        C1[监听划词]
        C2[弹出翻译按钮]
        C3[整理待翻译文本<br/>并保留页面原文]
        C4[上报翻译请求]
        C5[边接收译文<br/>边逐段实时显示]
        C6[完成原地替换<br/>页面不留痕迹]
    end

    subgraph Background["后台脚本"]
        B1[接收翻译请求]
        B2[读取已保存的设置]
        B3[检查设置是否齐全]
        B4[调用 AI 接口翻译]
        B5[转发译文结果]
    end

    U1 --> C1
    C1 --> C2
    U2 --> C3
    C3 --> C4
    C4 --> B1
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> B5
    B5 --> C5
    C5 --> C6
```

---

## 2. 划词翻译时序图（content / background 分工）

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant C as content（页面脚本）
    participant B as background（后台脚本）
    participant LLM as AI 翻译接口

    Note over C: 页面侧（content）
    U->>C: 划选文本<br/>监听 mouseup / selectionchange<br/>content/index.ts
    C->>C: 弹出浮动翻译按钮<br/>show(x, y)<br/>content/FloatingButton.ts
    U->>C: 点击翻译按钮<br/>onClick → startTranslate<br/>content/FloatingButton.ts / index.ts
    C->>C: 提取选区文本节点并包锚点<br/>createInlineTranslator(range, shadowRoot)<br/>content/InlineTranslator.ts
    C->>C: 生成待翻译文本（每段一个节点，¶ 分隔）<br/>getText()<br/>content/InlineTranslator.ts
    C->>B: 建立连接并发送文本<br/>runtime.connect("stream-translate") + START<br/>content/index.ts

    Note over B: 后台侧（background）
    B->>B: 接收 START，分派翻译<br/>onConnect → streamTranslateOverPort<br/>background/index.ts / StreamTranslator.ts
    B->>B: 读取已保存的设置<br/>getStorage()<br/>utils/storage.ts
    B->>B: 校验 baseUrl / model / body<br/>StreamTranslator.ts
    B->>LLM: 流式请求翻译<br/>chatCompletions(stream: true)<br/>StreamTranslator.ts

    loop 流式返回
        LLM-->>B: 返回译文片段
        B-->>C: 转发译文片段 CHUNK<br/>port.postMessage<br/>StreamTranslator.ts
        C->>C: 按段切分，逐段写回锚点<br/>appendChunk()<br/>content/InlineTranslator.ts
    end

    LLM-->>B: 流结束
    B-->>C: 发送完成通知 DONE<br/>StreamTranslator.ts
    C->>C: 尽力对齐 + 恢复原文结构 + 切样式<br/>finish()<br/>content/InlineTranslator.ts
```

---

## 3. 组件依赖关系图

```mermaid
flowchart TB
    subgraph Shared["共享模块"]
        TM[messages.ts]
        TS[types/storage.ts]
        PR[utils/protocol.ts]
    end

    subgraph Background["background"]
        BI[background/index.ts] --> ST[StreamTranslator.ts]
    end

    subgraph Content["content"]
        CI[content/index.ts] --> FB[FloatingButton.ts]
        CI --> IT[InlineTranslator.ts]
    end

    subgraph Options["options"]
        OI[options/index.tsx] --> OA[App.tsx]
    end

    Background --> Shared
    Content --> Shared
    Options --> Shared
```