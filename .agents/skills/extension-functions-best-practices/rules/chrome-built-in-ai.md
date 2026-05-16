# Chrome Built-in AI (Extensions)

On-device **built-in AI** in Chrome uses **Gemini Nano** (and smaller expert models) exposed as **web platform–style APIs** inside extension pages (side panel, popup, offscreen document, etc.). Official overview: [AI on Chrome](https://developer.chrome.com/docs/ai) and [Extensions and AI](https://developer.chrome.com/docs/extensions/ai).

> **Source of truth**: API names, Chrome/channel availability, and origin-trial status change over time. Always confirm against [Built-in AI APIs (status table)](https://developer.chrome.com/docs/ai/built-in-apis) and each API’s doc page.

---

## Supported built-in APIs (Chrome documentation)

The following are listed in Google’s built-in AI docs as extension-relevant task APIs. **Web vs extensions** and **Chrome version** differ per API—see the status table on the page linked above.

| API | Documentation | Typical use in extensions |
|-----|---------------|---------------------------|
| **Prompt API** | [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) | Free-form prompts to **Gemini Nano** (`LanguageModel` in JS). **Extensions-only** shipping path documented for Chrome 138+. |
| **Summarizer API** | [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api) | Summaries (length/format options). |
| **Translator API** | [Translator API](https://developer.chrome.com/docs/ai/translator-api) | On-demand translation. |
| **Language Detector API** | [Language Detector API](https://developer.chrome.com/docs/ai/language-detection) | Detect text language (often paired with Translator). |
| **Writer API** | [Writer API](https://developer.chrome.com/docs/ai/writer-api) | Generate new text for a writing task. |
| **Rewriter API** | [Rewriter API](https://developer.chrome.com/docs/ai/rewriter-api) | Rewrite tone, length, or style of existing text. |
| **Proofreader API** | [Proofreader API](https://developer.chrome.com/docs/ai/proofreader-api) | Grammar/readability fixes. |

Explainer links and **origin trials / developer trials** are listed in the same [built-in APIs](https://developer.chrome.com/docs/ai/built-in-apis) article.

---

## Requirements and policies (high level)

- **Hardware / OS**: Gemini Nano–backed APIs expect desktop-class constraints (free disk space, GPU VRAM or CPU/RAM thresholds, unmetered network for **first** model download). Full checklist: [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) (and parallel sections on other API pages).
- **Policy**: Review [Google Generative AI Prohibited Uses Policy](https://policies.google.com/terms/generative-ai/use-policy) and [People + AI Guidebook](https://pair.withgoogle.com/guidebook/).
- **Deprecations**: Extension developers should **remove** expired origin-trial permissions such as `"aiLanguageModelOriginTrial"` when no longer required ([Prompt API](https://developer.chrome.com/docs/ai/prompt-api)).
- **Typing**: Use [`@types/dom-chromium-ai`](https://www.npmjs.com/package/@types/dom-chromium-ai) for TypeScript.

---

## Official extension samples (clone and load unpacked)

| Sample | Repository path | What it demonstrates |
|--------|-----------------|----------------------|
| Prompt API + side panel | [functional-samples/ai.gemini-on-device](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/ai.gemini-on-device) | `LanguageModel.create`, `prompt`, temperature/topK (see `sidepanel/index.js`). |
| Summarizer + active tab | [functional-samples/ai.gemini-on-device-summarization](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/ai.gemini-on-device-summarization) | **Summarizer** API with tab content. |
| Gemini **cloud** API | [functional-samples/ai.gemini-in-the-cloud](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/ai.gemini-in-the-cloud) | Not built-in AI; useful contrast for hybrid apps. |

---

## Minimal Manifest V3 shape (Prompt API sample)

Aligned with Google’s **Chrome Prompt AI Demo** sample: extension UI hosts the API; `minimum_chrome_version` tracks the documented baseline.

```json
{
  "manifest_version": 3,
  "name": "Built-in AI (Prompt) Minimal Demo",
  "version": "1.0.0",
  "minimum_chrome_version": "138",
  "description": "Side panel using Chrome built-in Prompt API (Gemini Nano).",
  "permissions": ["sidePanel"],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "Open AI side panel"
  }
}
```

Add **`activeTab`**, **`scripting`**, **`tabs`**, etc. only if you also read page content from the user’s tab (as the summarization sample does).

---

## Minimal Prompt API usage (side panel script)

Patterns follow [Prompt API](https://developer.chrome.com/docs/ai/prompt-api): call **`LanguageModel.availability()`** with the **same options** you pass to **`prompt()`** / **`promptStreaming()`**, then **`LanguageModel.create()`** after user activation; monitor **`downloadprogress`** when the model is downloading.

```javascript
/* global LanguageModel */

const sessionOptions = {
  initialPrompts: [
    { role: 'system', content: 'You are a helpful assistant.' }
  ]
};

async function getAvailability() {
  if (!('LanguageModel' in self)) {
    return 'unavailable';
  }
  // Per Prompt API: pass the same option object you use for prompt() / promptStreaming().
  return LanguageModel.availability({});
}

async function openSession() {
  return LanguageModel.create({
    ...sessionOptions,
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => {
        console.log(`Model download: ${Math.round(e.loaded * 100)}%`);
      });
    }
  });
}

async function runPrompt(userText) {
  const availability = await getAvailability();
  if (availability === 'unavailable') {
    throw new Error('Prompt API / LanguageModel not available');
  }
  const session = await openSession();
  try {
    return await session.prompt(userText);
  } finally {
    session.destroy();
  }
}
```

For **streaming** responses and **multimodal** `expectedInputs` / `expectedOutputs`, see the full [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) documentation.

---

## Minimal Summarizer API usage

From [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api): feature-detect `Summarizer`, call `Summarizer.availability()`, then `Summarizer.create(options)` after **user activation** if the model must download. The canonical extension flow (including `downloadprogress` / `ready`) is in [ai.gemini-on-device-summarization/sidepanel/index.js](https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/functional-samples/ai.gemini-on-device-summarization/sidepanel/index.js).

```javascript
/* global Summarizer */

async function summarizeText(longText, uiOptions) {
  if (!('Summarizer' in self)) {
    throw new Error('Summarizer API not supported');
  }
  const options = {
    sharedContext: 'web page content',
    type: uiOptions.type,
    format: uiOptions.format,
    length: uiOptions.length
  };
  const availability = await Summarizer.availability();
  if (availability === 'unavailable') {
    throw new Error('Summarizer not available on this device');
  }
  const summarizer = await Summarizer.create(options);
  if (availability !== 'available') {
    summarizer.addEventListener('downloadprogress', (e) => {
      console.log(`Model download: ${Math.round(e.loaded * 100)}%`);
    });
    await summarizer.ready;
  }
  try {
    return await summarizer.summarize(longText);
  } finally {
    summarizer.destroy();
  }
}
```

Allowed values for `type`, `format`, and `length` are defined in the [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api) documentation; pass the **same** option shape to `availability()` when the doc requires it.

---

## Local development flags

For **localhost** experiments, Chrome docs list flags such as:

- `chrome://flags/#optimization-guide-on-device-model`
- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`

Details: [Prompt API — Use on localhost](https://developer.chrome.com/docs/ai/prompt-api).

---

## When built-in AI is not enough

Chrome’s [built-in AI overview](https://developer.chrome.com/docs/ai/built-in) recommends a **hybrid** approach (on-device when available, **cloud** otherwise)—e.g. [Firebase AI Logic](https://developer.chrome.com/docs/ai/firebase-ai-logic)—because hardware, locale, and channel coverage vary.
