# Plan 002: API Key 安全加固（导出提示 + 日志审查）

> **Executor instructions**: 按步骤顺序执行。每步完成后运行验证命令。遇到 STOP 条件立即停止并报告，不要自行发挥。完成后不要更新 `plans/README.md`。
>
> **Drift check（首先运行）**: `git diff --stat 9584456..HEAD -- app/options/App.tsx app/background/StreamTranslator.ts`
> 如果以上文件自本计划编写后发生变化，对照 "Current state" 摘录对比实时代码；不匹配则视为 STOP 条件。

## Status

- **Priority**: P1
- **Effort**: S（30 分钟）
- **Risk**: LOW（仅增加 toast 提示和清理日志，不改业务逻辑）
- **Depends on**: 计划 001（必须先有 typecheck + lint 基线）
- **Category**: security
- **Planned at**: commit `9584456`, 2026-06-19

## Why this matters

两个小但值得修复的安全问题：

1. **导出配置无安全提示**：用户点击「导出配置」时，`apiKey` 原样写入 JSON 文件并触发浏览器下载，没有任何提示告知用户该文件包含敏感信息。用户可能无意识地分享该文件（发到群聊、上传网盘、提交到 Git 等）。配置导入导出是插件的必要功能，不应移除 API Key，但应明确提示用户妥善保管。

2. **后台日志输出敏感错误信息**：`StreamTranslator.ts` 的 `catch` 块将 API 返回的原始错误消息（`errorMessage`）输出到 `console.error`。如果 API 端点在 401/403 响应体中间接包含密钥信息（某些代理/网关可能回显请求头），密钥会出现在浏览器控制台中。

## Current state

### 导出函数：`app/options/App.tsx:194–202`

```ts
const handleExport = async (): Promise<void> => {
  const data = await getAllStorage();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `llm-translate-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

当前 `handleExport` 没有任何用户提示。

### 后台日志：`app/background/StreamTranslator.ts:75–78`

```ts
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error("[LLM Streaming Translator BG] 翻译失败：", errorMessage);
  port.postMessage({ type: "ERROR", error: errorMessage });
}
```

`console.error` 的第二个参数直接拼接了 API 返回的错误详情。

### 项目约定参考

- `App.tsx` 中已有的 toast 调用模式：
  ```ts
  showToast('设置已保存', 'success');          // 成功提示
  showToast('请先填写 API Base URL', 'error');  // 错误提示
  ```
  Toast 会显示 3 秒后自动消失（见 `app/hooks/useToast.ts`）。
- `showToast` 已在 `App` 组件中通过 `useToast()` hook 获得，可直接使用。

## Commands you will need

| 用途 | 命令 | 预期成功 |
|------|------|----------|
| 类型检查 | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 构建 | `pnpm build` | exit 0 |

## Scope

**In scope**：
- `app/options/App.tsx` — 在 `handleExport` 中增加 toast 安全提示
- `app/background/StreamTranslator.ts` — 移除 `console.error` 中的 `errorMessage` 拼接

**Out of scope**：
- 导入逻辑 — 导出格式不变，导入逻辑无需修改
- `browser.storage.local` 加密 — 浏览器扩展 storage 已有隔离，超出本计划范围
- 导出内容脱敏 — 用户明确要求保留 API Key 在导出文件中的完整功能
- 其他 `console.log` 调用 — 仅处理 `StreamTranslator.ts` 中可能泄露敏感信息的一处

## Steps

### Step 1: 导出时增加 toast 安全提示

编辑 `app/options/App.tsx`，找到 `handleExport` 函数（约第 194 行），在 `URL.revokeObjectURL(url)` 之后、函数结束之前添加一行 toast 提示：

```ts
const handleExport = async (): Promise<void> => {
  const data = await getAllStorage();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `llm-translate-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('配置已导出，文件包含 API Key，请妥善保存勿分享', 'success');
};
```

**变更说明**：仅新增一行 `showToast` 调用，不改动任何导出逻辑。导出文件内容不变（包含完整 apiKey）。

**Verify**: `pnpm typecheck` → exit 0

### Step 2: 清理后台错误日志

编辑 `app/background/StreamTranslator.ts`，找到 catch 块（约第 75 行）。

当前代码：
```ts
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error("[LLM Streaming Translator BG] 翻译失败：", errorMessage);
  port.postMessage({ type: "ERROR", error: errorMessage });
}
```

修改为：保留日志标识便于定位问题来源，但移除可能包含敏感数据的错误详情：

```ts
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error("[LLM Streaming Translator BG] 翻译失败");
  port.postMessage({ type: "ERROR", error: errorMessage });
}
```

**关键**：`port.postMessage` 仍发送完整 `errorMessage` 给前端（用户需要看到错误原因），只清理了 `console.error` 的输出。

**Verify**: `pnpm lint` → exit 0

### Step 3: 最终验证

```bash
pnpm typecheck   # exit 0
pnpm lint        # exit 0
pnpm build       # exit 0
```

## Test plan

- 手动测试导出：打开选项页，点击「导出配置」。确认：
  - 文件正常下载
  - 页面顶部出现 toast："配置已导出，文件包含 API Key，请妥善保存勿分享"
- 手动测试导出文件内容：打开下载的 JSON，确认 `apiKey` 字段仍包含真实密钥值
- 手动测试导入：用导出的文件点击「导入配置」，确认所有字段（包括 apiKey）正常恢复
- 手动测试翻译错误：模拟一个错误的 API 配置发起翻译，确认：
  - 弹窗仍显示具体错误信息（用户体验不受影响）
  - 浏览器 Console 中不再出现详细的 `errorMessage`（仅显示 `[LLM Streaming Translator BG] 翻译失败`）

## Done criteria

- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint` exit 0
- [ ] `pnpm build` exit 0
- [ ] 导出后显示 toast 提示（含"API Key"和"妥善保存"关键词）
- [ ] 导出文件内容不变（apiKey 完整保留）
- [ ] 导入导出的文件功能正常
- [ ] `StreamTranslator.ts` 的 `console.error` 不再拼接 `errorMessage`
- [ ] 仅 `app/options/App.tsx` 和 `app/background/StreamTranslator.ts` 被修改

## STOP conditions

- `pnpm typecheck` 报错（如果 001 计划完成后 typecheck 是通过的）
- 导出功能异常（文件无法下载或内容为空）

## Maintenance notes

- 如果未来选项页支持多语言（i18n），toast 文本需要纳入翻译表。
- 如果用户反馈需要"不再提示"选项，可以在 storage 中增加 `exportWarningDismissed` 字段，但不在本计划范围。
- `console.error` 的详细错误信息对调试有价值，未来可考虑通过 storage 配置 debug 模式开关来控制日志详细程度。
