import {
	extractTranslatedContent,
	SEGMENT_SEPARATOR,
	SegmentStreamParser,
} from "@/utils/protocol";

export interface InlineTranslatorController {
	/** 追加译文 chunk，流式解析段分隔并写入对应锚点 */
	appendChunk: (chunk: string) => void;
	/** 翻译完成：flush 缓冲区，unwrap 锚点恢复原始 DOM */
	finish: () => void;
	/** 清理所有引用和辅助元素 */
	destroy: () => void;
	/**
	 * 返回发送给 LLM 的文本：每个文本节点一段，pre/code 等 preserve 块整块一段；
	 * 不译内容用 {{varN}} 占位，段间以 {{seg}} 分隔，其余为待翻译文本
	 */
	getText: () => string;
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
 * 刷成 {{seg}}{{var2}}{{seg}}{{var3}}... 的长链。整块折叠为一段、只占一个
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
	joinedText: string;
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
	// 段数 = 段目标数，段间用 {{seg}} 分隔。段内结构：待翻译部分原样保留；
	// "不译内容"（未选中前/后、preserve 整块）统一替换为 {{varN}} 占位符
	// （编号全局递增）。模型只需照抄占位符、翻译其余部分，无需理解任何标签结构
	// （大幅降低本地小模型的理解负担）。
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
			rows.push(placeholder());
			continue;
		}

		// 非 preserve 节点：锚点只包选中部分，未选中部分（before/after）留在 DOM 原文里，
		// 由 DOM 保证上下文保真（不依赖模型照抄）。before/after 用占位符替代，
		// 模型只看得到占位符，不会去翻译它们。
		//
		// 【换行折叠】节点内可能含 \n（如 HTML 源码美化、white-space:pre 文本）。
		// 虽然 {{seg}} 分隔已保证段内换行不破坏段数对齐，但保留折叠可减少段内换行噪音、
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
		rows.push(
			(before ? placeholder() : "") + selected + (after ? placeholder() : ""),
		);
	}

	// 待翻译文本 = 每个段用 {{seg}} 分隔（段数对齐协议）。
	// 语境信息由 background 从网页元数据（title/description）注入 system prompt，
	// 这里不再包任何上下文标记，保持输入极简、只含待翻译文本。
	const joinedText = rows.join(SEGMENT_SEPARATOR);

	return { segments, joinedText };
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
	const { segments, joinedText } = extractTextNodes(range);

	if (segments.length === 0) {
		return {
			appendChunk: () => {},
			finish: () => {},
			destroy: () => {},
			getText: () => joinedText,
		};
	}

	let currentNodeIndex = 0;

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

	/**
	 * 共享段流解析器：chunk 拆分 / 空段对齐 / 未完成协议前缀剥离统一由
	 * protocol.ts 保证（与 options 测试板块同一套规则），这里只负责把
	 * "完整段 / 未完成尾段"按段下标写回对应锚点。
	 */
	const parser = new SegmentStreamParser({
		// 完整段到达：消耗一个锚点下标。空段也必须消耗（保持段序对齐），
		// 写不写由 writeToSegment 判断——空段不写，finish 阶段清空丢弃。
		onSegment: (segment) => {
			writeToSegment(currentNodeIndex, segment);
			currentNodeIndex++;
		},
		// 未完成尾段：写入当前锚点作流式预览
		onPartial: (partial) => {
			writeToSegment(currentNodeIndex, partial);
		},
	});

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

		appendChunk(chunk: string): void {
			parser.push(chunk);
		},

		finish(): void {
			// flush 缓冲区：剩余内容写入当前锚点
			// （buffer 为空说明模型输出以分隔符结尾，flush 内直接忽略）
			parser.flush();

			// 尽力对齐：不再做严格段数校验/整段回滚，而是尽量保留已译部分。
			// 原因是本地小模型经常吞/并段（如把 "The " + "Oniguruma Engine" 合并成一段），
			// 严格回滚会让整段译文全部丢失，体验很差。
			// - 模型输出段数 > 锚点数：多余段已在流式阶段由 writeToSegment 的
			//   index 越界检查丢弃，这里无需处理。
			// - 模型输出段数 < 锚点数（含完整空段）：未写回的锚点 written=false。
			//   preserve 段还原原始元素；非 preserve 段按用户要求"丢弃空段"——
			//   清空锚点，而不是保留原文（否则会残留孤立原文碎片，如本例的 "The "）。
			// 代价：若模型在中间错位合并，后续段译文会整体前移，这是"尽力"方案的固有妥协。
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
		},

		destroy(): void {
			// 回滚：translate 段恢复原文、preserve 段还原元素，
			// 全部 unwrap 回原始 DOM 结构
			restoreOriginals();
		},
	};
}
