# Implementation Plans

由 improve skill 于 2026-06-19 生成，针对 commit `9584456`。按下表顺序执行，除非依赖关系另有说明。每位执行者：在执行前完整阅读计划文件，遵守其中的 STOP 条件，完成后更新对应行的状态。

## 执行顺序与状态

| Plan | 标题 | 优先级 | 工作量 | 依赖 | 状态 |
|------|------|--------|--------|------|------|
| 000 | 依赖升级 + 修复 rimraf 缺失 | P0 | M | — | TODO |
| 001 | 建立验证基线（typecheck + Biome） | P1 | M | 000 | TODO |
| 002 | API Key 安全加固（导出提示 + 日志审查） | P1 | S | 001 | TODO |
| 003 | 端口生命周期修复 + fetchModels 魔术值修复 | P2 | S | 001 | TODO |
| 004 | Content Script Shadow DOM 隔离 | P2 | M | 000, 001 | TODO |

状态值：TODO | IN PROGRESS | DONE | BLOCKED（附一行原因）| REJECTED（附一行理由）

## 依赖关系图

```
000（依赖升级）
 ├─→ 001（验证基线）
 │    ├─→ 002（API Key 安全）
 │    └─→ 003（端口 + 魔术值）
 └─→ 004（Shadow DOM，需要 000 升级的 @addfox/utils 和 001 的验证基线）
```

## 依赖说明

- **001 依赖 000**：typecheck 和 lint 必须在依赖版本确定后进行，否则可能因版本不匹配导致误报或漏报。
- **002 依赖 001**：修改 `App.tsx` 和 `StreamTranslator.ts` 后必须有 typecheck + lint 验证修改未引入错误。
- **003 依赖 001**：同上，修改 `content/index.ts` 和 `App.tsx` 后需要验证基线。
- **004 依赖 000 + 001**：需要 `@addfox/utils@0.2.4` 提供的 `defineShadowContentUI` API（000 升级），且修改后需要 typecheck + lint 验证（001 基线）。
- **002、003 相互独立**，可在 001 完成后并行执行。
- **004 与 002、003 相互独立**。

## 已考虑并拒绝的发现

- **测试翻译消息类型完善（原发现 #5）**：用户明确表示将手动验收，无需针对此项编写计划。
- **建立单元测试**：用户明确表示将手动验收，无需编写测试计划。
- **`host_permissions` 配置项**：在 Chrome MV3 和 Firefox MV3 中，`fetch()` 不需要 `host_permissions`。当前 `addfox.config.ts` 中已正确使用 `optional_host_permissions`。
- **`defaultStorage.targetLang: 'Chinese'` vs 中文 UI**：这是产品设计选择（目标语言默认英语，但 UI 面向中文用户），不构成 bug。
- **类型错误 `typescript@6.0.3`**：经验证，TypeScript 6.0.3 确实存在于 npm registry（2026 年发布），非拼写错误。
