# Migrate from WXT to Addfox

## Mapping overview

| WXT | Addfox |
|-----|-------|
| `entrypoints/background.ts` | `app/background/index.ts` |
| `entrypoints/content.ts` | `app/content/index.ts` |
| `entrypoints/content-ui/` | `app/content/` + `defineShadowContentUI` |
| `entrypoints/popup/` | `app/popup/index.tsx` + optional `index.html` |
| `entrypoints/options/` | `app/options/index.tsx` + optional `index.html` |
| `entrypoints/sidepanel/` | `app/sidepanel/index.tsx` |
| `wxt.config.ts` | `addfox.config.ts` |
| `package.json: wxt` dev dependency | `addfox` dev dependency |
| Auto-generated manifest | Explicit `manifest` field in config |
| WXT modules | Rsbuild plugins from `@rsbuild/plugin-*` |
| `storage` item definitions | Direct `chrome.storage` usage with types |

## Steps

### 1. Create addfox.config.ts

Port your WXT config:

**WXT:**
```ts
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['storage', 'activeTab']
  }
});
```

**Addfox:**
```ts
// addfox.config.ts
import { defineConfig } from 'addfox';
import { pluginReact } from '@rsbuild/plugin-react';

const manifest = {
  manifest_version: 3,
  name: 'My Extension',
  version: '1.0.0',
  description: 'Migrated from WXT',
  permissions: ['storage', 'activeTab'],
  host_permissions: ['<all_urls>'],
  action: {
    default_popup: 'popup/index.html'
  },
  options_ui: { open_in_tab: true },
  content_scripts: [{ matches: ['<all_urls>'] }]
};

export default defineConfig({
  manifest: { chromium: manifest, firefox: { ...manifest } },
  plugins: [pluginReact()]
});
```

### 2. Port background script

**WXT:**
```ts
// entrypoints/background.ts
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      browser.storage.local.set({ installed: Date.now() });
    }
  });
});
```

**Addfox:**
```ts
// app/background/index.ts
import browser from 'webextension-polyfill';

// Top-level execution (no wrapper needed)
browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    browser.storage.local.set({ installed: Date.now() });
  }
});
```

### 3. Port content script

**WXT:**
```ts
// entrypoints/content.ts
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('Content script loaded');
    // Your logic here
  }
});
```

**Addfox:**
```ts
// app/content/index.ts
import browser from 'webextension-polyfill';

// Top-level execution
console.log('Content script loaded');

// Listen for messages
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.from === 'popup') {
    return Promise.resolve({ received: true });
  }
});
```

### 4. Port content UI (WXT content-ui)

**WXT:**
```ts
// entrypoints/content-ui/index.tsx
import { createShadowRootUi } from 'wxt/utils';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'my-content-ui',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container) {
        const root = createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      }
    });
    ui.mount();
  }
});
```

**Addfox:**
```ts
// app/content/index.ts
import { defineShadowContentUI } from '@addfox/utils';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const mountUI = defineShadowContentUI({
  name: 'my-content-ui',
  target: 'body',
  attr: {
    style: 'position:fixed;bottom:16px;right:16px;z-index:2147483647;'
  },
  injectMode: 'append'
});

function init() {
  const root = mountUI();
  const reactRoot = createRoot(root);
  reactRoot.render(<App />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

### 5. Port popup/options

**WXT:**
```tsx
// entrypoints/popup/App.tsx
export default definePopup(() => {
  return <div>Popup content</div>;
});
```

**Addfox:**
```tsx
// app/popup/index.tsx
import { createRoot } from 'react-dom/client';
import { Popup } from './Popup';

const root = document.getElementById('root')!;
createRoot(root).render(<Popup />);

// app/popup/Popup.tsx
export function Popup() {
  return <div>Popup content</div>;
}
```

Optional HTML template (auto-generated if omitted):
```html
<!-- app/popup/index.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Popup</title>
</head>
<body>
  <div id="root"></div>
  <script data-addfox-entry src="./index.tsx"></script>
</body>
</html>
```

### 6. Port storage definitions

**WXT:**
```ts
// utils/storage.ts
const settingsStorage = storage.defineItem<Settings>('local:settings', {
  defaultValue: { theme: 'light' }
});
```

**Addfox:**
```ts
// utils/storage.ts
import browser from 'webextension-polyfill';

interface Settings {
  theme: 'light' | 'dark';
}

const DEFAULT_SETTINGS: Settings = { theme: 'light' };

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

export async function setSettings(settings: Partial<Settings>) {
  const current = await getSettings();
  await browser.storage.local.set({
    settings: { ...current, ...settings }
  });
}
```

### 7. Port messaging

**WXT:**
```ts
// utils/messaging.ts
import { defineExtensionMessaging } from '@wxt-dev/messaging';

interface ProtocolMap {
  getSettings: () => Settings;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```

**Addfox:**
```ts
// utils/messaging.ts
import browser from 'webextension-polyfill';

export type MessageType = 
  | { from: 'popup'; action: 'getSettings' }
  | { from: 'content'; action: 'pageInfo'; data: { url: string } };

export async function sendToBackground(message: MessageType) {
  return browser.runtime.sendMessage(message);
}

export async function sendToContent(tabId: number, message: MessageType) {
  return browser.tabs.sendMessage(tabId, message);
}

// In background
browser.runtime.onMessage.addListener((message: MessageType, sender) => {
  if (message.from === 'popup' && message.action === 'getSettings') {
    return getSettings(); // Returns Promise
  }
  return undefined;
});
```

### 8. Port Tailwind configuration

**WXT:**
```ts
// wxt.config.ts
export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()]
  })
});
```

**Addfox:**
```js
// postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

```css
/* app/popup/index.css */
@import 'tailwindcss';
```

## WXT-specific notes

- **Auto-imports**: WXT provides auto-imports; Addfox requires explicit imports
- **Dev mode**: Both have HMR, but implementation differs
- **Storage**: WXT has typed storage wrapper; Addfox uses direct API with type wrappers
- **Messaging**: WXT has protocol-based messaging; Addfox uses standard runtime messages
- **Content UI**: WXT has `createShadowRootUi`; Addfox has `defineShadowContentUI` from `@addfox/utils`
- **Build tool**: WXT uses Vite; Addfox uses Rsbuild
- **Config**: WXT uses `wxt.config.ts` with modules; Addfox uses `addfox.config.ts` with `plugins` array

## Feature migration

When migrating specific features:

| Feature | WXT Pattern | Addfox Pattern | Reference |
|---------|-------------|---------------|-----------|
| Video download | Custom entry + fetch | `entry` + background | extension-functions-best-practices (Video) |
| AI sidebar | Sidepanel entry | `app/sidepanel/` | extension-functions-best-practices (AI) |
| Screenshot | `browser.tabs.captureTab` | Same API | extension-functions-best-practices (Image) |

## See also

- [addfox-best-practices skill](../../addfox-best-practices/SKILL.md)
- [extension-functions-best-practices skill](../../extension-functions-best-practices/SKILL.md)
- WXT documentation: https://wxt.dev
