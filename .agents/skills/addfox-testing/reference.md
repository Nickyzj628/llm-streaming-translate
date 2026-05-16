# Addfox testing reference

## Rstest config file names

Resolved in order (see addfox `RSTEST_CONFIG_FILES` and [rstest configure](https://rstest.rs/guide/basic/configure-rstest)):

- `rstest.config.cts`
- `rstest.config.mts`
- `rstest.config.cjs`
- `rstest.config.js`
- `rstest.config.ts`
- `rstest.config.mjs`

Place one at project root. Use `defineConfig` from `@rstest/core`.

## File naming

| Kind | Pattern | Example |
|------|---------|---------|
| Unit | `*.test.ts` or `*.spec.ts` | `__tests__/utils.test.ts`, `__tests__/entryResolver.test.ts` |
| E2E (extension load) | `e2e.extension.test.ts` or `e2e.*.test.ts` | `__tests__/e2e.extension.test.ts` |
| E2E (browser DOM only) | `e2e.browser.test.ts` or similar | `__tests__/e2e.browser.test.ts` |

Keep E2E names consistent so `rstest.config` `projects[].include` can target them (e.g. `__tests__/e2e.*.test.ts` for browser project, unit + extension E2E in node project).

## Dependencies summary

| Scenario | devDependencies | Notes |
|----------|-----------------|--------|
| Unit only | `@rstest/core` | Optional: `@rstest/coverage-istanbul` for coverage |
| Unit + E2E (browser) | `@rstest/core`, `@rstest/browser`, `playwright` | `npx playwright install chromium` (or firefox/webkit) |
| Unit + E2E (extension load) | `@rstest/core`, `playwright` | Extension E2E runs in Node project; uses Playwright API directly |

## E2E extension load

1. Build: `addfox build` (output default: `.addfox/extension`).
2. In the test file, use Playwright’s `chromium.launchPersistentContext` with a dedicated user data dir and load the extension:

```ts
import { chromium } from "playwright";
import { resolve } from "path";
import { existsSync } from "fs";

const EXTENSION_OUTPUT = resolve(process.cwd(), ".addfox", "extension");
const USER_DATA_DIR = resolve(process.cwd(), ".addfox", "e2e-user-data");

// Check extension was built
if (!existsSync(EXTENSION_OUTPUT)) {
  throw new Error(`Extension not built at ${EXTENSION_OUTPUT}. Run "addfox build" first.`);
}

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: true,
  args: [
    `--disable-extensions-except=${EXTENSION_OUTPUT}`,
    `--load-extension=${EXTENSION_OUTPUT}`,
  ],
});

// Get extension ID from service worker, then open popup
// const page = await context.newPage();
// await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
```

3. Run these tests in the **node** project (they use Playwright from Node), not in the rstest **browser** project (which serves pages and does not load the extension).

## Unit test example

```ts
import { describe, expect, it } from "@rstest/core";

describe("my util", () => {
  it("returns expected value", () => {
    expect(1 + 2).toBe(3);
  });
});
```

## E2E browser (Rstest browser project)

Tests that run in a real browser but do **not** load the extension use `@rstest/browser` and the `page` fixture:

```ts
import { describe, expect, it } from "@rstest/core";
import { page } from "@rstest/browser";

describe("E2E browser", () => {
  it("sees element", async () => {
    document.body.innerHTML = `<button id="btn">Click me</button>`;
    await expect
      .element(page.getByRole("button", { name: "Click me" }))
      .toBeVisible();
  });
});
```

Configure a project with `browser: { enabled: true, provider: "playwright", browser: "chromium" }` and `include` these files.

## Coverage (optional)

In `rstest.config.ts`:

```ts
coverage: {
  enabled: true,
  include: ["app/**/*.ts", "src/**/*.ts"],
  exclude: ["**/*.d.ts", "**/node_modules/**"],
  reporters: [["text", { skipFull: true }], "html", "lcov"],
  reportsDirectory: "./coverage",
},
```

Install `@rstest/coverage-istanbul`. Run: `rstest run --coverage`.

## Links

- [Rstest guide](https://rstest.rs/guide/)
- [Rstest browser testing](https://rstest.rs/guide/browser-testing/)
- [Rstest config](https://rstest.rs/guide/basic/configure-rstest)
- Addfox examples: `addfox-with-rstest` (unit only), `addfox-with-rstest-e2e` (unit + E2E extension + E2E browser)
