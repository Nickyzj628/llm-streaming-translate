import type { InlineTranslatorController } from "@/content/InlineTranslator";
import {
	extractTranslatedContent,
	joinSegmentRows,
	SegmentStreamParser,
} from "@/utils/protocol";
import type {
	StreamTranslateHandle,
	StreamTranslateOptions,
} from "@/utils/streamTranslate";

/**
 * 发起一次流的方式。真实实现是 utils/streamTranslate.ts（端口客户端），
 * 由入口注入——这样会话本身不静态依赖端口模块，纯逻辑能在单测里跑。
 */
export type StreamTransport = (
	options: StreamTranslateOptions,
) => StreamTranslateHandle;

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
 * 发起一次划词翻译会话：负责这次会话的请求、流式写回、错位重试与收尾。
 *
 * 为什么把协议解析和对齐状态都放这儿：它们描述的是"本次流译到第几段了"，
 * 属于一次会话，不是 DOM 的事。早先这些状态在 InlineTranslator 里，会话得
 * 反向注入 onMisalign 回调、translator 又反手回调会话，两边互相调用才转得起来；
 * 现在解析器归会话持有、translator 只剩"按段写/恢复"的纯 DOM 方法，单向调用。
 *
 * 会话的完整生命周期（发起 → 错位重试 → 收尾/放弃）在这一个函数里读完，
 * "是否已结束"由本对象的 ended 判定，旧会话的迟到回调影响不到新会话。
 *
 * @param options.translator 已建好锚点的原地翻译器（本会话接管其生命周期）
 * @param options.transport 发起一次流的方式（入口注入真实端口客户端）
 * @param options.getPageMeta 每次发起请求前读取网页元数据（重试时也重新读）
 * @param options.onEnded 会话自然结束（成功/失败/放弃）时回调，供持有方复位
 */
export function startTranslationSession(options: {
	translator: InlineTranslatorController;
	transport: StreamTransport;
	getPageMeta: () => { title: string; description: string };
	onEnded: () => void;
}): TranslationSession {
	const { translator, transport, getPageMeta, onEnded } = options;

	// 协议行抓一份留着：错位重试时要按 fromSegment 切片重拼子文本
	const rows = translator.getRows();
	const totalSegments = rows.length;

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
	 * 下一个该写回的段下标（绝对段序号 = cursor + 1）。
	 * 它同时等于"已通过序号校验的段数"，错位时就从它起续译。
	 */
	let cursor = 0;
	/**
	 * 本次流期望输出的段数。首次是全量；重试只译后半段，得跟着改成
	 * totalSegments - fromSegment，否则 finish 的段数兜底会把重试流误判成漏段。
	 */
	let expectedSegments = totalSegments;
	/**
	 * 最后一段已提交的完整译文。模型把段内换行当成新段、自己往后编号时，
	 * 多出来的内容要拼回这一段（见 onSegment 的溢出分支），不能丢
	 */
	let lastSegmentText = "";
	/**
	 * 当前流的序号。换流（错位重试）后，旧流的迟到回调（abort 竞态、端口在途消息）
	 * 一律丢弃——否则旧流的 chunk/DONE 会推进新流的解析器，一串连环错位
	 */
	let streamSeq = 0;

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
	 * 段流解析器的消费逻辑：第 cursor 个输出段应结束于 {{seg(cursor+1)}}。
	 * 序号不符说明模型在这之前拆/并段错位了，立即回调重试；后续段不再消费，
	 * 避免错误译文以 written=true 残留。这是"断点重试"能精确定位错位段的关键——
	 * 长文纯文本段之间没有 {{var}} 占位符，序号是唯一可靠的地标。
	 */
	function makeParser(): SegmentStreamParser {
		return new SegmentStreamParser({
			onSegment: (segment, segmentNumber) => {
				const text = extractTranslatedContent(segment);
				// 真实段都写满了，模型还在给段号：这些是它给段内换行自己编的段，
				// 内容属于最后一段的续写，拼回去（原来越界下标会被静默丢掉，译文只剩开头）
				if (cursor >= totalSegments) {
					appendToLastSegment(text);
					return;
				}
				const expected = cursor + 1;
				if (segmentNumber !== expected) {
					handleMisalign(cursor);
					return;
				}
				writeSegmentAt(cursor, text);
				cursor++;
			},
			// 未完成尾段：写入当前锚点作流式预览，无序号也不推进下标
			onPartial: (partial) => {
				const text = extractTranslatedContent(partial);
				// 段都写满还在出内容：同样是最后一段的续写，预览时临时拼上，
				// 不动已提交的 lastSegmentText，等完整段到达再正式拼
				if (cursor >= totalSegments) {
					translator.writeSegment(
						totalSegments - 1,
						joinLastSegment(lastSegmentText, text),
					);
					return;
				}
				translator.writeSegment(cursor, text);
			},
		});
	}

	/** 写回一段，并记住最后一段的完整译文（溢出内容拼接要用） */
	function writeSegmentAt(index: number, text: string): void {
		translator.writeSegment(index, text);
		if (index === totalSegments - 1) lastSegmentText = text;
	}

	/**
	 * 把模型溢出的段内容拼到最后一段末尾。
	 * 为什么用空行拼：模型总是因为看到段内换行才自己编号，那些换行原文里本来就有
	 */
	function appendToLastSegment(text: string): void {
		if (text === "") return;
		lastSegmentText = joinLastSegment(lastSegmentText, text);
		translator.writeSegment(totalSegments - 1, lastSegmentText);
	}

	/** 两段译文按原文的空行接起来（任一为空就返回另一个） */
	function joinLastSegment(base: string, extra: string): string {
		if (!base) return extra;
		if (!extra) return base;
		return `${base}\n\n${extra}`;
	}

	/**
	 * 重建段流解析器。每次开始（含重试）都新建一个，避免沿用旧 parser 的残留
	 * buffer 与消费闭包（它们引用的是上一轮的 cursor 状态）。
	 */
	let parser = makeParser();

	/**
	 * 对齐检测回调（流式 {{segN}} 序号错配 + finish 段数兜底共用入口）：
	 * 发现错位后从 fromSegment 起重译。重试的活全在这儿——恢复错位段及之后
	 * 锚点的原文（前半段已写回的译文保留不动）、段下标挪回去、新建解析器、
	 * 按绝对序号重拼"从错位段起的协议子文本"。
	 *
	 * 为什么只重译后半段：前面的段都过了序号校验，译文可信；重译范围随
	 * fromSegment 往后走而收敛，长文比全文重译省大量 token。
	 */
	function handleMisalign(fromSegment: number): void {
		if (ended) return;
		// 真实段都写满了，没有可重译的内容：直接按成功收尾。
		// 绝不能拿 rows.slice(超出末尾) 的空串去发请求——那会变成一个空 content 的
		// 空转请求，只烧 token 不产出
		if (fromSegment >= totalSegments) {
			translator.finish();
			end();
			return;
		}
		// 达到重试上限：放弃，回滚原文（同 onError 行为），避免反复错位死循环
		if (attempts >= MAX_ATTEMPTS) {
			currentStream?.abort();
			translator.destroy();
			end();
			return;
		}
		// 中止当前错位流，避免旧请求继续消耗 token
		currentStream?.abort();
		currentStream = null;
		attempts++;
		for (let i = fromSegment; i < totalSegments; i++) {
			translator.restoreSegment(i);
		}
		// 段下标从错位段起计数，期望段数改成后半段段数
		cursor = fromSegment;
		expectedSegments = totalSegments - fromSegment;
		parser = makeParser();
		// 子文本保持绝对序号（段号不重置），协议自洽
		runStream(joinSegmentRows(rows.slice(fromSegment), fromSegment));
	}

	/**
	 * 发起一次流式翻译（初始或错位重试共用）。
	 * @param text 发给 LLM 的协议文本（初始为全文本，重试为后半段子文本）
	 */
	function runStream(text: string): void {
		// 每次发起领一个流序号：换流之后旧流的回调全部作废（abort 有竞态，
		// 端口也可能还有在途消息，让它们继续推进解析器就是连环错位）
		const seq = ++streamSeq;
		const isCurrent = (): boolean => !ended && seq === streamSeq;

		currentStream = transport({
			text,
			pageMeta: getPageMeta(),
			onChunk: (chunk) => {
				if (!isCurrent()) return;
				parser.push(chunk);
			},
			onDone: () => {
				if (!isCurrent()) return;
				// flush 缓冲，再用段数兜底：流式阶段的序号校验抓不到"漏抄末尾
				// 分隔符、把最后两段并成一段"这类情况（尾段没序号），这里用
				// 输出段数 < 期望段数判断末尾吞段，从 cursor 起续译。
				// 多输出段不重试——溢出段已在 onSegment 里拼回最后一段，
				// 重译只会把已经拿到的译文再丢一次
				parser.flush();
				if (parser.segmentCount < expectedSegments) {
					handleMisalign(cursor);
					return;
				}
				// 段数对齐：尽力保住已译部分，unwrap 锚点收尾。
				// 注意这里别去动 currentStream——handleMisalign 会 abort 旧流并
				// runStream 建新流，onDone 返回后再覆盖新句柄就是旧版踩过的时序 bug。
				translator.finish();
				end();
			},
			onError: (error) => {
				if (!isCurrent()) return;
				console.error(error);
				translator.destroy();
				end();
			},
			onDisconnect: () => {
				if (!isCurrent()) return;
				translator.destroy();
				end();
			},
		});
	}

	// 首次发起完整翻译
	runStream(joinSegmentRows(rows, 0));

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
