import browser from "webextension-polyfill";
import { streamTranslateOverPort } from "@/background/StreamTranslator";
import type { StreamTranslatePortMessage } from "@/types/messages";

browser.runtime.onInstalled.addListener((): void => {
	console.log("Extension installed");
});

// Firefox MV2 uses browser.browserAction, Chrome MV3 uses browser.action
const actionApi = browser.action || browser.browserAction;

actionApi?.onClicked?.addListener((): void => {
	void browser.runtime.openOptionsPage();
});

browser.runtime.onConnect.addListener((port) => {
	if (port.name !== "stream-translate") return;

	const messageHandler = (message: StreamTranslatePortMessage) => {
		if (message.type === "START") {
			streamTranslateOverPort(message.text, port).catch((err) => {
				const errorMessage = err instanceof Error ? err.message : String(err);
				port.postMessage({ type: "ERROR", error: errorMessage });
			});
		}
	};

	port.onMessage.addListener(messageHandler as (message: unknown) => void);

	port.onDisconnect.addListener(() => {
		port.onMessage.removeListener(messageHandler as (message: unknown) => void);
	});
});
