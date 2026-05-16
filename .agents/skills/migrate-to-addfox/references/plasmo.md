# Migrate from Plasmo to Addfox

## Mapping overview

| Plasmo | Addfox |
|--------|-------|
| `background.ts` | `app/background/index.ts` |
| `contents/*.ts` | `app/content/index.ts` (or multiple entries) |
| `popup.tsx` | `app/popup/index.tsx` |
| `options.tsx` | `app/options/index.tsx` |
| `sidepanel.tsx` | `app/sidepanel/index.tsx` |
| `newtab.tsx` | `app/newtab/index.tsx` |
| `devtools.tsx` | `app/devtools/index.tsx` |
| `offscreen.tsx` | `app/offscreen/index.tsx` |
| `package.json` manifest | `addfox.config.ts` manifest field |
| `.plasmo/` cache | `.addfox/` output |
| Plasmo modules | Rsbuild plugins from `@rsbuild/plugin-*` |

## Steps

### 1. Create addfox.config.ts

Port Plasmo manifest from `package.json`:

**Plasmo:**
```json
{
  "manifest": {
    "name": "My Extension",
    "description": "Plasmo extension",
    "version": "1.0.0",
    "permissions": ["storage", "activeTab"]
  }
}
```

**Addfox:**
```ts
// addfox.config.ts
import { defineConfig } from 'addfox';
import { pluginReact } from '@rsbuild/plugin-react';

const manifest = {
  manifest_version: 3,
  name: 'My Extension',
  description: 'Migrated from Plasmo',
  version: '1.0.0',
  permissions: ['storage', 'activeTab'],
  host_permissions: ['<all_urls>'],
  action: {
    default_popup: 'popup/index.html'
  },
  content_scripts: [{ matches: ['<all_urls>'] }]
};

export default defineConfig({
  manifest: { chromium: manifest, firefox: { ...manifest } },
  plugins: [pluginReact()]
});
```

### 2. Port background script

**Plasmo:**
```ts
// background.ts
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

export {};
```

**Addfox:**
```ts
// app/background/index.ts
import browser from 'webextension-polyfill';

browser.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});
```

### 3. Port content script

**Plasmo:**
```ts
// contents/page-info.ts
import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: true
};

// Auto-runs when matched
console.log("Content script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getPageInfo") {
    sendResponse({
      title: document.title,
      url: location.href
    });
  }
});
```

**Addfox:**
```ts
// app/content/index.ts
import browser from 'webextension-polyfill';

// Configure in addfox.config.ts:
// manifest.content_scripts: [{ matches: ['<all_urls>'], all_frames: true }]

console.log("Content script loaded");

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "getPageInfo") {
    return Promise.resolve({
      title: document.title,
      url: location.href
    });
  }
});
```

### 4. Port multiple content scripts

**Plasmo:**
```ts
// contents/video.ts - auto-discovered
// contents/ai-assist.ts - auto-discovered
```

**Addfox:**
```ts
// addfox.config.ts
export default defineConfig({
  entry: {
    'content-video': 'app/content/video.ts',
    'content-ai': 'app/content/ai-assist.ts'
  },
  manifest: {
    content_scripts: [
      {
        matches: ['*://*.youtube.com/*'],
        js: ['content-video/index.js']
      },
      {
        matches: ['<all_urls>'],
        js: ['content-ai/index.js']
      }
    ]
  }
});
```

### 5. Port popup

**Plasmo:**
```tsx
// popup.tsx
import { useState } from "react";

function IndexPopup() {
  const [data, setData] = useState("");
  
  return (
    <div style={{ padding: 16 }}>
      <h1>Welcome</h1>
      <input onChange={(e) => setData(e.target.value)} />
    </div>
  );
}

export default IndexPopup;
```

**Addfox:**
```tsx
// app/popup/index.tsx
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";

const root = document.getElementById("root")!;
createRoot(root).render(<Popup />);

// app/popup/Popup.tsx
import { useState } from "react";

export function Popup() {
  const [data, setData] = useState("");
  
  return (
    <div style={{ padding: 16 }}>
      <h1>Welcome</h1>
      <input onChange={(e) => setData(e.target.value)} />
    </div>
  );
}
```

### 6. Port content UI overlay

**Plasmo:**
```tsx
// contents/overlay.tsx
import type { PlasmoCSConfig, PlasmoGetOverlayAnchor } from "plasmo";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
};

export const getOverlayAnchor: PlasmoGetOverlayAnchor = async () => {
  return document.querySelector("body");
};

export default function Overlay() {
  return (
    <div style={{ position: "fixed", bottom: 16, right: 16 }}>
      My Overlay
    </div>
  );
}
```

**Addfox:**
```tsx
// app/content/index.ts
import { defineShadowContentUI } from "@addfox/utils";
import { createRoot } from "react-dom/client";
import { Overlay } from "./Overlay";

const mountUI = defineShadowContentUI({
  name: "my-overlay",
  target: "body",
  attr: {
    style: "position:fixed;bottom:16px;right:16px;z-index:2147483647;"
  }
});

function init() {
  const root = mountUI();
  createRoot(root).render(<Overlay />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// app/content/Overlay.tsx
export function Overlay() {
  return <div>My Overlay</div>;
}
```

### 7. Port storage hooks

**Plasmo:**
```tsx
// popup.tsx
import { useStorage } from "@plasmohq/storage/hook";

function IndexPopup() {
  const [theme, setTheme] = useStorage("theme", "light");
  
  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      {theme}
    </button>
  );
}
```

**Addfox:**
```tsx
// hooks/useStorage.ts
import { useState, useEffect } from "react";
import browser from "webextension-polyfill";

export function useStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  
  useEffect(() => {
    browser.storage.local.get(key).then((result) => {
      if (result[key] !== undefined) {
        setValue(result[key]);
      }
    });
    
    const listener = (changes: { [key: string]: any }) => {
      if (changes[key]) {
        setValue(changes[key].newValue);
      }
    };
    
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [key]);
  
  const setStoredValue = (newValue: T) => {
    browser.storage.local.set({ [key]: newValue });
    setValue(newValue);
  };
  
  return [value, setStoredValue] as const;
}

// app/popup/Popup.tsx
import { useStorage } from "../../hooks/useStorage";

export function Popup() {
  const [theme, setTheme] = useStorage("theme", "light");
  
  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      {theme}
    </button>
  );
}
```

### 8. Port messaging

**Plasmo:**
```ts
// background/messages/getSettings.ts
import type { PlasmoMessaging } from "@plasmohq/messaging";

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const settings = await getSettings();
  res.send({ settings });
};

export default handler;
```

**Addfox:**
```ts
// app/background/index.ts
import browser from "webextension-polyfill";
import { getSettings } from "../utils/settings";

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.from === "popup" && message.action === "getSettings") {
    const settings = await getSettings();
    return { settings };
  }
});

// utils/messaging.ts
export async function sendMessage(action: string, payload?: any) {
  return browser.runtime.sendMessage({
    from: "popup",
    action,
    payload
  });
}
```

## Plasmo-specific notes

- **Auto-discovery**: Plasmo auto-discovers files by convention; Addfox uses explicit config or standard `app/` structure
- **Path alias**: Plasmo uses `~` for root; Addfox uses standard relative imports or configure in `rsbuild.source.alias`
- **Config**: Plasmo uses `package.json` manifest; Addfox uses `addfox.config.ts` with `manifest` field
- **Storage hooks**: Plasmo provides built-in hooks; Addfox requires custom hooks
- **Messaging**: Plasmo has file-based message handlers; Addfox uses standard runtime messaging
- **Content UI**: Plasmo has `getOverlayAnchor`; Addfox has `defineShadowContentUI`
- **Plugins**: Plasmo has its own module system; Addfox uses standard Rsbuild plugins

## Feature migration

| Feature | Plasmo Pattern | Addfox Pattern | Reference |
|---------|----------------|---------------|-----------|
| Video download | `contents/` + fetch | `entry` + background | extension-functions-best-practices (Video) |
| AI sidebar | `sidepanel.tsx` | `app/sidepanel/` | extension-functions-best-practices (AI) |
| Screenshot | `browser.tabs.captureTab` | Same API | extension-functions-best-practices (Image) |
| Storage | `useStorage` hook | Custom hook | See example above |

## See also

- [addfox-best-practices skill](../../addfox-best-practices/SKILL.md)
- [extension-functions-best-practices skill](../../extension-functions-best-practices/SKILL.md)
- Plasmo documentation: https://docs.plasmo.com
