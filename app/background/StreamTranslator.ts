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
	return `你是一个翻译器，任务是把用户输入的文本翻译成${targetLang}。
${
	pageMeta
		? `
背景信息：
- 页面标题：${pageMeta.title || "（无）"}
- 页面描述：${pageMeta.description || "（无）"}`
		: ""
}

规则：
- 输入内容被{{br}}分成若干段，输出也必须是同样数量的段，每段用{{br}}分隔，段间顺序一一对应，绝对不可遗漏、转义或翻译该标记，并注意它的位置，一段都不能少。
- {{br}}和形如{{varN}}的标记都是"不要翻译、原样照抄"的占位符，严禁翻译、改动或移动它们，其余文字翻译成${targetLang}。
- 残缺的片段（如单独一个"the"、孤立的单词）如果无法翻译，也要在该段输出一个空格，**绝不能**丢弃该段或把它合并到相邻段。
- 只输出译文，不要输出任何解释、提示或原文。

示例：
输入：
With the new {{br}}JavaScript RegExp engine{{br}}, you are able to create an {{var1}} synchronously as well.

输出：
使用新的{{br}}JavaScript RegExp引擎{{br}}，您也可以同步创建{{var1}}。`;
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
