# Ad Blocker Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| Efficient engine + dynamic rules + cosmetic filtering | With EasyList-style lists, fewer ads and trackers | [uBlock](https://github.com/gorhill/uBlock) |
| Heuristic tracker protection | Learns and blocks trackers as you browse | [privacybadger](https://github.com/EFForg/privacybadger) |
| Commercial-grade OSS extension | Feature layering aligned with AdGuard products | [AdguardBrowserExtension](https://github.com/AdguardTeam/AdguardBrowserExtension) |

**Note**: MV3 caps rule counts; uBO and peers ship **production** `declarativeNetRequest`, rule compilation, and performance code—prefer them over tutorial filter pseudocode.

## Common Feature Types

- **Ad Blocking**: Prevent ad loading
- **Tracker Blocking**: Block tracking scripts
- **Privacy Protection**: Anti-fingerprinting, link cleaning
- **Malware Protection**: Phishing/malware site blocking

## Core Implementation

### Filter Rule System

```javascript
// EasyList-style filter parsing
class FilterEngine {
  constructor() {
    this.rules = [];
  }
  
  parseRule(rule) {
    // ||example.com^$third-party
    const match = rule.match(/\|\|([^\^]+)\^(.*)/);
    if (match) {
      return {
        domain: match[1],
        options: this.parseOptions(match[2])
      };
    }
    return null;
  }
  
  parseOptions(optionsStr) {
    const options = {};
    if (optionsStr.includes('third-party')) {
      options.thirdParty = true;
    }
    if (optionsStr.includes('script')) {
      options.types = ['script'];
    }
    return options;
  }
  
  shouldBlock(url, context) {
    return this.rules.some(rule => {
      return url.includes(rule.domain) &&
             (!rule.options.thirdParty || context.isThirdParty);
    });
  }
}
```

### MV2: webRequest API

```javascript
// Manifest V2 blocking
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (shouldBlock(details.url, details)) {
      return { cancel: true };
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// Redirect to local resource
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    return {
      redirectUrl: chrome.runtime.getURL('blocked.html')
    };
  },
  { urls: ['*://*.tracker.com/*'] },
  ['blocking']
);
```

### MV3: declarativeNetRequest

```javascript
// manifest.json
{
  "declarative_net_request": {
    "rule_resources": [{
      "id": "filters",
      "enabled": true,
      "path": "rules.json"
    }],
    "dynamic_rules": {
      "max_number_of_dynamic_rules": 5000
    }
  }
}

// rules.json (static rules)
[
  {
    "id": 1,
    "priority": 1,
    "action": { "type": "block" },
    "condition": {
      "urlFilter": "||example-ad.com",
      "resourceTypes": ["script", "image"]
    }
  }
]

// Dynamic rules (runtime)
async function addDynamicRule(id, filter) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [{
      id,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: filter,
        resourceTypes: ['script', 'xmlhttprequest']
      }
    }],
    removeRuleIds: [id]
  });
}
```

### Cosmetic Filtering (Element Hiding)

```javascript
// Inject CSS to hide ad elements
function injectCosmeticFilters(selectors) {
  const style = document.createElement('style');
  style.textContent = selectors
    .map(s => `${s} { display: none !important; }`)
    .join('\n');
  document.head.appendChild(style);
}

// Common ad selectors
const AD_SELECTORS = [
  '.ad',
  '.advertisement',
  '#banner-ad',
  '[class*="ad-"]',
  '[id*="googleads"]'
];

// Dynamic content handling
const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1) { // Element
        AD_SELECTORS.forEach(selector => {
          if (node.matches && node.matches(selector)) {
            node.style.display = 'none';
          }
          node.querySelectorAll?.(selector).forEach(el => {
            el.style.display = 'none';
          });
        });
      }
    });
  });
});
```

### Privacy Headers

```javascript
// Send Do Not Track and Global Privacy Control
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    details.requestHeaders.push(
      { name: 'DNT', value: '1' },
      { name: 'Sec-GPC', value: '1' }
    );
    return { requestHeaders: details.requestHeaders };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestHeaders']
);
```

## Permissions Required

- `declarativeNetRequest` / `webRequest` (MV2)
- `<all_urls>` - Block all requests
- `storage` - Store filter lists

## Best Practices

1. **Rule Efficiency**: Use Trie tree for fast matching
2. **Memory Management**: Limit stored filter lists
3. **False Positive Handling**: Allow user whitelist
4. **MV3 Limits**: Max 5000 dynamic rules, 30000 static
5. **Update Mechanism**: Regular filter list updates
6. **Transparency**: Show what's being blocked

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| uBlock Origin | Efficient, low resource | https://github.com/gorhill/uBlock |
| Privacy Badger | Algorithmic tracking detection | https://github.com/EFForg/privacybadger |
| AdGuard | Commercial-grade | https://github.com/AdguardTeam/AdguardBrowserExtension |

## Filter Lists

- **EasyList**: https://easylist.to/
- **EasyPrivacy**: https://easylist.to/
- **uBlock filters**: https://github.com/uBlockOrigin/uAssets
