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
				content: `你是一个翻译模型。把用户输入的文字翻译成 ${targetLang}。

用户输入是多行文本，每行对应网页中被选中的一段文字。必须严格遵守以下规则：

【最重要】输出行数必须和输入行数完全一致，一行对应一行，按顺序一一对应。禁止把多行合并成一行，禁止漏行，禁止额外加行。即使某一行只有半个单词、翻译出来不自然，也要单独输出一行。

每行输出以 "- " 开头，并且【必须保留】输入中的 <NO_TRANSLATE>...</NO_TRANSLATE> 标签结构：标签内的内容逐字照抄、不要翻译，标签外的内容才是需要翻译的部分。标签结构要与输入一一对应。

如果某一行是不完整的片段，按字面意思翻译即可，不要补全内容、不要合并前后行。

只输出译文，不要输出任何解释、提示或原文。

示例：
输入：
- Build new UI.
- <NO_TRANSLATE>Press </NO_TRANSLATE>Enter<NO_TRANSLATE> to start</NO_TRANSLATE>
- <NO_TRANSLATE>design.md</NO_TRANSLATE>

输出：
- 构建新的UI。
- <NO_TRANSLATE>Press </NO_TRANSLATE>按下<NO_TRANSLATE> to start</NO_TRANSLATE>
- <NO_TRANSLATE>design.md</NO_TRANSLATE>`,
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
