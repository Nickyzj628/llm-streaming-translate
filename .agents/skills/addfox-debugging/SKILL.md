---
name: addfox-debugging
version: 0.1.1
description: Debug Addfox build and runtime issues, including terminal failures, manifest errors, extension loading issues, and context messaging problems.
metadata:
  tags: addfox, debugging, build-error, troubleshooting, browser-extension
---

# Addfox Debugging

Use this skill to diagnose and resolve Addfox build/runtime issues.

## When to use

- `addfox build` or `addfox dev` fails
- Extension cannot load in browser
- Popup is blank or content script does not inject
- Messaging returns `undefined` or no response
- Hot reload is not updating as expected

## Debug workflow

1. Read terminal output and identify first actionable error.
2. Inspect `.addfox/error.md` and `.addfox/meta.md` when present.
3. Verify `addfox.config.ts` and manifest structure.
4. Validate entry files and resolved output paths.
5. Reproduce issue in browser (`chrome://extensions` or `about:debugging`).

## Common fixes

- Missing plugin dependency: install the required Rsbuild plugin.
- Entry path mismatch: verify path is correct relative to `appDir`.
- MV2/MV3 mismatch: align manifest version with API usage.
- Service worker issues: ensure background entry exists and is bundled.

## Related skills

- `addfox-best-practices` for correct configuration patterns
- `addfox-testing` for automated regression validation
