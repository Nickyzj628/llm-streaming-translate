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

/**
 * content 端入口：负责"划词 → 显示浮动按钮 → 点击触发翻译会话"的完整交互编排。
 *
 * 一次划词翻译的完整生命周期（收集文本节点 → 发起 LLM 流式请求 → 流式写回 →
 * 成功收尾 / 失败回滚 → 状态复位）都收敛在本文件里，避免多文件中转。
 * 协议文本的构造与 DOM 写回细节在 InlineTranslator.ts；端口生命周期的管理在
 * utils/streamTranslate.ts（content 与 options 测试板块共用）。
 */
const mountUI = defineShadowContentUI({
	name: "llm-translate-ui",
	target: document.body,
	injectMode: "append",
});
const shadowRoot = mountUI() as ShadowRoot;
setParent(shadowRoot);

let isTranslating = false;
/** 当前进行中的翻译器，用于写回分流 / 打断上一会话 / 页面卸载清理 */
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
		// 选中新文本时打断上一会话（重新划词）。
		// 这里统一走 abort()（销毁 translator + 断开端口），
		// 比旧实现"只销毁 translator、端口空跑"更干净——不留浪费的 background 请求。
		if (isTranslating) {
			abortCurrent();
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

/** 打断当前进行中的翻译：销毁翻译器 + 断开端口，并复位全局状态 */
function abortCurrent(): void {
	currentTranslator?.destroy();
	currentTranslator = null;
	currentStream?.abort();
	currentStream = null;
	isTranslating = false;
}

function startTranslate(_text: string): void {
	// 打断前一个进行中的翻译
	if (isTranslating) {
		abortCurrent();
	}

	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return;

	// 保留 Range，仅清除高亮
	const range = selection.getRangeAt(0);
	selection.removeAllRanges();

	// 创建原地翻译器，提取文本节点、建立锚点、得到分段协议文本
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
		// 流式写回：translator 内部按段分隔拆解并写入对应锚点
		onChunk: (chunk) => {
			currentTranslator?.appendChunk(chunk);
		},
		onDone: () => {
			// finish() 内部做尽力对齐：尽量保留已译部分，缺失段补原文
			currentTranslator?.finish();
			finish();
		},
		onError: (error) => {
			console.error(error);
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
	abortCurrent();
}

window.addEventListener("beforeunload", cleanup);

document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("selectionchange", handleSelectionChange);
