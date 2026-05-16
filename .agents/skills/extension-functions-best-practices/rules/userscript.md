# Userscript Manager Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| Userscript manager (de facto standard) | Install/update scripts, `@grant` APIs | [Tampermonkey](https://github.com/Tampermonkey/tampermonkey) |
| Open-source manager | Violentmonkey ecosystem | [violentmonkey](https://github.com/violentmonkey/violentmonkey) |
| Firefox-native direction | Greasemonkey compatibility | [greasemonkey](https://github.com/greasemonkey/greasemonkey) |
| Background scripts / extended features | Per ScriptCat README | [scriptcat](https://github.com/scriptscat/scriptcat) |
| Modern build + HMR | Develop userscripts with Vite | [vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey) |

**Note**: `GM_xmlhttpRequest` and similar require proxying from background/service worker; naive `eval` of user code raises security and CSP issues—these manager repos show architectures that **actually run scripts safely**.

## Common Feature Types

- **Script Manager**: Install, update, execute userscripts
- **Page Enhancement**: Automated page modifications
- **Automation**: Auto-fill, auto-click, data scraping

## Core Implementation

### Userscript Metadata Parsing

```javascript
function parseMetadata(code) {
  const metadata = {};
  const match = code.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
  
  if (match) {
    const lines = match[1].split('\n');
    for (const line of lines) {
      const keyValue = line.match(/@(\w+)\s+(.+)/);
      if (keyValue) {
        const [, key, value] = keyValue;
        if (!metadata[key]) metadata[key] = [];
        metadata[key].push(value);
      }
    }
  }
  
  return metadata;
}

// Example metadata block
/*
// ==UserScript==
// @name         My Script
// @namespace    http://example.com/
// @version      1.0
// @match        https://example.com/*
// @grant        GM_setValue
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==
*/
```

### Script Injection

```javascript
function injectUserscript(code, metadata) {
  // Create isolated context
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      'use strict';
      ${code}
    })();
  `;
  
  // Inject into page context for full access
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}
```

### GM API Implementation

```javascript
// GM_setValue / GM_getValue
const GM_storage = {};

function GM_setValue(key, value) {
  GM_storage[key] = value;
  chrome.storage.local.set({ [`gm_${key}`]: value });
}

async function GM_getValue(key, defaultValue) {
  const result = await chrome.storage.local.get(`gm_${key}`);
  return result[`gm_${key}`] || defaultValue;
}

// GM_xmlhttpRequest (bypass CORS)
function GM_xmlhttpRequest(details) {
  chrome.runtime.sendMessage({
    action: 'GM_XHR',
    details
  }, (response) => {
    if (response.success && details.onload) {
      details.onload(response);
    } else if (!response.success && details.onerror) {
      details.onerror(response);
    }
  });
}

// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'GM_XHR') {
    fetch(msg.details.url, {
      method: msg.details.method || 'GET',
      headers: msg.details.headers,
      body: msg.details.data
    })
    .then(r => r.text())
    .then(text => sendResponse({ success: true, responseText: text }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    
    return true; // Async response
  }
});

// GM_addStyle
function GM_addStyle(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}
```

### URL Matching

```javascript
function matchesUrl(pattern, url) {
  // Convert @match pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  
  return new RegExp(regexPattern).test(url);
}

// Check if script should run on current page
function shouldRunScript(metadata) {
  const currentUrl = location.href;
  
  if (metadata.match) {
    return metadata.match.some(pattern => matchesUrl(pattern, currentUrl));
  }
  
  if (metadata.include) {
    return metadata.include.some(pattern => matchesUrl(pattern, currentUrl));
  }
  
  return true;
}
```

## Permissions Required

- `<all_urls>` - Run scripts on any page
- `storage` - Store script data
- `webRequest` - GM_xmlhttpRequest CORS bypass
- `activeTab` - Current page injection

## Best Practices

1. **Sandbox Security**: Run userscripts in isolated context
2. **Error Handling**: Script errors shouldn't break page
3. **Performance**: Lazy load scripts, use efficient selectors
4. **Storage Quotas**: Implement storage cleanup
5. **Update Checking**: Check @updateURL periodically
6. **Conflict Resolution**: Handle multiple scripts on same page

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| Tampermonkey | Most popular, cloud sync | https://github.com/Tampermonkey/tampermonkey |
| Violentmonkey | Open source, lightweight | https://github.com/violentmonkey/violentmonkey |
| Greasemonkey | Firefox native | https://github.com/greasemonkey/greasemonkey |
| ScriptCat | Chinese, background scripts | https://github.com/scriptscat/scriptcat |

## Development Tools

- **vite-plugin-monkey**: https://github.com/lisonge/vite-plugin-monkey
  Modern dev tool with HMR and TypeScript support
