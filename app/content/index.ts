import {
	hide as hideButton,
	isButtonElement,
	onClick,
	setParent,
	show as showButton,
} from "@/content/FloatingButton";
import { createTranslationController } from "@/content/TranslationController";

/**
 * content 端入口：只负责"事件 → 动作"的声明式转发。
 *
 * 一次划词翻译的完整生命周期（收集文本节点 → 发起 LLM 流式请求 → 流式写回 →
 * 成功收尾 / 失败回滚 → 状态复位）收敛在 TranslationController 里，这里不掺业务细节。
 *
 * 职责划分：
 * - 本文件：Shadow DOM 挂载、全局事件监听、把事件转发给 controller；
 * - TranslationController：会话状态机与翻译流程编排；
 * - InlineTranslator：协议文本构造与 DOM 写回；
 * - FloatingButton：浮动按钮的纯 UI。
 */

/**
 * 零 realm 污染的 Shadow DOM 挂载：普通 <div> 当 host，不注册自定义元素。
 *
 * 为什么不用 @addfox/utils 的 defineShadowContentUI：它会把内容脚本 realm 的
 * 自定义元素类注册进页面共享的 customElements（Firefox 内容脚本与页面共享该
 * 注册表），升级后的 host 原型链混入扩展对象；页面脚本（如 Cloudflare Turnstile
 * 初始化时遍历 DOM）一碰到它就触发 Firefox Xray 拦截，抛
 * "Permission denied to access property" 导致校验组件无法渲染。
 * 普通 div 的原型链完全属于页面 realm，页面怎么读 tagName 都不会越权。
 */
function mountShadowUI(): ShadowRoot {
	const host = document.createElement("div");
	host.dataset.llmTranslateHost = "true";
	const shadowRoot = host.attachShadow({ mode: "open" });
	document.body.appendChild(host);
	return shadowRoot;
}

const shadowRoot = mountShadowUI();
setParent(shadowRoot);

const controller = createTranslationController();

function handleMouseDown(e: MouseEvent): void {
	if (isButtonElement(e.target as Node)) return;
	hideButton();
}

function handleMouseUp(e: MouseEvent): void {
	if (isButtonElement(e.target as Node)) return;

	requestAnimationFrame(() => {
		// 先打断上一会话（重新划词或点击空白取消选择都会打断进行中的翻译，
		// 与原来 index.ts 的时序一致；abort 对空闲状态是幂等安全的）。
		controller.abort();

		if (controller.getSelectedText().length === 0) {
			hideButton();
			return;
		}

		showButton(e.clientX + 8, e.clientY + 8);
		onClick(() => {
			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) return;
			// 保留 Range，仅清除高亮
			const range = selection.getRangeAt(0);
			selection.removeAllRanges();
			// 点击浮动按钮即视为开始翻译：立即隐藏按钮，避免残留
			// （原逻辑在 startTranslate 发起翻译后 hideButton，重构后收敛到点击处）
			hideButton();
			controller.start(range);
		});
	});
}

function handleSelectionChange(): void {
	// 翻译进行中不处理选区变化（与原实现一致：避免干扰正在写回的锚点）
	if (controller.isTranslating()) return;
	if (controller.getSelectedText().length === 0) {
		hideButton();
	}
}

function cleanup(): void {
	document.removeEventListener("mousedown", handleMouseDown);
	document.removeEventListener("mouseup", handleMouseUp);
	document.removeEventListener("selectionchange", handleSelectionChange);
	hideButton();
	controller.dispose();
}

window.addEventListener("beforeunload", cleanup);

document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("selectionchange", handleSelectionChange);
