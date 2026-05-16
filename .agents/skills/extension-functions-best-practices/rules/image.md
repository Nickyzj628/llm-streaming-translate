# Image Features Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| Batch scrape, filter, download images | List, filter, bulk `downloads` | [image-downloader](https://github.com/PactInteractive/image-downloader) |
| Shadow DOM / lazy-loaded images | Deep nodes, `data-src`-style attrs | [pic-grabber](https://github.com/venopyx/pic-grabber) |
| One-click save images | Single/double-click download (per README) | [One-Click-Image-Downloader](https://github.com/Ratna-Babu/One-Click-Image-Downloader) |
| Full-page or region screenshot | Long-page stitch or selection | [screenshot-extension](https://github.com/lxieyang/screenshot-extension) |
| Full-page screenshot (classic) | Scroll-and-stitch flow | [webpage-screenshot](https://github.com/Aminadav/webpage-screenshot) |

**Note**: Cross-origin images without CORS taint canvases; production extensions combine `captureVisibleTab`, scroll stitching, `html2canvas`, etc.—use these repos for permissions and architecture.

## Common Feature Types

- **Image Download**: Batch download, gallery download, background image extraction
- **Image Preview**: Hover zoom, lightbox effects
- **Image Processing**: Format conversion, compression, OCR
- **Screenshot**: Visible area, full page, element capture

## Core APIs and Implementation

### Image Detection

```javascript
// Detect all images on page
function detectImages() {
  const images = [];
  
  // <img> tags
  document.querySelectorAll('img').forEach(img => {
    if (img.src) images.push({
      url: img.src,
      width: img.naturalWidth,
      height: img.naturalHeight
    });
  });
  
  // CSS background images
  document.querySelectorAll('*').forEach(el => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const url = bgImage.replace(/url\(["']?([^"')]+)["']?\)/, '$1');
      images.push({ url, type: 'background' });
    }
  });
  
  // Lazy-loaded images (check data attributes)
  document.querySelectorAll('[data-src], [data-original]').forEach(img => {
    const url = img.dataset.src || img.dataset.original;
    if (url) images.push({ url, type: 'lazy' });
  });
  
  return images;
}
```

### Shadow DOM Traversal

```javascript
function getAllImages(root = document) {
  const images = Array.from(root.querySelectorAll('img'));
  
  // Recursively check Shadow DOM
  root.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot) {
      images.push(...getAllImages(el.shadowRoot));
    }
  });
  
  return images;
}
```

### Batch Download

```javascript
async function downloadImages(imageUrls) {
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const filename = `image_${i + 1}.${getExtension(url)}`;
    
    try {
      await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
      });
      
      // Chrome limits concurrent downloads
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.error('Download failed:', url, err);
    }
  }
}
```

### Image Preview (Hover Zoom)

```javascript
// Create hover preview
function createHoverPreview(img) {
  const preview = document.createElement('div');
  preview.className = 'image-preview-overlay';
  preview.innerHTML = `<img src="${img.src}" style="max-width: 500px;">`;
  
  img.addEventListener('mouseenter', () => {
    document.body.appendChild(preview);
  });
  
  img.addEventListener('mouseleave', () => {
    preview.remove();
  });
}
```

### Canvas-based Image Processing

```javascript
async function processImage(imageUrl, options = {}) {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = options.width || img.width;
  canvas.height = options.height || img.height;
  
  // Apply filters
  if (options.grayscale) {
    ctx.filter = 'grayscale(100%)';
  }
  
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  // Convert format
  return canvas.toDataURL(options.format || 'image/png', options.quality || 0.9);
}
```

## Screenshot Implementation

### Visible Area Screenshot

```javascript
// Using chrome.tabs.captureVisibleTab
async function captureVisibleTab() {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, {
    format: 'png',
    quality: 100
  });
  
  // Save or process the screenshot
  await chrome.downloads.download({
    url: dataUrl,
    filename: `screenshot_${Date.now()}.png`
  });
  
  return dataUrl;
}
```

### Full Page Screenshot

```javascript
// Method 1: Scroll and stitch
async function captureFullPage() {
  const originalScroll = window.scrollY;
  const fullHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;
  const screenshots = [];
  
  // Scroll through page and capture
  for (let scrollY = 0; scrollY < fullHeight; scrollY += viewportHeight) {
    window.scrollTo(0, scrollY);
    await new Promise(r => setTimeout(r, 500)); // Wait for render
    
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    screenshots.push(dataUrl);
  }
  
  // Restore scroll position
  window.scrollTo(0, originalScroll);
  
  // Stitch images using canvas (simplified)
  return stitchScreenshots(screenshots);
}

// Method 2: Use offscreen document with DevicePixelRatio (MV3)
async function captureFullPageOffscreen() {
  // In offscreen document
  const canvas = document.createElement('canvas');
  canvas.width = document.documentElement.scrollWidth * devicePixelRatio;
  canvas.height = document.documentElement.scrollHeight * devicePixelRatio;
  
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  
  // Use html2canvas or similar library
  const html2canvas = await import('html2canvas');
  const canvas = await html2canvas.default(document.body, {
    scrollX: 0,
    scrollY: 0,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    windowWidth: document.documentElement.scrollWidth,
    windowHeight: document.documentElement.scrollHeight
  });
  
  return canvas.toDataURL('image/png');
}
```

### Element Screenshot

```javascript
// Capture specific element
async function captureElement(element) {
  const rect = element.getBoundingClientRect();
  
  // Use html2canvas for element capture
  const html2canvas = await import('html2canvas');
  const canvas = await html2canvas.default(element, {
    backgroundColor: null,
    logging: false,
    useCORS: true,
    allowTaint: true
  });
  
  return canvas.toDataURL('image/png');
}

// Crop from full page screenshot
async function captureElementByCrop(element, fullPageDataUrl) {
  const rect = element.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  const img = await loadImage(fullPageDataUrl);
  ctx.drawImage(
    img,
    rect.left + scrollX, rect.top + scrollY, rect.width, rect.height,
    0, 0, rect.width, rect.height
  );
  
  return canvas.toDataURL('image/png');
}
```

### Selection Screenshot

```javascript
// Capture user selection area
function initSelectionScreenshot() {
  const overlay = document.createElement('div');
  overlay.id = 'screenshot-selection-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.3);
    cursor: crosshair;
    z-index: 999999;
  `;
  
  let startX, startY, selectionBox;
  
  overlay.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    
    selectionBox = document.createElement('div');
    selectionBox.style.cssText = `
      position: fixed;
      border: 2px solid #fff;
      background: rgba(255,255,255,0.1);
      pointer-events: none;
    `;
    overlay.appendChild(selectionBox);
  });
  
  overlay.addEventListener('mousemove', (e) => {
    if (!selectionBox) return;
    
    const left = Math.min(startX, e.clientX);
    const top = Math.min(startY, e.clientY);
    const width = Math.abs(e.clientX - startX);
    const height = Math.abs(e.clientY - startY);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  });
  
  overlay.addEventListener('mouseup', async (e) => {
    const rect = selectionBox.getBoundingClientRect();
    overlay.remove();
    
    // Capture the selected area
    const screenshot = await captureVisibleTab();
    const cropped = await cropImage(screenshot, rect);
    
    downloadImage(cropped, 'selection.png');
  });
  
  document.body.appendChild(overlay);
}
```

### Screenshot with Annotations

```javascript
// Add annotations to screenshot
async function annotateScreenshot(dataUrl) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const img = await loadImage(dataUrl);
  canvas.width = img.width;
  canvas.height = img.height;
  
  // Draw screenshot
  ctx.drawImage(img, 0, 0);
  
  // Add annotation tools overlay
  // Allow drawing rectangles, arrows, text
  
  return canvas.toDataURL('image/png');
}
```

## Permissions Required

- `activeTab` or `<all_urls>` - Access page images
- `downloads` - Save images and screenshots
- `host_permissions` for target websites
- `tabs` - For chrome.tabs.captureVisibleTab

## Libraries for Screenshots

| Library | Use Case | Size |
|---------|----------|------|
| html2canvas | Full page, element capture | ~100KB |
| dom-to-image | Alternative to html2canvas | ~50KB |
| modern-screenshot | Lightweight alternative | ~30KB |

## Best Practices

1. **Copyright Respect**: Display fair use warnings for downloaded images
2. **Memory Management**: Don't load all images at once for large galleries
3. **CORS Handling**: Some images may be cross-origin restricted
4. **File Naming**: Generate meaningful filenames from context
5. **Progress UI**: Show download progress for large batches
6. **Screenshot Quality**: Use PNG for text, JPEG for photos to save space
7. **Scroll Position**: Restore original scroll position after full page capture

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| Image Downloader | Batch download, filtering | https://github.com/PactInteractive/image-downloader |
| Pic-Grabber | Lazy-load, Shadow DOM support | https://github.com/venopyx/pic-grabber |
| One-Click Image Downloader | One/double-click save | https://github.com/Ratna-Babu/One-Click-Image-Downloader |
