import browser from "webextension-polyfill";
import {
	hide as hideButton,
	isButtonElement,
	onClick,
	show as showButton,
} from "@/content/FloatingButton";
import {
	createTranslatePopup,
	type TranslatePopupController,
} from "@/content/TranslatePopup";
import type { StreamTranslatePortMessage } from "@/types/messages";

let isTranslating = false;
let currentPopup: TranslatePopupController | null = null;
let currentPort: browser.Runtime.Port | null = null;

function getSelectedText(): string {
	const selection = window.getSelection();
	return selection ? selection.toString().trim() : "";
}

function handleMouseDown(e: MouseEvent): void {
	if (isButtonElement(e.target as Node)) return;
	hideButton();
}

function handleMouseUp(e: MouseEvent): void {
	if (isButtonElement(e.target as Node)) return;

	requestAnimationFrame(() => {
		if (isTranslating) {
			currentPopup?.hide();
			isTranslating = false;
		}

		const selectedText = getSelectedText();
		if (selectedText.length > 0) {
			showButton(e.clientX + 8, e.clientY + 8);
			onClick(() => startTranslate(selectedText));
		} else {
			hideButton();
		}
	});
}

function handleSelectionChange(): void {
	if (isTranslating) return;
	if (getSelectedText().length === 0) {
		hideButton();
	}
}

function startTranslate(text: string): void {
	if (isTranslating) {
		currentPopup?.hide();
		currentPort?.disconnect();
		currentPort = null;
		isTranslating = false;
	}

	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return;

	const range = selection.getRangeAt(0);
	const targetRect = range.getBoundingClientRect();
	selection.removeAllRanges();

	isTranslating = true;
	hideButton();

	currentPopup = createTranslatePopup();
	currentPopup.show(targetRect);

	let isFinished = false;
	const port = browser.runtime.connect({ name: "stream-translate" });
	currentPort = port;

	const messageHandler = (message: unknown): void => {
		const msg = message as StreamTranslatePortMessage;
		if (msg.type === "CHUNK" && msg.chunk) {
			currentPopup?.appendChunk(msg.chunk);
		} else if (msg.type === "REASONING" && msg.reasoning) {
			currentPopup?.appendReasoning(msg.reasoning);
		} else if (msg.type === "USAGE") {
			currentPopup?.setUsage(msg.usage);
		} else if (msg.type === "DONE") {
			finish();
		} else if (msg.type === "ERROR") {
			console.error("[LLM Translate] Translation failed:", msg.error);
			currentPopup?.setError(msg.error || "未知错误");
			finish();
		}
	};

	const disconnectHandler = (): void => {
		if (!isFinished) {
			finish();
			currentPopup?.setError("连接已断开");
		}
	};

	port.onMessage.addListener(messageHandler);
	port.onDisconnect.addListener(disconnectHandler);

	port.postMessage({ type: "START", text });

	function finish(): void {
		if (isFinished) return;
		isFinished = true;
		isTranslating = false;
		port.onMessage.removeListener(messageHandler);
		port.onDisconnect.removeListener(disconnectHandler);
		currentPort = null;
		port.disconnect();
	}
}

function cleanup(): void {
	document.removeEventListener("mousedown", handleMouseDown);
	document.removeEventListener("mouseup", handleMouseUp);
	document.removeEventListener("selectionchange", handleSelectionChange);
	hideButton();
	currentPopup?.hide();
	currentPort?.disconnect();
	currentPort = null;
}

window.addEventListener("beforeunload", cleanup);

document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("selectionchange", handleSelectionChange);
