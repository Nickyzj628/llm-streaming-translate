import browser from "webextension-polyfill";
import { onStreamTranslatePort } from "@/background/PortListener";
import { STREAM_TRANSLATE_PORT } from "@/types/messages";

browser.runtime.onInstalled.addListener((): void => {
	console.log("Extension installed");
});

// Firefox MV2 uses browser.browserAction, Chrome MV3 uses browser.action
const actionApi = browser.action || browser.browserAction;

actionApi?.onClicked?.addListener((): void => {
	void browser.runtime.openOptionsPage();
});

// 端口级生命周期（消息监听、重复 START 打断、断开兜底、清理）全部交给
// PortListener 处理，入口只负责把监听转发给它。
browser.runtime.onConnect.addListener((port) => {
	if (port.name !== STREAM_TRANSLATE_PORT) return;
	onStreamTranslatePort(port);
});
