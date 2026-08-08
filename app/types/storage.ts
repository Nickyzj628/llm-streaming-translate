export interface StorageSchema {
	baseUrl: string;
	model: string;
	apiKey: string;
	body: string;
	targetLang: string;
}

export const defaultStorage: StorageSchema = {
	baseUrl: "https://api.deepseek.com",
	model: "deepseek-v4-flash",
	apiKey: "",
	body: `{"thinking": {"type": "disabled"}}`,
	targetLang: "简体中文",
};
