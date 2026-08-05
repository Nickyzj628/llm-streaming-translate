/**
 * 划词翻译的行对齐协议（<NO_TRANSLATE>）公共逻辑。
 *
 * 协议约定（两端必须同步，改动前先读 AGENTS.md 的"最容易踩的坑"）：
 * - content 端（InlineTranslator.ts）构造输入：每行 = 一个文本节点，
 *   未选中部分与 pre/code 等 preserve 节点用 <NO_TRANSLATE> 包裹；
 * - 模型输出：行数与输入严格一致，保留标签结构（标签内照抄、标签外翻译）；
 * - 写回/显示时：只取标签外内容（译文），标签内容即使被模型翻译也丢弃。
 *
 * 本模块同时被 content 端写回与 options 端测试显示使用，保证两端解析一致。
 */

/** 发送给 LLM 的标记：标签内是不翻译、须原样照抄的内容（未选中部分 / code 等），标签外才翻译 */
export const NO_TRANSLATE_TAG = "NO_TRANSLATE";

/**
 * 从模型输出行中提取"译文"部分：
 * 去掉行首 "- " 前缀后，按 <NO_TRANSLATE>...</NO_TRANSLATE> 标签切分，只保留标签外的内容（译文）。
 * - 模型带标签输出时：即使标签内容被模型翻译了也会被丢弃——上下文保真由 DOM 原文兜底；
 * - 模型不带标签输出（纯译文）时：整行即译文，原样返回；
 * - 末尾兜底清理残缺/残留的标签字符（如未闭合的 <NO_TRANSLATE>）。
 */
export function extractTranslatedContent(line: string): string {
	// 剥掉行首 "- " 前缀（\s? 容忍 "-" 后无空格）
	let content = line.replace(/^-\s?/, "");
	// 按 NO_TRANSLATE 标签切分（非贪婪），只拼接标签外的段
	content = content
		.split(new RegExp(`<${NO_TRANSLATE_TAG}>.*?</${NO_TRANSLATE_TAG}>`, "g"))
		.join("");
	// 兜底：清理模型可能输出的残缺标签字符，并去掉译文首尾空白
	return content.replace(new RegExp(`</?${NO_TRANSLATE_TAG}>`, "g"), "").trim();
}

/**
 * 去掉行中的 <NO_TRANSLATE> 标签字符（内容保留），用于 options 测试板块展示模型输出行的完整内容：
 * 标签内容（未选中部分）与标签外内容（译文）都显示出来，模拟真实页面中
 * "未选中部分保持原文 + 选中部分被译文替换"的整体效果。
 *
 * 注意与 extractTranslatedContent 的区别：后者丢弃标签内容（content 端写回选中锚点时用，
 * 标签内容由 DOM 原文兜底）；本函数保留标签内容，仅移除标签标记。
 */
export function stripNoTranslateTags(line: string): string {
	return line
		.replace(/^-\s?/, "")
		.replace(new RegExp(`</?${NO_TRANSLATE_TAG}>`, "g"), "");
}
