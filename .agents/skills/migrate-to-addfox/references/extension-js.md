# Migrate from Extension.js / CRXJS to Addfox

## Mapping overview

| Extension.js / CRXJS | Addfox |
|----------------------|-------|
| Vite + `@crxjs/vite-plugin` (or similar) | Rsbuild via Addfox; no Vite in pipeline |
| `manifest.json` + Vite entry points | `addfox.config.ts` + `app/` entry discovery or explicit `entry` |
| Vite output dir | `.addfox/extension/` |
| `vite.config.ts` | `addfox.config.ts` + `rsbuild` field (not `rsbuildConfig`) |
| HMR via Vite | HMR via Rsbuild |
| `import.meta.env` | `process.env.*` with `envPrefix` or `rsbuild.source.define` |

## Steps

### 1. Create addfox config

Add `addfox.config.ts` at project root with `defineConfig`.

**Extension.js/CRXJS:**
```js
// vite.config.js
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist'
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
  description: 'Migrated from CRXJS',
  permissions: ['storage', 'activeTab'],
  host_permissions: ['<all_urls>'],
  action: {
    default_popup: 'popup/index.html'
  },
  background: {
    service_worker: 'background/index.js'
  },
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['content/index.js']
  }],
  options_ui: { open_in_tab: true }
};

export default defineConfig({
  manifest: { chromium: manifest, firefox: { ...manifest } },
  plugins: [pluginReact()]
});
```

### 2. Entry layout

Place background, content, popup, options scripts under `app/` with standard names.

**Extension.js structure:**
```
src/
├── background.js
├── content.js
├── popup/
│   ├── index.html
│   └── main.jsx
└── options/
    ├── index.html
    └── main.jsx
```

**Addfox structure:**
```
app/
├── background/
│   └── index.ts        (was src/background.js)
├── content/
│   └── index.ts        (was src/content.js)
├── popup/
│   ├── index.html      (optional - auto-generated)
│   └── index.tsx       (was src/popup/main.jsx)
└── options/
    ├── index.html      (optional)
    └── index.tsx       (was src/options/main.jsx)
```

If Extension.js used multiple content scripts, define each in `entry` and in manifest `content_scripts` with matching paths:

```ts
// addfox.config.ts
export default defineConfig({
  entry: {
    'content-main': 'app/content/main.ts',
    'content-video': 'app/content/video.ts'
  },
  manifest: {
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content-main/index.js']
      },
      {
        matches: ['*://*.youtube.com/*'],
        js: ['content-video/index.js']
      }
    ]
  }
});
```

### 3. Manifest

**Do not write content script source paths in the manifest**; the framework fills built output paths for the content entry.

**Extension.js:**
```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "src/background.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["src/content.js"]
  }]
}
```

**Addfox:**
```ts
const manifest = {
  manifest_version: 3,
  background: {
    service_worker: 'background/index.js'  // Output path, filled by framework
  },
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['content/index.js']  // Output path, not source path
  }]
};

export default defineConfig({
  manifest: { chromium: manifest, firefox: { ...manifest } }
});
```

Background: Addfox outputs `background/index.js` (service worker); ensure `manifest.background.service_worker` is not overridden with a Vite-specific path.

### 4. Dependencies and build

Remove Vite and CRXJS/Extension.js plugin; add `addfox`.

```bash
# Remove old dependencies
npm uninstall vite @crxjs/vite-plugin

# Install Addfox
npm install -D addfox
npm install webextension-polyfill

# Install framework plugin
npm install -D @rsbuild/plugin-react  # or @addfox/rsbuild-plugin-vue, etc.
```

Replace `vite build` / `vite dev` with `addfox dev` and `addfox build`.

**package.json scripts:**
```json
{
  "scripts": {
    "dev": "addfox dev -b chrome",
    "build": "addfox build"
  }
}
```

For React/Vue/Svelte, use Addfox's `plugins` array with Rsbuild plugins.

### 5. Environment variables

Replace Vite's `import.meta.env` usage with `process.env` and `envPrefix`:

**Extension.js:**
```ts
const apiKey = import.meta.env.VITE_API_KEY;
```

**Addfox:**
```ts
// addfox.config.ts
export default defineConfig({
  envPrefix: ['VITE_'],  // Only expose VITE_* variables
});

// In code
const apiKey = process.env.VITE_API_KEY;
```

Or use `rsbuild.source.define` for specific values:

```ts
export default defineConfig({
  rsbuild: {
    source: {
      define: {
        'process.env.API_URL': JSON.stringify('https://api.example.com')
      }
    }
  }
});
```

### 6. Import paths

**Extension.js:**
```ts
import { Button } from '~/components/Button';
```

**Addfox:**
```ts
// Use relative imports
import { Button } from '../../components/Button';

// Or configure alias in addfox.config.ts
export default defineConfig({
  rsbuild: {
    source: {
      alias: {
        '~': './app'
      }
    }
  }
});
```

### 7. Static assets

**Extension.js:**
```js
// vite.config.js
export default {
  publicDir: 'public'
};
```

**Addfox:**
```ts
// addfox.config.ts
export default defineConfig({
  rsbuild: {
    output: {
      copy: [{ from: './public', to: '.' }]
    }
  }
});
```

### 8. Tailwind CSS migration

**Extension.js:**
```js
// vite.config.js
import tailwindcss from 'tailwindcss';

export default {
  css: {
    postcss: {
      plugins: [tailwindcss()]
    }
  }
};
```

**Addfox (Tailwind v4):**
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

## Extension.js-specific notes

- **HMR**: Addfox provides its own HMR for extension pages; behavior may differ from Vite HMR
- **Dynamic imports**: Supported by Rsbuild; ensure paths are valid for extension context (no dynamic host URLs unless allowed by CSP)
- **Asset handling**: Rsbuild handles assets differently than Vite; check `rsbuild.output.copy` for static assets
- **Public folder**: Use `rsbuild.output.copy` instead of Vite's `publicDir`
- **Config field**: Use `rsbuild` (not `rsbuildConfig`) for build overrides
- **Plugins**: Use Rsbuild plugins (`@rsbuild/plugin-*`) instead of Vite plugins

## Feature migration

| Feature | Extension.js Pattern | Addfox Pattern | Reference |
|---------|---------------------|---------------|-----------|
| Video download | Background fetch | Same | extension-functions-best-practices (Video) |
| AI sidebar | Popup/sidepanel | `app/sidepanel/` | extension-functions-best-practices (AI) |
| Screenshot | `chrome.tabs.captureTab` | Same API | extension-functions-best-practices (Image) |
| Content UI | Vite component | `defineShadowContentUI` | addfox-best-practices |

## See also

- [addfox-best-practices skill](../../addfox-best-practices/SKILL.md)
- [extension-functions-best-practices skill](../../extension-functions-best-practices/SKILL.md)
- Rsbuild documentation: https://rsbuild.dev
