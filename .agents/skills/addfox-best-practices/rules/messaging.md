# Messaging in extensions

Patterns for communication between background, content scripts, and extension pages (popup, options) when using Addfox.

## Include message origin

Always include a **from** (or equivalent) field in message payloads so the receiver can identify the sender. Senders can be: `"background"`, `"content"`, `"popup"`, `"options"`, or a custom page/custom content script id.

Example payload:

```ts
chrome.runtime.sendMessage({
  from: "popup",
  action: "getSettings",
  payload: {},
});
```

Receiver (e.g. background):

```ts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.from === "popup" && msg.action === "getSettings") {
    // handle
  }
});
```

This avoids confusion when multiple content scripts or pages send messages and simplifies routing and security checks.

## Channels

- **Extension context**: Use `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` (or `browser.*` with webextension-polyfill). Messages stay within the extension.
- **Content ↔ page script**: Use `window.postMessage` and validate `event.origin` (e.g. `chrome.runtime.getURL("")` or expected page origin). Prefer extension messaging when only background/popup/content are involved.

## One-shot vs long-lived

- **sendMessage**: One-shot; use when a single response is enough.
- **connect (port)**: Long-lived channel for streaming or repeated messages. Remember to close or disconnect when done.

## Security

- Validate message structure and `from` (and optionally `sender.url` / `sender.tab`) before acting.
- Do not trust data from content script as if it were from background; content script can be in a compromised page context.
