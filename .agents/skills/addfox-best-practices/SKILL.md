---
name: addfox-best-practices
version: 0.1.1
description: Best practices for building browser extensions with the Addfox framework. Use when developing extensions with Addfox, configuring manifest/entry/permissions, or when discussing MV3, cross-browser support, framework/styling choices, messaging, and content UI injection.
---

# Addfox Best Practices

Use this skill when working on Addfox extension architecture, configuration, and runtime integration.

## When to use

Use this skill when you need to:
- Configure `addfox.config.ts` (`manifest`, `entry`, `plugins`, `rsbuild`, `appDir`, `outDir`)
- Design entry strategy for `background`, `content`, `popup`, `options`, and custom entries
- Decide permissions and host patterns for least-privilege access
- Target both Chromium and Firefox with browser-specific manifest sections
- Implement content UI and messaging between extension contexts

## Quick references

| Topic | See |
|---|---|
| Entry setup | [rules/entry.md](./rules/entry.md) |
| Chromium details | [rules/chromium.md](./rules/chromium.md) |
| Firefox details | [rules/firefox.md](./rules/firefox.md) |
| Manifest V3 | [rules/mv3.md](./rules/mv3.md) |
| Manifest V2 | [rules/mv2.md](./rules/mv2.md) |
| Manifest fields | [rules/manifest-fields.md](./rules/manifest-fields.md) |
| Permissions | [rules/permissions.md](./rules/permissions.md) |
| Content UI | [rules/content-ui.md](./rules/content-ui.md) |
| Messaging | [rules/messaging.md](./rules/messaging.md) |

## Best-practice checklist

- Prefer file-based reserved entries first; use `entry` only when customization is required.
- Keep manifest source paths clear and let Addfox resolve build output paths.
- Minimize permissions and host scope; avoid `<all_urls>` unless absolutely necessary.
- Keep background logic event-driven for MV3 service worker lifecycle.
- Use typed message contracts across contexts to reduce runtime mismatch.

## Related docs

- [reference.md](./reference.md)
- [rules/entry.md](./rules/entry.md)
- [rules/manifest-fields.md](./rules/manifest-fields.md)
