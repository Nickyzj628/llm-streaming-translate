# Manifest V2 Guide

Legacy MV2 reference for compatibility and maintenance scenarios.

---

## When MV2 is still relevant

- Maintaining existing MV2 extensions.
- Firefox compatibility requirements.
- Projects that cannot yet migrate to MV3 APIs.

---

## Required fields

```json
{
  "manifest_version": 2,
  "name": "My Extension",
  "version": "1.0.0"
}
```

---

## Background

```json
{
  "background": {
    "scripts": ["background/index.js"],
    "persistent": false
  }
}
```

`persistent: false` is preferred unless always-on background is truly required.

---

## Browser action

```json
{
  "browser_action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png"
    }
  }
}
```

---

## Permissions model

```json
{
  "permissions": ["storage", "tabs", "*://*.example.com/*"],
  "optional_permissions": ["bookmarks"]
}
```

---

## Migration guidance

- Keep MV2 only where required.
- Plan API replacements for MV3 (`action`, service worker, DNR).
- Maintain separate browser-specific manifest blocks during migration.

---

## Related docs

- [./mv3.md](./mv3.md)
- [./firefox.md](./firefox.md)
- [./manifest-fields.md](./manifest-fields.md)
