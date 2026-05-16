# Translation Features Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| Bilingual page, PDF, multiple engines | Major sites + PDF flows | [immersive-translate](https://github.com/immersive-translate/immersive-translate) |
| Selection + AI explanations | Reading-focused AI assist | [read-frog](https://github.com/mengxi-ream/read-frog) |
| Standalone popup, multiple providers | Selection translate, writing assist | [openai-translator](https://github.com/openai-translator/openai-translator) |
| Lightweight full-page translation | Classic page translate UX (Firefox/Chrome) | [Traducao-Paginas-Web](https://github.com/FilipePS/Traducao-Paginas-Web) |

**Note**: API keys, quotas, and privacy policies are per project; these repos show full UI + messaging for Readability + remote API patterns.

## Common Feature Types

- **Page Translation**: Full page translation, bilingual display
- **Select-to-Translate**: Hover/click translation
- **PDF Translation**: PDF document translation
- **Video Subtitle Translation**: Real-time subtitle translation

## Core APIs and Implementation

### Content Extraction (Readability)

```javascript
// Use Mozilla's Readability.js
const article = new Readability(document.cloneNode(true)).parse();
// article.content - HTML content
// article.textContent - Plain text
// article.title - Article title
```

### Paragraph Translation (Bilingual)

```javascript
async function translatePage() {
  const paragraphs = document.querySelectorAll('p, h1, h2, h3, li');
  
  for (const p of paragraphs) {
    const originalText = p.textContent.trim();
    if (originalText.length < 10) continue;
    
    try {
      const translated = await translateText(originalText);
      
      // Bilingual display
      p.innerHTML = `
        <span class="original-text">${originalText}</span>
        <span class="translated-text" style="color: #666;">${translated}</span>
      `;
    } catch (err) {
      console.error('Translation failed:', err);
    }
  }
}
```

### Select-to-Translate

```javascript
// Show popup on text selection
document.addEventListener('mouseup', async (e) => {
  const selection = window.getSelection().toString().trim();
  if (selection.length < 2) return;
  
  const popup = createPopup(e.pageX, e.pageY);
  const translated = await translateText(selection);
  popup.textContent = translated;
});
```

### Translation API Integration

```javascript
// Google Translate (unofficial)
async function translateGoogle(text, targetLang = 'en') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  const data = await response.json();
  return data[0].map(item => item[0]).join('');
}

// OpenAI API
async function translateOpenAI(text, targetLang = 'English') {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: `Translate to ${targetLang}: ${text}`
      }]
    })
  });
  const data = await response.json();
  return data.choices[0].message.content;
}
```

### PDF Translation

```javascript
// Using PDF.js to extract text
const pdfjsLib = require('pdfjs-dist');

async function extractPDFText(pdfUrl) {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
  const textContent = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();
    textContent.push(text.items.map(item => item.str).join(' '));
  }
  
  return textContent.join('\n');
}

// Overlay translated text on PDF
function createTranslationLayer(originalText, translatedText) {
  const layer = document.createElement('div');
  layer.className = 'translation-overlay';
  layer.innerHTML = `
    <div class="original">${originalText}</div>
    <div class="translation">${translatedText}</div>
  `;
  return layer;
}
```

## Permissions Required

- `activeTab` - Access page content
- Storage for API keys (secure)
- Host permissions for translation APIs

## Best Practices

1. **Content Detection**: Use Readability.js to identify main content vs navigation
2. **Preserve Layout**: Keep HTML structure, only translate text nodes
3. **Rate Limiting**: Implement request queues for API limits
4. **Caching**: Cache translations to reduce API calls
5. **Privacy**: Don't send sensitive content to third-party APIs
6. **SPA Support**: Watch for DOM changes in single-page apps

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| Immersive Translate | Bilingual, PDF, smart detection | https://github.com/immersive-translate/immersive-translate |
| Read Frog | AI-powered, learning focus | https://github.com/mengxi-ream/read-frog |
| OpenAI Translator | ChatGPT-based | https://github.com/openai-translator/openai-translator |
| TWP | Lightweight page translation | https://github.com/FilipePS/Traducao-Paginas-Web |

## Libraries

- **Readability.js**: https://github.com/mozilla/readability
- **PDF.js**: https://github.com/mozilla/pdf.js
