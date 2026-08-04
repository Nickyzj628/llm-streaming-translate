import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginSolid } from "@rsbuild/plugin-solid";
import { defineConfig } from "addfox";

const baseManifest = {
	name: "LLM Streaming Translator",
	version: "1.2.2",
	manifest_version: 3,
	description: "基于大模型的网页划词流式翻译插件",
	permissions: ["activeTab", "storage"],
	optional_host_permissions: ["http://*/*", "https://*/*"],
	icons: {
		"16": "16.png",
		"32": "32.png",
		"48": "48.png",
		"128": "128.png",
	},
	action: {
		default_title: "LLM Streaming Translator",
		default_icon: {
			"16": "16.png",
			"32": "32.png",
			"48": "48.png",
			"128": "128.png",
		},
	},
	web_accessible_resources: [
		{
			resources: ["32.png"],
			matches: ["<all_urls>"],
		},
	],
};

const chromiumManifest = {
	...baseManifest,
	browser_specific_settings: {
		gecko: {
			id: "{1fd0a7a9-8b13-4cfa-bfb9-da712514f553}",
		},
	},
};

const firefoxManifest = {
	...baseManifest,
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
		chromium: chromiumManifest,
		firefox: firefoxManifest,
	},
	plugins: [
		pluginBabel({ include: /\.(?:jsx|tsx)$/ }),
		pluginSolid(),
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
