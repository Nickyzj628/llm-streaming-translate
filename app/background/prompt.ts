import {
	PLACEHOLDER_TOKEN,
	SEGMENT_MARKER_LABEL,
	segmentSeparator,
} from "@/utils/protocol";

/**
 * 构造系统提示词（段对齐协议在模型侧的契约）。
 *
 * 为什么单独成文件：这里的"规则 + 成功/失败示例"与 content 端构造输入、
 * protocol 的流式解析同属一份协议。原先它内联在 StreamTranslator 的传输逻辑里，
 * 改协议时最容易漏改；独立出来后，标记形态全部由 protocol.ts 派生，不再手写副本。
 *
 * 网页元数据（title/description）作为"网页背景"注入，帮助模型理解页面主题与语境：
 * pageMeta 整体缺失时整段不注入；字段为空串时以"（无）"占位（保持既有行为）。
 */
export function buildSystemPrompt(
	pageMeta: { title: string; description: string } | undefined,
	targetLang: string,
): string {
	// 示例里的标记同样由协议模块生成，避免示例与实际形态漂移
	const seg1 = segmentSeparator(1);
	const seg2 = segmentSeparator(2);
	const seg3 = segmentSeparator(3);
	const placeholder = PLACEHOLDER_TOKEN;

	return [
		`你是一个翻译器，任务是把用户输入的文本翻译成${targetLang}。`,
		pageMeta &&
			`
背景信息：
- 页面标题：${pageMeta.title || "无"}
- 页面描述：${pageMeta.description || "无"}`,
		`
规则：
- 输入的每一段后面都跟着${SEGMENT_MARKER_LABEL}（N为段序号，从1递增）。这些段只是网页文本被切碎后的碎片、不是句子边界：先通读全部输入、把各段拼成完整句子理解，再逐段输出译文。
- ${SEGMENT_MARKER_LABEL}是"这一段到此结束"的地标，必须紧跟在它这一段译文的末尾，一个字都不能改：绝不能提到译文前面，也绝不能丢弃、合并、移动或改变序号。${placeholder}同样原样照抄。
- 某一段没有可译内容时（如孤立的"the"、空格、符号、代码残留），这一段就输出空，只留它的${SEGMENT_MARKER_LABEL}；绝不要把相邻段的内容挪进这一段、也不要把它这一段的内容挪到别的段。
- 只输出译文，不要输出任何解释、提示或原文。`,
		`
正确示例（注意${seg1}${seg2}紧邻：第2段只有一个孤立的"the"，中文里用不上，这一段就输出空，标记照留）：
输入："The quick brown ${placeholder} jumps over the lazy dog.${seg1}the${seg2}And then it sleeps.${seg3}"
输出："敏捷的棕色${placeholder}跳过了懒狗。${seg1}${seg2}然后它就睡了。${seg3}"

错误示例：
输入："Synchronous Usage ${seg1}The highlighter is sync.${seg2}Enjoy it.${seg3}"
输出："${seg1}同步用法 高亮器是同步的。${seg2}尽情使用。${seg3}"
为什么错：${seg1}被提到了译文最前面，于是第1段变成空段（"Synchronous Usage"的译文整段串进了第2段）。写回页面时第1段会被清空、两段的译文挤在下一个节点里
正确输出："同步用法 ${seg1}高亮器是同步的。${seg2}尽情使用。${seg3}"`,
	]
		.filter(Boolean)
		.join("\n");
}
