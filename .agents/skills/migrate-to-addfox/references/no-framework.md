# Migrate from no-framework (vanilla) to Addfox

## Mapping overview

| Vanilla / no framework | Addfox |
|------------------------|-------|
| Hand-written `manifest.json` | `manifest` field in `addfox.config.ts` or manifest files under `app/` |
| Ad-hoc JS bundles or no build | Rsbuild via Addfox; single build pipeline |
| Loose script paths | Reserved entry names and `app/` layout |
| Manual file organization | Auto-discovery + explicit `entry` |
| No dependency management | Package manager + `addfox` |

## Steps

### 1. Create addfox config

Add `addfox.config.ts` at project root. Copy manifest fields from existing `manifest.json`:

**Vanilla manifest.json:**
```json
{
  "manifest_version": 3,
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Vanilla extension",
  "permissions": ["storage", "activeTab"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }],
  "action": {
    "default_popup": "popup.html"
  }
}
```

**Addfox:**
```ts
// addfox.config.ts
import { defineConfig } from 'addfox';

const manifest = {
  manifest_version: 3,
  name: 'My Extension',
  version: '1.0.0',
  description: 'Migrated to Addfox',
  permissions: ['storage', 'activeTab'],
  action: {
    default_popup: 'popup/index.html'
  },
  background: {
    service_worker: 'background/index.js'
  },
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['content/index.js']
  }]
};

export default defineConfig({
  manifest: { chromium: manifest, firefox: { ...manifest } }
});
```

Ensure `manifest_version: 3` and `background.service_worker`, `action.default_popup`, etc. use framework output paths (e.g. `popup/index.html`, `background/index.js`).

### 2. Create app directory

Create `app/` and place entry scripts:

```bash
mkdir -p app/{background,content,popup,options}
```

**Mapping:**
```
background.js      → app/background/index.js or index.ts
content.js         → app/content/index.js or index.ts
popup.html         → app/popup/index.html (optional)
popup.js           → app/popup/index.js or index.ts
options.html       → app/options/index.html (optional)
options.js         → app/options/index.js or index.ts
```

**Examples:**

```ts
// app/background/index.ts
import browser from 'webextension-polyfill';

browser.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

// Port your original background.js logic
// Example: Message handling
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'ping') {
    return Promise.resolve({ status: 'pong' });
  }
});
```

```ts
// app/content/index.ts
import browser from 'webextension-polyfill';

// Port your original content.js logic
// Example: Page interaction
function init() {
  console.log('Content script running on:', location.href);
  
  // Your DOM manipulation
  const button = document.createElement('button');
  button.textContent = 'Extension Button';
  document.body.appendChild(button);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

```tsx
// app/popup/index.tsx (if using React)
import { createRoot } from 'react-dom/client';
import { Popup } from './Popup';

const root = document.getElementById('root')!;
createRoot(root).render(<Popup />);

// app/popup/Popup.tsx
export function Popup() {
  return (
    <div style={{ width: 300, padding: 16 }}>
      <h1>My Extension</h1>
      <button onClick={() => browser.runtime.openOptionsPage()}>
        Open Options
      </button>
    </div>
  );
}
```

If you had no build, convert inline scripts into entry files; **avoid inline scripts in HTML for MV3/CSP**.

### 3. Manifest paths

**Do not write source paths for built-in entries in the manifest**; the framework injects the built paths.

**Vanilla (incorrect for Addfox):**
```json
{
  "background": {
    "service_worker": "src/background.js"
  }
}
```

**Addfox (correct):**
```ts
const manifest = {
  background: {
    service_worker: 'background/index.js'  // Output path, not source
  }
};

export default defineConfig({
  manifest: { chromium: manifest, firefox: { ...manifest } }
});
```

Standard entry paths are defined in Addfox (e.g. `popup/index.html`, `background/index.js`); do not hardcode different paths unless using custom entries.

### 4. Dependencies

Install `addfox` as dev dependency. Optionally add `webextension-polyfill` for cross-browser API.

```bash
# Initialize package.json if needed
npm init -y

# Install Addfox
npm install -D addfox

# Recommended: Install polyfill
npm install webextension-polyfill
npm install -D @types/webextension-polyfill

# Optional: Add TypeScript
npm install -D typescript

# Optional: Add React
npm install react react-dom
npm install -D @rsbuild/plugin-react @types/react @types/react-dom
```

Add TypeScript/React/Vue etc. only if you intend to use them.

### 5. Scripts and assets

Replace any manual copy/bundle scripts with `addfox dev` and `addfox build`.

**package.json:**
```json
{
  "scripts": {
    "dev": "addfox dev -b chrome",
    "build": "addfox build"
  }
}
```

Icons and static assets: place under `app/` and reference in manifest, or use `rsbuild.output.copy` for a `public/`-style folder:

```ts
// addfox.config.ts
export default defineConfig({
  rsbuild: {
    output: {
      copy: [
        { from: './public', to: '.' }
      ]
    }
  }
});
```

### 6. CSS and styling

**Vanilla CSS:**
```css
/* app/popup/index.css */
body {
  font-family: sans-serif;
  padding: 16px;
}
```

**With Tailwind CSS v4:**
```bash
npm install -D tailwindcss @tailwindcss/postcss postcss
```

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

```ts
// app/popup/index.tsx
import './index.css';
```

### 7. TypeScript migration (optional)

If migrating to TypeScript:

1. Rename `.js` to `.ts`
2. Add type annotations gradually
3. Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["webextension-polyfill"]
  },
  "include": ["app/**/*", "utils/**/*"]
}
```

## Vanilla-specific notes

- **No bundler**: If the project had no bundler, ensure all imports are compatible with Rsbuild (ES modules, supported file types)
- **Global variables**: Replace global `chrome` with imported `browser` from polyfill for consistency
- **Content script and background**: Must not rely on Node-only APIs; use extension APIs and browser globals only
- **CSP**: MV3 has strict CSP; avoid inline scripts and `eval()`
- **ES modules**: Use `import`/`export` instead of global script loading
- **Config field**: Use `rsbuild` (not `rsbuildConfig`) for build configuration overrides

## Before/After comparison

**Vanilla workflow:**
1. Edit `background.js`
2. Edit `content.js`
3. Manually copy files to distribution folder
4. Load in browser
5. Repeat

**Addfox workflow:**
1. Edit `app/background/index.ts`
2. Edit `app/content/index.ts`
3. Run `addfox dev`
4. Auto-rebuild and HMR
5. Extension auto-reloads

## Feature migration

When adding new features during migration:

| Feature | Implementation | Reference |
|---------|----------------|-----------|
| Video download | Background + content | extension-functions-best-practices (Video) |
| AI integration | Sidepanel + AI SDK | extension-functions-best-practices (AI) |
| Screenshot | `chrome.tabs.captureTab` | extension-functions-best-practices (Image) |
| Password manager | Storage + scripting | extension-functions-best-practices (Password Manager) |
| Content UI | `defineShadowContentUI` | addfox-best-practices |

## See also

- [addfox-best-practices skill](../../addfox-best-practices/SKILL.md)
- [extension-functions-best-practices skill](../../extension-functions-best-practices/SKILL.md)
- [addfox-debugging skill](../../addfox-debugging/SKILL.md)
- TypeScript handbook: https://www.typescriptlang.org/docs/
