/**
 * 划词翻译的端口客户端（content 端与 options 端共用）。
 *
 * 原来 content 端（content/index.ts）和 options 端（useTestTranslation.ts）
 * 各自重复实现了一段"端口生命周期"：connect port、监听 CHUNK/DONE/ERROR、
 * 超时、清理监听器、disconnect、异常断开兜底。这里收敛成一份，两端只负责
 * 各自的"写回差异"（onChunk 如何把译文写回、onDone/onError/onDisconnect 如何收尾）。
 *
 * 消息协议见 types/messages.ts（START/CHUNK/DONE/ERROR），改动需两端同步。
 */
import browser from "webextension-polyfill";
import {
	STREAM_TRANSLATE_PORT,
	type StreamTranslatePortMessage,
} from "@/types/messages";

export interface StreamTranslateCallbacks {
	/** 每个译文 chunk 到达时回调（消费方各自决定如何写回译文） */
	onChunk: (chunk: string) => void;
	/** 翻译成功完成（已收到 DONE，端口已清理） */
	onDone: () => void;
	/** 翻译失败（已收到 ERROR） */
	onError: (error: string) => void;
	/**
	 * 端口被异常断开（background 崩溃/被关闭，且未收到 DONE/ERROR）或超时。
	 * 注意：主动 abort() 不会触发此回调。
	 */
	onDisconnect?: () => void;
}

export interface StreamTranslateOptions extends StreamTranslateCallbacks {
	/** 发送给 background 的待翻译文本（content 端为分段协议文本，options 端为测试文本） */
	text: string;
	/** 网页元数据（content 端传入；options 测试板块不传） */
	pageMeta?: { title: string; description: string };
	/** 超时毫秒：到达后自动断开并触发 onDisconnect。缺省不设超时 */
	timeoutMs?: number;
}

export interface StreamTranslateHandle {
	/** 主动取消：断开端口并清理监听器（不触发 onDisconnect） */
	abort: () => void;
}

/**
 * 发起一次划词翻译，返回一个可 abort 的句柄。
 * 端口生命周期（连接、监听、清理、disconnect、超时）都由本函数统一管理。
 */
export function streamTranslate(
	options: StreamTranslateOptions,
): StreamTranslateHandle {
	const port = browser.runtime.connect({ name: STREAM_TRANSLATE_PORT });
	let finished = false;
	let timeoutId: ReturnType<typeof setTimeout> | null =
		options.timeoutMs !== undefined
			? setTimeout(() => {
					cleanup(true);
				}, options.timeoutMs)
			: null;

	/**
	 * 统一收尾：移除监听器、清超时、断连。
	 * @param notifyOnDisconnect 是否在收尾后触发 onDisconnect 兜底回调
	 *   （超时/异常断开传 true；DONE/ERROR/主动 abort 传 false）
	 */
	function cleanup(notifyOnDisconnect: boolean): void {
		if (finished) return;
		finished = true;
		port.onMessage.removeListener(messageHandler);
		port.onDisconnect.removeListener(disconnectHandler);
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		port.disconnect();
		if (notifyOnDisconnect) options.onDisconnect?.();
	}

	function messageHandler(message: unknown): void {
		const msg = message as StreamTranslatePortMessage;
		if (msg.type === "CHUNK" && msg.chunk) {
			options.onChunk(msg.chunk);
		} else if (msg.type === "DONE") {
			cleanup(false);
			options.onDone();
		} else if (msg.type === "ERROR") {
			cleanup(false);
			options.onError(msg.error);
		}
	}

	// 端口断开兜底：若在正常结束（DONE/ERROR/abort）前就断开
	// （background 崩溃/被关闭），走 onDisconnect 让消费方回滚。
	function disconnectHandler(): void {
		if (!finished) {
			cleanup(true);
		}
	}

	port.onMessage.addListener(messageHandler);
	port.onDisconnect.addListener(disconnectHandler);

	// 连接后立即发送 START。这里包 try/catch 是防御性保护：
	// 极端情况下（如 background 刚建立连接就被回收），postMessage 可能抛
	// "Attempting to use a disconnected port object"，包住避免变成 uncaught。
	// 若发送失败，onDisconnect 会触发，消费方走回滚兜底。
	try {
		port.postMessage({
			type: "START",
			text: options.text,
			...(options.pageMeta ? { pageMeta: options.pageMeta } : {}),
		});
	} catch {
		cleanup(true);
	}

	return {
		abort: () => cleanup(false),
	};
}
