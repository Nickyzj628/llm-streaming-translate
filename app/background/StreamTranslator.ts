import {
	chatCompletions,
	defineModel,
	extractErrorMessage,
} from "@nickyzj2023/utils";
import type browser from "webextension-polyfill";
import type { StreamTranslatePortMessage } from "@/types/messages";
import { getStorage } from "@/utils/storage";

/**
 * 安全地向端口发送消息。
 *
 * 为什么需要它：本函数运行在 background service worker（MV3）里，而 SW 是
 * 可被回收的。当 SW 空闲超时被回收（或崩溃）后再被唤醒时，原来建立的 port
 * 已经断开；此时再 postMessage 会抛 "Attempting to use a disconnected port
 * object"。这类错误发生在一个没有挂 catch 的异步回调（如 for-await 流式循环）
 * 里就会出现 Uncaught (in promise)。因此统一在这里吞掉并告警，避免二次抛错。
 */
export function safePostMessage(
	port: browser.Runtime.Port,
	message: StreamTranslatePortMessage,
): void {
	try {
		port.postMessage(message);
	} catch {
		// 端口已断开（SW 被回收/崩溃）：消息无处可达，静默丢弃即可。
		// 消费方（content/options）收到 onDisconnect 会自行回滚，无需这边兜底。
		console.warn("[background]端口已断开，丢弃消息", message.type);
	}
}

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
	return [
		`你是一个翻译器，任务是把用户输入的文本翻译成${targetLang}。`,
		pageMeta &&
			`
背景信息：
- 页面标题：${pageMeta.title || "（无）"}
- 页面描述：${pageMeta.description || "（无）"}`,
		`
规则：
- 用户输入的{{seg}}为分段标记，{{varN}}为变量标记，严禁翻译、改动或移动它们。
- 即使残缺的段落（如单独一个"the"等无实际意义的单词）难以翻译，也要保留段落标记，**绝不能**丢弃任何标记。
- 只输出译文，不要输出任何解释、提示或原文。`,
		`
示例1：
输入："The quick brown fox jumps over the lazy dog."
正确输出："敏捷的棕色狐狸跳过了懒狗。"

示例2：
输入："The {{seg}}RegExp Engine{{seg}} can only be created by {{var1}}."
错误输出："正则引擎{{seg}}只能被{{var1}}创建。"
原因：丢失了一个{{seg}}标记，导致段落数对不上，严禁这样做！
正确输出："{{seg}}正则引擎{{seg}}只能被{{var1}}创建。"`,
	]
		.filter(Boolean)
		.join("\n");
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
		safePostMessage(port, {
			type: "ERROR",
			error: "API Base URL未配置，请在选项页面中设置",
		});
		return;
	}

	if (!modelName) {
		safePostMessage(port, {
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
			safePostMessage(port, {
				type: "ERROR",
				error: "自定义请求体JSON格式无效",
			});
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
				safePostMessage(port, { type: "CHUNK", chunk: content });
			}
		}

		safePostMessage(port, { type: "DONE" });
	} catch (e) {
		console.error("[background]翻译失败");
		safePostMessage(port, { type: "ERROR", error: extractErrorMessage(e) });
	}
}
