import {
	collectTextNodes,
	unwrapToOriginal,
	unwrapToText,
	wrapElement,
	wrapSelected,
} from "@/content/domAnchor";
import { planSegments, type SegmentInput } from "@/content/segmentPlan";

/**
 * 原地翻译器的 DOM 层：把选区变成一组"段锚点"，之后按段号写回译文。
 *
 * 只管两件事：选区 → 锚点 + 每段的协议行；上层叫它写哪段就写哪段。
 * 流式拆段、序号对齐、错位重试这些"一次会话"的活都不在这——它们在
 * TranslationSession.ts。早先这些状态混在本文件里，会话还得反过来往这里
 * 注入 onMisalign 回调（两边互相调用才转得起来）；拆开后会话单向往下调，
 * 谁管什么一目了然。
 */

/**
 * 段目标：段计划（协议行）+ DOM 锚点的结合体，是流式写回 / 收尾 / 回滚的单位。
 * - translate：锚点包住选中部分文本，写回时写入上层给的纯译文；
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
			/** 该段的协议行（含 {{var}} 占位符） */
			row: string;
			/**
			 * 选中部分原文。保留原始换行：回滚（destroy）时必须逐字恢复原文，
			 * 绝不能写入折叠了换行的协议行文本，否则会破坏页面上依赖换行的内容。
			 */
			originalText: string;
			/**
			 * 是否已被模型译文覆盖（writeSegment 成功写回后置 true）。
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

	// 段计划：协议行怎么拼（纯逻辑，见 segmentPlan.ts）
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

/**
 * 原地翻译器的对外句柄。上层（TranslationSession）拿着段数、协议行和这几个
 * 按段操作的方法编排整条流程，本层不关心"什么时候该写哪段"。
 */
export interface InlineTranslatorController {
	/** 段数（普通文本节点段 + preserve 块段），上层据此判断要不要发起请求 */
	readonly segmentCount: number;
	/**
	 * 各段的协议行（含 {{var}} 占位符，不含 {{segN}}）。段序号由上层用
	 * joinSegmentRows 统一拼，保证绝对递增；重试时上层拿它切片重拼子文本。
	 */
	getRows: () => string[];
	/**
	 * 写回第 index 段的纯译文（占位符已由上层删除）。preserve 段忽略；
	 * 空文本不写，免得把锚点原文清掉（完整空段交给 finish 清空丢弃）。
	 */
	writeSegment: (index: number, text: string) => void;
	/**
	 * 恢复第 index 段的原文（重试前调用）。锚点 span 必须留在 DOM 里——
	 * 续写靠 isConnected 判断能不能写，unwrap 掉就再也写不进去了。
	 */
	restoreSegment: (index: number) => void;
	/**
	 * 收尾：已写回的段保留译文，未写回的段丢弃（preserve 段还原原始元素），
	 * 最后全部 unwrap 回纯文本。
	 */
	finish: () => void;
	/** 回滚：translate 段恢复原文、preserve 段还原元素，还原页面原始 DOM */
	destroy: () => void;
}

export function createInlineTranslator(
	range: Range,
): InlineTranslatorController {
	const segments = buildSegments(range);

	/**
	 * 写回一段的译文。删占位符的活上层干完了，这里只认纯译文。
	 */
	function writeSegment(index: number, text: string): void {
		if (index >= segments.length) return;
		const info = segments[index];
		if (!info.target.isConnected) return;

		// preserve 块：锚点里包着整个原始元素（内部还有嵌套标签），
		// 赋 textContent 会把结构拍平成纯文本、破坏代码块，所以一个字都不写
		if (info.kind === "preserve") return;

		// 空文本（流式未完成段）不写，避免清空锚点原文；
		// "完整空段"同样落这里，written 保持 false，由 finish 清空丢弃
		if (text === "") return;
		info.target.textContent = text;
		// 标记已写回：finish 时据此区分"模型已覆盖"与"未写回空段"
		info.written = true;
	}

	/** 恢复一段的原文（重试前用），锚点 span 保留在 DOM 中 */
	function restoreSegment(index: number): void {
		if (index >= segments.length) return;
		const info = segments[index];
		if (!info.target.isConnected) return;
		// preserve 段的 DOM 从头到尾没被写过，没什么好恢复的
		if (info.kind !== "translate") return;

		info.target.textContent = info.originalText;
		info.written = false;
	}

	/** 收尾：尽力保住已译部分，再把所有锚点 unwrap 掉 */
	function finish(): void {
		for (const info of segments) {
			if (!info.target.isConnected) continue;
			if (info.kind === "preserve") {
				// preserve：还原原始元素
				unwrapToOriginal(info.target, info.preservedElement);
			} else if (info.written) {
				// 已写回：把译文落成纯文本
				unwrapToText(info.target, info.target.textContent ?? "");
			} else {
				// 未写回的空段：丢原文、清空锚点，不留孤立碎片
				unwrapToText(info.target, "");
			}
		}
	}

	/** 回滚：translate 段恢复原文、preserve 段还原元素 */
	function destroy(): void {
		for (const info of segments) {
			if (!info.target.isConnected) continue;
			if (info.kind === "preserve") {
				unwrapToOriginal(info.target, info.preservedElement);
			} else {
				unwrapToText(info.target, info.originalText);
			}
		}
	}

	// 空选区不用特判：buildSegments 返回空数组时下面几个循环天然什么都不做，
	// 是否发请求由上层看 segmentCount 决定
	return {
		segmentCount: segments.length,
		getRows: () => segments.map((s) => s.row),
		writeSegment,
		restoreSegment,
		finish,
		destroy,
	};
}
