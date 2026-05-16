# Reference: Web Page to Extension Entry Conversion

## 1) Source Audit

Before conversion, identify:

- Framework/runtime (vanilla, React, Vue, etc.)
- Build tool assumptions (Vite/webpack/Next static export)
- API dependencies (cookies, localStorage, fetch auth, service workers)
- Routing mode (history/hash)
- External scripts/fonts loaded from CDN
- Style stack (CSS/Tailwind/UnoCSS/Less/Sass)
- Third-party dependencies and whether they are browser-safe or Node-only

## 1.1 Classification Matrix (Required)

Create a quick matrix before conversion:

| Area | Source choice | Conversion impact |
|---|---|---|
| Runtime | Native JS / React / Vue / Svelte / Solid | Determines Addfox framework plugin and runtime deps |
| Styling | CSS / Tailwind / UnoCSS / Less / Sass | Determines style tooling/plugins and imports |
| Libraries | Browser-safe / Node-only | Determines direct reuse vs replacement/architecture change |

If any dependency is Node-only, mark it as **not directly runnable** in extension page entries.

## 2) Target Entry Selection

Use this decision pattern:

- Need quick actions from toolbar -> `popup`
- Need full settings page -> `options`
- Need docked browser-side workflow -> `sidepanel`
- Need debugging companion panel -> `devtools`
- Replace browser new tab page -> `newtab`
- Override browser built-in pages -> `bookmarks` / `history`
- Anything else -> custom entry

## 3) Minimal File Pattern

```text
app/
  <entry-name>/
    index.html
    index.tsx (or index.ts / index.js)
    App.(tsx|vue|svelte|jsx|js)
```

`index.html` should only include root container and script entry.

## 4) Manifest/Config Wiring Checklist

- Add or update entry mapping for the chosen target
- Add related manifest keys (`action`, `options_ui`, `side_panel`, `devtools_page`, `chrome_url_overrides`, etc.)
- Ensure icon fields and default pages are valid
- Add host permissions only when strictly required

Also verify:

- Framework plugin configuration matches the classified runtime.
- Style tooling/dependencies match the classified style stack.
- Node-only dependencies are removed from direct page entry path.

## 5) Runtime Adaptation

### Routing

- If history mode breaks under extension URL, prefer hash mode or configure base path.

### Data and Auth

- UI should not depend on same-origin cookies by default.
- Move privileged or cross-origin requests to background when permissioned.

### Messaging

- Use explicit message contracts between UI and background/content.
- Validate response shape and error handling for each message type.

## 6) CSP and Security

- Avoid inline script/eval patterns that violate extension CSP.
- Bundle scripts through build pipeline instead of injecting raw inline code.
- Sanitize user-generated HTML before render.

## 6.1 Node-only Dependency Handling

If source page depends on Node-only packages:

1. Document the incompatible package and why it is Node-only.
2. Choose one strategy:
   - Replace with browser-compatible alternative
   - Move logic to backend service and call via HTTP
   - Re-implement using browser APIs in extension contexts
3. Re-test affected feature path in popup/options/sidepanel/devtools/newtab context.

## 7) Verification Matrix

For each converted entry, verify:

1. UI renders with correct layout
2. Primary interactions work
3. Assets and fonts load
4. No console/runtime errors
5. Extension reload/update does not break state unexpectedly
6. Target browser compatibility (Chromium/Firefox as required)

## 8) Handoff Template

Use this structure in final delivery:

```md
## Converted Entry
- Target: <popup/options/sidepanel/devtools/newtab/bookmarks/history/custom>
- Source page: <path or module>

## Files
- Added: ...
- Updated: ...

## Config/Manifest
- Changed keys: ...

## Runtime Adaptations
- Routing: ...
- Messaging: ...
- Permissions: ...

## Validation
- Build: pass/fail
- Runtime check: pass/fail
- Known limitations: ...
```

## 9) Addfox-Specific Acceptance Criteria

Before closing conversion tasks in Addfox projects, confirm:

1. `addfox.config` includes correct framework plugins and entry mapping.
2. Manifest keys for the target entry are present and browser-compatible.
3. Page entry has explicit HTML file and bootstrap script.
4. Any privileged APIs are handled in background, not directly in restricted UI context.
5. Dev and build runs both succeed, and resulting extension page works in browser runtime.
