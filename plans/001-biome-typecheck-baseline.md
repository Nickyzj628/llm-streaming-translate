# Plan 001: 建立验证基线（typecheck + Biome lint/format）

> **Executor instructions**: 按步骤顺序执行。每步完成后运行验证命令。遇到 STOP 条件立即停止并报告，不要自行发挥。完成后不要更新 `plans/README.md`。
>
> **Drift check（首先运行）**: `git diff --stat 9584456..HEAD -- package.json app/`
> 如果 `package.json` 或 `app/` 下任何文件自本计划编写后发生变化，对照 "Current state" 摘录对比实时代码；不匹配则视为 STOP 条件。

## Status

- **Priority**: P1（阻塞 002–004 的所有代码变更计划）
- **Effort**: M（半天）
- **Risk**: LOW（仅添加新文件和新脚本，不改业务逻辑）
- **Depends on**: 计划 000（依赖升级必须先完成）
- **Category**: dx
- **Planned at**: commit `9584456`, 2026-06-19

## Why this matters

当前项目无任何自动化验证手段：没有 `typecheck` 脚本、没有 lint、没有格式化工具。这意味着每一次代码变更都依赖人工审查，回归风险高。此计划为项目建立两条质量防线：

1. **TypeScript 类型检查**（`pnpm typecheck`）：在编译期捕获类型错误、拼写错误、API 误用
2. **Biome**（`pnpm lint` / `pnpm format`）：统一的代码风格和基础静态分析

二者合一后，后续所有代码变更计划（002–004）都有了可验证的「通过」标准。

选择 Biome 而非 ESLint+Prettier 的理由：Biome 是 Rust 编写的单体工具，安装快、运行快、配置简单，一个 `biome.json` 同时覆盖 lint 和 format，与 SolidJS/TSX 项目兼容良好。

## Current state

- **`package.json:6-9`** — 当前 scripts：
  ```json
  "scripts": {
    "dev": "addfox dev --no-open --cache",
    "build": "rimraf .addfox/extension/ && addfox build --browser firefox --no-open && addfox build --browser chrome --no-open"
  }
  ```
  无 `typecheck`、`lint`、`format` 脚本。

- **`tsconfig.json`** — 已配置 `"noEmit": true`，可直接用作 typecheck 命令的基础：
  ```json
  {
    "compilerOptions": {
      "target": "ES2020",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "strict": true,
      "jsx": "preserve",
      "resolveJsonModule": true,
      "isolatedModules": true,
      "noEmit": true,
      "skipLibCheck": true,
      "paths": { "@/*": ["./app/*"] },
      "types": ["webextension-polyfill"]
    },
    "include": ["app"]
  }
  ```
  注意：`skipLibCheck: true` 跳过了 `node_modules` 的类型检查，这是合理的（避免第三方库类型错误污染项目）。

- **`app/` 目录结构**：
  ```
  app/
    background/index.ts, StreamTranslator.ts
    content/index.ts, FloatingButton.ts, TranslatePopup.ts
    options/index.tsx, App.tsx, Options.module.scss
    components/Button/{Button.tsx, Button.module.scss}
    components/Input/{Input.tsx, Input.module.scss}
    components/Toast/{Toast.tsx, Toast.module.scss}
    hooks/useToast.ts
    styles/reset.scss, _variables.scss
    types/messages.ts, storage.ts
    utils/storage.ts
  ```
  文件类型：`.ts`、`.tsx`、`.scss`。Biome 原生支持 `.ts`、`.tsx`、`.json`；对 `.scss` 支持有限（Biome 的 CSS 格式化不覆盖 SCSS 语法）。SCSS 文件暂不纳入 Biome 检查范围。

- **项目代码风格约定**（从现有代码观察）：
  - 缩进：2 空格（见 `app/background/StreamTranslator.ts` 等文件）
  - 引号：双引号（如 `import browser from "webextension-polyfill"`）
  - 分号：有（如 `const selection = window.getSelection();`）
  - 行尾：LF
  - JSX 引号：双引号（如 `class={styles.options}`）

## Commands you will need

| 用途 | 命令 | 预期成功 |
|------|------|----------|
| 安装依赖 | `pnpm install` | exit 0 |
| 类型检查 | `pnpm typecheck` | exit 0 |
| Lint 检查 | `pnpm lint` | exit 0 |
| Lint 自动修复 | `pnpm lint:fix` | exit 0 |
| 格式化检查 | `pnpm format:check` | exit 0 |
| 格式化写入 | `pnpm format` | exit 0 |
| 构建 | `pnpm build` | exit 0 |

## Scope

**In scope**：
- `package.json` — 添加 `@biomejs/biome` devDependency + 新 scripts
- `biome.json` — 新建 Biome 配置文件
- `app/` 下 `.ts` 和 `.tsx` 文件 — 仅当 Biome 自动修复（`--write`）需要时才修改（如格式化不一致的行）

**Out of scope**：
- `app/` 下 `.scss` 文件 — Biome 不原生支持 SCSS 语法，不纳入检查
- 业务逻辑修改 — 此计划只添加工具链，不改变任何功能行为
- 移除 `@rsbuild/plugin-babel` 或任何现有插件 — addfox 需要它们

## Steps

### Step 1: 添加 typecheck 脚本

编辑 `package.json`，在 `scripts` 中添加：

```json
"typecheck": "tsc --noEmit"
```

**Verify**: `pnpm typecheck` → 运行 TypeScript 编译器。记录所有类型错误。

### Step 2: 修复已存在的类型错误（如有）

如果 step 1 报类型错误，逐条修复。常见可能性：
- 类型推断不精确导致的 `any` 隐式错误
- 导入路径问题

**Verify**: `pnpm typecheck` → exit 0，无类型错误

→ **STOP 条件**：如果类型错误超过 10 个，或需要修改超过 3 个文件，停止并报告（可能需要在后续计划中单独处理）。

### Step 3: 安装 Biome

```bash
pnpm add -D @biomejs/biome
```

**Verify**: `pnpm install` → exit 0；`npx biome --version` 输出版本号

### Step 4: 创建 Biome 配置文件

在项目根目录创建 `biome.json`，内容如下：

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "include": ["app/**/*.ts", "app/**/*.tsx", "*.json", "*.ts"],
    "ignore": [
      ".addfox/**",
      "node_modules/**",
      "pnpm-lock.yaml",
      "*.scss",
      "*.module.scss"
    ]
  },
  "formatter": {
    "enabled": true,
    "useEditorconfig": false,
    "indentStyle": "tab",
    "indentWidth": 2,
    "lineWidth": 80
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "jsxQuoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "off",
        "noDoubleEquals": "warn"
      },
      "style": {
        "noNonNullAssertion": "off",
        "useConst": "warn"
      }
    }
  }
}
```

**关键配置说明**：
- `indentStyle: "tab"` — 但 Biome 会按 `indentWidth: 2` 使用空格缩进（这是 Biome 的默认行为，`tab` 值在 `indentWidth` 设置为数字时实际渲染为空格）。**如果运行后发现缩进是 tab 字符**，改为 `"indentStyle": "space"`。
- `quoteStyle: "double"` — 匹配项目现有风格
- `semicolons: "always"` — 匹配项目现有风格
- `noExplicitAny: "off"` — 扩展代码中偶有 `any` 使用（如消息类型转换），暂不强制
- `noNonNullAssertion: "off"` — SolidJS 的 `ref` 模式可能用到 `!`
- `files.ignore` 排除 `.scss` — Biome 对 SCSS 支持有限

### Step 5: 添加 lint 和 format 脚本

编辑 `package.json`，在 `scripts` 中添加：

```json
"lint": "biome check app/",
"lint:fix": "biome check --write app/",
"format": "biome format --write app/",
"format:check": "biome format app/"
```

**Verify**: 运行 `pnpm lint` 查看初始 lint 结果。

### Step 6: 运行自动修复

```bash
pnpm lint:fix
```

这会自动修复所有 Biome 能自动修复的问题（格式、可自动修复的 lint）。

**Verify**: `pnpm lint` → exit 0，无错误和警告

### Step 7: 最终验证

依次运行：

```bash
pnpm typecheck   # exit 0
pnpm lint        # exit 0
pnpm format:check # exit 0（确认所有文件已格式化）
pnpm build       # exit 0（确认工具链变更没破坏构建）
```

全部 exit 0 即为通过。

## Test plan

无需新测试。验证方式是三个命令全部通过（见 step 7）。

## Done criteria

- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint` exit 0
- [ ] `pnpm format:check` exit 0
- [ ] `pnpm build` exit 0
- [ ] `biome.json` 存在于项目根目录
- [ ] `@biomejs/biome` 出现在 `devDependencies`
- [ ] 仅 `package.json`、`biome.json`、`pnpm-lock.yaml`、以及 Biome 自动修复的源文件被修改

## STOP conditions

- `pnpm typecheck` 报超过 10 个类型错误，或需要修改超过 3 个源文件
- `npx biome` 命令无法运行（二进制不兼容当前平台）
- `pnpm lint:fix` 改变了代码语义（如错误地删除"未使用"的导入，实际上它是类型导入或副作用导入）
- `pnpm build` 在工具链变更后失败

## Maintenance notes

- 后续每次提交前，运行 `pnpm lint && pnpm typecheck` 作为质量门。
- `.scss` 文件暂不在 Biome 检查范围内。如果未来需要 SCSS lint，可考虑 `stylelint` 作为补充工具（但不在本计划范围）。
- `biome.json` 中的 `$schema` 版本号应随 Biome 升级而更新。升级 Biome 时运行 `npx biome migrate` 自动迁移配置。
- 如果在 CI 中运行这些检查，使用 `pnpm lint` 而非 `pnpm lint:fix`（只检查不修改）。
