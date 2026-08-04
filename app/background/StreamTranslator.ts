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
		const result = await chatCompletions(
			defineModel({
				baseUrl: baseUrl.replace(/\/$/, ""),
				apiKey,
				model: modelName,
				customBody,
			}),
			[
				{
					role: "system",
					content: `You are a concise translation model.

Task:
- Translate the user's text into ${targetLang}.
- The user's input contains text segments separated by the "\u2016" character. Each segment is an independent piece of text to translate separately.
- Your output MUST contain exactly the same number of "\u2016" separators in the exact same order. Translate each segment and join them with "\u2016".
- The "\u2016" character is a structural delimiter — do NOT translate or modify it. Reproduce it verbatim between translated segments.
- If a segment appears empty, output an empty segment (consecutive "\u2016").
- Think briefly before translating.
- Do not explain or summarize.
- Output translation only.

Example 1:
Input:  "Hello \u2016world\u2016 today"
Output: "你好\u2016世界\u2016今天"

Example 2:
Input:  "She said:\u2016hello world\u2016and smiled."
Output: "她说：\u2016你好世界\u2016然后笑了。"`,
				},
				{
					role: "user",
					content: text,
				},
			],
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
