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
	/**
	 * 这个节点所在的容器会不会真渲染换行（white-space 为 pre/pre-wrap 等）。
	 * 为 true 时协议行保留原始 \n，让模型翻译后能把段落带回来
	 */
	keepNewlines: boolean;
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
 * 会真的把 \n 渲染成换行的 white-space 取值（其余取值下 \n 在页面上等同空格）
 */
const NEWLINE_RENDERING_WHITE_SPACE = new Set([
	"pre",
	"pre-wrap",
	"pre-line",
	"break-spaces",
]);

/**
 * 这个 white-space 取值下浏览器会不会真渲染换行。
 *
 * 判据取自 CSS：white-space 是继承属性，getComputedStyle 拿到的已经是继承后的
 * 值，所以看文本节点直接父元素就够
 */
export function keepsNewlines(whiteSpace: string): boolean {
	return NEWLINE_RENDERING_WHITE_SPACE.has(whiteSpace.trim().toLowerCase());
}

/**
 * 归一化协议行里的换行。
 *
 * keepNewlines 时原样留着：pre-wrap 这类容器里的换行是页面真会渲染的语义信息，
 * 折成空格模型就再也译不回来（推文、评论区长文就是这么丢段落的）
 * 否则把连续换行折成单个空格：普通容器里 \n 本来就等同空格，留着只是噪音
 * 注意只管协议行，originalText 永远保留原始换行（回滚要逐字恢复）
 */
export function normalizeNewlines(text: string, keepNewlines: boolean): string {
	return keepNewlines ? text : text.replace(/\n+/g, " ");
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
		const before = normalizeNewlines(input.before, input.keepNewlines);
		const after = normalizeNewlines(input.after, input.keepNewlines);
		return {
			kind: "translate",
			row:
				(before ? PLACEHOLDER_TOKEN : "") +
				normalizeNewlines(input.selected, input.keepNewlines) +
				(after ? PLACEHOLDER_TOKEN : ""),
			originalText: input.selected,
		};
	});
}
