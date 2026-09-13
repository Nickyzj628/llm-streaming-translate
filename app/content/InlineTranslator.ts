import {
	collectTextNodes,
	unwrapToOriginal,
	unwrapToText,
	wrapElement,
	wrapSelected,
} from "@/content/domAnchor";
import { planSegments, type SegmentInput } from "@/content/segmentPlan";
import {
	extractTranslatedContent,
	joinSegmentRows,
	SegmentStreamParser,
} from "@/utils/protocol";

/**
 * finish() 的对齐结果。
 */
export interface FinishResult {
	/** 段数对齐成功（已 unwrap 锚点恢复 DOM） */
	ok: boolean;
	/** ok=false 时：应从哪个段（0 基下标）起重试（= 已通过序号校验写回的段数） */
	fromSegment: number;
}

export interface InlineTranslatorController {
	/** 追加译文 chunk，流式解析段分隔并写入对应锚点 */
	appendChunk: (chunk: string) => void;
	/**
	 * 翻译完成：flush 缓冲区并返回对齐结果。
	 * ok=true 表示段数对齐，已 unwrap 锚点恢复原始 DOM；
	 * ok=false 表示末尾吞段/漏段（序号校验抓不到的情况），由调用方从 fromSegment
	 * 起重试。本方法不再自己触发重试——重试决策统一收敛到 TranslationController，
	 * 避免"finish 内部开新流、onDone 又覆盖句柄"的时序错乱。
	 */
	finish: () => FinishResult;
	/** 清理所有引用和辅助元素 */
	destroy: () => void;
	/**
	 * 返回发送给 LLM 的文本：每个文本节点一段，pre/code 等 preserve 块整块一段；
	 * 不译内容用 {{varN}} 占位，每段后跟 {{segN}} 分隔（含最后一段），其余为待翻译文本
	 */
	getText: () => string;
	/**
	 * 注入对齐检测回调：流式写回时发现模型在某段的 {{segN}} 序号错配（拆/并段错位），
	 * 回调"应从哪个段开始重试"。由 TranslationController 顺势中止当前请求、
	 * 调用 restart(fromSegment) 从该段起重新翻译，避免全文重译。
	 */
	setOnMisalign: (callback: (fromSegment: number) => void) => void;
	/**
	 * 从指定段开始重试：恢复该段及之后锚点的原文、重建流式解析器，
	 * 返回"从该段起的协议子文本"（前半段已保留的译文不动）。
	 */
	restart: (fromSegment: number) => string;
}

/**
 * 段目标：段计划（协议行）+ DOM 锚点的结合体，是流式写回 / 收尾 / 回滚的单位。
 * - translate：锚点包住选中部分文本，写回时删除占位符后写译文；
 * - preserve：锚点包住整个元素，写回时忽略模型输出、块内 DOM 保持原样。
 *
 * 为什么把协议行（row）并进段目标：以前 segments / rows 是两个平行数组、靠
 * "下标一一对应"的注释约定维系，任何分支只 push 一边就会静默错位。合成一个
 * 结构后对应关系由类型保证。
 */
type SegmentTarget =
	| {
			kind: "translate";
			target: HTMLSpanElement;
			/** 该段的协议行（含 {{varN}} 占位符） */
			row: string;
			/**
			 * 选中部分原文。保留原始换行：回滚（destroy）时必须逐字恢复原文，
			 * 绝不能写入折叠了换行的协议行文本，否则会破坏页面上依赖换行的内容。
			 */
			originalText: string;
			/**
			 * 是否已被模型译文覆盖（writeToSegment 成功写回后置 true）。
			 * finish 时据此区分"模型已覆盖的锚点"（保留译文）与"未写回的空段"
			 * （清空丢弃，用户明确要求丢弃空段）。
			 */
			written: boolean;
	  }
	| {
			kind: "preserve";
			target: HTMLSpanElement;
			row: string;
			/** 被包裹的原始元素（unwrap 时用它替换锚点，恢复原有 DOM 结构） */
			preservedElement: Element;
	  };

/**
 * 从选区建立段目标：收集文本节点 → 段计划（纯逻辑）→ 建立 DOM 锚点。
 *
 * 段协议：每个文本节点 = 一段；preserve 块（最外层 pre/code 元素）整块 = 一段。
 * 段目标顺序与段计划一一对应（下标相同），协议行直接存在段目标里。
 */
function buildSegments(range: Range): SegmentTarget[] {
	const collected = collectTextNodes(range);

	// 归约为段计划输入：preserve 块整块只算一段（同一块内的后续文本节点直接跳过，
	// 避免代码高亮块内几十个文本节点刷屏 prompt），普通文本节点一段
	const inputs: SegmentInput[] = [];
	/** 与 inputs 同下标的锚点来源（DOM 操作延迟到段计划确定后统一执行） */
	const sources: Array<
		| { kind: "preserve"; root: Element }
		| { kind: "translate"; node: Text; start: number; end: number }
	> = [];
	const handledPreserveRoots = new Set<Element>();

	for (const item of collected) {
		if (item.preserveRoot) {
			if (handledPreserveRoots.has(item.preserveRoot)) continue;
			handledPreserveRoots.add(item.preserveRoot);
			inputs.push({ preserve: true, selected: "", before: "", after: "" });
			sources.push({ kind: "preserve", root: item.preserveRoot });
			continue;
		}
		const text = item.node.textContent ?? "";
		inputs.push({
			preserve: false,
			selected: text.slice(item.start, item.end),
			before: text.slice(0, item.start),
			after: text.slice(item.end),
		});
		sources.push({
			kind: "translate",
			node: item.node,
			start: item.start,
			end: item.end,
		});
	}

	// 段计划：占位符编号与协议行（纯逻辑，见 segmentPlan.ts）
	const plans = planSegments(inputs);

	// 建立 DOM 锚点。plans 与 sources 同源同序，故用 sources 判别锚点类型
	return plans.map((plan, i): SegmentTarget => {
		const source = sources[i];
		if (source.kind === "preserve") {
			return {
				kind: "preserve",
				target: wrapElement(source.root),
				row: plan.row,
				preservedElement: source.root,
			};
		}
		return {
			kind: "translate",
			target: wrapSelected(source.node, source.start, source.end),
			row: plan.row,
			originalText: plan.originalText,
			written: false,
		};
	});
}

export function createInlineTranslator(
	range: Range,
): InlineTranslatorController {
	const segments = buildSegments(range);
	// 完整协议文本 = 每段协议行后跟 {{segN}}（含最后一段），序号绝对递增。
	// 语境信息由 background 从网页元数据（title/description）注入 system prompt，
	// 这里不包任何上下文标记，保持输入极简、只含待翻译文本。
	const joinedText = joinSegmentRows(
		segments.map((s) => s.row),
		0,
	);

	if (segments.length === 0) {
		return {
			appendChunk: () => {},
			finish: () => ({ ok: true, fromSegment: 0 }),
			destroy: () => {},
			getText: () => joinedText,
			setOnMisalign: () => {},
			restart: () => joinedText,
		};
	}

	let currentNodeIndex = 0;
	/**
	 * 本次流期望输出的段数。初始为全量锚点数；restart(fromSegment) 时改为
	 * "后半段段数"，因为重试只重译 fromSegment 起的子文本、parser 是新建的
	 * （其 segmentCount 只统计本次流）。finish 的段数兜底必须用它比对，
	 * 否则重试后 segmentCount(后半段) ≠ segments.length(全量) 会误触发重试。
	 */
	let expectedOutputSegments = segments.length;

	function writeToSegment(index: number, text: string): void {
		if (index >= segments.length) return;
		const info = segments[index];
		if (!info.target.isConnected) return;

		// preserve 块：模型输出行只用于行数对齐，DOM 保持原样。
		// 注意不能给锚点赋 textContent——锚点里包着整个原始元素（内部含嵌套标签），
		// 赋值会把块内结构拍平成纯文本、破坏代码块。
		if (info.kind === "preserve") return;

		// 非 preserve 节点：删除占位符 {{varN}} 得到纯译文写回选中锚点；
		// 未选中部分由 DOM 原文保留，上下文保真不依赖模型。
		// （未完成协议前缀的剥离已由共享的 SegmentStreamParser 完成，这里只删占位符）
		const content = extractTranslatedContent(text);
		// 内容为空（流式未完成段，如分隔符刚拆到一半）时不写，避免清空锚点原文。
		// 注意：这里不能把"完整空段"也当成空——完整空段应被丢弃（finish 时清空锚点），
		// 而非保留原文。区分交给 finish：完整空段未写回、written 保持 false，finish 清空；
		// 流式未完成段同样不写回，但不受影响（其真实内容随后续 chunk 写回）。
		if (content === "") return;
		info.target.textContent = content;
		// 标记已写回：finish 时据此区分"模型已覆盖"与"未写回空段"（丢弃后者）
		info.written = true;
	}

	/** 由调用方注入的错位回调（TranslationController 设置后中止当前流并 restart） */
	let onMisalign: (fromSegment: number) => void = () => {};
	function setOnMisalign(cb: (fromSegment: number) => void): void {
		onMisalign = cb;
	}

	/**
	 * 重建段流解析器。每次开始（含 restart）都新建一个，避免沿用旧 parser 的
	 * 残留 buffer 与消费闭包（它们引用旧的 currentNodeIndex 闭包状态）。
	 */
	let parser = makeParser();
	function makeParser(): SegmentStreamParser {
		return new SegmentStreamParser({
			// 完整段到达：消耗一个锚点下标。空段也必须消耗（保持段序对齐），
			// 写不写由 writeToSegment 判断——空段不写，finish 阶段清空丢弃。
			//
			// 序号对齐检测（每段都有的地标）：第 currentNodeIndex 个输出段应结束于
			// {{seg(currentNodeIndex+1)}}。序号不符说明模型在该段之前发生了拆/并段
			// 错位——立即回调中止重试，后续段不再消费，避免错误译文以 written=true
			// 残留。这是"断点重试"能精确定位错位段的关键（长文纯文本段之间没有
			// {{varN}} 占位符，序号是唯一可靠的地标）。
			onSegment: (segment, segmentNumber) => {
				const expected = currentNodeIndex + 1;
				if (segmentNumber !== expected) {
					onMisalign(currentNodeIndex);
					return;
				}
				writeToSegment(currentNodeIndex, segment);
				currentNodeIndex++;
			},
			// 未完成尾段：写入当前锚点作流式预览（无序号，不推进下标）
			onPartial: (partial) => {
				writeToSegment(currentNodeIndex, partial);
			},
		});
	}

	/**
	 * 从指定段开始重试：恢复该段及之后锚点的原文、重建解析器，
	 * 返回"从该段起的协议子文本"。
	 *
	 * 为什么只重译后半段：对齐检测已定位到错位起点 fromSegment，说明它之前
	 * 的译文已正确写回。重试时：
	 * - 恢复 fromSegment 起所有锚点为原文（前半段译文保留不动）；
	 * - 新建 parser，段下标从 fromSegment 起；
	 * - 子文本 = 各段协议行按绝对序号拼接，段号保持递增（协议自洽）。
	 */
	function restart(fromSegment: number): string {
		// 恢复错位段及之后锚点的原文，但【必须保留锚点 span 在 DOM 中】：
		// 后续 writeToSegment 依赖 info.target.isConnected 判断是否可写，
		// 若用 unwrapToText/unwrapToOriginal 把 span 替换掉，span 脱离 DOM 后
		// isConnected 变 false，重试流的译文就再也写不进去了（本次 bug 根因）。
		// 正确做法：translate 段把 span 内容换回原文、written 复位；
		// preserve 段的 DOM 从未被写回阶段改动（writeToSegment 对 preserve 直接 return），
		// 锚点 span 与原始元素都还在，无需任何恢复。
		for (let i = fromSegment; i < segments.length; i++) {
			const info = segments[i];
			if (!info.target.isConnected) continue;
			if (info.kind === "translate") {
				// 保留 span，仅把选中部分恢复为原始文本（含原始换行）
				info.target.textContent = info.originalText;
				info.written = false;
			}
		}
		// 重建解析器，段下标从 fromSegment 起计数
		currentNodeIndex = fromSegment;
		parser = makeParser();
		// 本次重试流期望输出的段数 = 后半段段数（finish 的段数兜底用它比对）
		expectedOutputSegments = segments.length - fromSegment;
		// 子文本：从 fromSegment 起的协议行按绝对序号拼接（段号保持原编号，协议自洽）
		return joinSegmentRows(
			segments.slice(fromSegment).map((s) => s.row),
			fromSegment,
		);
	}

	/** 恢复原始 DOM：translate 段恢复原文，preserve 段还原原始元素 */
	function restoreOriginals(): void {
		for (const info of segments) {
			if (!info.target.isConnected) continue;
			if (info.kind === "preserve") {
				unwrapToOriginal(info.target, info.preservedElement);
			} else {
				unwrapToText(info.target, info.originalText);
			}
		}
	}

	return {
		getText: () => joinedText,
		setOnMisalign,
		restart,

		appendChunk(chunk: string): void {
			parser.push(chunk);
		},

		finish(): FinishResult {
			// flush 缓冲区：正常流每段都以 {{segN}} 结尾，flush 时缓冲为空；
			// 只有模型漏抄末尾分隔符时才有尾段（写入"当前应写段"）。
			parser.flush();

			/**
			 * 段数对齐兜底。流式阶段的 {{segN}} 序号校验能抓"中间吞/并/拆段"，但
			 * "漏抄末尾分隔符、把最后两段合并"这类情况尾段没有序号、序号校验抓不到。
			 * 这里用段数兜底：模型实际输出段数 < 期望段数即视为末尾吞段，返回
			 * fromSegment = currentNodeIndex（= 已通过序号校验写回的段数），由调用方
			 * 从该段起重译，前半段已保留的译文不动。
			 *
			 * 为什么不再硬编码 fromSegment=0 全文重译：有了 {{segN}} 序号后，
			 * currentNodeIndex 之前每一段都通过了序号校验（确实对齐），从它起续译
			 * 是最小重译范围，也呼应"断点重试"的目标。
			 *
			 * 注意：模型多输出段（segmentCount > 期望）时不重试——多余段已在流式阶段
			 * 由 writeToSegment 的越界检查丢弃，已写回的前 n 段序号都对齐、译文可信。
			 */
			if (parser.segmentCount < expectedOutputSegments) {
				return { ok: false, fromSegment: currentNodeIndex };
			}

			// 尽力对齐：不再做严格段数校验/整段回滚，而是尽量保留已译部分。
			// 原因是本地小模型偶尔仍会吞/并段，严格回滚会让整段译文全部丢失，体验很差。
			// - 模型输出段数 > 锚点数：多余段已在流式阶段由 writeToSegment 的
			//   index 越界检查丢弃，这里无需处理。
			// - 未写回的锚点（written=false，含完整空段）：preserve 段还原原始元素；
			//   非 preserve 段按用户要求"丢弃空段"——清空锚点，而不是保留原文
			//   （否则会残留孤立原文碎片）。
			for (const info of segments) {
				if (!info.target.isConnected) continue;
				if (info.kind === "preserve") {
					// preserve：直接还原原始元素
					unwrapToOriginal(info.target, info.preservedElement);
				} else if (info.written) {
					// 已写回：保留译文
					unwrapToText(info.target, info.target.textContent ?? "");
				} else {
					// 未写回（空段）：丢弃原文，清空锚点
					unwrapToText(info.target, "");
				}
			}
			return { ok: true, fromSegment: 0 };
		},

		destroy(): void {
			// 回滚：translate 段恢复原文、preserve 段还原元素，
			// 全部 unwrap 回原始 DOM 结构
			restoreOriginals();
		},
	};
}
