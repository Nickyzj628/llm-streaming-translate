import { extractTranslatedContent, SEGMENT_SEPARATOR } from "@/utils/protocol";

export interface InlineTranslatorController {
	/** 追加译文 chunk，流式解析段分隔并写入对应锚点 */
	appendChunk: (chunk: string) => void;
	/** 翻译完成：flush 缓冲区，unwrap 锚点恢复原始 DOM，切换 class */
	finish: () => void;
	/** 清理所有引用和辅助元素 */
	destroy: () => void;
	/** 返回发送给 LLM 的文本：每个文本节点一段，不译内容用 {{varN}} 占位，段间以 {{seg}} 分隔，其余为待翻译文本 */
	getText: () => string;
}

/** 选中段包裹用的锚点 class（display: contents，仅定位用，无视觉） */
const SELECTED_CLASS = "llm-selected";

/**
 * 不翻译但须原样保留的元素标签名集合。
 * 这些元素内的文本（code 等）在待翻译行中不发送内容，只以 {{varN}} 占位符替代；
 * 写回时由 DOM 原文兜底，模型无需也没必要照抄。
 */
const PRESERVE_TAGS = new Set(["pre", "code", "kbd", "samp", "var"]);

interface SegmentTarget {
	/** 写回目标：选中部分包裹的 <span> 锚点（preserve 节点为整节点锚点） */
	target: HTMLSpanElement;
	parent: Element;
	/** 选中部分原文（preserve 节点为整节点原文），恢复（unwrap）时用 */
	originalText: string;
	/** 是否为 preserve 节点（pre/code 等）：写回时忽略模型输出、保持原文 */
	preserve: boolean;
}

/** 检查节点是否位于需要原样保留的元素（pre/code 等）内部 */
function isInsidePreservedElement(node: Node): boolean {
	let current: Node | null = node;
	while (current) {
		if (current.nodeType === Node.ELEMENT_NODE) {
			const tag = (current as Element).tagName.toLowerCase();
			if (PRESERVE_TAGS.has(tag)) return true;
		}
		current = current.parentElement;
	}
	return false;
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

	// 阶段一：只遍历收集，不碰 DOM——splitText 会改动 DOM，live TreeWalker
	// 在拆节点后遍历位置会漂移，必须全部收集完再统一执行 DOM 操作
	const collected: Array<{
		node: Text;
		start: number;
		end: number;
		preserve: boolean;
	}> = [];

	let node = walker.nextNode() as Text | null;
	while (node) {
		if (range.intersectsNode(node)) {
			const text = node.textContent ?? "";
			const start = node === range.startContainer ? range.startOffset : 0;
			const end = node === range.endContainer ? range.endOffset : text.length;

			// 跳过仅含空白字符的选中范围（元素间格式美化产生的无意义空白）
			if (text.slice(start, end).trim() !== "") {
				collected.push({
					node,
					start,
					end,
					preserve: isInsidePreservedElement(node),
				});
			}
		}
		node = walker.nextNode() as Text | null;
	}

	// 阶段二：统一执行 DOM 操作并构造发送文本。
	// 协议：每个文本节点 = 一段，段数 = 节点数，与 DOM 一一对应，段间用 {{seg}} 分隔。
	// 段内结构：待翻译部分原样保留；"不译内容"（未选中前/后、preserve 整段）
	// 统一替换为 {{varN}} 占位符（编号全局递增）。这样模型只需照抄占位符、翻译其余部分，
	// 无需理解任何标签结构（大幅降低本地小模型的理解负担）。
	// 占位符无需真实原文映射：未选中部分与 preserve 段都由 DOM 原文兜底。
	let placeholderIndex = 1;
	const placeholder = (): string => `{{var${placeholderIndex++}}}`;

	for (const item of collected) {
		const text = item.node.textContent ?? "";

		if (item.preserve) {
			// preserve 节点（code 等）整个节点不翻译：锚点包整个节点，
			// 行内只留一个占位符。模型照抄占位符即可；
			// 写回时忽略模型输出、保持原文（见 writeToSegment）。
			const span = wrapSelected(item.node, 0, text.length);
			segments.push({
				target: span,
				parent: span.parentElement!,
				originalText: text,
				preserve: true,
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
		// 让模型聚焦翻译。因此把节点内连续换行折叠为单个空格。
		// 换行基本是源码空白，折叠成空格视觉一致；未选中部分由 DOM 原文兜底不受影响。
		const before = text.slice(0, item.start).replace(/\n+/g, " ");
		const selected = text.slice(item.start, item.end).replace(/\n+/g, " ");
		const after = text.slice(item.end).replace(/\n+/g, " ");
		const span = wrapSelected(item.node, item.start, item.end);
		segments.push({
			target: span,
			parent: span.parentElement!,
			originalText: selected,
			preserve: false,
		});

		// 占位符代表未选中部分（before/after），为空时省略，避免噪音。
		rows.push(
			(before ? placeholder() : "") + selected + (after ? placeholder() : ""),
		);
	}

	// 待翻译文本 = 每个文本节点用 {{seg}} 分隔（段数对齐协议）。
	// 语境信息由 background 从网页元数据（title/description）注入 system prompt，
	// 这里不再包任何上下文标记，保持输入极简、只含待翻译文本。
	const joinedText = rows.join(SEGMENT_SEPARATOR);

	return { segments, joinedText };
}

function injectStyles(parent: ShadowRoot | HTMLElement): void {
	const styleId = "llm-inline-translate-styles";
	if (parent.querySelector(`#${styleId}`)) return;

	const style = document.createElement("style");
	style.id = styleId;
	style.textContent = `
		.llm-translating {
			opacity: 0.6;
			transition: opacity 150ms ease;
		}
		.llm-translated {
			opacity: 1;
			background: linear-gradient(90deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.04) 100%);
			border-radius: 2px;
			transition: opacity 150ms ease, background 300ms ease;
		}
	`;
	parent.appendChild(style);
}

function removeStyles(parent: ShadowRoot | HTMLElement): void {
	const style = parent.querySelector("#llm-inline-translate-styles");
	if (style) style.remove();
}

/** 用文本替换 span 锚点，恢复原始 DOM 结构（unwrap） */
function unwrapToText(span: HTMLSpanElement, text: string): void {
	span.replaceWith(document.createTextNode(text));
}

export function createInlineTranslator(
	range: Range,
	parent: ShadowRoot | HTMLElement,
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

	injectStyles(parent);

	let buffer = "";
	let currentNodeIndex = 0;
	let hasReceivedFirstChunk = false;

	function writeToSegment(index: number, text: string): void {
		if (index >= segments.length) return;
		const info = segments[index];
		if (!info.target.isConnected) return;

		// preserve 节点（code 等）：保持原文，模型输出行只用于行数对齐、不碰 DOM。
		// 这样即使模型把 code 内容翻译了，页面也不会被破坏。
		if (info.preserve) {
			info.target.textContent = info.originalText;
			return;
		}

		// 非 preserve 节点：删除占位符 {{varN}} 得到纯译文写回选中锚点；
		// 未选中部分由 DOM 原文保留，上下文保真不依赖模型。
		const content = extractTranslatedContent(text);
		// 内容为空（如模型只输出了 "-" 前缀或空行）时不写，避免清空锚点原文
		if (content.trim() === "") return;
		info.target.textContent = content;
	}

	function restoreOriginals(): void {
		for (const info of segments) {
			if (info.target.isConnected) {
				unwrapToText(info.target, info.originalText);
			}
		}
	}

	return {
		getText: () => joinedText,

		appendChunk(chunk: string): void {
			if (!hasReceivedFirstChunk) {
				hasReceivedFirstChunk = true;
				for (const info of segments) {
					info.parent.classList.add("llm-translating");
				}
			}

			buffer += chunk;
			const segmentsArr = buffer.split(SEGMENT_SEPARATOR);

			// 除最后一个段外，都是完整段（一个译文 = 一个锚点）。
			// 空段对应模型留下的残缺占位（见 prompt：无法翻译的段输出空段），
			// 必须消耗一个锚点 index 以保持段序对齐，但内容为空不需要写回，
			// 该锚点保持原文（wrap 后未被触碰，finish 时用其原文 unwrap 恢复）。
			// 注意：不能 continue 跳过，否则空段会破坏后续段的 index 对应关系。
			for (let i = 0; i < segmentsArr.length - 1; i++) {
				const seg = segmentsArr[i];
				if (seg.trim() !== "") {
					writeToSegment(currentNodeIndex, seg);
				}
				currentNodeIndex++;
			}

			// 最后一段是未完成段，写入当前锚点作流式预览；
			// 为空（如模型输出以分隔符结尾）时不写，避免把锚点原文清空
			buffer = segmentsArr[segmentsArr.length - 1] ?? "";
			if (buffer.trim() !== "") {
				writeToSegment(currentNodeIndex, buffer);
			}
		},

		finish(): void {
			// flush 缓冲区：剩余内容写入当前锚点（buffer 为空说明模型输出以分隔符结尾，忽略）
			if (buffer.trim() !== "") {
				writeToSegment(currentNodeIndex, buffer);
			}

			// 尽力对齐：不再做严格段数校验/整段回滚，而是尽量保留已译部分。
			// 原因是本地小模型经常吞/并段（如把 "The " + "Oniguruma Engine" 合并成一段），
			// 严格回滚会让整段译文全部丢失，体验很差。
			// - 模型输出段数 > 锚点数：多余段已在流式阶段由 writeToSegment 的
			//   index 越界检查丢弃，这里无需处理。
			// - 模型输出段数 < 锚点数：未写到的锚点保持原文（wrap 后未被触碰），
			//   unwrapToText 用其现有 textContent（即原文）恢复，缺失段自动补回原文。
			// 代价：若模型在中间错位合并，后续段译文会整体前移，这是"尽力"方案的固有妥协。
			for (const info of segments) {
				if (info.target.isConnected) {
					unwrapToText(info.target, info.target.textContent);
				}
				info.parent.classList.remove("llm-translating");
				info.parent.classList.add("llm-translated");
			}

			buffer = "";
		},

		destroy(): void {
			// 恢复原文并移除 class（span 锚点 unwrap 回原文）
			restoreOriginals();
			for (const info of segments) {
				info.parent.classList.remove("llm-translating", "llm-translated");
			}

			// 检查是否还有其他翻译中的元素决定是否移除 style
			const hasTranslating = parent.querySelector(".llm-translating") !== null;
			const hasTranslated = parent.querySelector(".llm-translated") !== null;
			if (!hasTranslating && !hasTranslated) {
				removeStyles(parent);
			}
		},
	};
}
