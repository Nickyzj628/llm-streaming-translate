# Extension Functions Reference

Comprehensive reference of open-source projects, libraries, and APIs for browser extension development.

---

## Video

### Enhancement

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Video Roll | https://github.com/VideoRoll/VideoRoll | Apache-2.0 (v1.1.8) | Rotation, zoom, filters, VR mode |
| YouTube Enhancer | https://github.com/YouTube-Enhancer/extension | MIT | YouTube-specific enhancements |

### Download

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Cat Catch | https://github.com/xifangczy/cat-catch | GPL-3.0 | Sniffing, M3U8/MPD, external downloaders; actively maintained |
| Live Stream Downloader | https://github.com/chandler-stimson/live-stream-downloader | MPL-2.0 | In-extension HLS detect + merge; store build to compare behavior |
| Video DownloadHelper | https://github.com/aclap-dev/video-downloadhelper | - | Mature sniffing; companion https://github.com/aclap-dev/vdhcoapp |
| HLS Downloader | https://github.com/puemos/hls-downloader | MIT | HLS stream download |
| Stream Detector | https://github.com/54ac/stream-detector | GPL-3.0 | Cookie export, stream detection |

### Recording

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Screenity | https://github.com/alyssaxuu/screenity | GPL-3.0 | Screen/camera recording |

### External Downloaders

| Project | GitHub | Purpose |
|---------|--------|---------|
| N_m3u8DL-RE | https://github.com/nilaoda/N_m3u8DL-RE | M3U8/MPD downloader |
| yt-dlp | https://github.com/yt-dlp/yt-dlp | Universal video downloader |
| aria2 | https://github.com/aria2/aria2 | Multi-protocol download utility |

---

## Audio

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Better Volume Booster | https://github.com/zWolfrost/Better-Volume-Booster | MIT | Domain memory, mono/stereo |
| Tab Volume | https://github.com/wokalek/tab-volume | CC BY-NC 4.0 | Per-tab volume control |
| Volume Control | https://github.com/Chaython/volumecontrol | MIT | Firefox volume boost |

### APIs
- **Web Audio API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

---

## Image

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Image Downloader | https://github.com/PactInteractive/image-downloader | MIT | Batch download, filtering |
| Pic-Grabber | https://github.com/venopyx/pic-grabber | MIT | Shadow DOM support |
| Image Downloader Continued | https://github.com/kisdma/image-downloader-cnt | MIT | Fork with bug fixes |
| screenshot-extension | https://github.com/lxieyang/screenshot-extension | MIT | Full/partial page screenshot reference |
| webpage-screenshot | https://github.com/Aminadav/webpage-screenshot | ISC | Classic full-page capture |

### Screenshot Libraries

| Library | GitHub | Purpose |
|---------|--------|---------|
| html2canvas | https://github.com/niklasvh/html2canvas | Full page/element capture |
| dom-to-image | https://github.com/tsayen/dom-to-image | Alternative to html2canvas |
| modern-screenshot | https://github.com/qq15725/modern-screenshot | Lightweight alternative |

---

## Translation

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Immersive Translate | https://github.com/immersive-translate/immersive-translate | - | Bilingual, PDF translation |
| Read Frog | https://github.com/mengxi-ream/read-frog | - | AI-powered translation |
| TWP | https://github.com/FilipePS/Traducao-Paginas-Web | GPL-3.0 | Lightweight page translation |
| OpenAI Translator | https://github.com/openai-translator/openai-translator | - | ChatGPT-based |

### Libraries
- **Readability.js**: https://github.com/mozilla/readability - Content extraction
- **PDF.js**: https://github.com/mozilla/pdf.js - PDF processing

---

## Download Management

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Turbo Download Manager v2 | https://github.com/inbasic/turbo-download-manager-v2 | MPL-2.0 | Multi-threading, resume |
| File Downloader Unleashed | https://github.com/helloyanis/file-downloader-unleashed | - | No blacklist |

---

## Userscript

### Managers

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Tampermonkey | https://github.com/Tampermonkey/tampermonkey | - | Most popular |
| Violentmonkey | https://github.com/violentmonkey/violentmonkey | MIT | Open source |
| Greasemonkey | https://github.com/greasemonkey/greasemonkey | MIT | Firefox native |
| ScriptCat | https://github.com/scriptscat/scriptcat | - | Background scripts |

### Development Tools

| Project | GitHub | Purpose |
|---------|--------|---------|
| vite-plugin-monkey | https://github.com/lisonge/vite-plugin-monkey | Modern dev with HMR |
| bun-ts-userscript-starter | https://github.com/genzj/bun-ts-userscript-starter | Bun + TypeScript boilerplate |
| react-userscripts | https://github.com/jmaxwell81/greasemonkey-react-userscripts | React integration |

---

## Chrome built-in AI (official)

| Resource | URL | Notes |
|----------|-----|-------|
| Extensions and AI | https://developer.chrome.com/docs/extensions/ai | Hub for extension + on-device AI |
| Built-in AI APIs (status) | https://developer.chrome.com/docs/ai/built-in-apis | Web vs extensions, Chrome version, trials |
| Prompt API | https://developer.chrome.com/docs/ai/prompt-api | `LanguageModel`, Gemini Nano, extension-specific notes |
| Summarizer API | https://developer.chrome.com/docs/ai/summarizer-api | |
| Translator API | https://developer.chrome.com/docs/ai/translator-api | |
| Language Detector API | https://developer.chrome.com/docs/ai/language-detection | |
| Writer API | https://developer.chrome.com/docs/ai/writer-api | |
| Rewriter API | https://developer.chrome.com/docs/ai/rewriter-api | |
| Proofreader API | https://developer.chrome.com/docs/ai/proofreader-api | |
| TS typings | https://www.npmjs.com/package/@types/dom-chromium-ai | |
| Sample: Prompt (side panel) | https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/ai.gemini-on-device | |
| Sample: Summarizer | https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/ai.gemini-on-device-summarization | |

Skill guide: [rules/chrome-built-in-ai.md](rules/chrome-built-in-ai.md) in this repository.

---

## AI Integration

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| BrainyAI | https://github.com/luyu0279/BrainyAI | - | Multi-AI sidebar |
| ChatGPT Box | https://github.com/josStorer/chatGPTBox | GPL-3.0 | Deep integration |
| AI Side Panel Extension | https://github.com/creosB/AI-Side-Panel-Extension | - | Multi-service support |
| Scroll | https://github.com/asker-kurtelli/scroll | MIT | Chat navigation |
| Threadly | https://github.com/evinjohnn/Threadly | - | Prompt optimization |
| insidebar-ai | https://github.com/xiaolai/insidebar-ai | - | Text-to-AI |

**Policy**: Do not list unverifiable “placeholder” repos. Before adding an entry, confirm you can build a loadable extension and find real user Issues.

### AI SDKs

| SDK | GitHub | Purpose |
|-----|--------|---------|
| Vercel AI SDK | https://github.com/vercel/ai | React/JS streaming, multi-provider |
| LangChain.js | https://github.com/langchain-ai/langchainjs | Complex pipelines, RAG |
| LlamaIndex TS | https://github.com/run-llama/LlamaIndexTS | Document indexing |
| AI SDK React | Part of Vercel AI SDK | React hooks for AI |

### AI APIs
- **OpenAI**: https://platform.openai.com/docs
- **Google Gemini**: https://ai.google.dev/docs
- **Anthropic Claude**: https://docs.anthropic.com/
- **Ollama** (Local): https://github.com/ollama/ollama

---

## Ad Blocker / Privacy

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| uBlock Origin | https://github.com/gorhill/uBlock | GPL-3.0 | Efficient, low resource |
| Privacy Badger | https://github.com/EFForg/privacybadger | GPL-3.0 | Algorithmic tracking detection |
| AdGuard | https://github.com/AdguardTeam/AdguardBrowserExtension | GPL-3.0 | Commercial-grade |

### Filter Lists
- **EasyList**: https://easylist.to/
- **EasyPrivacy**: https://easylist.to/
- **uBlock Assets**: https://github.com/uBlockOrigin/uAssets

---

## Theme / Styling

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Dark Reader | https://github.com/darkreader/darkreader | MIT | Dynamic dark mode |
| Stylus | https://github.com/openstyles/stylus | GPL-3.0 | UserCSS manager |
| Midnight Lizard | https://github.com/Midnight-Lizard/Midnight-Lizard | MIT | Custom color schemes |

### NPM Package
```bash
npm install darkreader
```

---

## Email

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Mail Checker Plus | https://github.com/AndersSahlin/MailCheckerPlus | GPL-3.0 | Gmail preview, quick actions |
| gmail-api-chrome-extension | https://github.com/anatelli10/gmail-api-chrome-extension | MIT | Minimal OAuth + Gmail API sample |

### APIs
- **Gmail API**: https://developers.google.com/gmail/api/reference/rest

---

## Game / WebAssembly

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Cetus | https://github.com/Qwokka/Cetus | Apache-2.0 | WASM memory hacking |

### Resources
- **WebAssembly Spec**: https://webassembly.github.io/spec/
- **WASM Memory**: https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory

---

## Password Manager

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| Bitwarden | https://github.com/bitwarden/clients | GPL-3.0 | Full-featured, cloud sync |
| KeePassXC | https://github.com/keepassxreboot/keepassxc | GPL-3.0 | Local database |
| KeePassXC-Browser | https://github.com/keepassxreboot/keepassxc-browser | GPL-3.0 | Browser integration |

### Security Standards
- **Web Crypto API**: Native encryption in browsers
- **PBKDF2**: Key derivation
- **AES-256-GCM**: Encryption algorithm
- **BIP39**: Mnemonic phrases

---

## Web3 Wallet

| Project | GitHub | License | Notes |
|---------|--------|---------|-------|
| MetaMask | https://github.com/MetaMask/metamask-extension | - | Industry standard |
| Rabby | https://github.com/RabbyHub/Rabby | - | Multi-chain, simulation |
| Rainbow (browser extension) | https://github.com/rainbow-me/browser-extension | - | Extension source (distinct from mobile app repo) |

### Libraries
- **ethers.js**: https://docs.ethers.org/
- **viem**: https://viem.sh/
- **web3.js**: https://web3js.readthedocs.io/

### Standards
- **EIP-1193**: Ethereum Provider API
- **EIP-1102**: Opt-in account exposure
- **EIP-712**: Typed data signing
- **EIP-4361**: Sign-In with Ethereum

---

## Media Processing Libraries

### Recommended: Mediabunny
- **Docs**: https://mediabunny.dev/
- **NPM**: `mediabunny`
- **Features**: Metadata, trimming, transmuxing, no WASM

### Use with Caution
- **FFmpeg.wasm**: Large bundle, WASM overhead - avoid for simple tasks

---

## Chrome Extension APIs

### Manifest V3
- `chrome.action` - Toolbar button
- `chrome.alarms` - Scheduled tasks
- `chrome.commands` - Keyboard shortcuts
- `chrome.contextMenus` - Right-click menus
- `chrome.declarativeNetRequest` - Network blocking
- `chrome.downloads` - File downloads
- `chrome.identity` - OAuth
- `chrome.notifications` - Desktop notifications
- `chrome.offscreen` - Offscreen documents
- `chrome.scripting` - Script injection
- `chrome.sidePanel` - Side panel (Chrome 114+)
- `chrome.storage` - Data storage
- `chrome.tabCapture` - Tab audio capture
- `chrome.tabs` - Tab management
- `chrome.webRequest` - Network interception (MV2 only)

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Manifest V3 | ✅ | ✅ | ✅ | ✅ |
| Side Panel | ✅ 114+ | ❌ | ❌ | ✅ |
| declarativeNetRequest | ✅ | ✅ | ✅ | ✅ |
| webRequest (blocking) | ❌ MV3 | ✅ | ✅ | ❌ MV3 |
| Tab Capture | ✅ | ✅ | ❌ | ✅ |
| Native Messaging | ✅ | ✅ | ✅ | ✅ |

---

## Contributing

When suggesting additions:
1. Verify active maintenance
2. Check open-source license
3. Test MV3 compatibility
