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
 * 流式解析时，段分隔符 {{seg}} 可能被模型拆成多个 chunk 到达（如先到 "{{" 再 "seg" 再 "}}")。
 * 在 "}}" 到达前，buffer 里会残留一个"正在形成的分隔符前缀"（{{seg / {{se / {{s / {{），
 * 此时 split(SEGMENT_SEPARATOR) 无法识别它，会把它当成"最后一段译文"写进锚点，
 * 导致页面残留 {{seg 之类的脏字符（见 InlineTranslator 流式写回）。
 *
 * 该函数在流式写回前剥离段尾恰好是分隔符未完成前缀的部分，只返回真正的译文。
 * 完整分隔符会被 split 识别，不会成为段尾，因此不会误删真实以 "{{" 开头的译文。
 * 与 content 端（InlineTranslator.ts）、options 端（useTestTranslation.ts）的流式写回共用。
 */
export function stripIncompleteSegmentPrefix(text: string): string {
	// 从最长前缀到最短前缀逐个匹配，避免只删掉一部分前缀（如 "{{seg" 只删 "{{"）。
	// 前缀与 SEGMENT_SEPARATOR 的头部逐字符一致，改动分隔符时需同步此处。
	const prefixes = ["{{seg", "{{se", "{{s", "{{"];
	for (const prefix of prefixes) {
		if (text.endsWith(prefix)) {
			return text.slice(0, -prefix.length);
		}
	}
	return text;
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
