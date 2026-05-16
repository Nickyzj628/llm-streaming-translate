# Chromium Configuration Guide

Configuration guidance for Chromium-family browsers: Chrome, Edge, Brave, Opera, Vivaldi, and Arc.

---

## Supported browsers

| Browser | CLI target | MV3 baseline |
|---|---|---|
| Chrome | `chrome` | 88+ |
| Edge | `edge` | 88+ |
| Brave | `brave` | 1.19+ |
| Opera | `opera` | 74+ |
| Vivaldi | `vivaldi` | 3.6+ |
| Arc | `arc` | 1.0+ |

---

## Manifest V3 baseline

```ts
const chromiumManifest = {
  manifest_version: 3,
  name: 'My Extension',
  version: '1.0.0',
  minimum_chrome_version: '88'
};
```

---

## Background: service worker

```ts
const manifest = {
  manifest_version: 3,
  background: {
    service_worker: 'background/index.js',
    type: 'module'
  }
};
```

Notes:
- Service worker is event-driven and can be suspended.
- Move periodic logic to `chrome.alarms`.
- Use offscreen documents when DOM is required.

---

## Action API

Use `action` in MV3:

```ts
const manifest = {
  action: {
    default_popup: 'popup/index.html',
    default_title: 'My Extension'
  }
};
```

---

## Side panel (Chrome)

```ts
const manifest = {
  permissions: ['sidePanel'],
  side_panel: {
    default_path: 'sidepanel/index.html'
  }
};
```

Anchor for cross-file links: `#side-panel-chrome`.

---

## Recommended practices

- Keep host permissions narrow.
- Use MV3-compatible APIs (`scripting`, `declarativeNetRequest`, `action`).
- Validate extension in both stable Chrome and target Chromium variants.

---

## Related docs

- [./mv3.md](./mv3.md)
- [./manifest-fields.md](./manifest-fields.md)
