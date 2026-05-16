# Examples: Convert Web Pages to Extension Entries

## Example 1: React marketing page -> Popup

### Input

- Existing React page: `src/pages/Landing.tsx`
- Existing root HTML: `public/index.html`
- Style stack: Tailwind CSS
- Third-party libs: browser-safe UI libs only
- Goal: reuse UI as extension popup

### Target mapping

- `app/popup/index.html` (new popup HTML entry)
- `app/popup/index.tsx` (mount React root)
- `app/popup/App.tsx` (migrated page component)

### Addfox work items

1. Ensure `addfox.config.ts` includes React plugin.
2. Ensure manifest contains `action.default_popup` and popup icons.
3. Replace web-only assumptions (origin cookies, unrestricted `window.open`) as needed.

### Result checklist

- Popup opens and renders correctly in extension toolbar.
- Static assets resolve via extension URL.
- No CSP/eval issues.

---

## Example 2: Vue settings page -> Options + Sidepanel

### Input

- Existing Vue page: `src/views/Settings.vue`
- Existing router in history mode
- Style stack: Sass
- Third-party libs: browser-safe form/state libs
- Goal: use same UI for options and sidepanel

### Target mapping

- `app/options/index.html`, `app/options/index.ts`
- `app/sidepanel/index.html`, `app/sidepanel/index.ts`
- Shared view and composables reused by both entries

### Addfox work items

1. Configure Vue plugin in `addfox.config`.
2. Add `options_ui` and `side_panel` related manifest keys.
3. Adjust router/base mode for extension URL compatibility.

### Result checklist

- Options page and sidepanel both load the same feature set.
- Shared state synchronization is explicit (message or storage based).
- Browser-specific sidepanel behavior is validated.

---

## Example 3: Plain HTML dashboard -> Newtab override

### Input

- Existing static page: `dashboard.html` + `dashboard.js`
- Style stack: plain CSS
- Third-party libs: charting library that supports browser runtime
- Goal: replace browser newtab page

### Target mapping

- `app/newtab/index.html` (content moved from dashboard.html)
- `app/newtab/index.js` (bootstrap and event bindings)

### Addfox work items

1. Add newtab override in manifest (`chrome_url_overrides` or browser equivalent).
2. Ensure all asset references are extension-safe.
3. Remove inline scripts if CSP would block execution.

### Result checklist

- Opening a new tab shows converted dashboard.
- Page does not rely on unavailable web origin context.
- Permissions remain least-privilege.

---

## Example 4: Any frontend page -> Custom entry

### Input

- Existing page that does not fit reserved entry names
- Style stack: UnoCSS
- Third-party libs include one Node-only package (must be replaced or moved out of page entry)
- Goal: keep custom route/feature as standalone extension page

### Target mapping

- `app/reports/index.html`
- `app/reports/index.tsx` (or ts/js depending stack)
- Add explicit custom entry mapping in Addfox config

### Addfox work items

1. Add custom entry configuration in `addfox.config`.
2. Ensure manifest references final generated page where needed.
3. Replace or re-architect Node-only package usage before runtime verification.
4. Verify navigation path and message channels for this entry.

### Result checklist

- Custom page is built and reachable in extension context.
- No missing manifest/config linkage.
- Build output includes expected custom bundle and HTML.
