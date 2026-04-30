import path from 'node:path';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'extension',
  manifest: {
    name: 'LLM Streaming Translator',
    description: '基于大语言模型的网页划词翻译扩展',
    permissions: ['activeTab', 'storage'],
    host_permissions: ['https://api.deepseek.com/*'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: 'LLM Streaming Translator',
    },
    browser_specific_settings: {
      gecko: {
        id: '{754FB1AD-CC3B-4856-B6A0-7786F8CA9D17}',
        strict_min_version: '112.0',
      },
    },
  },
  vite: () => ({
    plugins: [solid()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '~': path.resolve(import.meta.dirname, 'node_modules'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
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
