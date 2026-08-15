/**
 * 划词翻译的段对齐协议（占位符 + 段序号）公共逻辑。
 *
 * 协议约定（两端必须同步，改动前先读 AGENTS.md 的"最容易踩的坑"）：
 * - content 端（InlineTranslator.ts）构造输入：每个文本节点 = 一段，每段后跟
 *   带序号的段分隔标记 {{segN}}（N 为绝对段序号，从 1 递增，最后一段也必须带）；
 *   "不译内容"（未选中部分 / pre/code 等 preserve 节点）统一替换为占位符
 *   {{var1}}、{{var2}}...（编号全局递增），模型只需原样照抄标记，无需理解任何标签结构；
 * - 模型输出：照抄每段的 {{segN}} 与段内 {{varN}}，只翻译其余内容；
 * - 写回：删掉占位符得到纯译文写入选中锚点；未选中部分由 DOM 原文兜底。
 *
 * 为什么用带序号的 {{segN}} 而不是固定 {{seg}}：长文多段纯文本之间没有占位符，
 * 固定分隔符无法在流式阶段判断"模型在哪一段开始拆/并段错位"，只能全文重译。
 * 序号让"第 i 个输出段结束于 {{segi}}"成为每段都有的地标，content 端据此精确
 * 定位错位段并只重译后半段（断点重试），详见 InlineTranslator.ts 的注释。
 *
 * 本模块由 content 端（InlineTranslator.ts）写回使用（options 测试板块已移除）。
 */

/** 占位符：匹配不译内容留下的 {{varN}} 标记（N 为不译片段编号，全局递增） */
export const PLACEHOLDER_RE = /\{\{var\d+\}\}/g;

/**
 * 生成带序号的段分隔标记 {{segN}}（N 为绝对段序号，从 1 递增）。
 * content 端（InlineTranslator.ts）构造输入与解析输出必须一致，
 * 是"段数对齐"协议的核心标记，改动必须与 content 端同步（见 AGENTS.md 的"最容易踩的坑"）。
 */
export function segmentSeparator(segmentNumber: number): string {
	return `{{seg${segmentNumber}}}`;
}

/**
 * 把协议行按绝对段序号拼接成完整协议文本。
 * 每段（含最后一段）后跟 {{segN}} 分隔标记，N = startIndex + i + 1（绝对段序号，1 起）。
 * content 端（InlineTranslator）使用：
 * - 初始：startIndex = 0；
 * - 断点重试（restart）：startIndex = fromSegment，序号保持"绝对递增且唯一"，协议自洽。
 */
export function joinSegmentRows(rows: string[], startIndex = 0): string {
	let out = "";
	for (let i = 0; i < rows.length; i++) {
		out += rows[i] + segmentSeparator(startIndex + i + 1);
	}
	return out;
}

/**
 * 流式解析时，协议标记（{{segN}} 分隔符 / {{varN}} 占位符）可能被模型拆成多个
 * chunk 到达（如先到 "{{seg" 再到 "1}}"），buffer 尾部会残留一个"正在形成的标记前缀"。
 * 此时 split 正则无法识别它，会把它当成译文写进锚点，页面残留脏字符。
 *
 * 该函数剥离"恰好是某个协议标记未完成前缀"的段尾。单个正则覆盖两类标记的
 * 全部截断前缀，且按最长匹配贪心剥离（{{segN}} 与 {{varN}} 的头两个字符相同）：
 *   {{segN}} 的前缀： {{ / {{s / {{se / {{seg / {{seg + 任意数字
 *   {{varN}}  的前缀： {{ / {{v / {{va / {{var / {{var + 任意数字
 * 完整分隔符会被 split 识别、完整占位符由 extractTranslatedContent 删除，
 * 二者都不会以"前缀"形态出现在段尾，因此不会误删真实译文。
 * 与 content 端（InlineTranslator.ts）的流式写回共用，改动分隔符/占位符时必须同步此处。
 */
const INCOMPLETE_PROTOCOL_TAIL_RE =
	/\{\{(?:s(?:e(?:g\d*)?)?|v(?:a(?:r\d*)?)?)?$/u;

export function stripIncompleteSegmentPrefix(text: string): string {
	const match = text.match(INCOMPLETE_PROTOCOL_TAIL_RE);
	return match ? text.slice(0, -match[0].length) : text;
}

/**
 * 从模型输出的一段中提取"译文"：删除占位符 {{varN}}（对应当前段内的不译内容）。返回纯译文。
 * - 占位符（未选中部分 / code 等）由 DOM 原文兜底，写回选中锚点时丢弃；
 * - 段内可能含换行（{{segN}} 分隔方案允许），保留换行，仅清理首尾空白。
 */
export function extractTranslatedContent(segment: string): string {
	// 删除占位符（不译内容，DOM 原文已保留，不写回）
	const content = segment.replace(PLACEHOLDER_RE, "");
	return content.trim();
}

export interface SegmentStreamSink {
	/**
	 * 完整段到达（其后紧跟着 {{segN}} 分隔标记）。空段也会回调——消费方必须推进
	 * 自己的段下标以保持段序对齐（空段对应模型输出的残缺段，如无法翻译的孤立词）。
	 * @param segmentNumber 该段结束处的 {{segN}} 序号（绝对段序号，从 1 递增），
	 *   供消费方做段对齐检测：第 i 个输出段应结束于 {{seg(i+1)}}。
	 */
	onSegment: (segment: string, segmentNumber: number) => void;
	/**
	 * 当前未完成尾段到达（流式预览；flush 时是最终尾段）。
	 * 已剥离未完成的协议前缀；为空（如模型恰好输出到分隔符边界）时不回调。
	 * 注意：尾段没有 {{segN}} 序号——正常流每段都以分隔符结尾、flush 时缓冲为空；
	 * 只有模型漏抄末尾分隔符时 flush 才有尾段，此时消费方按"当前应写段"处理。
	 */
	onPartial: (partial: string) => void;
}

/**
 * 共享的段流解析器：把"可能被任意切分的译文 chunk 流"增量解析成
 * "完整段 + 未完成尾段"回调，规则与 content 端写回、options 端测试显示完全一致。
 *
 * 为什么收敛在这里：段对齐协议（{{segN}} 拆分 / 未完成前缀剥离 / 空段对齐）是
 * 最容易写漂的逻辑（AGENTS.md"最容易踩的坑"）。以前 InlineTranslator 与
 * options 测试板块各写一份 buffer 拆分循环，现在统一由本类保证行为一致，
 * 消费方只负责"把段写回自己的目标"（DOM 锚点）。
 */
export class SegmentStreamParser {
	private buffer = "";
	/**
	 * 模型输出的段总数（完整段 + 收尾时的非空尾段）。
	 *
	 * 用途：段数对齐兜底（InlineTranslator.finish）。流式阶段靠 {{segN}} 序号逐段
	 * 校验，但"模型漏抄末尾分隔符、把最后两段合并"这类情况序号校验抓不到（尾段
	 * 没有序号），需要在收尾时用"模型输出段数 vs 期望段数"兜底，少段即触发重试。
	 */
	private count = 0;

	constructor(private readonly sink: SegmentStreamSink) {}

	/** 模型已输出的段数（完整段数 + 收尾时非空尾段数） */
	get segmentCount(): number {
		return this.count;
	}

	/** 追加一个译文 chunk（可被任意切分，无需按段边界对齐） */
	push(chunk: string): void {
		this.buffer += chunk;
		// 分隔符带序号：用带捕获组的正则 split，返回 [段0, 序号0, 段1, 序号1, ..., 尾段]。
		// 即偶数下标是段内容、奇数下标是该段结束处的 {{segN}} 序号，最后一个是未完成尾段。
		const parts = this.buffer.split(/\{\{seg(\d+)\}\}/);
		const fullSegments = Math.floor((parts.length - 1) / 2);

		// 除最后一段外都是完整段（其后已有 {{segN}}）。空段也要回调以消耗一个段下标，
		// 否则会破坏后续段与锚点的对应关系。
		for (let i = 0; i < fullSegments; i++) {
			const segment = stripIncompleteSegmentPrefix(parts[i * 2]);
			const segmentNumber = Number(parts[i * 2 + 1]);
			this.sink.onSegment(segment, segmentNumber);
			this.count++;
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
			// 非空尾段也是模型输出的一段，计入段总数（供段数对齐校验）
			this.count++;
		}
	}
}
