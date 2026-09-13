import type { InlineTranslatorController } from "@/content/InlineTranslator";
import {
	type StreamTranslateHandle,
	streamTranslate,
} from "@/utils/streamTranslate";

/** 一次划词翻译会话的生命周期句柄 */
export interface TranslationSession {
	/**
	 * 打断会话：销毁翻译器（回滚已写回的原文）+ 中止在途请求，并通知持有方。
	 * 会话已结束（成功/失败/放弃）后调用是幂等空操作。
	 */
	abort: () => void;
}

/**
 * 断点重试的最大次数。每次重试只重译"错位段及之后"的后半段，成本递减；
 * 但模型可能在固定段反复错位造成死循环（每次重试仍消耗 API token），
 * 所以设硬上限，达到上限后回滚原文（同 onError 行为）。可按需调大，但建议保留。
 */
const MAX_ATTEMPTS = 5;

/**
 * 发起一次划词翻译会话：负责这次会话的请求、错位重试与收尾。
 *
 * 为什么把它从 TranslationController.start() 的闭包里提出来：原来
 * runStream / finish / attempts / handleMisalign 都声明在 start() 内部、靠闭包
 * 捕获，会话概念只存在于缩进层次里，无法单独推理；"onDone 覆盖新句柄"那类时序
 * bug 正是这种隐式状态的产物。提成显式对象后，一次会话的完整生命周期
 * （发起 → 错位重试 → 收尾/放弃）在一处读完，且"是否已结束"由本对象的 ended
 * 判定，不再依赖 controller 的全局标志（旧会话的迟到回调影响不到新会话）。
 *
 * @param options.translator 已建好锚点的原地翻译器（本会话接管其生命周期）
 * @param options.initialText 首次请求的协议文本
 * @param options.getPageMeta 每次发起请求前读取网页元数据（重试时也重新读）
 * @param options.onEnded 会话自然结束（成功/失败/放弃）时回调，供持有方复位
 */
export function startTranslationSession(options: {
	translator: InlineTranslatorController;
	initialText: string;
	getPageMeta: () => { title: string; description: string };
	onEnded: () => void;
}): TranslationSession {
	const { translator, initialText, getPageMeta, onEnded } = options;

	/** 当前在途的端口流句柄（错位重试时会换成新的） */
	let currentStream: StreamTranslateHandle | null = null;
	/**
	 * 已重试次数：0 = 首次请求。每次断点重试 +1；达到 MAX_ATTEMPTS 后放弃。
	 * 保留计数是为了防死循环（模型在固定段反复错位会一直消耗 token）。
	 */
	let attempts = 0;
	/** 会话是否已结束：结束后的迟到回调（端口、错位）一律忽略 */
	let ended = false;

	/**
	 * 会话收尾：置结束标志、清句柄并通知持有方。
	 * 只复位状态、不销毁翻译器——成功路径的 DOM 已由 translator.finish() 收尾，
	 * 失败路径由调用方先 destroy 再走到这里。
	 */
	function end(): void {
		if (ended) return;
		ended = true;
		currentStream = null;
		onEnded();
	}

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
		if (ended) return;
		// 达到重试上限：放弃，回滚原文（同 onError 行为），避免反复错位死循环
		if (attempts >= MAX_ATTEMPTS) {
			currentStream?.abort();
			translator.destroy();
			end();
			return;
		}
		// 中止当前错位流，从定位到的错位段起重译后半段
		currentStream?.abort();
		currentStream = null;
		attempts++;
		runStream(translator.restart(fromSegment));
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
				// 注意这里不要动 currentStream——handleMisalign 会 abort 旧流并
				// runStream 建立新流，onDone 返回后不能再覆盖新句柄（闭包版踩过的 bug）。
				const result = translator.finish();
				if (result.ok) {
					end();
				} else {
					handleMisalign(result.fromSegment);
				}
			},
			onError: (error) => {
				console.error(error);
				translator.destroy();
				end();
			},
			onDisconnect: () => {
				translator.destroy();
				end();
			},
		});
		// 注入对齐检测回调（translator 内部在发现错位时调用）
		translator.setOnMisalign(handleMisalign);
	}

	// 首次发起完整翻译
	runStream(initialText);

	return {
		abort(): void {
			if (ended) return;
			translator.destroy();
			currentStream?.abort();
			currentStream = null;
			end();
		},
	};
}
