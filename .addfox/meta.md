---
ai_context: addfox_extension_metadata
description: Structured metadata about the Addfox browser extension project
when_to_use:
  - Initial project exploration - understand extension structure, entries, permissions
  - Build debugging - check entry configuration, output paths, dependencies
  - Architecture review - analyze entry relationships and code organization
  - Before modifying entries - see current configuration and generated outputs
structure:
  - Section 1: Basic project info (name, version, manifest version)
  - Section 2: Permissions (required, host, optional)
  - Section 3: Entries (source files, build outputs, configuration flags)
related_files:
  - error.md: Runtime errors (use when debugging extension errors)
  - llms.txt: This project's AI guide (always read first)
---

# Extension Meta

## 1. Basic information

- Framework: addfox
- Name: LLM Streaming Translator
- Description: 基于大模型的流式划词翻译插件
- Version: 1.3.0
- Framework version: 0.2.5
- Manifest version: 3

## 2. Permissions

### 2.1 Permissions
- activeTab
- storage

### 2.2 Host permissions
- None

### 2.3 Optional permissions
- None

## 3. Entries

```text
background/
├── 📄 Source: E:/Projects/llm-streaming-translate/app/background/index.ts
└── 📁 JS/
    └── background/index.js
    ⚙️  html: false

content/
├── 📄 Source: E:/Projects/llm-streaming-translate/app/content/index.ts
└── 📁 JS/
    └── content/index.js
    ⚙️  html: false

options/
├── 📄 Source: E:/Projects/llm-streaming-translate/app/options/index.tsx
├── 📁 JS/
│   ├── options/index.js
│   └── static/js/shared-vendor.js
└── 📁 CSS/
    └── static/css/options.1ec9571125.css
    ⚙️  html: true
```
