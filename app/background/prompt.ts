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
 * 给模型的说法里不叫"段"、叫"碎片"：{{segN}} 的边界是 TreeWalker 切出来的文本
 * 节点（+ preserve 块整块折叠），跟语义段落毫无关系。用"段"这种词，模型会当成
 * 自然段落，看见段内换行就自己补新序号，整份译文被拆成不存在的段丢掉。
 * 也不跟模型解释 DOM/TreeWalker——实现细节对它没用，只稀释注意力。
 *
 * 标记字面照旧是 seg。改形态要牵动测试与文档里几十处字面量，而模型只是照抄、
 * 不靠这三个字母推断语义，不划算——只改说法，不动形态。
 *
 * 网页元数据（title/description）作为"网页背景"注入，帮助模型理解页面主题与语境：
 * pageMeta 整体缺失时整段不注入；字段为空串时以"（无）"占位（保持既有行为）。
 * 注意 pageMeta 由 content 端在会话开始时给快照（见 content/pageContext.ts）：
 * 同一页里标题变了也不会改这份 system（重试尤其不换），为的是前缀缓存命中；
 * 标题真的变了（换页）时 content 端会连历史一起清空，所以这里不存在
 * "system 是上一页、历史是这一页"的混搭。
 *
 * 以下两条规则无条件存在（哪怕这次请求根本没带历史/诊断）：只在重试时临时加，
 * 会让首次请求与重试的 system 不同，前缀从第一个 token 起就 cache miss。
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
		`你是一个翻译器，任务是把用户输入的文本翻译成${targetLang}版本的语言。`,
		pageMeta &&
			`
背景信息：
- 页面标题：${pageMeta.title || "无"}
- 页面描述：${pageMeta.description || "无"}`,
		`
规则：
- 输入是网页文字被程序按照DOM节点切成的碎片，每个碎片末尾跟着${SEGMENT_MARKER_LABEL}（N为碎片序号，从1递增）。碎片边界只看网页结构，跟句子、段落、换行都没关系：一个碎片可能是一整句、半句、一个词，也可能只是几个空格。先通读全部输入、把碎片拼成完整句子理解，再按同样的边界逐块输出译文。
- 输出的碎片序号只能来自输入：输入里出现哪些${SEGMENT_MARKER_LABEL}，输出里就只出现那些，个数完全相同——输入只有${seg1}就只输出一个${seg1}。绝不能新增序号，也不能丢弃、合并、移动、改号，更不能把标记提到译文前面。另外，${placeholder}标记也要按原样照抄。
- 如果本次输入前面带历史对话，那是你在本页面此前已完成的翻译：请忽略那里的碎片编号，本次输出只用本次输入（最后一条消息）里出现的编号，绝不接着历史里最大的编号往下编。
- 历史对话里可能出现由 <system-reminder> 标签包裹的消息：那是系统对上一轮翻译质量的指导意见，不是待翻译的网页文字。不要翻译它、不要照抄它、不要把它当成输入碎片，也不要因此改变碎片编号；其中提到的"第 N 个碎片"只是指认上一轮错处的位置。
- 某个碎片没有可译内容时（如孤立的"the"、空格、符号、代码残留），这个碎片就输出空，只留它的${SEGMENT_MARKER_LABEL}；绝不把相邻碎片的内容挪进这一个里面。
- 只输出译文，不要输出任何解释、提示或原文。`,
		`
正确示例：
输入："The quick brown ${placeholder} jumps over the lazy dog.
And then it sleeps.${seg1}the${seg2}"
输出："敏捷的棕色${placeholder}跳过了懒狗。
然后它就睡了。${seg1}${seg2}"
为什么对：输入只有2个碎片，第1个碎片里那个换行不算碎片，不擅自补${seg2}；第2个碎片只有一个孤立的"the"，中文用不上，这个碎片就输出空。

错误示例：
输入："Synchronous Usage ${seg1}The highlighter is sync.${seg2}Enjoy it.${seg3}"
输出："${seg1}同步用法 高亮器是同步的。${seg2}尽情使用。${seg3}"
为什么错：${seg1}被提到了译文最前面，于是第1个碎片变成空、内容整段串进了第2个碎片。写回页面时第1个碎片会被清空、两段译文挤在下一个节点里
正确输出："同步用法 ${seg1}高亮器是同步的。${seg2}尽情使用。${seg3}"`,
	]
		.filter(Boolean)
		.join("\n");
}
