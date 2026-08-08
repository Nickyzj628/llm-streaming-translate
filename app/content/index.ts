import { defineShadowContentUI } from "@addfox/utils";
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
import { streamTranslate } from "@/utils/streamTranslate";

const mountUI = defineShadowContentUI({
	name: "llm-translate-ui",
	target: document.body,
	injectMode: "append",
});
const shadowRoot = mountUI() as ShadowRoot;
setParent(shadowRoot);

let isTranslating = false;
let currentTranslator: InlineTranslatorController | null = null;
/** 当前进行中的翻译句柄（streamTranslate 返回值），用于主动取消 */
let currentStream: { abort: () => void } | null = null;

/**
 * 读取当前网页的元数据（title + meta description），供 background 注入 system prompt
 * 帮助模型理解页面主题与语境。description 为空时省略该字段。
 * 截断保护：避免超长 title/description 塞爆 prompt。
 */
function getPageMeta(): { title: string; description: string } {
	const title = document.title.trim().slice(0, 200);
	const descEl = document.querySelector<HTMLMetaElement>(
		'meta[name="description"], meta[property="og:description"]',
	);
	const description = (descEl?.content ?? "").trim().slice(0, 300);
	return { title, description };
}

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
	// 取消前一个进行中的翻译：先销毁翻译器，再 abort 端口
	if (isTranslating) {
		currentTranslator?.destroy();
		currentStream?.abort();
		currentStream = null;
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

	/**
	 * 复位翻译状态：isTranslating 归 false、清掉 currentTranslator/currentStream。
	 * 端口自身的监听器清理/断连由 streamTranslate 内部完成，这里只管业务状态。
	 */
	function finish(): void {
		if (!isTranslating) return;
		isTranslating = false;
		currentTranslator = null;
		currentStream = null;
	}

	currentStream = streamTranslate({
		text: segmentedText,
		pageMeta: getPageMeta(),
		onChunk: (chunk) => {
			// 流式写回：translator 内部按段分隔拆解并写入对应锚点
			currentTranslator?.appendChunk(chunk);
		},
		onDone: () => {
			// finish() 内部做尽力对齐：尽量保留已译部分，缺失段补原文
			currentTranslator?.finish();
			finish();
		},
		onError: (error) => {
			console.error("[LLM Translate] Translation failed:", error);
			// 失败回滚：销毁翻译器，恢复原文 DOM
			currentTranslator?.destroy();
			finish();
		},
		onDisconnect: () => {
			// 端口被异常断开（background 崩溃/被关闭）：回滚原文
			currentTranslator?.destroy();
			finish();
		},
	});
}

function cleanup(): void {
	document.removeEventListener("mousedown", handleMouseDown);
	document.removeEventListener("mouseup", handleMouseUp);
	document.removeEventListener("selectionchange", handleSelectionChange);
	hideButton();
	currentTranslator?.destroy();
	currentTranslator = null;
	currentStream?.abort();
	currentStream = null;
}

window.addEventListener("beforeunload", cleanup);

document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("selectionchange", handleSelectionChange);
