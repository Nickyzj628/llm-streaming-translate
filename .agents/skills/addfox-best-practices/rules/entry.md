# Entry Configuration Guide

Detailed guidance on Addfox's entry configuration methods, applicable scenarios and best practices.

---

## Overview of configuration methods

Addfox supports three entry configuration methods, ranked by recommended priority:

| Priority | Configuration method | Applicable scenarios | Complexity |
|--------|----------|----------|--------|
| ⭐ 1 (recommended) | **File-based Entry** | Use built-in reserved names | Easiest |
| 2 | **Manifest direct configuration** | Need to be referenced in manifest | Simple |
| 3 | **Entry field configuration** | Custom entry or non-reserved name | Flexible |

---

## 1. File-based Entry (recommended)

### Core concepts

Do not set the `entry` field, use the default `appDir: "app"`, and place the script in the reserved directory. The framework automatically discovers and handles these entries.

### Preserve directory structure

```
app/
├── background/          → Service worker / Background page
│ ├── index.ts # Main entrance
│ └── utils.ts # Auxiliary module
├── content/             → Content script
│   ├── index.ts
│   └── styles.css
├── popup/ → Toolbar popup page
│   ├── index.tsx
│ └── index.html # Optional: Custom template
├── options/ → options page
│   └── index.tsx
├── sidepanel/ → Chrome sidebar
│   └── index.tsx
├── devtools/            → DevTools page
│   └── index.tsx
├── offscreen/           → Offscreen document (MV3)
│   └── index.tsx
├── newtab/ → New tab page overlay
│   └── index.tsx
├── sandbox/ → sandbox page
│   └── index.ts
├── bookmarks/ → bookmark page overlay
│   └── index.tsx
└── history/ → History page coverage
    └── index.tsx
```

### When to use File-based Entry

✅ **Recommended usage scenarios:**
- Use standard extension functions (popup, options, background, content, etc.)
- Hope the configuration is as simple as possible
- Team collaboration to maintain project structure consistency
- Rapid prototyping

**Configuration example:**

```ts
// addfox.config.ts - minimalist configuration
import { defineConfig } from 'addfox';

export default defineConfig({
  manifest: {
    manifest_version: 3,
    name: 'My Extension',
    version: '1.0.0'
  }
});
```

> No need to configure `entry`, the framework automatically discovers the reserved directory under `app/`.

### Keep entry details

| Entry name | Automatic output path | Generate HTML | Manifest field | Special instructions |
|----------|-------------|-----------|---------------|----------|
| `background` | `background/index.js` | ❌ | `background.service_worker` | MV3 Service Worker |
| `content` | `content/index.js` | ❌ | `content_scripts` | Can be configured with `content_scripts` |
| `popup` | `popup/index.html` | ✅ | `action.default_popup` | Click the toolbar icon to pop up |
| `options` | `options/index.html` | ✅ | `options_ui.page` | Extended options page |
| `sidepanel` | `sidepanel/index.html` | ✅ | `side_panel.default_path` | Chrome sidebar |
| `devtools` | `devtools/index.html` | ✅ | `devtools_page` | Developer Tools Panel |
| `offscreen` | `offscreen/index.html` | ✅ | - | MV3 off-screen document |
| `sandbox` | `sandbox/index.html` | ✅ | `sandbox.pages` | Sandbox pages |
| `newtab` | `newtab/index.html` | ✅ | `chrome_url_overrides.newtab` | New tab page |
| `bookmarks` | `bookmarks/index.html` | ✅ | `chrome_url_overrides.bookmarks` | Bookmarks page |
| `history` | `history/index.html` | ✅ | `chrome_url_overrides.history` | History page |

### Manifest configuration of File-based Entry

When using File-based Entry, **Do not write the complete source file path in the manifest**. The framework will automatically fill in the packaged output path.

```ts
// ✅ Correct - just declare existence and the path is filled in by the frame
const manifest = {
  manifest_version: 3,
  background: {
service_worker: 'background/index.js' // The framework will handle it automatically
  },
  action: {
default_popup: 'popup/index.html' // The framework will handle it automatically
  },
  content_scripts: [{
    matches: ['<all_urls>'],
// js: ['content/index.js'] // No need to write, the frame will fill in automatically
  }]
};
```

---

## 2. Manifest direct configuration

### Core concepts

Configure the source file path directly in the manifest (instead of the packaged path), and the framework will automatically parse and replace it with the correct output path.

### When to use Manifest direct configuration

✅ **Applicable scenarios:**
- Need to explicitly control the entry path
- Multiple content scripts configuration
- Custom path structure but use reserved names
- Need to clearly see the entry definition in the manifest

### Configuration method

```ts
// addfox.config.ts
export default defineConfig({
  manifest: {
    manifest_version: 3,
    name: 'My Extension',
    
// Directly configure the source file path
    action: {
default_popup: 'popup/index.html' // Source file path
    },
    options_ui: {
page: 'options/index.html', // Source file path
      open_in_tab: true
    },
    background: {
service_worker: 'background/index.ts' // Source file path
    },
    content_scripts: [{
      matches: ['<all_urls>'],
js: ['content/index.ts'], // Source file path
css: ['content/styles.css'] // Source file path
    }]
  }
});
```

> **Important**: The **source file path** (relative to `appDir`) is configured, and the framework will automatically parse and replace it with the packaged output path.

### Supported Manifest fields

| Manifest field | Supported source file path formats |
|---------------|---------------------|
| `action.default_popup` | `.html` file path |
| `options_ui.page` | `.html` file path |
| `background.service_worker` | `.js` / `.ts` file path |
| `background.scripts` | `.js` / `.ts` file path array (MV2) |
| `content_scripts[].js` | `.js` / `.ts` file path array |
| `content_scripts[].css` | `.css` / `.scss` / `.less` file path array |
| `side_panel.default_path` | `.html` file path |
| `devtools_page` | `.html` file path |
| `sandbox.pages` | `.html` file path array |
| `chrome_url_overrides.*` | `.html` file path |

---

## 3. Entry field configuration

### Core concepts

Define custom entries explicitly via the `entry` field. This is the only way to support non-reserved name entries.

### When must the Entry field be used?

✅ **Must use scenario:**
- **Custom entry name** (such as `capture`, `injected-helper`, `pdf-worker`, etc.)
- **A reserved name requires multiple independent entries** (such as multiple content scripts)
- **Entry file is not in the default reserved directory structure**
- **Need to disable a reserved entry** (set to `false`)

### Basic configuration

```ts
// addfox.config.ts
export default defineConfig({
  entry: {
// Simple path configuration
    'custom-script': 'scripts/custom.ts',
    
    // Configuration with HTML generation
    'custom-page': {
      src: 'pages/custom.tsx',
html: true // Automatically generate HTML
    },
    
// Use custom HTML template
    'custom-page-with-template': {
      src: 'pages/another.tsx',
html: 'templates/base.html' // Use the specified template
    }
  },
  
  manifest: {
    web_accessible_resources: [{
// Reference the output path (not the source file path)
      resources: [
'custom-script/index.js', // JS entry output
'custom-page/index.html' // HTML entry output
      ],
      matches: ['<all_urls>']
    }]
  }
});
```

### Entry configuration format

```ts
type EntryConfigValue = 
| string // path relative to appDir
| { src: string; html?: boolean | string } // With HTML control
| false; // Disable reserved entry
```

| Configuration form | Description | Example |
|----------|------|------|
| `string` | Entry file path | `'scripts/helper.ts'` |
| `{ src: string }` | Explicitly specify the source file | `{ src: 'pages/app.tsx' }` |
| `{ src, html: true }` | Automatically generate HTML | `{ src: 'popup/main.tsx', html: true }` |
| `{ src, html: string }` | Use an HTML template | `{ src: 'popup/main.tsx', html: 'tpl/popup.html' }` |
| `false` | Disable reserved entry | `{ popup: false }` |

### Common usage scenarios

#### Scenario 1: Multiple Content Scripts

```ts
export default defineConfig({
  entry: {
// Primary content script
    'content': 'content/main.ts',
//Additional injection script
    'content-injected': 'content/injected.ts',
// content script for a specific website
    'content-youtube': 'content/youtube.ts'
  },
  manifest: {
    content_scripts: [
      {
        matches: ['<all_urls>'],
js: ['content/index.js']           // Primary content script
      },
      {
        matches: ['https://www.youtube.com/*'],
js: ['content-youtube/index.js'], // YouTube only
        run_at: 'document_start'
      }
    ],
    web_accessible_resources: [{
      resources: ['content-injected/index.js'],
      matches: ['<all_urls>']
    }]
  }
});
```

#### Scenario 2: Web Accessible Worker

```ts
export default defineConfig({
  entry: {
//worker for page injection
    'page-worker': 'workers/page-worker.ts',
// Worker for off-screen processing
    'offscreen-worker': 'workers/offscreen.ts'
  },
  manifest: {
    web_accessible_resources: [{
      resources: [
        'page-worker/index.js',
        'offscreen-worker/index.js'
      ],
      matches: ['<all_urls>']
    }]
  }
});
```

#### Scenario 3: Disable default reserved entry

```ts
export default defineConfig({
  entry: {
// Disable popup (pure background extension)
    popup: false,
// Disable auto-discovered content
    content: false,
// Custom content entry
    'my-content': 'scripts/content.ts'
  },
  manifest: {
    content_scripts: [{
      matches: ['<all_urls>'],
      js: ['my-content/index.js']
    }]
  }
});
```

#### Scenario 4: Complex multi-page extension

```ts
export default defineConfig({
  entry: {
// keep entry
    background: 'background/index.ts',
    popup: 'popup/index.tsx',
    
// Customize the management background page
    'admin-dashboard': {
      src: 'admin/dashboard.tsx',
      html: true
    },
    
// Customize the welcome page
    'welcome-page': {
      src: 'pages/welcome.tsx',
      html: 'templates/welcome.html'
    },
    
//auxiliary script
    'capture-helper': 'helpers/capture.ts',
    'dom-injector': 'helpers/injector.ts'
  },
  manifest: {
// Expose custom pages through web_accessible_resources
    web_accessible_resources: [
      {
        resources: [
          'admin-dashboard/index.html',
          'welcome-page/index.html',
          'capture-helper/index.js'
        ],
        matches: ['<all_urls>']
      }
    ]
  }
});
```

---

## Scenario selection decision tree

```
Need to create a portal?
├── Is it a standard reserved name? (popup/options/background/content...)
│ ├── Yes → Use File-based Entry (recommended)
│ │ └── Just create app/{name}/index.ts
│   │
│ └── No (custom name such as capture-helper)
│ └── Must be configured using the Entry field
│
└── Yes → Need multiple entries with the same name or a special path?
├── Yes → Use Entry field configuration
└── No → Use File-based Entry
```

---

## Best Practices

### ✅ Do

- **Priority to use File-based Entry**: the simplest and most consistent with the convention
- **Use descriptive names for custom entries**: such as `video-capture` instead of `vc`
- **Use the correct extension when referencing the output path in the manifest**:
- HTML entry: `{name}/index.html`
- JS entry: `{name}/index.js`
- **Use `false` to disable unwanted reserved entries**: avoid accidental builds

### ❌ Don't

- **Don't mix configuration methods** to cause confusion:
  ```ts
// ❌ Not recommended: use both file-based and entry to configure the entry with the same name
  entry: {
    popup: 'custom/popup.tsx'  // This overrides the file-based app/popup/
  }
  ```
- **Do not repeatedly define reserved entries in entry**: unless there are special needs
- **Don't forget to expose required resources in web_accessible_resources**

---

## troubleshooting

### Entrance not found

**Issue**: `app/popup/index.tsx` is created but no popup is generated when building.

**examine**:
1. Make sure the `entry` field is not set to `false` or overwritten
2. Confirm that the file path is correct (relative to `appDir`)
3. Confirm that the file extension is correct (.ts, .tsx, .js, .jsx)

### Custom entry path error

**Issue**: Entry is configured but the build fails.

**examine**:
```ts
// ❌ Error: path should start at appDir
entry: {
  helper: './src/helpers/helper.ts'
}

// ✅ Correct: path relative to appDir
entry: {
  helper: 'helpers/helper.ts'
}
```

### web_accessible_resources 404

**Problem**: The page cannot load custom entry resources.

**examine**:
```ts
// ❌ Error: Source file path referenced
web_accessible_resources: [{
resources: ['helpers/helper.ts'], // Error!
  matches: ['<all_urls>']
}]

// ✅ Correct: quote the output path
web_accessible_resources: [{
resources: ['helper/index.js'], // Correct! Use entry name
  matches: ['<all_urls>']
}]
```

---

## Related documents

- [SKILL.md](../SKILL.md) — Master Best Practice Guide
- [reference.md](../reference.md) — Detailed configuration reference
- [manifest-fields.md](./manifest-fields.md) — Manifest fields reference
- [content-ui.md](./content-ui.md) — Content UI injection guide
