# Video Features Implementation Guide

## Store- and community-verified reference implementations

| Area | User-visible outcome | Repo |
|------|----------------------|------|
| In-page video UX (rotate/zoom/filters, etc.) | Live transforms on `<video>`, many sites | [VideoRoll](https://github.com/VideoRoll/VideoRoll) |
| Site-specific enhancement (see repo) | Player UI / behavior tweaks | [YouTube-Enhancer](https://github.com/YouTube-Enhancer/extension) |
| Sniffing + parsing + external downloader | Hand M3U8/MPD to N_m3u8DL-RE, etc. | [cat-catch](https://github.com/xifangczy/cat-catch) |
| In-extension HLS download + merge | Pick quality → playable local file (non-DRM) | [live-stream-downloader](https://github.com/chandler-stimson/live-stream-downloader) |
| HLS-focused detection + download | Detect page HLS and run download flow | [hls-downloader](https://github.com/puemos/hls-downloader) |
| Mature sniffing + native companion | Convert/merge with vdhcoapp, etc. | [video-downloadhelper](https://github.com/aclap-dev/video-downloadhelper) |
| Recording + annotations | Record tab/screen and export | [Screenity](https://github.com/alyssaxuu/screenity) |

**Downloads**: `chrome.downloads.download(m3u8Url)` alone is usually **not** a successful video download; you need segment fetch + merge or external tools—see [rules/download.md](download.md).

## Common Feature Types

- **Video Experience Enhancement**: Rotation, zoom, speed control, volume boost, filters, screenshot, Picture-in-Picture
- **Video Download**: Media sniffing, download management, format conversion
- **Recording**: Screen/tab/camera recording

## Core APIs and Implementation

### Video Element Detection

```javascript
// Detect all video elements on page
const videos = document.querySelectorAll('video');

// Handle dynamically loaded videos
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.tagName === 'VIDEO') {
        enhanceVideo(node);
      }
    });
  });
});
observer.observe(document.body, { childList: true, subtree: true });
```

### Video Control Implementation

```javascript
// Speed control (0.25x - 16x)
video.playbackRate = 2.0;

// Rotation and zoom via CSS
video.style.transform = 'rotate(90deg) scale(1.5)';

// Volume boost using Web Audio API
const audioContext = new AudioContext();
const source = audioContext.createMediaElementSource(video);
const gainNode = audioContext.createGain();
gainNode.gain.value = 2.0; // 200% volume
source.connect(gainNode);
gainNode.connect(audioContext.destination);

// Screenshot using canvas
const canvas = document.createElement('canvas');
canvas.width = video.videoWidth;
canvas.height = video.videoHeight;
const ctx = canvas.getContext('2d');
ctx.drawImage(video, 0, 0);
const dataUrl = canvas.toDataURL('image/png');
```

### Picture-in-Picture

```javascript
// Request PiP
video.requestPictureInPicture();

// Listen for events
video.addEventListener('enterpictureinpicture', (e) => {
  console.log('Entered PiP:', e.pictureInPictureWindow);
});
```

## Video Download Implementation

### Media Sniffing

```javascript
// MV2: webRequest API (MV2 only; observes URLs; MP4 direct vs HLS playlist need different follow-up)
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (isVideoUrl(details.url)) {
      captureMediaUrl(details.url, details.type);
    }
  },
  { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest'] }
);

// MV3: No equivalent global webRequest observer. For production patterns see the repos above
// (e.g. DNR, devtools, page injection, Native Messaging combinations).
```

### M3U8/MPD Parsing

```javascript
// Parse M3U8 playlist
async function parseM3U8(url) {
  const response = await fetch(url);
  const text = await response.text();
  const lines = text.split('\n');
  const segments = [];
  
  for (const line of lines) {
    if (line.endsWith('.ts') || line.endsWith('.m4s')) {
      segments.push(new URL(line, url).href);
    }
  }
  return segments;
}
```

### Download Triggering

```javascript
chrome.downloads.download({
  url: videoUrl,
  filename: 'video.mp4',
  headers: [
    { name: 'Referer', value: pageUrl }
  ]
});
```

## Screen Recording

```javascript
// Get display media
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: { mediaSource: 'screen' },
  audio: true
});

// Record using MediaRecorder
const recorder = new MediaRecorder(stream);
const chunks = [];

recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  // Download or process the recording
};

recorder.start();
```

## Permissions Required

- `activeTab` or `*://*/*` - Access page content
- `downloads` - Download media files
- `webRequest` (MV2) / `declarativeNetRequest` (MV3) - Network interception
- `tabCapture` - Tab recording
- `offscreen` (MV3) - Audio processing in background

## Best Practices

1. **Compliance & DRM**: Separate “enhance playback” from “download”; EME/Widevine or site policy may make lawful decryption-by-extension impossible.
2. **HLS/DASH**: Playlist URL ≠ finished file; follow parsing, segmenting, and merge strategies in Cat Catch, Live Stream Downloader, Video DownloadHelper, etc.
3. **Memory management**: Stream large downloads; avoid buffering entire files in memory.
4. **CORS / auth headers**: Direct URL downloads often need Referer, Cookie, etc.; missing headers → empty files or 403.
5. **Performance**: Throttle video-node scanning to avoid layout thrash.
6. **MV3**: Use offscreen for audio processing where needed; network sniffing must use MV3-viable architecture—do not assume blocking `webRequest`.

## Reference Projects

| Project | Type | GitHub |
|---------|------|--------|
| Video Roll | Enhancement | https://github.com/VideoRoll/VideoRoll |
| YouTube Enhancer | Enhancement | https://github.com/YouTube-Enhancer/extension |
| Cat Catch | Download / sniffing | https://github.com/xifangczy/cat-catch |
| Live Stream Downloader | Download / HLS merge | https://github.com/chandler-stimson/live-stream-downloader |
| HLS Downloader | Download / HLS | https://github.com/puemos/hls-downloader |
| Video DownloadHelper | Download / companion app | https://github.com/aclap-dev/video-downloadhelper |
| Screenity | Recording | https://github.com/alyssaxuu/screenity |
