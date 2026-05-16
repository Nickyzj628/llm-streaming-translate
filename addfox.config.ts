import { defineConfig } from "addfox";
import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginSolid } from "@rsbuild/plugin-solid";
import { pluginSass } from "@rsbuild/plugin-sass";

const manifest = {
  name: "LLM Streaming Translator",
  version: "1.0.3",
  manifest_version: 3,
  description: "基于大模型的网页划词流式翻译插件",
  permissions: ["activeTab", "storage"],
  host_permissions: ["https://api.deepseek.com/*"],
  optional_host_permissions: ["http://*/*", "https://*/*"],
  icons: {
    "16": "icons/translate.png",
    "32": "icons/translate.png",
    "48": "icons/translate.png",
    "128": "icons/translate.png",
  },
  action: {
    default_title: "LLM Streaming Translator",
    default_icon: {
      "16": "icons/translate.png",
      "32": "icons/translate.png",
      "48": "icons/translate.png",
      "128": "icons/translate.png",
    },
  },
  web_accessible_resources: [
    {
      resources: ["icons/translate.png"],
      matches: ["<all_urls>"],
    },
  ],
  browser_specific_settings: {
    gecko: {
      id: "{1fd0a7a9-8b13-4cfa-bfb9-da712514f553}",
      strict_min_version: "142.0",
      data_collection_permissions: {
        required: ["none"],
      },
    },
  },
};

export default defineConfig({
  manifest: {
    chromium: manifest,
    firefox: {
      ...manifest,
      manifest_version: 2,
      permissions: [
        ...(manifest.permissions || []),
        ...(manifest.host_permissions || []),
        ...(manifest.optional_host_permissions || []),
      ],
      host_permissions: undefined,
      optional_host_permissions: undefined,
      browser_action: manifest.action,
      action: undefined,
    },
  },
  plugins: [
    pluginBabel({ include: /\.(?:jsx|tsx)$/ }),
    pluginSolid(),
    pluginSass(),
  ],
  rsbuild: {
    resolve: {
      alias: {
        "@": "./app",
      },
    },
  },
  browserPath: {
    chrome: `${process.env.LOCALAPPDATA}\\CentBrowser\\Application\\chrome.exe`,
  },
});
