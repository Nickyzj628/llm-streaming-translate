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
- 用户输入的${SEGMENT_MARKER_LABEL}为分段标记（N为段序号，从1递增，每段都以${SEGMENT_MARKER_LABEL}结尾），${placeholder}为不译内容标记，严禁翻译、改动或移动它们。
- 即使残缺的段落（如单独一个"the"等无实际意义的单词）难以翻译，也要保留每段的${SEGMENT_MARKER_LABEL}标记，**绝不能**丢弃、合并任何标记或改变标记的序号。
- 只输出译文，不要输出任何解释、提示或原文。`,
		`
正确示例：
输入："The quick brown ${placeholder} jumps over the lazy dog.${seg1}And..."
输出："敏捷的棕色${placeholder}跳过了懒狗。${seg1}然后..."

错误示例：
输入："The ${seg1}RegExp Engine can only be created by ${placeholder}.${seg2}So..."
输出："正则引擎只能由${placeholder}创建。${seg2}所以..."
为什么错：丢失了${seg1}标记，导致段落数对不上
正确输出："${seg1}正则引擎只能由${placeholder}创建。${seg2}所以..."`,
	]
		.filter(Boolean)
		.join("\n");
}
