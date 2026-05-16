# Manifest V3 Guide

Manifest V3 architecture, required fields, and practical Addfox usage patterns.

---

## MV3 at a glance

| Aspect | MV3 |
|---|---|
| Background | Service worker |
| Request control | Declarative Net Request |
| Remote code | Disallowed |
| CSP | Stricter defaults |

---

## Required fields

```json
{
  "manifest_version": 3,
  "name": "My Extension",
  "version": "1.0.0"
}
```

---

## Background / service worker

```json
{
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  }
}
```

### Lifecycle notes

- Service worker is event-driven.
- No direct DOM access in service worker context.
- Use offscreen document for DOM-bound operations.

---

## Content scripts and permissions

```json
{
  "permissions": ["storage", "scripting"],
  "host_permissions": ["*://*.example.com/*"],
  "content_scripts": [{
    "matches": ["*://*.example.com/*"],
    "js": ["content/index.js"]
  }]
}
```

---

## Addfox tips

- Prefer reserved entries under `app/`.
- Keep permissions least-privilege.
- Split browser-specific differences into `manifest.chromium` / `manifest.firefox`.

---

## Related docs

- [./manifest-fields.md](./manifest-fields.md)
- [./chromium.md](./chromium.md)
- [./firefox.md](./firefox.md)
