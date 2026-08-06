import { chatCompletions, defineModel } from "@nickyzj2023/utils";
import type browser from "webextension-polyfill";
import { getStorage } from "@/utils/storage";

/**
 * 构造系统提示词。
 * 网页元数据（title/description）作为"网页背景"注入，帮助模型理解页面主题与语境，
 * 再明确翻译任务与段对齐协议。元数据为空时（如 options 测试板块）不注入该段，
 * 保持 prompt 简洁、后向兼容。
 */
function buildSystemPrompt(
	pageMeta: { title: string; description: string } | undefined,
	targetLang: string,
): string {
	// 网页背景段：仅当有元数据时注入，作为纯主题信号，不参与写回
	const background =
		pageMeta && (pageMeta.title || pageMeta.description)
			? `这是一份网页内容，网页信息如下（仅用于帮助理解语境，不要翻译这些信息）：
- 网页标题：${pageMeta.title || "（无）"}
- 网页描述：${pageMeta.description || "（无）"}

`
			: "";

	return `${background}你是一个翻译器，任务是把用户输入的文本翻译成${targetLang}。

规则：
- 输入用 ¶ 分成若干段，输出也必须是同样数量的段，每段用 ¶ 分隔，段间顺序一一对应，一段都不能少。段数必须与输入完全一致。
- 残缺的片段（如单独一个 "The "、孤立的单词）如果无法翻译，就在该位置输出一个空段（两个 ¶ 之间什么都不写），【绝不能】丢弃该段或把它合并到相邻段。
- ¶ 和形如 [[数字]] 的标记都是"不要翻译、原样照抄"的内容，其余文字翻译成${targetLang}。
- 只输出译文，不要输出任何解释、提示或原文。

示例：
输入：
The ¶[[0]] Oniguruma Engine¶ can only be created asynchronously.

输出：
 ¶[[0]] 正则引擎¶ 只能异步创建。`;
}

export async function streamTranslateOverPort(
	text: string,
	port: browser.Runtime.Port,
	pageMeta?: { title: string; description: string },
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
				content: buildSystemPrompt(pageMeta, targetLang),
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
