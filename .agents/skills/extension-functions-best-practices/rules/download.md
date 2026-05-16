# Download Features Implementation Guide

## Reality check & common pitfalls (read this)

Sample code in this guide illustrates API shapes; **copy-pasting often does not yield a playable video file**, because:

- **HLS (`.m3u8`) / DASH (`.mpd`)**: The master playlist is text; real media is many `.ts` / `.m4s` segments. Calling `chrome.downloads.download` on the playlist URL usually saves **only the playlist**, not a merged MP4.
- **Auth and hotlink protection**: Direct URLs often need `Referer`, `Cookie`, `Origin`, or short-lived tokens; missing headers → 403 or empty files. Wrapping `fetch` in a content script **does not observe all subresources** and can fight CSP / page logic.
- **DRM (Widevine, etc.) and ToS**: Encrypted streams are gated by EME; extensions cannot legally “decrypt for download.” Respect site terms and distinguish user-owned / authorized assets from platform-hosted content.
- **Manifest V3**: There is **no** MV2-equivalent blocking `webRequest` sniffing in the service worker. Production approaches include **declarativeNetRequest (limited)**, **devtools.network (DevTools open)**, **page-context hooks (fragile)**, or **native helpers (Native Messaging)**—align with the mature projects below.

## Store- and community-verified reference implementations

| Capability | User-visible outcome | Repo | Notes |
|------------|----------------------|------|-------|
| Sniffing + M3U8/MPD parsing + external downloader | Capture stream → send to N_m3u8DL-RE / PotPlayer, etc. | [cat-catch](https://github.com/xifangczy/cat-catch) | High activity; learn sniff → parse → external tool handoff |
| In-extension HLS detection + multi-thread merge to disk | Pick quality → single local file (if stream is not encrypted) | [live-stream-downloader](https://github.com/chandler-stimson/live-stream-downloader) | Store listing available; learn segment fetch, disk write, merge |
| General video sniffing + native companion | Detect media → convert/merge in browser or with desktop app | [video-downloadhelper](https://github.com/aclap-dev/video-downloadhelper) and [vdhcoapp](https://github.com/aclap-dev/vdhcoapp) | Production extension OSS core; learn extension + Native Messaging / external FFmpeg |
| Multi-connection / resume for direct URLs | Faster large files, pause/resume | [turbo-download-manager-v2](https://github.com/inbasic/turbo-download-manager-v2) | MPL-2.0; queues and segmentation |
| Export cookies for aria2 / yt-dlp | Pass site cookies to CLI downloaders | [stream-detector](https://github.com/54ac/stream-detector) | GPL-3.0; extension → external CLI workflow |

**CLI / desktop (not extensions; often paired with the above)**: [N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [aria2](https://github.com/aria2/aria2).

## Common Feature Types

- **Batch Download**: Multiple file downloads
- **Download Management**: Queue, resume, multi-threading
- **Resource Sniffing**: Auto-detect downloadable resources

## Core APIs and Implementation

### Resource Sniffing (MV2)

```javascript
// MV2 webRequest API
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (isDownloadableResource(details.url, details.type)) {
      captureResource(details);
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

function isDownloadableResource(url, type) {
  const videoExts = ['.mp4', '.webm', '.m3u8', '.mpd'];
  const audioExts = ['.mp3', '.m4a', '.wav', '.ogg'];
  
  return videoExts.some(ext => url.includes(ext)) ||
         audioExts.some(ext => url.includes(ext)) ||
         type === 'media';
}
```

### Resource Sniffing (MV3)

```javascript
// Use declarativeNetRequest for known patterns
// Or content script to intercept fetch/XHR

// content_script.js
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  
  // Capture media responses
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('video')) {
    chrome.runtime.sendMessage({
      type: 'CAPTURED_MEDIA',
      url: args[0]
    });
  }
  
  return response;
};
```

### Download with Custom Headers

```javascript
chrome.downloads.download({
  url: resourceUrl,
  filename: 'video.mp4',
  headers: [
    { name: 'Referer', value: pageUrl },
    { name: 'User-Agent', value: navigator.userAgent }
  ],
  saveAs: false
});
```

### External Downloader Integration

```javascript
// URL Protocol scheme
function openWithExternalDownloader(url, referer) {
  const command = `mydownloader://download?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
  window.open(command);
}

// Native Messaging (requires native host)
async function downloadWithNativeHost(url) {
  const port = chrome.runtime.connectNative('com.mycompany.downloader');
  port.postMessage({ action: 'download', url });
  
  port.onMessage.addListener((response) => {
    console.log('Download status:', response);
  });
}
```

### Download Progress Tracking

```javascript
chrome.downloads.onCreated.addListener((downloadItem) => {
  console.log('Download started:', downloadItem.id);
});

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state) {
    console.log('Download state changed:', delta.state.current);
  }
  if (delta.bytesReceived) {
    console.log('Progress:', delta.bytesReceived.current);
  }
});
```

## Permissions Required

- `downloads` - Manage downloads
- `webRequest` (MV2) / `declarativeNetRequest` (MV3) - Sniff resources
- `nativeMessaging` - Integrate external downloaders

## Best Practices

1. **Memory Management**: Stream large files, don't buffer in memory
2. **CORS/Referer**: Pass correct headers for hotlink-protected resources
3. **File Naming**: Sanitize filenames, preserve original extensions
4. **Conflict Handling**: Handle duplicate filenames
5. **Progress UI**: Show download progress for large files
6. **Error Recovery**: Implement retry logic for failed downloads

## Reference projects (same as the table above, quick links)

| Project | Features | GitHub |
|---------|----------|--------|
| Cat Catch | Sniffing, M3U8/MPD, external downloaders | https://github.com/xifangczy/cat-catch |
| Live Stream Downloader | In-extension HLS detection and merged download | https://github.com/chandler-stimson/live-stream-downloader |
| Video DownloadHelper | Sniffing + vdhcoapp / conversion pipeline | https://github.com/aclap-dev/video-downloadhelper |
| Stream Detector | Cookie export, stream detection | https://github.com/54ac/stream-detector |
| Turbo Download Manager v2 | Multi-connection, resume | https://github.com/inbasic/turbo-download-manager-v2 |

## External Downloaders

- **N_m3u8DL-RE**: https://github.com/nilaoda/N_m3u8DL-RE
- **yt-dlp**: https://github.com/yt-dlp/yt-dlp
- **aria2**: https://github.com/aria2/aria2
