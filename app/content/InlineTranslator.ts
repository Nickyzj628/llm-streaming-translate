import {
	extractTranslatedContent,
	joinSegmentRows,
	SegmentStreamParser,
} from "@/utils/protocol";

/**
 * finish() 的对齐结果。
 */
export interface FinishResult {
	/** 段数对齐成功（已 unwrap 锚点恢复 DOM） */
	ok: boolean;
	/** ok=false 时：应从哪个段（0 基下标）起重试（= 已通过序号校验写回的段数） */
	fromSegment: number;
}

export interface InlineTranslatorController {
	/** 追加译文 chunk，流式解析段分隔并写入对应锚点 */
	appendChunk: (chunk: string) => void;
	/**
	 * 翻译完成：flush 缓冲区并返回对齐结果。
	 * ok=true 表示段数对齐，已 unwrap 锚点恢复原始 DOM；
	 * ok=false 表示末尾吞段/漏段（序号校验抓不到的情况），由调用方从 fromSegment
	 * 起重试。本方法不再自己触发重试——重试决策统一收敛到 TranslationController，
	 * 避免"finish 内部开新流、onDone 又覆盖句柄"的时序错乱。
	 */
	finish: () => FinishResult;
	/** 清理所有引用和辅助元素 */
	destroy: () => void;
	/**
	 * 返回发送给 LLM 的文本：每个文本节点一段，pre/code 等 preserve 块整块一段；
	 * 不译内容用 {{varN}} 占位，每段后跟 {{segN}} 分隔（含最后一段），其余为待翻译文本
	 */
	getText: () => string;
	/**
	 * 注入对齐检测回调：流式写回时发现模型在某段的 {{segN}} 序号错配（拆/并段错位），
	 * 回调"应从哪个段开始重试"。由 TranslationController 顺势中止当前请求、
	 * 调用 restart(fromSegment) 从该段起重新翻译，避免全文重译。
	 */
	setOnMisalign: (callback: (fromSegment: number) => void) => void;
	/**
	 * 从指定段开始重试：恢复该段及之后锚点的原文、重建流式解析器，
	 * 返回"从该段起的协议子文本"（前半段已保留的译文不动）。
	 */
	restart: (fromSegment: number) => string;
}

/** 选中段包裹用的锚点 class（display: contents，仅定位/调试用，无视觉样式） */
const SELECTED_CLASS = "llm-selected";

/**
 * 不翻译但须原样保留的元素标签名集合。
 * 这些元素（代码块等）的文本不发送给模型，整块只以一个 {{varN}} 占位符替代；
 * 写回时由 DOM 原文兜底，模型无需也没必要照抄内容。
 */
const PRESERVE_TAGS = new Set(["pre", "code", "kbd", "samp", "var"]);

/**
 * 段目标：流式写回 / 收尾 / 回滚操作的单位。
 * - translate：普通文本节点段，锚点包住选中部分文本，写回时删除占位符后写译文；
 * - preserve：不翻译块（pre/code 等）整体折叠为一段，锚点包住整个元素，
 *   写回时忽略模型输出、块内 DOM 保持原样。
 */
type SegmentTarget =
	| {
			kind: "translate";
			target: HTMLSpanElement;
			/**
			 * 选中部分原文。保留原始换行：回滚（destroy）时必须逐字恢复原文，
			 * 绝不能写入折叠了换行的协议行文本，否则会破坏页面上依赖换行的内容。
			 */
			originalText: string;
			/**
			 * 是否已被模型译文覆盖（writeToSegment 成功写回后置 true）。
			 * finish 时据此区分"模型已覆盖的锚点"（保留译文）与"未写回的空段"
			 * （清空丢弃，用户明确要求丢弃空段）。
			 */
			written: boolean;
	  }
	| {
			kind: "preserve";
			target: HTMLSpanElement;
			/** 被包裹的原始元素（unwrap 时用它替换锚点，恢复原有 DOM 结构） */
			preservedElement: Element;
	  };

/**
 * 查找节点最外层的 preserve 祖先元素（pre/code 等）。
 *
 * 为什么取"最外层"：代码高亮块常见 pre > code > span.line > span.token 的
 * 深层结构，块内可能有几十个文本节点。如果按文本节点逐段占位，用户提示词会被
 * 刷成 {{seg1}}{{var2}}{{seg2}}{{var3}}... 的长链。整块折叠为一段、只占一个
 * {{varN}}，既减少 prompt 噪音，也减少模型数错段数的概率。
 */
function findPreserveRoot(node: Node): Element | null {
	let root: Element | null = null;
	let current: Element | null = node.parentElement;
	while (current) {
		if (PRESERVE_TAGS.has(current.tagName.toLowerCase())) {
			root = current;
		}
		current = current.parentElement;
	}
	return root;
}

/**
 * 把文本节点的 [start, end) 范围包一层 <span class="llm-selected"> 锚点。
 * 返回该 span，后续流式写回/恢复都直接操作它，无需计算 offset。
 */
function wrapSelected(node: Text, start: number, end: number): HTMLSpanElement {
	const span = document.createElement("span");
	span.className = SELECTED_CLASS;
	span.style.display = "contents";

	// splitText 拆出选中段：node 保留 [0, start)，selected 为 [start, end)
	let selected = node;
	if (start > 0) {
		selected = node.splitText(start);
	}
	if (end < start + selected.data.length) {
		selected.splitText(end - start);
	}

	node.parentNode?.insertBefore(span, selected);
	span.appendChild(selected);
	return span;
}

/**
 * 把整个元素包一层锚点（preserve 块专用）。
 * display: contents 保证包裹前后布局完全一致；unwrap 时用 preservedElement
 * 替换锚点即可恢复原始 DOM。
 */
function wrapElement(element: Element): HTMLSpanElement {
	const span = document.createElement("span");
	span.className = SELECTED_CLASS;
	span.style.display = "contents";
	element.parentNode?.insertBefore(span, element);
	span.appendChild(element);
	return span;
}

function extractTextNodes(range: Range): {
	segments: SegmentTarget[];
	/** 每段的协议行（含占位符串），顺序与 segments 一一对应 */
	rows: string[];
} {
	const segments: SegmentTarget[] = [];
	const rows: string[] = [];

	// 若 commonAncestor 是 Text 节点，TreeWalker 以它为 root 时 nextNode()
	// 不会返回自身 → 改用其父元素作 root，避免漏掉唯一的目标文本节点
	let root = range.commonAncestorContainer;
	if (root.nodeType === Node.TEXT_NODE) {
		root = root.parentElement!;
	}

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

	// 阶段一：只遍历收集，不碰 DOM——splitText/包裹会改动 DOM，live TreeWalker
	// 在拆节点后遍历位置会漂移，必须全部收集完再统一执行 DOM 操作
	const collected: Array<{
		node: Text;
		start: number;
		end: number;
		preserveRoot: Element | null;
	}> = [];

	let node = walker.nextNode() as Text | null;
	while (node) {
		if (range.intersectsNode(node)) {
			const text = node.textContent ?? "";
			const start = node === range.startContainer ? range.startOffset : 0;
			const end = node === range.endContainer ? range.endOffset : text.length;
			const preserveRoot = findPreserveRoot(node);

			// 跳过仅含空白字符的选中范围（元素间格式美化产生的无意义空白）。
			// 但 preserve 块内的空白文本节点不跳过：它作为块的"进入标记"，
			// 保证"只选中代码块里的换行"这类选区也能命中整个 preserve 块。
			if (!(preserveRoot === null && text.slice(start, end).trim() === "")) {
				collected.push({ node, start, end, preserveRoot });
			}
		}
		node = walker.nextNode() as Text | null;
	}

	// 阶段二：统一执行 DOM 操作并构造发送文本。
	// 协议：每个文本节点 = 一段；preserve 块（最外层 pre/code 元素）整块 = 一段。
	// 段数 = 段目标数，每段后跟 {{segN}} 分隔（含最后一段，N 绝对递增）。段内结构：
	// 待翻译部分原样保留；"不译内容"（未选中前/后、preserve 整块）统一替换为
	// {{varN}} 占位符（编号全局递增）。模型只需照抄标记、翻译其余部分，无需理解
	// 任何标签结构（大幅降低本地小模型的理解负担）。
	// 占位符无需真实原文映射：未选中部分与 preserve 块都由 DOM 原文兜底。
	let placeholderIndex = 1;
	const placeholder = (): string => `{{var${placeholderIndex++}}}`;

	// 已处理的 preserve 根元素：同一块里的后续文本节点直接跳过，
	// 整块只占一个占位符段（避免代码高亮块内几十个文本节点刷屏 prompt）
	const handledPreserveRoots = new Set<Element>();

	for (const item of collected) {
		const text = item.node.textContent ?? "";

		if (item.preserveRoot) {
			if (handledPreserveRoots.has(item.preserveRoot)) continue;
			handledPreserveRoots.add(item.preserveRoot);

			// preserve 块：锚点包整个元素，行内只留一个占位符。
			// 模型照抄占位符即可；写回时忽略模型输出、块内 DOM 保持原样
			// （见 writeToSegment 的 preserve 分支）。
			segments.push({
				kind: "preserve",
				target: wrapElement(item.preserveRoot),
				preservedElement: item.preserveRoot,
			});
			// preserve 段：整块只占一个占位符，协议行就是该占位符本身。
			const ph = placeholder();
			rows.push(ph);
			continue;
		}

		// 非 preserve 节点：锚点只包选中部分，未选中部分（before/after）留在 DOM 原文里，
		// 由 DOM 保证上下文保真（不依赖模型照抄）。before/after 用占位符替代，
		// 模型只看得到占位符，不会去翻译它们。
		//
		// 【换行折叠】节点内可能含 \n（如 HTML 源码美化、white-space:pre 文本）。
		// 虽然 {{segN}} 分隔已保证段内换行不破坏段数对齐，但保留折叠可减少段内换行噪音、
		// 让模型聚焦翻译。因此把协议行内的连续换行折叠为单个空格。
		// 注意：只折叠协议行——originalText 保留原始换行，回滚时逐字恢复。
		const selectedRaw = text.slice(item.start, item.end);
		const selected = selectedRaw.replace(/\n+/g, " ");
		const before = text.slice(0, item.start).replace(/\n+/g, " ");
		const after = text.slice(item.end).replace(/\n+/g, " ");
		const span = wrapSelected(item.node, item.start, item.end);
		segments.push({
			kind: "translate",
			target: span,
			originalText: selectedRaw,
			written: false,
		});

		// 占位符代表未选中部分（before/after），为空时省略，避免噪音。
		const row =
			(before ? placeholder() : "") + selected + (after ? placeholder() : "");
		rows.push(row);
	}

	// 待翻译文本 = 每个段后跟 {{segN}} 分隔（段数对齐协议，含最后一段）。
	// 语境信息由 background 从网页元数据（title/description）注入 system prompt，
	// 这里不再包任何上下文标记，保持输入极简、只含待翻译文本。
	// 注意：协议行的拼接在 createInlineTranslator 里做（需要 rows 里的协议行），
	// 这里只返回行数组，不再提前 join。
	return { segments, rows };
}

/** 用文本替换 span 锚点，恢复原始 DOM 结构（unwrap） */
function unwrapToText(span: HTMLSpanElement, text: string): void {
	span.replaceWith(document.createTextNode(text));
}

/** preserve 块恢复：用原始元素替换锚点 span，还原页面原有 DOM 结构 */
function unwrapToOriginal(span: HTMLSpanElement, element: Element): void {
	span.replaceWith(element);
}

export function createInlineTranslator(
	range: Range,
): InlineTranslatorController {
	const { segments, rows } = extractTextNodes(range);
	// 每段的协议行（含占位符串），顺序与 segments 一一对应。
	// 为什么存下来：restart(fromSegment) 要重造"从该段起的协议子文本"，只能由
	// 各段的协议行拼接，不能现场重读 DOM（未选中/preserve 内容不在锚点里）。
	const protocolRows: string[] = rows;
	// 完整协议文本 = 每段协议行后跟 {{segN}}（含最后一段），序号绝对递增
	const joinedText = joinSegmentRows(protocolRows, 0);

	if (segments.length === 0) {
		return {
			appendChunk: () => {},
			finish: () => ({ ok: true, fromSegment: 0 }),
			destroy: () => {},
			getText: () => joinedText,
			setOnMisalign: () => {},
			restart: () => joinedText,
		};
	}

	let currentNodeIndex = 0;
	/**
	 * 本次流期望输出的段数。初始为全量锚点数；restart(fromSegment) 时改为
	 * "后半段段数"，因为重试只重译 fromSegment 起的子文本、parser 是新建的
	 * （其 segmentCount 只统计本次流）。finish 的段数兜底必须用它比对，
	 * 否则重试后 segmentCount(后半段) ≠ segments.length(全量) 会误触发重试。
	 */
	let expectedOutputSegments = segments.length;

	function writeToSegment(index: number, text: string): void {
		if (index >= segments.length) return;
		const info = segments[index];
		if (!info.target.isConnected) return;

		// preserve 块：模型输出行只用于行数对齐，DOM 保持原样。
		// 注意不能给锚点赋 textContent——锚点里包着整个原始元素（内部含嵌套标签），
		// 赋值会把块内结构拍平成纯文本、破坏代码块。
		if (info.kind === "preserve") return;

		// 非 preserve 节点：删除占位符 {{varN}} 得到纯译文写回选中锚点；
		// 未选中部分由 DOM 原文保留，上下文保真不依赖模型。
		// （未完成协议前缀的剥离已由共享的 SegmentStreamParser 完成，这里只删占位符）
		const content = extractTranslatedContent(text);
		// 内容为空（流式未完成段，如分隔符刚拆到一半）时不写，避免清空锚点原文。
		// 注意：这里不能把"完整空段"也当成空——完整空段应被丢弃（finish 时清空锚点），
		// 而非保留原文。区分交给 finish：完整空段未写回、written 保持 false，finish 清空；
		// 流式未完成段同样不写回，但不受影响（其真实内容随后续 chunk 写回）。
		if (content === "") return;
		info.target.textContent = content;
		// 标记已写回：finish 时据此区分"模型已覆盖"与"未写回空段"（丢弃后者）
		info.written = true;
	}

	/** 由调用方注入的错位回调（TranslationController 设置后中止当前流并 restart） */
	let onMisalign: (fromSegment: number) => void = () => {};
	function setOnMisalign(cb: (fromSegment: number) => void): void {
		onMisalign = cb;
	}

	/**
	 * 重建段流解析器。每次开始（含 restart）都新建一个，避免沿用旧 parser 的
	 * 残留 buffer 与消费闭包（它们引用旧的 currentNodeIndex 闭包状态）。
	 */
	let parser = makeParser();
	function makeParser(): SegmentStreamParser {
		return new SegmentStreamParser({
			// 完整段到达：消耗一个锚点下标。空段也必须消耗（保持段序对齐），
			// 写不写由 writeToSegment 判断——空段不写，finish 阶段清空丢弃。
			//
			// 序号对齐检测（每段都有的地标）：第 currentNodeIndex 个输出段应结束于
			// {{seg(currentNodeIndex+1)}}。序号不符说明模型在该段之前发生了拆/并段
			// 错位——立即回调中止重试，后续段不再消费，避免错误译文以 written=true
			// 残留。这是"断点重试"能精确定位错位段的关键（长文纯文本段之间没有
			// {{varN}} 占位符，序号是唯一可靠的地标）。
			onSegment: (segment, segmentNumber) => {
				const expected = currentNodeIndex + 1;
				if (segmentNumber !== expected) {
					onMisalign(currentNodeIndex);
					return;
				}
				writeToSegment(currentNodeIndex, segment);
				currentNodeIndex++;
			},
			// 未完成尾段：写入当前锚点作流式预览（无序号，不推进下标）
			onPartial: (partial) => {
				writeToSegment(currentNodeIndex, partial);
			},
		});
	}

	/**
	 * 从指定段开始重试：恢复该段及之后锚点的原文、重建解析器，
	 * 返回"从该段起的协议子文本"。
	 *
	 * 为什么只重译后半段：对齐检测已定位到错位起点 fromSegment，说明它之前
	 * 的译文已正确写回。重试时：
	 * - 恢复 fromSegment 起所有锚点为原文（前半段译文保留不动）；
	 * - 新建 parser，段下标从 fromSegment 起；
	 * - 子文本 = rows[fromSegment..] 的协议行，{{segN}} 序号保持绝对递增（协议自洽）。
	 */
	function restart(fromSegment: number): string {
		// 恢复错位段及之后锚点的原文，但【必须保留锚点 span 在 DOM 中】：
		// 后续 writeToSegment 依赖 info.target.isConnected 判断是否可写，
		// 若用 unwrapToText/unwrapToOriginal 把 span 替换掉，span 脱离 DOM 后
		// isConnected 变 false，重试流的译文就再也写不进去了（本次 bug 根因）。
		// 正确做法：translate 段把 span 内容换回原文、written 复位；
		// preserve 段的 DOM 从未被写回阶段改动（writeToSegment 对 preserve 直接 return），
		// 锚点 span 与原始元素都还在，无需任何恢复。
		for (let i = fromSegment; i < segments.length; i++) {
			const info = segments[i];
			if (!info.target.isConnected) continue;
			if (info.kind === "translate") {
				// 保留 span，仅把选中部分恢复为原始文本（含原始换行）
				info.target.textContent = info.originalText;
				info.written = false;
			}
		}
		// 重建解析器，段下标从 fromSegment 起计数
		currentNodeIndex = fromSegment;
		parser = makeParser();
		// 本次重试流期望输出的段数 = 后半段段数（finish 的段数兜底用它比对）
		expectedOutputSegments = segments.length - fromSegment;
		// 子文本：从 fromSegment 起的协议行按绝对序号拼接（序号保持原编号，协议自洽）
		return joinSegmentRows(protocolRows.slice(fromSegment), fromSegment);
	}

	/** 恢复原始 DOM：translate 段恢复原文，preserve 段还原原始元素 */
	function restoreOriginals(): void {
		for (const info of segments) {
			if (!info.target.isConnected) continue;
			if (info.kind === "preserve") {
				unwrapToOriginal(info.target, info.preservedElement);
			} else {
				unwrapToText(info.target, info.originalText);
			}
		}
	}

	return {
		getText: () => joinedText,
		setOnMisalign,
		restart,

		appendChunk(chunk: string): void {
			parser.push(chunk);
		},

		finish(): FinishResult {
			// flush 缓冲区：正常流每段都以 {{segN}} 结尾，flush 时缓冲为空；
			// 只有模型漏抄末尾分隔符时才有尾段（写入"当前应写段"）。
			parser.flush();

			/**
			 * 段数对齐兜底。流式阶段的 {{segN}} 序号校验能抓"中间吞/并/拆段"，但
			 * "漏抄末尾分隔符、把最后两段合并"这类情况尾段没有序号、序号校验抓不到。
			 * 这里用段数兜底：模型实际输出段数 < 期望段数即视为末尾吞段，返回
			 * fromSegment = currentNodeIndex（= 已通过序号校验写回的段数），由调用方
			 * 从该段起重译，前半段已保留的译文不动。
			 *
			 * 为什么不再硬编码 fromSegment=0 全文重译：有了 {{segN}} 序号后，
			 * currentNodeIndex 之前每一段都通过了序号校验（确实对齐），从它起续译
			 * 是最小重译范围，也呼应"断点重试"的目标。
			 *
			 * 注意：模型多输出段（segmentCount > 期望）时不重试——多余段已在流式阶段
			 * 由 writeToSegment 的越界检查丢弃，已写回的前 n 段序号都对齐、译文可信。
			 */
			if (parser.segmentCount < expectedOutputSegments) {
				return { ok: false, fromSegment: currentNodeIndex };
			}

			// 尽力对齐：不再做严格段数校验/整段回滚，而是尽量保留已译部分。
			// 原因是本地小模型偶尔仍会吞/并段，严格回滚会让整段译文全部丢失，体验很差。
			// - 模型输出段数 > 锚点数：多余段已在流式阶段由 writeToSegment 的
			//   index 越界检查丢弃，这里无需处理。
			// - 未写回的锚点（written=false，含完整空段）：preserve 段还原原始元素；
			//   非 preserve 段按用户要求"丢弃空段"——清空锚点，而不是保留原文
			//   （否则会残留孤立原文碎片）。
			for (const info of segments) {
				if (!info.target.isConnected) continue;
				if (info.kind === "preserve") {
					// preserve：直接还原原始元素
					unwrapToOriginal(info.target, info.preservedElement);
				} else if (info.written) {
					// 已写回：保留译文
					unwrapToText(info.target, info.target.textContent ?? "");
				} else {
					// 未写回（空段）：丢弃原文，清空锚点
					unwrapToText(info.target, "");
				}
			}
			return { ok: true, fromSegment: 0 };
		},

		destroy(): void {
			// 回滚：translate 段恢复原文、preserve 段还原元素，
			// 全部 unwrap 回原始 DOM 结构
			restoreOriginals();
		},
	};
}
