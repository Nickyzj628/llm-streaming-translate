export interface StorageSchema {
	baseUrl: string;
	model: string;
	apiKey: string;
	body: string;
	targetLang: string;
}

export const defaultStorage: StorageSchema = {
	baseUrl: "https://api.deepseek.com",
	model: "deepseek-flash",
	apiKey: "",
	body: `{"thinking": {"type": "disabled"}}`,
	targetLang: "zh, zh-CN, zh-Hans",
};
