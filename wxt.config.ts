import path from 'node:path';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'extension',
  manifest: {
    name: 'LLM Streaming Translator',
    description: '基于大模型的网页划词流式翻译插件',
    permissions: ['activeTab', 'storage'],
    host_permissions: ['https://api.deepseek.com/*'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    icons: {
      16: 'assets/icons/translate.png',
      32: 'assets/icons/translate.png',
      48: 'assets/icons/translate.png',
      128: 'assets/icons/translate.png',
    },
    action: {
      default_title: 'LLM Streaming Translator',
    },
    browser_specific_settings: {
      gecko: {
        id: '{1fd0a7a9-8b13-4cfa-bfb9-da712514f553}',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
  vite: () => ({
    plugins: [solid()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {},
      },
    },
  }),
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // Remove Firefox-specific fields from Chrome manifest
      if (_wxt.config.browser !== 'firefox') {
        delete (manifest as Record<string, unknown>).browser_specific_settings;
      }
    },
  },
});
