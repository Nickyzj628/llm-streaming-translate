export interface StorageSchema {
	baseUrl: string;
	model: string;
	apiKey: string;
	body: string;
	targetLang: string;
}

export const defaultStorage: StorageSchema = {
	baseUrl: "https://api.deepseek.com",
	model: "deepseek-chat",
	apiKey: "",
	body: "",
	targetLang: "Chinese",
};
