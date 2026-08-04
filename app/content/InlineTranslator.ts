const DELIMITER = "\u2016";

export interface InlineTranslatorController {
	/** 追加译文 chunk，流式解析分隔符并写入对应文本节点 */
	appendChunk: (chunk: string) => void;
	/** 翻译完成：flush 缓冲区，移除 "翻译中" 标记，添加 "翻译完成" 标记 */
	finish: () => void;
	/** 清理所有引用和辅助元素 */
	destroy: () => void;
	/** 返回拼接好分隔符的文本，供发送给 LLM */
	getText: () => string;
}

interface TextNodeInfo {
	node: Text;
	parent: Element;
	/** true 表示该节点位于不应翻译的元素（pre/code 等）内，译文应原样保留原文 */
	preserve: boolean;
}

/** 不翻译但须原样保留原文的元素标签名集合（原文发给 LLM 作上下文，强制保留） */
const PRESERVE_TAGS = new Set(["pre", "code", "kbd", "samp", "var"]);

/** 保留段的标记，用于让 LLM 识别“不要翻译、原样复制”的段 */
const NO_TRANSLATE_TAG = "NO_TRANSLATE";

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

function extractTextNodes(range: Range): {
	nodes: TextNodeInfo[];
	segments: string[];
	joinedText: string;
} {
	const nodes: TextNodeInfo[] = [];
	const segments: string[] = [];

	// 若 commonAncestor 是 Text 节点，TreeWalker 以它为 root 时 nextNode()
	// 不会返回自身 → 改用其父元素作 root，避免漏掉唯一的目标文本节点
	let root = range.commonAncestorContainer;
	if (root.nodeType === Node.TEXT_NODE) {
		root = root.parentElement!;
	}

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

	let node = walker.nextNode() as Text | null;

	while (node) {
		if (range.intersectsNode(node)) {
			const text = node.textContent ?? "";
			let segment: string;

			if (node === range.startContainer && node === range.endContainer) {
				// 选区在同一节点内
				segment = text.slice(range.startOffset, range.endOffset);
			} else if (node === range.startContainer) {
				segment = text.slice(range.startOffset);
			} else if (node === range.endContainer) {
				segment = text.slice(0, range.endOffset);
			} else {
				segment = text;
			}

			// 跳过仅含空白字符的文本节点（元素间格式美化产生的无意义空白）
			if (segment.trim() === "") {
				node = walker.nextNode() as Text | null;
				continue;
			}

			// preserve 段（pre/code/kbd/samp/var 内）：不跳过，仍纳入分段，
			// 但用 <NO_TRANSLATE> 包裹，让 LLM 把它当上下文看且原样保留
			const preserve = isInsidePreservedElement(node);
			nodes.push({ node, parent: node.parentElement!, preserve });
			segments.push(
				preserve
					? `<${NO_TRANSLATE_TAG}>${segment}</${NO_TRANSLATE_TAG}>`
					: segment,
			);
		}

		node = walker.nextNode() as Text | null;
	}

	const joinedText = segments.join(DELIMITER);

	return { nodes, segments, joinedText };
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

export function createInlineTranslator(
	range: Range,
	parent: ShadowRoot | HTMLElement,
): InlineTranslatorController {
	const { nodes, joinedText } = extractTextNodes(range);

	if (nodes.length === 0) {
		return {
			appendChunk: () => {},
			finish: () => {},
			destroy: () => {},
			getText: () => joinedText,
		};
	}

	injectStyles(parent);

	// 缓存各节点原文：LLM 输出段数与节点数不一致时，恢复原文避免错位破坏页面
	const originalTexts = nodes.map((info) => info.node.textContent ?? "");

	let buffer = "";
	let currentNodeIndex = 0;
	let hasReceivedFirstChunk = false;

	function writeToNode(index: number, text: string): void {
		if (index >= nodes.length) return;
		const info = nodes[index];
		if (!info?.node.isConnected) return;

		// preserve 段（pre/code 等）写回时剥掉 <NO_TRANSLATE> 标记，恢复原文
		const content = info.preserve
			? text.replace(new RegExp(`</?${NO_TRANSLATE_TAG}>`, "g"), "")
			: text;
		info.node.textContent = content;
	}

	function restoreOriginalTexts(): void {
		for (let i = 0; i < nodes.length; i++) {
			const info = nodes[i];
			if (!info?.node.isConnected) continue;
			info.node.textContent = originalTexts[i] ?? "";
		}
	}

	return {
		getText: () => joinedText,

		appendChunk(chunk: string): void {
			if (!hasReceivedFirstChunk) {
				hasReceivedFirstChunk = true;
				for (const info of nodes) {
					if (info.parent) {
						info.parent.classList.add("llm-translating");
					}
				}
			}

			buffer += chunk;
			const parts = buffer.split(DELIMITER);

			// 除最后一段外，都是完整段
			for (let i = 0; i < parts.length - 1; i++) {
				writeToNode(currentNodeIndex, parts[i]);
				currentNodeIndex++;
			}

			// 最后一段是未完成段，写入当前节点
			buffer = parts[parts.length - 1] ?? "";
			writeToNode(currentNodeIndex, buffer);
		},

		finish(): void {
			// flush 缓冲区：剩余内容写入当前节点
			if (buffer.length > 0) {
				writeToNode(currentNodeIndex, buffer);
			}

			// 段数校验：LLM 输出的段数必须与节点数一致（‖ 分隔符数量对齐），
			// 否则视为协议错位——恢复原文，避免错位写回破坏页面内容
			if (currentNodeIndex + 1 !== nodes.length) {
				restoreOriginalTexts();
				for (const info of nodes) {
					if (info.parent) {
						info.parent.classList.remove("llm-translating");
					}
				}
				buffer = "";
				return;
			}

			// 移除 "翻译中" class，添加 "翻译完成" class
			for (const info of nodes) {
				if (info.parent) {
					info.parent.classList.remove("llm-translating");
					info.parent.classList.add("llm-translated");
				}
			}

			buffer = "";
		},

		destroy(): void {
			// 移除样式和 class
			for (const info of nodes) {
				if (info.parent) {
					info.parent.classList.remove("llm-translating", "llm-translated");
				}
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
