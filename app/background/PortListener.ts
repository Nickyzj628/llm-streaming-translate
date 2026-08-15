import type browser from "webextension-polyfill";
import {
	type StreamTranslationController,
	startStreamTranslation,
} from "@/background/StreamTranslator";
import type { StreamTranslatePortMessage } from "@/types/messages";

/**
 * background 端"stream-translate"长连接端口的处理器。
 *
 * 它把 index.ts 里原来内联的端口级生命周期（消息监听、重复 START 打断、
 * 断开兜底、监听器清理）收敛为 `onStreamTranslatePort(port)` 一个入口，
 * 让 background 入口只负责"端口 → 转发"，不掺端口细节。
 *
 * 生命周期：
 *   收到 START → 打断同端口上一会话 → 开启新流式翻译
 *   端口断开 → 中止在途 LLM 请求（避免 token 浪费）→ 清理监听器
 */
export function onStreamTranslatePort(port: browser.Runtime.Port): void {
	/** 当前端口上正在进行的翻译（同端口重复 START / 端口断开时中止） */
	let current: StreamTranslationController | null = null;

	const messageHandler = (message: StreamTranslatePortMessage): void => {
		if (message.type !== "START") return;

		// 同端口重复 START：先打断上一会话再开新会话，
		// 避免两个流交错写同一端口、译文互相污染
		current?.abort();
		current = startStreamTranslation(message.text, port, message.pageMeta);
	};

	const disconnectHandler = (): void => {
		// content 主动 abort / 页面卸载 / SW 重启都会断开端口：
		// 立即中止在途 LLM 请求，避免为无人消费的会话继续消耗 token
		current?.abort();
		current = null;
		port.onMessage.removeListener(messageHandler as (message: unknown) => void);
		port.onDisconnect.removeListener(disconnectHandler);
	};

	port.onMessage.addListener(messageHandler as (message: unknown) => void);
	port.onDisconnect.addListener(disconnectHandler);
}
