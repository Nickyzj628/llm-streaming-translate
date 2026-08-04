import { defineShadowContentUI } from "@addfox/utils";
import browser from "webextension-polyfill";
import {
	hide as hideButton,
	isButtonElement,
	onClick,
	setParent,
	show as showButton,
} from "@/content/FloatingButton";
import {
	createInlineTranslator,
	type InlineTranslatorController,
} from "@/content/InlineTranslator";
import type { StreamTranslatePortMessage } from "@/types/messages";

const mountUI = defineShadowContentUI({
	name: "llm-translate-ui",
	target: document.body,
	injectMode: "append",
});
const shadowRoot = mountUI() as ShadowRoot;
setParent(shadowRoot);

let isTranslating = false;
let currentTranslator: InlineTranslatorController | null = null;
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
			currentTranslator?.destroy();
			currentTranslator = null;
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

function startTranslate(_text: string): void {
	// 若已有翻译进行中，先取消前一个
	if (isTranslating) {
		currentTranslator?.destroy();
		currentPort?.disconnect();
		currentPort = null;
		currentTranslator = null;
		isTranslating = false;
	}

	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return;

	// 保留 Range，仅清除高亮
	const range = selection.getRangeAt(0);
	selection.removeAllRanges();

	// 创建原地翻译器，提取文本节点和分段信息
	const translator = createInlineTranslator(range, shadowRoot);
	currentTranslator = translator;
	const segmentedText = translator.getText();

	isTranslating = true;
	hideButton();

	let isFinished = false;
	const port = browser.runtime.connect({ name: "stream-translate" });
	currentPort = port;

	const messageHandler = (message: unknown): void => {
		const msg = message as StreamTranslatePortMessage;
		if (msg.type === "CHUNK" && msg.chunk) {
			currentTranslator?.appendChunk(msg.chunk);
		} else if (msg.type === "DONE") {
			// finish() 内部做段数校验：对齐则标记完成，错位则恢复原文
			currentTranslator?.finish();
			finish();
		} else if (msg.type === "ERROR") {
			console.error("[LLM Translate] Translation failed:", msg.error);
			currentTranslator?.destroy();
			currentTranslator = null;
			finish();
		}
	};

	const disconnectHandler = (): void => {
		if (!isFinished) {
			currentTranslator?.destroy();
			currentTranslator = null;
			finish();
		}
	};

	port.onMessage.addListener(messageHandler);
	port.onDisconnect.addListener(disconnectHandler);

	port.postMessage({ type: "START", text: segmentedText });

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
	currentTranslator?.destroy();
	currentTranslator = null;
	currentPort?.disconnect();
	currentPort = null;
}

window.addEventListener("beforeunload", cleanup);

document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("selectionchange", handleSelectionChange);
