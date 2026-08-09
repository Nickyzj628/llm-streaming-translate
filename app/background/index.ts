import { extractErrorMessage } from "@nickyzj2023/utils";
import browser from "webextension-polyfill";
import {
	safePostMessage,
	streamTranslateOverPort,
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

	const messageHandler = (message: StreamTranslatePortMessage) => {
		if (message.type === "START") {
			streamTranslateOverPort(message.text, port, message.pageMeta).catch((e) => {
				// 用 safePostMessage：若此处端口已断开（SW 被回收），
				// 直接 postMessage 会二次抛错变成 Uncaught (in promise)。
				safePostMessage(port, {
					type: "ERROR",
					error: extractErrorMessage(e),
				});
			});
		}
	};

	port.onMessage.addListener(messageHandler as (message: unknown) => void);

	port.onDisconnect.addListener(() => {
		port.onMessage.removeListener(messageHandler as (message: unknown) => void);
	});
});
