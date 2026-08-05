import { extractTranslatedContent, NO_TRANSLATE_TAG } from "@/utils/protocol";

export interface InlineTranslatorController {
	/** 追加译文 chunk，流式解析行分隔并写入对应锚点 */
	appendChunk: (chunk: string) => void;
	/** 翻译完成：flush 缓冲区，unwrap 锚点恢复原始 DOM，切换 class */
	finish: () => void;
	/** 清理所有引用和辅助元素 */
	destroy: () => void;
	/** 返回发送给 LLM 的文本：每行一个文本节点，<NO_TRANSLATE> 内的内容不翻译、其余翻译 */
	getText: () => string;
}

/** 选中段包裹用的锚点 class（display: contents，仅定位用，无视觉） */
const SELECTED_CLASS = "llm-selected";

/** 行分隔：每行 = 一个文本节点，输出按行数与输入对齐 */
const LINE_BREAK = "\n";

/** 不翻译但须原样保留原文的元素标签名集合（原文发给 LLM 作上下文，强制保留） */
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
	// 协议：每行 = 一个文本节点，行数 = 节点数，与 DOM 一一对应。
	// 行内用 <NO_TRANSLATE> 标出“不翻译”部分（未选中部分 / code 等 preserve 节点），
	// 其余部分才是唯一需要翻译的内容。模型输出时保留标签结构、翻译标签外内容，行数严格对齐；
	// 写回时只取标签外译文（见 writeToSegment），标签内容即使被模型翻译也会被丢弃。
	for (const item of collected) {
		const text = item.node.textContent ?? "";

		if (item.preserve) {
			// preserve 节点（code 等）整个节点都不翻译：锚点包整个节点、整行 NO_TRANSLATE 占位。
			// 模型输出行只用于行数对齐，写回时忽略其内容、保持原文（见 writeToSegment），
			// 这样即使模型翻译了 code 内容，页面也不会被破坏。
			const span = wrapSelected(item.node, 0, text.length);
			segments.push({
				target: span,
				parent: span.parentElement!,
				originalText: text,
				preserve: true,
			});
			rows.push(`- <${NO_TRANSLATE_TAG}>${text}</${NO_TRANSLATE_TAG}>`);
			continue;
		}

		// 非 preserve 节点：锚点只包选中部分，未选中部分（before/after）留在 DOM 原文里，
		// 由 DOM 保证上下文保真（不依赖模型照抄）。
		const before = text.slice(0, item.start);
		const selected = text.slice(item.start, item.end);
		const after = text.slice(item.end);
		const span = wrapSelected(item.node, item.start, item.end);
		segments.push({
			target: span,
			parent: span.parentElement!,
			originalText: selected,
			preserve: false,
		});

		// 未选中部分（before/after）用 NO_TRANSLATE 标出让模型照抄作上下文；
		// 为空时省略标签，避免“<NO_TRANSLATE></NO_TRANSLATE>”空标签噪音。
		rows.push(
			`- ` +
				(before ? `<${NO_TRANSLATE_TAG}>${before}</${NO_TRANSLATE_TAG}>` : "") +
				selected +
				(after ? `<${NO_TRANSLATE_TAG}>${after}</${NO_TRANSLATE_TAG}>` : ""),
		);
	}

	const joinedText = rows.join(LINE_BREAK);

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

		// 非 preserve 节点：只取模型输出行中的译文（标签外内容）写回选中锚点，
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
			const lines = buffer.split(LINE_BREAK);

			// 除最后一行外，都是完整行（一个译文 = 一个锚点）。
			// 空行跳过：模型可能输出多余空行（含尾随换行产生的空行），
			// 它们不参与行计数、也不写回，避免行数校验被空行干扰。
			for (let i = 0; i < lines.length - 1; i++) {
				const line = lines[i];
				if (line.trim() === "") continue;
				writeToSegment(currentNodeIndex, line);
				currentNodeIndex++;
			}

			// 最后一行是未完成行，写入当前锚点作流式预览；
			// 为空（如模型输出以换行结尾）时不写，避免把锚点原文清空
			buffer = lines[lines.length - 1] ?? "";
			if (buffer.trim() !== "") {
				writeToSegment(currentNodeIndex, buffer);
			}
		},

		finish(): void {
			// flush 缓冲区：剩余内容写入当前锚点（buffer 为空说明模型输出以换行结尾，忽略）
			if (buffer.trim() !== "") {
				writeToSegment(currentNodeIndex, buffer);
			}

			// 行数校验：LLM 实际输出的有效行数（空行不计）必须与锚点数一致：
			// - buffer 非空 → 已写 currentNodeIndex 个完整行 + 未完成 1 行 = currentNodeIndex + 1
			// - buffer 为空 → 只有 currentNodeIndex 个完整行（尾随换行不产生新行）
			// 否则视为协议错位——恢复原文，避免错位写回破坏页面内容
			const writtenLines =
				buffer.trim() === "" ? currentNodeIndex : currentNodeIndex + 1;
			if (writtenLines !== segments.length) {
				restoreOriginals();
				for (const info of segments) {
					info.parent.classList.remove("llm-translating");
				}
				buffer = "";
				return;
			}

			// 成功：unwrap 翻译段的 span，恢复原始 DOM 结构
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
