# Audio Features Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| Boost in-page media volume (e.g. per-domain memory) | Gain on `<video>` / `<audio>` above 100% | [Better-Volume-Booster](https://github.com/zWolfrost/Better-Volume-Booster) |
| Per-tab volume + shortcuts | Per-tab slider, hotkeys | [tab-volume](https://github.com/wokalek/tab-volume) |
| Firefox volume boost | Louder audio in-browser | [volumecontrol](https://github.com/Chaython/volumecontrol) |

**Limits**: `tabCapture` is Chromium-centric; DRM (e.g. Netflix) cannot be “boosted” via Web Audio on decrypted output.

## Common Feature Types

- **Volume Boost**: Amplify volume beyond 100% limit
- **Audio Processing**: Equalizer, effects, pitch adjustment
- **Audio Capture**: Page audio recording/download

## Core APIs and Implementation

### Volume Boost (Web Audio API)

```javascript
function boostVolume(videoElement, boostFactor = 2.0) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaElementSource(videoElement);
  const gainNode = audioContext.createGain();
  
  gainNode.gain.value = boostFactor;
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  return { audioContext, gainNode };
}

// Usage
const video = document.querySelector('video');
const { gainNode } = boostVolume(video, 1.5); // 150% volume

// Adjust later
gainNode.gain.setValueAtTime(2.0, audioContext.currentTime);
```

### Tab Audio Capture (Chromium)

```javascript
// Requires "tabCapture" permission
chrome.tabCapture.capture({
  audio: true,
  video: false
}, (stream) => {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const gainNode = audioContext.createGain();
  
  gainNode.gain.value = 2.0;
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
});
```

### Audio Visualization

```javascript
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256;
source.connect(analyser);

const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

function visualize() {
  analyser.getByteFrequencyData(dataArray);
  // Draw visualization using Canvas
  requestAnimationFrame(visualize);
}
```

### Per-Domain Volume Memory

```javascript
// Store volume setting per domain
async function setDomainVolume(domain, volume) {
  await chrome.storage.local.set({
    [`volume_${domain}`]: volume
  });
}

async function getDomainVolume(domain) {
  const result = await chrome.storage.local.get(`volume_${domain}`);
  return result[`volume_${domain}`] || 1.0;
}
```

## Permissions Required

- `tabCapture` - Capture tab audio (Chromium only)
- `activeTab` - Access page media elements
- `storage` - Save volume preferences

## MV3 Considerations

In Manifest V3, AudioContext must be created in an **offscreen document**:

```javascript
// background.js
chrome.offscreen.createDocument({
  url: 'offscreen/audio.html',
  reasons: ['USER_MEDIA'],
  justification: 'Audio processing'
});

// offscreen/audio.js
const audioContext = new AudioContext();
// Process audio here
```

## Best Practices

1. **Audio Quality**: High boost factors (>3x) may cause distortion/clipping
2. **DRM Content**: Cannot process protected content (Netflix, Spotify)
3. **Volume Warning**: Warn users about potential hearing damage
4. **Mono/Stereo Toggle**: Provide audio channel control
5. **Compatibility**: Firefox doesn't support tabCapture for audio

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| Better Volume Booster | Domain memory, mono/stereo | https://github.com/zWolfrost/Better-Volume-Booster |
| Tab Volume | Per-tab control, hotkeys | https://github.com/wokalek/tab-volume |
| Volume Control | Firefox volume boost | https://github.com/Chaython/volumecontrol |
