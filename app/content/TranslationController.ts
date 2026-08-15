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

/**
 * 断点重试的最大次数。每次重试只重译"错位段及之后"的后半段，成本递减；
 * 但模型可能在固定段反复错位造成死循环（每次重试仍消耗 API token），
 * 所以设硬上限，达到上限后回滚原文（同 onError 行为）。可按需调大，但建议保留。
 */
const MAX_ATTEMPTS = 5;

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

		/**
		 * 发起一次流式翻译（初始或错位重试共用）。
		 * @param text 发给 LLM 的协议文本（初始为全文本，重试为后半段子文本）
		 */
		function runStream(text: string): void {
			currentStream = streamTranslate({
				text,
				pageMeta: getPageMeta(),
				onChunk: (chunk) => {
					translator.appendChunk(chunk);
				},
				onDone: () => {
					// finish 返回对齐结果：ok=true 段数对齐，直接收尾；
					// ok=false 表示末尾吞段/漏段，由 handleMisalign 从 fromSegment 起续译。
					// 注意不要在这里动 currentStream——handleMisalign 会 abort 旧流并
					// runStream 建立新流，onDone 返回后不能再覆盖新句柄（本次重构修的 bug）。
					const result = translator.finish();
					if (result.ok) {
						finish();
					} else {
						handleMisalign(result.fromSegment);
					}
				},
				onError: (error) => {
					console.error(error);
					translator.destroy();
					finish();
				},
				onDisconnect: () => {
					translator.destroy();
					finish();
				},
			});
			// 注入对齐检测回调（translator 内部在发现错位时调用）
			translator.setOnMisalign(handleMisalign);
		}

		/**
		 * 已重试次数：0 = 首次请求。每次断点重试 +1；达到 MAX_ATTEMPTS 后放弃。
		 * 保留计数是为了防死循环（模型在固定段反复错位会一直消耗 token）。
		 */
		let attempts = 0;

		/**
		 * 对齐检测回调（流式 {{segN}} 序号错配 + finish 段数兜底共用入口）：
		 * 发现错位后从 fromSegment 起重译。restart 恢复错位段起锚点的原文并返回
		 * 子文本；旧流立即中止，避免旧请求继续消耗 token。
		 *
		 * 为什么这是"自动断点重试"的核心：每次错位都精确定位到"第一个没对齐的段"，
		 * 前半段已写回的译文不动，只重译后半段——长文多段时比全文重译省大量 token，
		 * 且重试范围随 fromSegment 前进而收敛。
		 */
		function handleMisalign(fromSegment: number): void {
			// 达到重试上限：放弃，回滚原文（同 onError 行为），避免反复错位死循环
			if (attempts >= MAX_ATTEMPTS) {
				currentStream?.abort();
				currentStream = null;
				translator.destroy();
				finish();
				return;
			}
			// 中止当前错位流，从定位到的错位段起重译后半段
			currentStream?.abort();
			currentStream = null;
			attempts++;
			runStream(translator.restart(fromSegment));
		}

		// 首次发起完整翻译
		runStream(segmentedText);
	}

	return {
		start,
		abort: () => abortCurrent(),
		dispose: () => abortCurrent(),
		getSelectedText,
		isTranslating: () => isTranslating,
	};
}
