# Plan 000: 依赖升级 + 修复 rimraf 缺失

> **Executor instructions**: 按步骤顺序执行。每步完成后运行验证命令。遇到 STOP 条件立即停止并报告，不要自行发挥。完成后不要更新 `plans/README.md`（由审核者维护）。
>
> **Drift check（首先运行）**: `git diff --stat 9584456..HEAD -- package.json addfox.config.ts tsconfig.json`
> 如果以上任何文件自本计划编写后发生了变化，对照 "Current state" 摘录对比实时代码；不匹配则视为 STOP 条件。

## Status

- **Priority**: P0（阻塞所有后续计划）
- **Effort**: M（半天，包含排查兼容性问题）
- **Risk**: MED（`@rsbuild/plugin-babel@2.0.0` 可能与 `addfox` 内置的 `@rsbuild/core` 版本不兼容；TS 6 可能引入新严格检查）
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `9584456`, 2026-06-19

## Why this matters

项目已 1 个月未维护，所有依赖均有新版本。关键依赖 `addfox` 从 0.1.1 跳到 0.2.4、「你写的 `@nickyzj2023/utils` 从 1.0.71 到 1.0.75 有 `fetcher`/`chatCompletions` 的完善和优化」。此外 `rimraf` 在构建脚本中使用但未声明在依赖中，全新 `pnpm install` 后 `pnpm build` 会直接崩溃。此计划是项目"地基"，必须优先完成。

## Current state

- **`package.json`** — 依赖版本和构建脚本
  ```json
  // package.json (lines 1-10, 12-20)
  {
    "name": "llm-streaming-translator",
    "version": "1.1.1",
    "private": true,
    "type": "module",
    "scripts": {
      "dev": "addfox dev --no-open --cache",
      "build": "rimraf .addfox/extension/ && addfox build --browser firefox --no-open && addfox build --browser chrome --no-open"
    },
    "dependencies": {
      "@addfox/utils": "^0.1.1",
      "@nickyzj2023/utils": "^1.0.71",
      "solid-js": "^1.9.13",
      "webextension-polyfill": "^0.12.0"
    },
    "devDependencies": {
      "@rsbuild/plugin-babel": "^1.1.2",
      "@rsbuild/plugin-sass": "^1.5.2",
      "@rsbuild/plugin-solid": "^1.2.0",
      "@types/chrome": "^0.1.42",
      "@types/webextension-polyfill": "^0.12.5",
      "addfox": "^0.1.1",
      "sass": "^1.99.0",
      "typescript": "^6.0.3"
    }
  }
  ```
  - 注意：`rimraf` 出现在 `build` 脚本（第 6 行），但不在 `devDependencies` 或 `dependencies` 中。

- **`pnpm outdated --json` 输出摘要**（运行日期 2026-06-19）：

  | 包 | 当前 | 最新 | 注意 |
  |---|---|---|---|
  | `@nickyzj2023/utils` | 1.0.71 | 1.0.75 | 补丁升级 |
  | `addfox` (dev) | 0.1.1 | 0.2.4 | 版本跳跃大 |
  | `@addfox/utils` | 0.1.1 | 0.2.4 | 版本跳跃大 |
  | `@rsbuild/plugin-babel` (dev) | 1.1.2 | 2.0.0 | ⚠️ Major，peerDep `@rsbuild/core@^2.0.0` |
  | `typescript` (dev) | 5.9.3 | 6.0.3 | ⚠️ Major |
  | `solid-js` | 1.9.12 | 1.9.13 | patch |
  | `@rsbuild/plugin-solid` (dev) | 1.2.0 | 1.2.2 | patch |
  | `@rsbuild/plugin-sass` (dev) | 1.5.2 | 1.5.3 | patch |
  | `sass` (dev) | 1.99.0 | 1.101.0 | minor |
  | `@types/chrome` (dev) | 0.1.42 | 0.1.43 | patch |

- **`@nickyzj2023/utils` v1.0.71 → v1.0.75 API 对比**（通过下载最新 tarball 的 `index.d.mts` 与当前 `node_modules` 对比）：
  - `chatCompletions`：签名、`StreamChunk` 类型（`reasoningContent`/`content`/`usage`）完全相同。向后兼容。
  - `fetcher`：签名不变。
  - `to`：签名不变。
  - 破坏性变更：`log()` 重命名为 `logger()` — 但项目代码**未使用此 API**，无影响。
  - **结论**：`@nickyzj2023/utils` 升级不需要代码改动。

- **`addfox.config.ts`** 当前内容（完整）在项目根目录，`tsconfig.json` 在项目根目录。升级后需确认构建仍通过。

- **项目约定**：使用 pnpm 作为包管理器。`pnpm-workspace.yaml` 存在。构建命令：`pnpm build`。无 CI 配置。

## Commands you will need

| 用途 | 命令 | 预期成功 |
|------|------|----------|
| 安装依赖 | `pnpm install` | exit 0，无 ERESOLVE 错误 |
| 类型检查 | `npx tsc --noEmit` | exit 0，无类型错误 |
| 构建 | `pnpm build` | exit 0，输出 `.addfox/extension/extension-chromium/` 和 `.addfox/extension/extension-firefox/` 存在 |
| 查看过期依赖 | `pnpm outdated` | 仅剩 `@rsbuild/plugin-babel`（如果被回退）或全部 up-to-date |

## Scope

**In scope**（允许修改的文件）：
- `package.json` — 更新版本号、添加 `rimraf`
- `pnpm-lock.yaml` — pnpm install 自动更新
- `addfox.config.ts` — 仅当 `addfox@0.2.4` 的 API 变化需要适配时才修改
- `tsconfig.json` — 仅当 TS 6 的新选项需要调整时才修改

**Out of scope**（不要碰）：
- 任何 `app/` 下的源代码 — 这是功能代码，依赖升级不应该要求改动（除非类型检查报错，此时需在 STOP 条件中报告）
- `CLAUDE.md`、`README.md`、`skills-lock.json`
- `public/` 目录

## Steps

### Step 0: 记录当前状态

```bash
git status
pnpm --version
node --version
```

记录输出，出现问题时用于回溯。

### Step 1: 添加 rimraf 依赖

编辑 `package.json`，在 `devDependencies` 中添加：

```json
"rimraf": "^5.0.0"
```

（rimraf 5.x 支持 ESM，与项目 `"type": "module"` 兼容。）

**Verify**: `pnpm install` → exit 0

### Step 2: 升级非破坏性依赖

修改 `package.json` 中以下版本号（只改数字，保留 `^` 前缀）：

| 字段 | 旧值 | 新值 |
|------|------|------|
| `dependencies["@nickyzj2023/utils"]` | `^1.0.71` | `^1.0.75` |
| `dependencies["solid-js"]` | `^1.9.13` | `^1.9.13`（不变，已最新） |
| `dependencies["@addfox/utils"]` | `^0.1.1` | `^0.2.4` |
| `devDependencies["addfox"]` | `^0.1.1` | `^0.2.4` |
| `devDependencies["@rsbuild/plugin-solid"]` | `^1.2.0` | `^1.2.2` |
| `devDependencies["@rsbuild/plugin-sass"]` | `^1.5.2` | `^1.5.3` |
| `devDependencies["sass"]` | `^1.99.0` | `^1.101.0` |
| `devDependencies["@types/chrome"]` | `^0.1.42` | `^0.1.43` |
| `devDependencies["typescript"]` | `^6.0.3` | `^6.0.3`（不变，已最新） |

**不要改** `@rsbuild/plugin-babel` 和 `webextension-polyfill`（它们保持不变，后续步骤单独处理）。

**Verify**: `pnpm install` → exit 0，无 peer dependency 警告

### Step 3: 验证当前构建

```bash
pnpm build
```

**预期**：构建成功（exit 0），输出目录存在：
- `.addfox/extension/extension-chromium/`
- `.addfox/extension/extension-firefox/`

如果构建失败，检查错误信息。最常见原因：
- `addfox@0.2.4` 配置格式变更 → 查看 `addfox.config.ts` 是否需要适配
- 类型错误 → 运行 `npx tsc --noEmit` 定位

→ 如果 `addfox` 的 API 变了，查看 `node_modules/addfox/README.md` 或运行 `npx addfox --help` 了解新用法，然后适配 `addfox.config.ts`。

→ **STOP 条件**：如果 `addfox@0.2.4` 要求的变更超过修改 `addfox.config.ts` 的 10 行代码（如需要重写整个配置文件），停止并报告。

### Step 4: 尝试升级 @rsbuild/plugin-babel 到 2.0.0

修改 `package.json`：
```json
"@rsbuild/plugin-babel": "^2.0.0"
```

运行 `pnpm install`。

→ **如果 `pnpm install` 成功**：运行 `pnpm build`。如果构建成功，保留 v2.0.0。

→ **如果 `pnpm install` 报告 peer dependency 冲突**（`@rsbuild/core` 版本不匹配）：回退 `@rsbuild/plugin-babel` 到 `^1.1.2`，运行 `pnpm install`。这是预期行为——`addfox@0.2.4` 内置的 `@rsbuild/core` 可能尚未支持 2.x 的 babel 插件。

→ **如果 `pnpm build` 因 babel 插件报错**：同样回退到 `^1.1.2`。

回退后，在 `package.json` 中该依赖旁边加一行注释：
```json
"@rsbuild/plugin-babel": "^1.1.2",  // hold: v2 requires @rsbuild/core@^2.0.0
```

### Step 5: 最终验证

```bash
pnpm install   # 确认 lockfile 干净
npx tsc --noEmit   # 类型检查
pnpm build    # 完整构建（Firefox + Chrome）
```

全部 exit 0 即为通过。

## Test plan

- 手动测试：在 Chrome 中加载 `.addfox/extension/extension-chromium/`，打开任意网页划词翻译，验证功能正常。
- 手动测试：在选项页中点击「测试翻译」验证流式翻译仍能工作。

## Done criteria

- [ ] `pnpm install` exit 0，无 peer dependency 警告
- [ ] `npx tsc --noEmit` exit 0
- [ ] `pnpm build` exit 0，两个浏览器扩展均成功构建
- [ ] `rimraf` 出现在 `devDependencies` 中
- [ ] `@nickyzj2023/utils` 版本 ≥ 1.0.75
- [ ] `addfox` 版本 ≥ 0.2.4
- [ ] 仅 `package.json`、`pnpm-lock.yaml`（和可能的 `addfox.config.ts`）被修改
- [ ] 无 `app/` 下文件被修改

## STOP conditions

- `pnpm install` 报 ERESOLVE 无法自动解决
- `addfox@0.2.4` 的配置 API 发生显著变化（>10 行代码适配）
- 构建成功后，类型检查（`npx tsc --noEmit`）报错
- 构建失败且无法通过回退单个依赖（`@rsbuild/plugin-babel`）解决
- `app/` 下任何文件需要修改才能通过构建或类型检查（源码不应因依赖升级而改动）

## Maintenance notes

- 后续每次维护时，优先运行 `pnpm outdated` 检查依赖状态。
- `@rsbuild/plugin-babel` 被回退后，每次 `addfox` 升级时需重新尝试升级该包（因为 `addfox` 可能升级其内置 `@rsbuild/core`）。
- `rimraf` 未来可替换为 `pnpm exec rimraf` 的内置删除（Node 20+ 有原生 `fs.rmSync({recursive: true})`），但这不是本计划范围。
