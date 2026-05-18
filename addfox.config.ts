import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginSass } from "@rsbuild/plugin-sass";
import { pluginSolid } from "@rsbuild/plugin-solid";
import { defineConfig } from "addfox";

const manifest = {
	name: "LLM Streaming Translator",
	version: "1.0.3",
	manifest_version: 3,
	description: "基于大模型的网页划词流式翻译插件",
	permissions: ["activeTab", "storage"],
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
			strict_min_version: "109.0",
			data_collection_permissions: {
				required: ["none"],
			},
		},
	},
};

export default defineConfig({
	manifest: {
		chromium: manifest,
		firefox: manifest,
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
		chrome: `${process.env.LOCALAPPDATA}\\Chromium\\Application\\chrome.exe`,
		firefox: "C:\\Program Files\\LibreWolf\\librewolf.exe",
	},
});
