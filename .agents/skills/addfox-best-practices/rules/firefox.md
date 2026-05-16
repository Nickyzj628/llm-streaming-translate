# Firefox Configuration Guide

Firefox extension configuration across MV3 and MV2 targets.

---

## Version support

| Manifest | Firefox version | Status |
|---|---|---|
| MV3 | 109+ | Stable |
| MV2 | 48+ | Supported (legacy) |

Recommendation: use MV3 for new projects; keep MV2 only for compatibility constraints.

---

## Gecko-specific fields

```ts
const manifest = {
  browser_specific_settings: {
    gecko: {
      id: 'myextension@example.com',
      strict_min_version: '109.0'
    }
  }
};
```

---

## Background strategy

### MV3

Use service worker:

```json
{
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  }
}
```

### MV2

Use `background.scripts`:

```json
{
  "background": {
    "scripts": ["background/index.js"],
    "persistent": false
  }
}
```

---

## Sidebar

Firefox uses `sidebar_action`:

```json
{
  "sidebar_action": {
    "default_panel": "sidebar/index.html",
    "default_title": "My Sidebar"
  }
}
```

Anchor for cross-file links: `#sidebar`.

---

## Recommended practices

- Always set a stable Gecko extension ID for local/dev and self-hosted updates.
- Keep separate `manifest.firefox` overrides when Chromium behavior diverges.
- Test messaging and background lifecycle in Firefox directly.

---

## Related docs

- [./mv3.md](./mv3.md)
- [./mv2.md](./mv2.md)
- [./manifest-fields.md](./manifest-fields.md)
