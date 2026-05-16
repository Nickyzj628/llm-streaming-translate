# Exenzo debugging reference

## .addfox/error.md

Written by the HMR/debug server when a runtime error is reported (e.g. from the extension’s error handler) and `addfox dev --debug` is used. Path: `<project-root>/.addfox/error.md`.

**Typical structure:**

```markdown
## Extension Error — <entry> — <timestamp>

- **entry**: <entry name>
- **type**: error
- **message**: <error message>
- **location**: <filename or URL>:<line>:<column>

### Stack

<stack trace>
```

- **entry**: Which entry the error came from (e.g. `popup`, `options`, `content`, `background`). Maps to `app/<entry>/`.
- **location**: Exact file/URL and line (and optionally column). Use to open the failing file.
- **message** / **stack**: Error type and call stack; use for root cause and framework-specific patterns.

The file is cleared when the dev server starts and updated when a new error is reported. If the path is custom `outputRoot`, error.md lives under `<outputRoot>/error.md` (e.g. `.addfox/error.md` for default).

## Terminal error block (with --debug)

Terminal output can include a block with:

- Same **entry**, **type**, **message**, **location**, **stack** as above.
- **bundler**: rsbuild
- **front-end-framework**: Detected framework (React, Vue, Preact, Svelte, Solid, or Vanilla). Use this to choose framework-specific fixes.

## .addfox/meta.md

Generated after a successful build (by the manifest plugin). Path: `<project-root>/.addfox/meta.md` (or under custom `outputRoot`).

**Sections:**

1. **Basic information** — Framework (addfox), name, description, version, framework version, manifest version.
2. **Permissions** — permissions, host_permissions, optional_permissions.
3. **Entries** — List of entry names and their script paths (absolute or relative).

Use meta.md to confirm plugin identity, entry list, and permissions without opening manifest or config.

## Enabling debug and error.md

- Run `addfox dev --debug` so that:
  - Runtime errors from the extension are sent to the dev server.
  - error.md is created/updated under `.addfox/` (or configured outputRoot).
- Without `--debug`, error.md is not written; rely on terminal and browser DevTools.

## --report and Rsdoctor

When error.md is not available and the issue is not resolved quickly, use **Rsdoctor** to analyze the build.

**Enable report:**

- **CLI**: `addfox dev -r`, `addfox dev --report`, `addfox build -r`, or `addfox build --report`
- **Config**: `report: true` in addfox.config (CLI flag overrides config)

**Output:**

- **Path**: `<project-root>/.addfox/report/` (or `<outputRoot>/report/` if outputRoot is custom)
- **Content**: Rsdoctor report (from `@rsdoctor/rspack-plugin`). Open **`index.html`** in a browser to view compilation, chunks, modules, and bundle analysis.

**When to suggest:**

- error.md does not exist (e.g. user did not run with `--debug`, or the failure is build-time only).
- The problem persists after one or two rounds of fixes based on terminal output alone.
- Need to inspect entry/chunk graph, module resolution, or dependency tree to find the root cause.

Rsdoctor docs: [rsdoctor.rs](https://rsdoctor.rs/).
