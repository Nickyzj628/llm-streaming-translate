# AI Features Implementation Guide

## Community-verified reference implementations

| Capability | User-visible outcome | Repo |
|------------|----------------------|------|
| Multi-model sidebar / aggregation | Chat and switch models after build (per README) | [BrainyAI](https://github.com/luyu0279/BrainyAI) |
| Deep page integration (selection, menus, summarize) | Integrations with ChatGPT and other UIs | [chatGPTBox](https://github.com/josStorer/chatGPTBox) |
| LLM web UI navigation | Easier navigation on long chat pages | [scroll](https://github.com/asker-kurtelli/scroll) |
| Multi-service sidebar template | Shortcuts, side panel skeleton | [AI-Side-Panel-Extension](https://github.com/creosB/AI-Side-Panel-Extension) |

**Do not cite unverifiable “placeholder” repos**: no clear history, no build docs, suspicious stars/forks, or anonymous authors—such links have been mistaken for spam before. **Verify** with `pnpm`/`npm i`, a loadable extension build, and real Issues from users.

### Chrome built-in AI (Gemini Nano in the browser)

For **on-device** APIs (`LanguageModel` / Prompt API, `Summarizer`, `Translator`, `LanguageDetector`, Writer, Rewriter, Proofreader), use the dedicated guide with official doc links, API list, manifest snippet, and minimal samples: **[rules/chrome-built-in-ai.md](chrome-built-in-ai.md)**.

## Common Feature Types

- **AI Sidebar**: Browser side panel with AI chat
- **Page Summarization**: Auto-summarize web content
- **AI Reading Assistant**: Explain, translate, Q&A
- **Prompt Enhancement**: Auto-optimize user prompts

## Core Implementation

### Side Panel Implementation

```javascript
// Chrome Side Panel API (Chrome 114+)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Or iframe-based sidebar
function createSidebar() {
  const sidebar = document.createElement('iframe');
  sidebar.id = 'ai-sidebar';
  sidebar.src = chrome.runtime.getURL('sidebar.html');
  sidebar.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    border: none;
    z-index: 999999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.1);
  `;
  
  document.body.appendChild(sidebar);
  return sidebar;
}
```

### Content Extraction

```javascript
// Extract main content using Readability
const article = new Readability(document.cloneNode(true)).parse();

// Or simple extraction
function extractContent() {
  // Remove non-content elements
  const clone = document.body.cloneNode(true);
  const elementsToRemove = clone.querySelectorAll(
    'nav, header, footer, aside, .advertisement, .sidebar'
  );
  elementsToRemove.forEach(el => el.remove());
  
  return {
    title: document.title,
    url: location.href,
    content: clone.innerText.substring(0, 8000), // Limit tokens
    selection: window.getSelection().toString()
  };
}
```

### Third-Party AI SDKs

#### Vercel AI SDK

```javascript
// npm install ai
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Streaming text generation
async function generateWithVercelAI(prompt) {
  const { textStream } = await streamText({
    model: openai('gpt-4o'),
    prompt: prompt,
  });

  // Stream to UI
  for await (const textPart of textStream) {
    appendToUI(textPart);
  }
}

// Multi-modal with Vercel AI SDK
import { generateObject } from 'ai';
import { z } from 'zod';

async function analyzePageStructured(content) {
  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: z.object({
      summary: z.string(),
      keyPoints: z.array(z.string()),
      sentiment: z.enum(['positive', 'neutral', 'negative']),
      topics: z.array(z.string())
    }),
    prompt: `Analyze this webpage content: ${content}`
  });
  
  return object;
}
```

#### LangChain.js

```javascript
// npm install langchain @langchain/openai
import { ChatOpenAI } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { loadSummarizationChain } from 'langchain/chains';

// Summarization with LangChain
async function summarizeWithLangChain(content) {
  const model = new ChatOpenAI({ 
    temperature: 0, 
    modelName: 'gpt-3.5-turbo' 
  });
  
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 4000,
    chunkOverlap: 200
  });
  
  const docs = await textSplitter.createDocuments([content]);
  const chain = loadSummarizationChain(model, { type: 'map_reduce' });
  
  const result = await chain.call({ input_documents: docs });
  return result.text;
}

// RAG (Retrieval Augmented Generation)
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';

async function createPageRAG(content) {
  const embeddings = new OpenAIEmbeddings();
  const vectorStore = await MemoryVectorStore.fromTexts(
    [content],
    [{ source: 'current-page' }],
    embeddings
  );
  
  return vectorStore.asRetriever();
}
```

#### LlamaIndex (TypeScript)

```javascript
// npm install llamaindex
import { Document, VectorStoreIndex, OpenAI } from 'llamaindex';

async function indexPageContent(content) {
  const document = new Document({ text: content });
  const index = await VectorStoreIndex.fromDocuments([document]);
  
  const queryEngine = index.asQueryEngine();
  return queryEngine;
}
```

#### AI SDK React Components

```jsx
// npm install ai
import { useChat } from 'ai/react';

function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat', // Your backend endpoint
  });

  return (
    <div className="chat-container">
      {messages.map(m => (
        <div key={m.id} className={m.role}>
          {m.content}
        </div>
      ))}
      
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask about this page..."
        />
      </form>
    </div>
  );
}
```

### OpenAI API Integration (Native)

```javascript
// Secure API call through background script
// background.js
const API_KEY_STORAGE = 'openai_api_key';

async function callOpenAI(messages, model = 'gpt-3.5-turbo') {
  const { apiKey } = await chrome.storage.local.get(API_KEY_STORAGE);
  
  if (!apiKey) {
    throw new Error('API key not set');
  }
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2000
    })
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

// Usage for summarization
async function summarizePage(content) {
  return callOpenAI([
    {
      role: 'system',
      content: 'Summarize the following webpage content in 3 bullet points.'
    },
    {
      role: 'user',
      content: content.substring(0, 4000)
    }
  ]);
}
```

### Multi-Provider Support

```javascript
const PROVIDERS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-3.5-turbo', 'gpt-4']
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    models: ['gemini-pro']
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: ['claude-3-haiku', 'claude-3-sonnet']
  }
};

async function callAI(provider, messages) {
  const config = PROVIDERS[provider];
  const { apiKeys } = await chrome.storage.local.get('apiKeys');
  
  switch(provider) {
    case 'openai':
      return callOpenAI(messages);
    case 'gemini':
      return callGemini(messages, apiKeys.gemini);
    case 'anthropic':
      return callAnthropic(messages, apiKeys.anthropic);
    default:
      throw new Error('Unknown provider');
  }
}
```

### Secure API Key Storage

```javascript
// Never expose API key to content script
// popup.js or options.js
async function saveApiKey(provider, key) {
  await chrome.storage.local.set({
    [`api_key_${provider}`]: key
  });
}

// background.js - all API calls go through here
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'CHAT_WITH_AI') {
    handleAIChat(msg.messages)
      .then(response => sendResponse({ success: true, response }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Async
  }
});
```

## Permissions Required

- `sidePanel` - Chrome side panel (Chrome 114+)
- `storage` - API key storage
- `activeTab` - Content access
- Host permissions for AI APIs

## Best Practices

1. **API Key Security**: Never store keys in content scripts
2. **Rate Limiting**: Implement client-side throttling
3. **Token Management**: Count tokens, stay within limits
4. **Error Handling**: Graceful fallbacks for API failures
5. **Streaming**: Support streaming responses for better UX
6. **Privacy**: Allow local model usage (Ollama)

## SDK Comparison

| SDK | Best For | Bundle Size | Streaming |
|-----|----------|-------------|-----------|
| Vercel AI SDK | React apps, streaming | Small | ✅ Native |
| LangChain | Complex pipelines, RAG | Large | ✅ |
| LlamaIndex | Document indexing | Medium | ✅ |
| Native API | Simple use cases | Minimal | Manual |

## Reference Projects

| Project | Features | GitHub |
|---------|----------|--------|
| BrainyAI | Multi-AI sidebar | https://github.com/luyu0279/BrainyAI |
| ChatGPT Box | Deep integration, summarization | https://github.com/josStorer/chatGPTBox |
| Scroll | LLM page navigation | https://github.com/asker-kurtelli/scroll |
| AI Side Panel Extension | Multi-service, shortcuts | https://github.com/creosB/AI-Side-Panel-Extension |

## Local AI Option

```javascript
// Ollama local API
async function callLocalAI(message) {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama2',
      prompt: message,
      stream: false
    })
  });
  const data = await response.json();
  return data.response;
}
```
