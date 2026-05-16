# Theme/Dark Mode Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| Global dark mode, dynamic analysis, fix media inversion | Readable dark theme on most sites | [darkreader](https://github.com/darkreader/darkreader) |
| UserCSS manager, community styles | Per-site user CSS injection | [stylus](https://github.com/openstyles/stylus) |
| Fine-grained color schemes | Custom palettes and scheduling | [Midnight-Lizard](https://github.com/Midnight-Lizard/Midnight-Lizard) |

**NPM**: [`darkreader`](https://www.npmjs.com/package/darkreader) matches the main repo algorithms; reuse the dynamic theming pipeline in your own extension.

## Common Feature Types

- **Dark Mode**: Automatic/forced dark theme
- **Custom Styling**: User CSS injection
- **Theme Management**: Install, switch, edit themes

## Core Implementation

### CSS Filter Method (Dark Reader approach)

```javascript
function applyDarkMode() {
  const style = document.createElement('style');
  style.id = 'dark-mode-style';
  style.textContent = `
    html {
      filter: invert(100%) hue-rotate(180deg) !important;
    }
    
    /* Revert images and videos */
    img, video, iframe, canvas,
    [style*="background-image"] {
      filter: invert(100%) hue-rotate(180deg) !important;
    }
    
    /* Preserve specific elements */
    .no-dark-mode, .preserve-colors {
      filter: none !important;
    }
  `;
  document.head.appendChild(style);
}

function removeDarkMode() {
  const style = document.getElementById('dark-mode-style');
  if (style) style.remove();
}
```

### Dynamic Theme Generation

```javascript
// Analyze page colors and generate dark theme
function analyzeColors() {
  const computedStyles = window.getComputedStyle(document.body);
  const bgColor = computedStyles.backgroundColor;
  const textColor = computedStyles.color;
  
  // Convert to RGB
  const bgRgb = parseColor(bgColor);
  
  // Determine if dark
  const brightness = (bgRgb.r * 299 + bgRgb.g * 587 + bgRgb.b * 114) / 1000;
  
  return brightness < 128;
}

function generateDarkVariables() {
  return `
    :root {
      --darkreader-bg: #1a1a1a;
      --darkreader-text: #e0e0e0;
      --darkreader-border: #444;
    }
    
    body {
      background-color: var(--darkreader-bg) !important;
      color: var(--darkreader-text) !important;
    }
  `;
}
```

### UserCSS / Stylus Format

```javascript
// Parse UserCSS metadata
function parseUserCSS(css) {
  const metadata = {};
  const metaBlock = css.match(/==UserStyle==([\s\S]*?)==\/UserStyle==/);
  
  if (metaBlock) {
    const lines = metaBlock[1].split('\n');
    for (const line of lines) {
      const match = line.match(/@(\w+)\s+(.+)/);
      if (match) {
        metadata[match[1]] = match[2];
      }
    }
  }
  
  // Extract actual CSS
  const actualCSS = css.replace(/==UserStyle==[\s\S]*?==\/UserStyle==/, '');
  
  return { metadata, css: actualCSS };
}

// Example UserCSS
/*
==UserStyle==
@name         Dark GitHub
@namespace    github.com/openstyles
@version      1.0.0
@description  Dark theme for GitHub
@author       Me
@match        https://github.com/*
==/UserStyle==

body {
  background: #0d1117 !important;
  color: #c9d1d9 !important;
}
*/
```

### Apply Custom CSS

```javascript
function applyCustomCSS(css, urlPattern) {
  if (!matchesUrl(urlPattern, location.href)) return;
  
  const style = document.createElement('style');
  style.className = 'custom-user-style';
  style.textContent = css;
  document.head.appendChild(style);
}

// Storage and management
async function saveStyle(name, css, patterns) {
  const styles = await chrome.storage.local.get('userStyles');
  styles.userStyles = styles.userStyles || {};
  styles.userStyles[name] = { css, patterns, enabled: true };
  await chrome.storage.local.set(styles);
}

async function applyAllStyles() {
  const { userStyles } = await chrome.storage.local.get('userStyles');
  
  for (const [name, style] of Object.entries(userStyles || {})) {
    if (style.enabled) {
      for (const pattern of style.patterns) {
        applyCustomCSS(style.css, pattern);
      }
    }
  }
}
```

### Auto Theme Switching

```javascript
// Follow system theme
if (window.matchMedia) {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  darkModeQuery.addEventListener('change', (e) => {
    if (e.matches) {
      applyDarkMode();
    } else {
      removeDarkMode();
    }
  });
  
  // Initial check
  if (darkModeQuery.matches) {
    applyDarkMode();
  }
}

// Scheduled switching
function scheduleThemeSwitch() {
  const now = new Date();
  const sunset = new Date();
  sunset.setHours(18, 0, 0);
  
  const sunrise = new Date();
  sunrise.setHours(6, 0, 0);
  
  if (now > sunset || now < sunrise) {
    applyDarkMode();
  } else {
    removeDarkMode();
  }
}
```

## Permissions Required

- `activeTab` or `<all_urls>` - Inject styles
- `storage` - Store user styles
- `scripting` (MV3) - CSS injection

## Best Practices

1. **Performance**: CSS filters can impact large pages
2. **Image Handling**: Ensure images display correctly
3. **iframe Handling**: Recursively handle nested iframes
4. **FOUC Prevention**: Inject styles as early as possible
5. **Site Compatibility**: Provide exclude list
6. **Storage**: Use IndexedDB for large style collections

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| Dark Reader | Dynamic dark mode, smart inversion | https://github.com/darkreader/darkreader |
| Stylus | UserCSS manager, cloud sync | https://github.com/openstyles/stylus |
| Midnight Lizard | Custom color schemes | https://github.com/Midnight-Lizard/Midnight-Lizard |

## NPM Package

```javascript
// Dark Reader API
import { enable, disable, auto } from 'darkreader';

enable({
  brightness: 100,
  contrast: 90,
  sepia: 10,
  mode: 1 // 1 = dynamic, 0 = static
});

disable();

// Auto follow system
auto({
  brightness: 100,
  contrast: 90,
  sepia: 10
});
```
