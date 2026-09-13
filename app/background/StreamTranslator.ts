import { stream } from "@nickyzj2023/ai";
import { extractErrorMessage } from "@nickyzj2023/utils";
import type browser from "webextension-polyfill";
import { buildSystemPrompt } from "@/background/prompt";
import type { StreamTranslatePortMessage } from "@/types/messages";
import { getStorage } from "@/utils/storage";

/** 单次流式翻译的控制句柄：abort() 立即中止底层 HTTP 连接 */
export interface StreamTranslationController {
	abort: () => void;
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
		// 消费方收到 onDisconnect 会自行回滚，无需这边兜底。
		console.warn("[background]端口已断开，丢弃消息", message.type);
	}
}

/**
 * 发起一次流式翻译，逐 chunk 经端口回传，返回可中止句柄。
 *
 * 为什么用 @nickyzj2023/ai 的 stream：它内部就是我们原先手写的那一套
 * （fetcher 发请求 + parseSSE 解析 SSE），但额外统一了各厂商的思考字段差异、
 * 工具调用拼接与错误归一，且 AbortSignal 由 options.signal 透传——content 端
 * 打断（重新划词/页面卸载）时能立即硬中止 HTTP 连接，不会把整个流跑完再丢弃。
 *
 * 注意：上游当前总是发送 `tools: []`（个别供应商对空数组不宽容），如需彻底
 * 规避要等上游改成条件性携带。
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
				{ role: "system", content: buildSystemPrompt(pageMeta, targetLang) },
				{ role: "user", content: text },
			];

			// options.body 会被平铺进 /chat/completions 请求体（上游支持），
			// 所以设置项 body 的额外字段照旧生效
			// options.body 会被平铺进 /chat/completions 请求体（上游支持），
			// 所以设置项 body 的额外字段照旧生效
			for await (const event of stream(
				{ baseUrl, model: modelName, apiKey },
				messages,
				[],
				{ signal: controller.signal, body: customBody },
			)) {
				if (controller.signal.aborted) return;
				if (event.type === "content_delta") {
					safePostMessage(port, { type: "CHUNK", chunk: event.delta });
				} else if (event.type === "error") {
					// 上游已归一错误信息（extractErrorMessage），直接回传
					sendError(event.message);
					return;
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
