import { PLACEHOLDER_TOKEN } from "@/utils/protocol";

/**
 * 段计划的输入：一个段目标的原始文本切分。
 * 普通文本节点：selected 是选中部分、before/after 是同节点内的未选中部分；
 * preserve 块（pre/code 等）：整块折叠为一段，三段文本都为空。
 */
export interface SegmentInput {
	/** 选中部分原文（保留原始换行，供回滚逐字恢复） */
	selected: string;
	/** 同节点内、选中部分之前的未选中文本 */
	before: string;
	/** 同节点内、选中部分之后的未选中文本 */
	after: string;
	/** 是否为 preserve 块（整块只占一个占位符） */
	preserve: boolean;
}

/** 段计划：一段的协议行与类型（DOM 锚点由调用方建立） */
export interface PlannedSegment {
	kind: "translate" | "preserve";
	/**
	 * 发给模型的协议行（含 {{var}} 占位符，不含 {{segN}}——段序号由
	 * joinSegmentRows 统一拼，保证绝对递增）
	 */
	row: string;
	/** translate 段的选中原文（回滚用）；preserve 段为空串 */
	originalText: string;
}

/**
 * 协议行内的连续换行折叠为单个空格。
 *
 * 段内换行虽然不破坏段数对齐（{{segN}} 才是地标），但会稀释小模型的注意力，
 * 且页面文本节点的换行多来自源码美化、没有语义。注意只折叠协议行：
 * originalText 保留原始换行（回滚时必须逐字恢复）。
 */
export function collapseNewlines(text: string): string {
	return text.replace(/\n+/g, " ");
}

/**
 * 把各段的文本切分转成段计划（协议行）。
 *
 * 为什么做成纯函数：协议行怎么拼决定了模型看到什么，拼错了不会报错、只会静默
 * 变形（比如占位符漏放导致未选中内容被当译文翻掉），所以独立出来单测钉住。
 *
 * 行内规则：
 * - preserve 段：整块换成一个占位符，块内文本一个字都不发给模型；
 * - 普通段：before / after 各自换成占位符（为空则省略，避免噪音），
 *   中间夹着待翻译的选中文本。
 */
export function planSegments(inputs: SegmentInput[]): PlannedSegment[] {
	return inputs.map((input): PlannedSegment => {
		if (input.preserve) {
			return { kind: "preserve", row: PLACEHOLDER_TOKEN, originalText: "" };
		}
		const before = collapseNewlines(input.before);
		const after = collapseNewlines(input.after);
		return {
			kind: "translate",
			row:
				(before ? PLACEHOLDER_TOKEN : "") +
				collapseNewlines(input.selected) +
				(after ? PLACEHOLDER_TOKEN : ""),
			originalText: input.selected,
		};
	});
}
