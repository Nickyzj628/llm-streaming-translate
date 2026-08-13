/**
 * 划词翻译的段对齐协议（占位符）公共逻辑。
 *
 * 协议约定（两端必须同步，改动前先读 AGENTS.md 的"最容易踩的坑"）：
 * - content 端（InlineTranslator.ts）构造输入：每个文本节点 = 一段，段间用
 *   {{seg}} 分隔（不用换行，段内允许模型自由换行而不破坏段数对齐）；
 *   "不译内容"（未选中部分 / pre/code 等 preserve 节点）统一替换为占位符
 *   {{var1}}、{{var2}}...（编号全局递增），模型只需原样照抄占位符，无需理解任何标签结构；
 * - 模型输出：段数与输入严格一致，保留占位符位置；
 * - 写回：删掉占位符得到纯译文写入选中锚点；未选中部分由 DOM 原文兜底。
 *
 * 本模块同时被 content 端写回与 options 端测试显示使用，保证两端解析一致。
 */

/** 占位符：匹配不译内容留下的 {{varN}} 标记（N 为不译片段编号，全局递增） */
export const PLACEHOLDER_RE = /\{\{var\d+\}\}/g;

/**
 * 段分隔符：每个文本节点一段，段间用 {{seg}} 分隔（不用换行）。
 * 与 content 端（InlineTranslator.ts）构造输入、options 端（测试板块）解析输出必须一致，
 * 是"段数对齐"协议的核心标记，改动必须两端同步（见 AGENTS.md 的"最容易踩的坑"）。
 */
export const SEGMENT_SEPARATOR = "{{seg}}";

/**
 * 流式解析时，协议标记（{{seg}} 分隔符 / {{varN}} 占位符）可能被模型拆成多个
 * chunk 到达（如先到 "{{" 再到 "seg}}"），buffer 尾部会残留一个"正在形成的标记前缀"。
 * 此时 split(SEGMENT_SEPARATOR) 无法识别它，会把它当成译文写进锚点，页面残留脏字符。
 *
 * 该函数剥离"恰好是某个协议标记未完成前缀"的段尾。单个正则覆盖两类标记的
 * 全部截断前缀，且按最长匹配贪心剥离（{{seg}} 与 {{varN}} 的头两个字符相同）：
 *   {{seg}} 的前缀：  {{ / {{s / {{se / {{seg
 *   {{varN}} 的前缀： {{ / {{v / {{va / {{var / {{var + 任意数字
 * 完整分隔符会被 split 识别、完整占位符由 extractTranslatedContent 删除，
 * 二者都不会以"前缀"形态出现在段尾，因此不会误删真实译文。
 * 与 content 端（InlineTranslator.ts）、options 端（useTestTranslation.ts）的流式写回共用，
 * 改动分隔符/占位符时必须同步此处。
 */
const INCOMPLETE_PROTOCOL_TAIL_RE = /\{\{(?:s(?:e(?:g)?)?|v(?:a(?:r\d*)?)?)?$/u;

export function stripIncompleteSegmentPrefix(text: string): string {
	const match = text.match(INCOMPLETE_PROTOCOL_TAIL_RE);
	return match ? text.slice(0, -match[0].length) : text;
}

/**
 * 从模型输出的一段中提取"译文"：删除占位符 {{varN}}（对应当前段内的不译内容）。返回纯译文。
 * - 占位符（未选中部分 / code 等）由 DOM 原文兜底，写回选中锚点时丢弃；
 * - 段内可能含换行（{{seg}} 分隔方案允许），保留换行，仅清理首尾空白。
 */
export function extractTranslatedContent(segment: string): string {
	// 删除占位符（不译内容，DOM 原文已保留，不写回）
	const content = segment.replace(PLACEHOLDER_RE, "");
	return content.trim();
}

export interface SegmentStreamSink {
	/**
	 * 完整段到达（其后紧跟着段分隔符）。空段也会回调——消费方必须推进自己的
	 * 段下标以保持段序对齐（空段对应模型输出的残缺段，如无法翻译的孤立词）。
	 */
	onSegment: (segment: string) => void;
	/**
	 * 当前未完成尾段到达（流式预览；flush 时是最终尾段）。
	 * 已剥离未完成的协议前缀；为空（如模型恰好输出到分隔符边界）时不回调。
	 */
	onPartial: (partial: string) => void;
}

/**
 * 共享的段流解析器：把"可能被任意切分的译文 chunk 流"增量解析成
 * "完整段 + 未完成尾段"回调，规则与 content 端写回、options 端测试显示完全一致。
 *
 * 为什么收敛在这里：段对齐协议（{{seg}} 拆分 / 未完成前缀剥离 / 空段对齐）是
 * 最容易写漂的逻辑（AGENTS.md"最容易踩的坑"）。以前 InlineTranslator 与
 * useTestTranslation 各写一份 buffer 拆分循环，现在统一由本类保证两端行为一致，
 * 消费方只负责"把段写回自己的目标"（DOM 锚点 / 测试输入行）。
 */
export class SegmentStreamParser {
	private buffer = "";

	constructor(private readonly sink: SegmentStreamSink) {}

	/** 追加一个译文 chunk（可被任意切分，无需按段边界对齐） */
	push(chunk: string): void {
		this.buffer += chunk;
		const parts = this.buffer.split(SEGMENT_SEPARATOR);

		// 除最后一段外都是完整段（其后已有分隔符）。空段也要回调以消耗一个段下标，
		// 否则会破坏后续段与锚点的对应关系。
		for (let i = 0; i < parts.length - 1; i++) {
			this.sink.onSegment(stripIncompleteSegmentPrefix(parts[i]));
		}

		this.buffer = parts[parts.length - 1] ?? "";
		const tail = stripIncompleteSegmentPrefix(this.buffer);
		if (tail.trim() !== "") {
			this.sink.onPartial(tail);
		}
	}

	/** 流结束：把缓冲的尾段作为最终段交给消费方（buffer 为空说明模型输出以分隔符结尾，忽略） */
	flush(): void {
		const tail = stripIncompleteSegmentPrefix(this.buffer);
		this.buffer = "";
		if (tail.trim() !== "") {
			this.sink.onPartial(tail);
		}
	}
}
