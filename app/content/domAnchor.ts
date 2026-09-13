/**
 * 划词翻译的 DOM 锚点层：选区遍历、锚点包裹与恢复。
 *
 * 只做 DOM 操作，不做"哪一段该翻译、占位符怎么编号"的决策——那些在
 * segmentPlan.ts（纯逻辑、可单测）。拆开后 DOM 层只关心"怎么改页面"，
 * 计划层只关心"发什么给模型"，两边可以各自推理、各自验证。
 */

/** 选中段包裹用的锚点 class（display: contents，仅定位/调试用，无视觉样式） */
const SELECTED_CLASS = "llm-selected";

/**
 * 不翻译但须原样保留的元素标签名集合。
 * 这些元素（代码块等）的文本不发送给模型，整块只以一个 {{varN}} 占位符替代；
 * 写回时由 DOM 原文兜底，模型无需也没必要照抄内容。
 */
const PRESERVE_TAGS = new Set(["pre", "code", "kbd", "samp", "var"]);

/** 选区内的一个待处理文本节点（含选中范围与所属 preserve 块） */
export interface CollectedTextNode {
	node: Text;
	/** 选中范围在节点内的起止偏移 */
	start: number;
	end: number;
	/** 最外层 preserve 祖先（pre/code 等），不在 preserve 块内时为 null */
	preserveRoot: Element | null;
}

/**
 * 查找节点最外层的 preserve 祖先元素（pre/code 等）。
 *
 * 为什么取"最外层"：代码高亮块常见 pre > code > span.line > span.token 的
 * 深层结构，块内可能有几十个文本节点。如果按文本节点逐段占位，用户提示词会被
 * 刷成 {{seg1}}{{var2}}{{seg2}}{{var3}}... 的长链。整块折叠为一段、只占一个
 * {{varN}}，既减少 prompt 噪音，也减少模型数错段数的概率。
 */
export function findPreserveRoot(node: Node): Element | null {
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
 * 遍历选区，收集所有相交文本节点及其选中范围。
 *
 * 为什么只收集、不改 DOM：splitText/包裹会改动 DOM，而 TreeWalker 是 live 的，
 * 拆节点后遍历位置会漂移。必须先全部收集完，再统一执行 DOM 操作。
 */
export function collectTextNodes(range: Range): CollectedTextNode[] {
	// 若 commonAncestor 是 Text 节点，TreeWalker 以它为 root 时 nextNode()
	// 不会返回自身 → 改用其父元素作 root，避免漏掉唯一的目标文本节点
	let root = range.commonAncestorContainer;
	if (root.nodeType === Node.TEXT_NODE) {
		root = root.parentElement!;
	}

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const collected: CollectedTextNode[] = [];

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
	return collected;
}

/**
 * 把文本节点的 [start, end) 范围包一层 <span class="llm-selected"> 锚点。
 * 返回该 span，后续流式写回/恢复都直接操作它，无需计算 offset。
 */
export function wrapSelected(
	node: Text,
	start: number,
	end: number,
): HTMLSpanElement {
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
export function wrapElement(element: Element): HTMLSpanElement {
	const span = document.createElement("span");
	span.className = SELECTED_CLASS;
	span.style.display = "contents";
	element.parentNode?.insertBefore(span, element);
	span.appendChild(element);
	return span;
}

/** 用文本替换 span 锚点，恢复原始 DOM 结构（unwrap） */
export function unwrapToText(span: HTMLSpanElement, text: string): void {
	span.replaceWith(document.createTextNode(text));
}

/** preserve 块恢复：用原始元素替换锚点 span，还原页面原有 DOM 结构 */
export function unwrapToOriginal(
	span: HTMLSpanElement,
	element: Element,
): void {
	span.replaceWith(element);
}
