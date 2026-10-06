import {
	hide as hideButton,
	isButtonElement,
	onClick,
	setParent,
	show as showButton,
} from "@/content/FloatingButton";
import { createInlineTranslator } from "@/content/InlineTranslator";
import {
	startTranslationSession,
	type TranslationSession,
} from "@/content/TranslationSession";
import { streamTranslate } from "@/utils/streamTranslate";

/**
 * content 端入口：事件转发 + 当前会话的持有者。
 *
 * 一次划词翻译的完整生命周期（收集文本节点 → 发起 LLM 流式请求 → 流式写回 →
 * 成功收尾 / 失败回滚 → 状态复位）在这里串起来，具体实现分给三个模块：
 * - TranslationSession：协议文本拼接、流式写回与错位重试（一次会话的活）；
 * - InlineTranslator：选区锚点与按段写回；
 * - FloatingButton：浮动按钮的纯 UI。
 *
 * 为什么不单开一个 controller 文件：这里全部状态只有 activeSession 一项、
 * 对外动作只有 start/abort 两个，且只有本文件用——单独一层文件只多一次跳转。
 */

/** 当前活跃会话（null 表示空闲）；会话结束或被打断后清空 */
let activeSession: TranslationSession | null = null;

/**
 * 打断当前会话（若有）：回滚 DOM + 断开端口。空闲时是幂等空操作。
 * 重新划词 / 页面卸载都会走到这里，避免留下浪费的 background 请求。
 */
function abortCurrent(): void {
	const session = activeSession;
	activeSession = null;
	session?.abort();
}

/** 读取当前选区文本（trim 后），供判断要不要显示浮动按钮 */
function getSelectedText(): string {
	const selection = window.getSelection();
	return selection ? selection.toString().trim() : "";
}

/**
 * 读取当前网页的元数据（title + meta description），供 background 注入 system prompt
 * 帮助模型理解页面主题与语境。description 为空时省略该字段。
 * 截断保护：避免超长 title/description 塞爆 prompt。
 */
function getPageMeta(): { title: string; description: string } {
	const title = document.title.trim().slice(0, 200);
	const descEl = document.querySelector<HTMLMetaElement>(
		'meta[name="description"], meta[property="og:description"]',
	);
	const description = (descEl?.content ?? "").trim().slice(0, 300);
	return { title, description };
}

/** 翻译一个选区 Range（点击浮动按钮触发） */
function startTranslation(range: Range): void {
	// 打断前一个进行中的翻译（重新划词/取消选择都会走到这里）
	abortCurrent();

	// 创建原地翻译器，收集文本节点、建立锚点、拿到每段协议行
	const translator = createInlineTranslator(range);

	// 选区内没有可翻译的文本节点（如选区全部落在被跳过的位置）：
	// 销毁锚点直接放弃，不发无意义的空请求
	if (translator.segmentCount === 0) {
		translator.destroy();
		return;
	}

	const session = startTranslationSession({
		translator,
		// 端口客户端由入口注入：会话本身不静态依赖端口模块（可单测）
		transport: streamTranslate,
		getPageMeta,
		// 会话自然结束（成功/失败/放弃）时清活跃句柄，且必须确认它仍是当前会话——
		// 旧会话的迟到回调不能把新会话的句柄清掉（闭包版踩过的时序 bug）
		onEnded: () => {
			if (activeSession === session) {
				activeSession = null;
			}
		},
	});
	activeSession = session;
}

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

function handleMouseDown(e: MouseEvent): void {
	if (isButtonElement(e.target as Node)) return;
	hideButton();
}

function handleMouseUp(e: MouseEvent): void {
	if (isButtonElement(e.target as Node)) return;

	requestAnimationFrame(() => {
		// 先打断上一会话（重新划词或点击空白取消选择都会打断进行中的翻译；
		// abort 对空闲状态是幂等安全的）
		abortCurrent();

		if (getSelectedText().length === 0) {
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
			hideButton();
			startTranslation(range);
		});
	});
}

function handleSelectionChange(): void {
	// 翻译进行中不处理选区变化，避免干扰正在写回的锚点
	if (activeSession !== null) return;
	if (getSelectedText().length === 0) {
		hideButton();
	}
}

function cleanup(): void {
	document.removeEventListener("mousedown", handleMouseDown);
	document.removeEventListener("mouseup", handleMouseUp);
	document.removeEventListener("selectionchange", handleSelectionChange);
	hideButton();
	abortCurrent();
}

window.addEventListener("beforeunload", cleanup);

document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("selectionchange", handleSelectionChange);
