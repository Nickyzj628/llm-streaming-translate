/**
 * 划词翻译的段对齐协议（占位符）公共逻辑。
 *
 * 协议约定（两端必须同步，改动前先读 AGENTS.md 的"最容易踩的坑"）：
 * - content 端（InlineTranslator.ts）构造输入：每个文本节点 = 一段，段间用
 *   ¶ 分隔（不用换行，段内允许模型自由换行而不破坏段数对齐）；
 *   "不译内容"（未选中部分 / pre/code 等 preserve 节点）统一替换为占位符
 *   [[0]]、[[1]]...，模型只需原样照抄占位符，无需理解任何标签结构；
 * - 模型输出：段数与输入严格一致，保留占位符位置；
 * - 写回：删掉占位符得到纯译文写入选中锚点；未选中部分由 DOM 原文兜底。
 *
 * 本模块同时被 content 端写回与 options 端测试显示使用，保证两端解析一致。
 */

/** 占位符：匹配不译内容留下的 [[n]] 标记（n 为不译片段编号） */
export const PLACEHOLDER_RE = /\[\[\d+\]\]/g;

/**
 * 从模型输出的一段中提取"译文"：删除占位符 [[n]]（对应当前段内的不译内容）。返回纯译文。
 * - 占位符（未选中部分 / code 等）由 DOM 原文兜底，写回选中锚点时丢弃；
 * - 段内可能含换行（¶ 分隔方案允许），保留换行，仅清理首尾空白。
 */
export function extractTranslatedContent(segment: string): string {
	// 删除占位符（不译内容，DOM 原文已保留，不写回）
	const content = segment.replace(PLACEHOLDER_RE, "");
	return content.trim();
}
