import {
	createInlineTranslator,
	type InlineTranslatorController,
} from "@/content/InlineTranslator";
import { streamTranslate } from "@/utils/streamTranslate";

/**
 * content 端"划词翻译"会话控制器。
 *
 * 它把 index.ts 里原来内联的整套会话编排（状态管理、选区/元数据读取、
 * 发起流式请求、回调写回/收尾/回滚、打断与复位）收敛成一组有名字的动作，
 * 让入口文件只负责"事件 → 动作"的声明式转发，新人无需在入口里翻业务细节。
 *
 * 一次会话的生命周期：
 *   start(range)  → 建 translator → 校验空文本 → 发起 stream → 回调写回/收尾/回滚
 *   abort()       → 打断当前会话（销毁 translator + 断开端口）
 *   dispose()     → 打断当前会话（页面卸载时由调用方触发）
 */
export interface TranslationController {
	/** 开始翻译一个选区 Range（点击浮动按钮触发） */
	start: (range: Range) => void;
	/**
	 * 打断当前进行中的翻译：销毁翻译器 + 断开端口，并复位全局状态。
	 * 重新划词 / 页面卸载时调用，避免留下浪费的 background 请求。
	 */
	abort: () => void;
	/** 清理并打断当前会话（beforeunload 时由调用方触发） */
	dispose: () => void;
	/** 读取当前选区文本（trim 后），供入口判断是否显示浮动按钮 */
	getSelectedText: () => string;
	/** 是否正在翻译中（供入口在选区变化时决定是否忽略，保持与原行为一致） */
	isTranslating: () => boolean;
}

export function createTranslationController(): TranslationController {
	// 会话状态：是否翻译中、当前翻译器（写回/打断/回滚对象）、当前流句柄（取消用）
	let isTranslating = false;
	let currentTranslator: InlineTranslatorController | null = null;
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

	/** 打断当前翻译：销毁翻译器 + 断开端口，并复位全局状态 */
	function abortCurrent(): void {
		currentTranslator?.destroy();
		currentTranslator = null;
		currentStream?.abort();
		currentStream = null;
		isTranslating = false;
	}

	function start(range: Range): void {
		// 打断前一个进行中的翻译
		if (isTranslating) {
			abortCurrent();
		}

		// 创建原地翻译器，提取文本节点、建立锚点、得到分段协议文本
		const translator = createInlineTranslator(range);
		const segmentedText = translator.getText();

		// 选区内没有可翻译的文本节点（如选区全部落在被跳过的位置）：
		// 销毁锚点直接放弃，不发无意义的空请求
		if (segmentedText === "") {
			translator.destroy();
			return;
		}

		currentTranslator = translator;
		isTranslating = true;

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
			// 回调闭包直接引用本次会话的 translator（而非模块级 currentTranslator）：
			// 即使中途被新会话替换，旧会话的迟到回调也只会操作已销毁的旧对象，
			// 不会把旧会话的 chunk 写进新会话的锚点
			// 流式写回：translator 内部按段分隔拆解并写入对应锚点
			onChunk: (chunk) => {
				translator.appendChunk(chunk);
			},
			onDone: () => {
				// finish() 内部做尽力对齐：尽量保留已译部分，缺失段补原文
				translator.finish();
				finish();
			},
			onError: (error) => {
				console.error(error);
				// 失败回滚：销毁翻译器，恢复原文 DOM
				translator.destroy();
				finish();
			},
			onDisconnect: () => {
				// 端口被异常断开（background 崩溃/被关闭）：回滚原文
				translator.destroy();
				finish();
			},
		});
	}

	return {
		start,
		abort: () => abortCurrent(),
		dispose: () => abortCurrent(),
		getSelectedText,
		isTranslating: () => isTranslating,
	};
}
