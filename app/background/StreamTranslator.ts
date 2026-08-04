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

CRITICAL RULE: The user's input is split into segments by the "‖" (U+2016) character. Your output MUST contain exactly the same number of "‖" separators in the exact same order. Translate each segment independently and join the results with "‖".

- Segments wrapped in "<NO_TRANSLATE>...</NO_TRANSLATE>" are code or terms that must NOT be translated — copy them verbatim, including the tags. They are shown only so you can understand the context.
- The "‖" character is a structural delimiter: never translate, drop, add, or reorder it. An empty segment stays empty (consecutive "‖").
- Output the translation only, with no explanations.

Example 1:
Input:  "Hello ‖world‖ today"
Output: "你好‖世界‖今天"

Example 2:
Input:  "Press ‖<NO_TRANSLATE>Enter</NO_TRANSLATE>‖ to start"
Output: "按下‖<NO_TRANSLATE>Enter</NO_TRANSLATE>‖键开始"`,
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
