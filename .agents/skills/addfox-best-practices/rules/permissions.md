# Permissions — usage and recommendations

Guidance for choosing and documenting extension permissions when using Addfox. Align with [Chrome permissions](https://developer.chrome.com/docs/extensions/reference/manifest/permissions) and store policies.

## Principles

1. **Least privilege**: Request only permissions needed for declared features.
2. **Document**: In store listing and (if applicable) privacy policy, explain why each sensitive permission is used.
3. **Avoid broad host access when possible**: Prefer `activeTab` or specific `host_permissions` over `<all_urls>`.

## Common permissions (brief)

| Permission | Typical use |
|------------|-------------|
| **storage** | Save settings, cache; use `chrome.storage.local` / `sync`. |
| **activeTab** | Access current tab only when user invokes extension (e.g. click action). No host_permissions needed for that tab. |
| **tabs** | Read tab metadata (url, title). Needed for tab list, tab-specific behavior. |
| **scripting** | Inject scripts or CSS. Use for content script–like injection at runtime. |
| **contextMenus** | Add right-click menu items. |
| **alarms** | Timers in service worker (prefer over setTimeout for long-lived scheduling). |
| **notifications** | Show system notifications. |
| **cookies** | Access cookies (host permission often required). Document if used. |
| **downloads** | Trigger file downloads. |
| **webRequest** / **webRequestBlocking** | MV3: prefer **declarativeNetRequest** where possible; webRequest is restricted. |

## host_permissions

- **&lt;all_urls&gt;** : Access any host. Required for content scripts that run on many sites, or for fetch/XHR to arbitrary URLs. Document clearly.
- **Specific patterns**: e.g. `["*://*.example.com/*"]` when only certain domains are needed.
- **activeTab**: Grants temporary access to current tab on user gesture; often avoids need for broad host_permissions.

## Optional permissions

Use **optional_permissions** for capabilities requested at runtime (e.g. after user clicks “Enable” in options). Reduces initial permission surface; document in UI.

## Store and review

- Chrome and Firefox both expect permission justification in description and privacy policy when handling user data or broad access.
- Avoid requesting permissions for unimplemented or future features.
