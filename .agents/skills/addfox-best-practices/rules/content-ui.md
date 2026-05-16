# Content UI — injecting DOM in web pages

When the content script needs to **create a UI** or **inject DOM** into the page, use the built-in helpers from **`@addfox/utils`**. Do not manually create shadow roots or iframes unless you have a reason to avoid the utils.

## Package and import

- **Package**: `@addfox/utils` (provided by addfox or add as dependency).
- **Import in**: Content entry only (e.g. `app/content/index.ts` or `app/content/index.tsx`).

```ts
import { defineShadowContentUI, defineIframeContentUI, defineContentUI } from "@addfox/utils";
```

## API overview

| Method | Wrapper | Use when |
|--------|---------|----------|
| **defineShadowContentUI(options)** | Shadow DOM | You want style isolation from the page; one mount root; custom element host. |
| **defineIframeContentUI(options)** | iframe | You need full isolation (page JS/CSS must not affect the UI). |
| **defineContentUI(options)** | none | No isolation; you inject a plain element (e.g. `div`). Use with scoped classes or accept page styles. |

Each returns a **mount function**. Call it (e.g. after `DOMContentLoaded`) to create and insert the root; the return value is the **root element** to append your UI to (or pass to React/Vue root).

## Common options

- **target**: `string` (CSS selector for `document.querySelector`) or `Element`. Where to insert the wrapper (e.g. `"body"`, `"#app"`).
- **attr?**: `Record<string, string>` — id, class, style, data-*, etc. Applied to the host element (the node inserted into the target).
- **injectMode?**: `"append"` (default) or `"prepend"` — insert at end or start of the target.

## defineShadowContentUI

- **name**: Custom element name (must contain a hyphen, e.g. `"my-content-ui"`). Used as the shadow host tag.
- Content script CSS (imported in the content entry) can be injected into the shadow root by the build; when this API is used, the manifest plugin may not auto-fill `content_scripts.css` (framework handles injection).

Example:

```ts
const mount = defineShadowContentUI({
  name: "my-content-ui",
  target: "body",
  attr: { id: "my-root", style: "position:fixed;bottom:16px;right:16px;z-index:2147483647;" },
  injectMode: "append",
});
const root = mount();
root.appendChild(document.createElement("div"));
```

## defineIframeContentUI

- No `tag` or `name`; the wrapper is always an iframe. The mount function returns the **body** of the iframe’s document (a div is created and appended to it).
- Same **target**, **attr**, **injectMode**. CSS can be injected into the iframe document by the build.

## defineContentUI

- **tag**: Element tag name (e.g. `"div"`). The host element is this tag.
- Use for simple injection without shadow/iframe; combine with React/Vue root or vanilla DOM.

Example (React):

```ts
const mount = defineContentUI({
  tag: "div",
  target: "body",
  attr: { id: "content-ui-root", class: "fixed bottom-4 right-4 z-[2147483647]" },
  injectMode: "append",
});
const container = mount();
createRoot(container).render(<App />);
```

## When to call mount

- Ensure the **target** exists. Call the mount function after `DOMContentLoaded` or when the target is available (e.g. `if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountUI); else mountUI();`).
- If the target is missing, the mount function throws (e.g. `content-ui: target not found (body)`).

## Manifest and CSS

- When the content script uses **defineShadowContentUI** or **defineIframeContentUI**, the framework may **not** auto-fill `content_scripts.css` in the manifest (CSS is injected at runtime into the shadow/iframe). Import your styles in the content entry so they are bundled; the utils and build pipeline handle injection into the wrapper.
- If you use **defineContentUI** only (no shadow/iframe), content script CSS in the manifest still applies to the page; scope your UI with a unique class or id to avoid affecting the host page.

## References

- Source: `@addfox/utils` — `content-ui.ts` (defineShadowContentUI, defineIframeContentUI, defineContentUI).
- Addfox examples: `addfox-content-ui`, `addfox-content-ui-react` in the addfox repo.
