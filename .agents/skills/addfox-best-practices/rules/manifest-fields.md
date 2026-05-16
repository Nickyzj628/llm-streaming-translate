# Manifest Fields Reference

Quick reference for common manifest fields when using Addfox.

## Related guides

- [MV3 Guide](./mv3.md)
- [MV2 Guide](./mv2.md)
- [Chromium Guide](./chromium.md)
- [Firefox Guide](./firefox.md)

## Required fields

- `manifest_version`
- `name`
- `version`

## Background

### MV3

```json
{
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  }
}
```

See [MV3 Guide](./mv3.md#background--service-worker).

### MV2

```json
{
  "background": {
    "scripts": ["background/index.js"],
    "persistent": false
  }
}
```

See [MV2 Guide](./mv2.md#background).

## Action and UI pages

- `action.default_popup` (MV3)
- `browser_action.default_popup` (MV2)
- `options_ui.page`
- `devtools_page`
- `side_panel.default_path` (Chrome)
- `sidebar_action.default_panel` (Firefox)

See [Chromium Guide](./chromium.md#side-panel-chrome) and [Firefox Guide](./firefox.md#sidebar).

## Content scripts

- `content_scripts[].matches`
- `content_scripts[].js`
- `content_scripts[].css`
- `run_at`, `all_frames`, `match_about_blank`

## Permissions

- `permissions`
- `host_permissions` (MV3)
- `optional_permissions`

Use least privilege and narrow host scope.

## Assets and exposure

- `icons`
- `web_accessible_resources`

Reference output paths, not source TypeScript paths.
