# LLM Streaming Translator 业务流程图（Mermaid）

> 使用 Mermaid 语法描述 options / content / background 三端如何协作完成「划词 → 翻译 → 原地替换」。
> 在支持 Mermaid 的编辑器或 GitHub/GitLab 中可直接渲染。

---

## 1. 整体业务流程图

```mermaid
flowchart TB
    subgraph User["用户"]
        U1[划选文本]
        U2[点击翻译按钮]
    end

    subgraph Content["content 脚本"]
        C1[监听选区]
        C2[显示浮动按钮]
        C3[提取文本并拼接]
        C4[发送 START]
        C5[接收 CHUNK/DONE]
        C6[按 U+2016 切分]
        C7[原地写入 DOM]
    end

    subgraph Background["background"]
        B1[建立端口连接]
        B2[读取存储配置]
        B3[校验配置]
        B4[请求 LLM 流]
        B5[转发 CHUNK/DONE]
    end

    subgraph Options["options 页面"]
        O1[填写配置]
        O2[保存配置]
        O3[拉取模型列表]
        O4[测试翻译]
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
    C6 --> C7
    O1 --> O4
    O2 -.->|background 读取| B2
    O4 -.->|走 stream-translate| B1
```

---

## 2. 划词翻译时序图

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant C as content
    participant FB as FloatingButton
    participant IT as InlineTranslator
    participant B as background
    participant S as storage.local
    participant LLM as LLM API

    U->>C: 划选文本
    C->>FB: show(x, y)
    FB-->>U: 显示翻译按钮

    U->>FB: 点击按钮
    FB->>C: onClick
    C->>IT: createInlineTranslator
    IT-->>C: getText()<br/>seg0‖seg1‖...
    C->>B: connect stream-translate
    C->>B: START

    B->>S: getStorage
    S-->>B: config
    B->>B: 校验配置
    B->>LLM: chatCompletions<br/>stream=true

    loop 流式返回
        LLM-->>B: content
        B->>C: CHUNK
        C->>IT: appendChunk
        IT->>IT: 按 ‖ 切分写节点
    end

    LLM-->>B: 流结束
    B->>C: DONE
    C->>IT: finish
    IT->>IT: flush + 切样式
```

---

## 3. options 页面配置与测试流程

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant O as options
    participant S as storage.local
    participant API as /models
    participant B as background

    U->>O: 打开选项页
    O->>S: getAllStorage
    S-->>O: 回填配置

    alt 选择预设
        U->>O: 选择预设
        O->>O: 填充 baseUrl/model/body
    end

    alt 刷新模型
        U->>O: 点击刷新
        O->>API: GET /models
        API-->>O: ids
        O->>O: setModels
    end

    alt 测试翻译
        U->>O: 点击测试
        O->>B: connect stream-translate
        O->>B: START
        B->>S: getStorage
        B->>API: chatCompletions
        API-->>B: 流式响应
        B->>O: CHUNK/DONE/ERROR
        O->>O: showToast
    end

    U->>O: 点击保存
    O->>S: setStorage
    S-->>O: 完成
    O->>O: showToast 已保存
```

---

## 4. 关键协作说明

### 4.1 分段对齐协议

- **content**：`InlineTranslator.ts` 把选区内每个 `Text` 节点作为一个 segment，用 `‖`（U+2016）拼接。
- **background**：系统提示要求 LLM 输出**相同数量**的 `‖` 分隔符，顺序一致。
- **content**：收到 `CHUNK` 后按 `‖` 切分，逐段写回对应节点。

> ⚠️ 修改 prompt 或 `InlineTranslator.ts` 的分段逻辑必须两端同步，否则译文错位。

### 4.2 端口消息协议

定义见 `app/types/messages.ts`。当前 content 端实际只关心四条：

| 方向 | 类型 | 说明 |
|---|---|---|
| content → background | `START` | 发起翻译 |
| background → content | `CHUNK` | 译文片段 |
| background → content | `DONE` | 流结束 |
| background → content | `ERROR` | 翻译失败 |

> `REASONING` 和 `USAGE` 在原地替换模式下无消费，可考虑从协议中移除或仅保留扩展点。

### 4.3 存储与权限

- **存储**：`browser.storage.local` 只被 **background** 读取；content 只发文本。
- **Schema**：`{ baseUrl, model, apiKey, body, targetLang }`（见 `app/types/storage.ts`）。
- **权限**：manifest 仅声明 `activeTab + storage`；LLM 端点通过 `optional_host_permissions`（http/https）授权访问。

### 4.4 入口文件

| 入口 | 文件 | 职责 |
|---|---|---|
| content | `app/content/index.ts` | 监听划词、显示按钮、发起翻译、原地替换 |
| background | `app/background/index.ts` | 维护端口连接、调度翻译器 |
| options | `app/options/index.tsx` | 配置界面、测试、导入导出 |

---

## 5. 组件依赖关系图

```mermaid
flowchart LR
    subgraph Content
        CI[content/index.ts]
        FB[FloatingButton.ts]
        IT[InlineTranslator.ts]
    end

    subgraph Background
        BI[background/index.ts]
        ST[StreamTranslator.ts]
    end

    subgraph Options
        OI[options/index.tsx]
        OA[options/App.tsx]
    end

    subgraph Shared["共享模块"]
        TM[messages.ts]
        TS[storage.ts]
        US[storage.ts]
    end

    CI --> FB
    CI --> IT
    CI --> TM
    BI --> ST
    BI --> TM
    ST --> TS
    ST --> US
    OA --> US
    OA --> TM
    OI --> OA
```
