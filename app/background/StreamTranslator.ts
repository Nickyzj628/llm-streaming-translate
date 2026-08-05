import { chatCompletions, defineModel } from "@nickyzj2023/utils";
import type browser from "webextension-polyfill";
import { getStorage } from "@/utils/storage";

export async function streamTranslateOverPort(
	text: string,
	port: browser.Runtime.Port,
): Promise<void> {
	const {
		baseUrl,
		model: modelName,
		apiKey,
		body,
		targetLang,
	} = await getStorage(["baseUrl", "model", "apiKey", "body", "targetLang"]);

	if (!baseUrl) {
		port.postMessage({
			type: "ERROR",
			error: "API Base URL 未配置，请在选项页面中设置",
		});
		return;
	}

	if (!modelName) {
		port.postMessage({
			type: "ERROR",
			error: "模型未配置，请在选项页面中设置",
		});
		return;
	}

	let customBody: Record<string, unknown> = {};
	if (body) {
		try {
			customBody = JSON.parse(body) as Record<string, unknown>;
		} catch {
			port.postMessage({ type: "ERROR", error: "自定义请求体 JSON 格式无效" });
			return;
		}
	}

	try {
		const messages: Array<{
			role: "system" | "user";
			content: string;
		}> = [
			{
				role: "system",
				content: `You are a concise translation model. Translate the user's text into ${targetLang}.

The input is a list of lines. Each line is formatted as "- <TARGET>...</TARGET>" plus optional context text outside the tags. The part inside <TARGET> is the ONLY thing to translate — everything else is context for understanding only, never translate it.

CRITICAL RULE: Output EXACTLY the same number of lines as the input, in the same order. Each output line is the translation of the corresponding <TARGET> part, prefixed with "- ". Do NOT output the <TARGET> tags, the context text, or any explanations.

Example:
Input:
- <TARGET>Example Game</TARGET>
- <TARGET>press</TARGET> Enter
- <TARGET>to start</TARGET>

Output:
- 示例游戏
- 按下
- 开始`,
			},
			{
				role: "user",
				content: text,
			},
		];

		const result = await chatCompletions(
			defineModel({
				baseUrl: baseUrl.replace(/\/$/, ""),
				apiKey,
				model: modelName,
				customBody,
			}),
			messages,
			{ stream: true },
		);

		for await (const { content } of result) {
			if (content) {
				port.postMessage({ type: "CHUNK", chunk: content });
			}
		}

		port.postMessage({ type: "DONE" });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		console.error("[LLM Streaming Translator BG] 翻译失败");
		port.postMessage({ type: "ERROR", error: errorMessage });
	}
}
