import { extractErrorMessage, fetcher, parseSSE } from "@nickyzj2023/utils";
import type browser from "webextension-polyfill";
import type { StreamTranslatePortMessage } from "@/types/messages";
import { getStorage } from "@/utils/storage";

/** 单次流式翻译的控制句柄：abort() 立即中止底层 HTTP 连接 */
export interface StreamTranslationController {
	abort: () => void;
}

/** OpenAI 兼容流式响应的单帧结构（只取需要的内容增量字段） */
interface StreamChunk {
	choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * 安全地向端口发送消息。
 *
 * 为什么需要它：本函数运行在 background service worker（MV3）里，而 SW 是
 * 可被回收的。当 SW 空闲超时被回收（或崩溃）后再被唤醒时，原来建立的 port
 * 已经断开；此时再 postMessage 会抛 "Attempting to use a disconnected port
 * object"。这类错误发生在一个没有挂 catch 的异步回调（如 for-await 流式循环）
 * 里就会出现 Uncaught (in promise)。因此统一在这里吞掉并告警，避免二次抛错。
 */
function safePostMessage(
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
 * 再明确翻译任务与段对齐协议。元数据为空时不注入该段，保持 prompt 简洁、后向兼容。
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
- 用户输入的{{segN}}为分段标记（N为段序号，从1递增，每段都以{{segN}}结尾），{{varN}}为变量标记，严禁翻译、改动或移动它们。
- 即使残缺的段落（如单独一个"the"等无实际意义的单词）难以翻译，也要保留每段的{{segN}}标记，**绝不能**丢弃、合并任何标记或改变标记的序号。
- 只输出译文，不要输出任何解释、提示或原文。`,
		`
示例1：
输入："The quick brown fox jumps over the lazy dog.{{seg1}}"
正确输出："敏捷的棕色狐狸跳过了懒狗。{{seg1}}"

示例2：
输入："The {{seg1}}RegExp Engine{{seg2}} can only be created by {{var1}}.{{seg3}}"
正确输出："这个{{seg1}}正则引擎{{seg2}}只能由{{var1}}创建。{{seg3}}"
错误输出："这个{{seg1}}正则引擎{{seg2}}只能由{{var1}}创建。"
原因：丢失了{{seg3}}标记，导致段落数对不上，严禁这样做！`,
	]
		.filter(Boolean)
		.join("\n");
}

/**
 * 发起一次流式翻译，逐 chunk 经端口回传，返回可中止句柄。
 *
 * 为什么用 @nickyzj2023/utils 的 fetcher + parseSSE 而不是该库的
 * chatCompletions：当前版本（1.0.85/1.0.86）的 chatCompletions 不暴露
 * AbortSignal，流一旦开始就无法取消——content 端打断翻译（重新划词/页面卸载）
 * 后，background 只能把整个流跑完，白白消耗 API token、拖住 SW 生命周期。
 * 这里用 fetcher 发 HTTP 请求（parser 透传 Response 以保留流式解析），配合
 * 库里的 parseSSE 解析 SSE（维持"不是 OpenAI 官方 SDK"的约定），自己持有
 * AbortController，端口断开时立即硬中止 HTTP 连接。
 */
export function startStreamTranslation(
	text: string,
	port: browser.Runtime.Port,
	pageMeta?: { title: string; description: string },
): StreamTranslationController {
	const controller = new AbortController();
	void run();

	async function run(): Promise<void> {
		try {
			const {
				baseUrl,
				model: modelName,
				apiKey,
				body,
				targetLang,
			} = await getStorage(["baseUrl", "model", "apiKey", "body", "targetLang"]);

			// 会话被中止后不再向端口发任何消息
			// （同端口可能已开始新会话，旧会话的迟到错误会污染新会话）
			const sendError = (error: string): void => {
				if (!controller.signal.aborted) {
					safePostMessage(port, { type: "ERROR", error });
				}
			};

			if (!baseUrl) {
				sendError("API Base URL未配置，请在选项页面中设置");
				return;
			}

			if (!modelName) {
				sendError("模型未配置，请在选项页面中设置");
				return;
			}

			let customBody: Record<string, unknown> = {};
			if (body) {
				try {
					customBody = JSON.parse(body) as Record<string, unknown>;
				} catch {
					sendError("自定义请求体JSON格式无效");
					return;
				}
			}

			const messages: Array<{ role: "system" | "user"; content: string }> = [
				{
					role: "system",
					content: buildSystemPrompt(pageMeta, targetLang),
				},
				{
					role: "user",
					content: text,
				},
			];

			// 用 @nickyzj2023/utils 的 fetcher 发请求（取代原生 fetch）。
			// 关键点：fetcher 默认响应解析为 JSON，这里通过 parser 原样返回
			// Response，从而保留下游 parseSSE 的流式解析能力；signal 会透传
			// 到底层 fetch，所以 AbortController 的中止行为不变。
			const response = await fetcher(
				`${baseUrl.replace(/\/$/, "")}`,
			).post<Response>(
				"/chat/completions",
				{
					model: modelName,
					messages,
					stream: true,
					...customBody,
				},
				{
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					signal: controller.signal,
					parser: (response): Promise<Response> => Promise.resolve(response),
				},
			);

			for await (const data of parseSSE<StreamChunk>(response)) {
				if (controller.signal.aborted) return;
				// parseSSE 对无法解析为 JSON 的行（如 SSE 结束哨兵 [DONE]）
				// 原样 yield 字符串，直接跳过
				if (typeof data === "string") continue;
				const content = data.choices?.[0]?.delta?.content;
				if (content) {
					safePostMessage(port, { type: "CHUNK", chunk: content });
				}
			}

			if (!controller.signal.aborted) {
				safePostMessage(port, { type: "DONE" });
			}
		} catch (e) {
			// 主动中止（AbortError）：静默返回，不向端口报错
			if (controller.signal.aborted) return;
			console.error("[background]翻译失败：", e);
			safePostMessage(port, {
				type: "ERROR",
				error: extractErrorMessage(e),
			});
		}
	}

	return {
		abort: (): void => controller.abort(),
	};
}
