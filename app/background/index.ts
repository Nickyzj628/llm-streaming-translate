import browser from "webextension-polyfill";
import {
	type StreamTranslationController,
	startStreamTranslation,
} from "@/background/StreamTranslator";
import {
	STREAM_TRANSLATE_PORT,
	type StreamTranslatePortMessage,
} from "@/types/messages";

browser.runtime.onInstalled.addListener((): void => {
	console.log("Extension installed");
});

// Firefox MV2 uses browser.browserAction, Chrome MV3 uses browser.action
const actionApi = browser.action || browser.browserAction;

actionApi?.onClicked?.addListener((): void => {
	void browser.runtime.openOptionsPage();
});

browser.runtime.onConnect.addListener((port) => {
	if (port.name !== STREAM_TRANSLATE_PORT) return;

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
});
