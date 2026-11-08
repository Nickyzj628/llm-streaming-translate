import {
	hide as hideButton,
	isButtonElement,
	onClick,
	setParent,
	show as showButton,
} from "@/content/FloatingButton";
import { createInlineTranslator } from "@/content/InlineTranslator";
import {
	appendHistory,
	clearHistory,
	getHistory,
	readPageMeta,
} from "@/content/pageContext";
import { shouldOfferTranslation } from "@/content/selectionFilter";
import { isAlreadyTargetLanguage } from "@/content/selectionLanguage";
import {
	startTranslationSession,
	type TranslationSession,
} from "@/content/TranslationSession";
import { mountToast } from "@/content/toast";
import { streamTranslate } from "@/utils/streamTranslate";
import { showToast } from "@/utils/toast";

/**
 * content 端入口：事件转发 + 当前会话的持有者。
 *
 * 一次划词翻译的完整生命周期（收集文本节点 → 发起 LLM 流式请求 → 流式写回 →
 * 成功收尾 / 失败回滚 → 状态复位）在这里串起来，具体实现分给三个模块：
 * - TranslationSession：协议文本拼接、流式写回与错位重试（一次会话的活）；
 * - InlineTranslator：选区锚点与按段写回；
 * - FloatingButton：浮动按钮的纯 UI。
 *
 * 为什么不单开一个 controller 文件：这里全部状态只有 activeSession + queued
 * 两项、对外动作只有 request/abort 两个，且只有本文件用——单独一层只多一次跳转。
 *
 * **同一时刻只跑一个会话**（锚点、页级历史、toast 全是单例，并行会互相踩）。
 * 翻译进行中用户还能继续划词，但点按钮不会再打断当前翻译，而是排队：
 * 当前会话收尾（成功/失败）后自动开始下一单，latest-wins 只留一单待办。
 */

/** 当前活跃会话（null 表示空闲）；会话结束或被打断后清空 */
let activeSession: TranslationSession | null = null;

/**
 * 排队中的下一次翻译（null = 无）。存 Range + 当时选中的文本：
 * 等当前会话收尾期间页面可能重绘/替换文本节点，开跑前要用文本比对验明它还认得上。
 */
let queued: { range: Range; text: string } | null = null;

/**
 * 打断当前会话（若有）：回滚 DOM + 断开端口。空闲时是幂等空操作。
 * 只有页面卸载会走到这里——正常流程里会话都是自然收尾，然后接力下一单。
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
 * 归一化（trim + 截断）统一在这里做：pageContext 用同一份返回值判断"是否换页"，
 * 所以比较基准与写进 prompt 的标题永远是同一个值。
 */
function readDocumentMeta(): { title: string; description: string } {
	const title = document.title.trim().slice(0, 200);
	const descEl = document.querySelector<HTMLMetaElement>(
		'meta[name="description"], meta[property="og:description"]',
	);
	const description = (descEl?.content ?? "").trim().slice(0, 300);
	return { title, description };
}

/**
 * 网页元数据（页级上下文的一部分）：首次翻译时快照，之后每次开新会话先比标题——
 * 标题变了就看作用户换了一页，历史对话与这份快照一起清空重读（见 pageContext.ts）。
 */
function getPageMeta(): { title: string; description: string } {
	return readPageMeta(readDocumentMeta);
}

/**
 * 请求翻译一个选区（点击浮动按钮触发）：空闲就直接开跑，正在翻译就排队等它收尾。
 *
 * 为什么排队而不是打断：打断会立刻回滚当前 DOM、丢掉已译部分（点一下新的就白翻
 * 一场）；为什么不是并行：锚点、页级历史、toast 都是单例，并行会互相踩（重叠选区
 * 还会让后建的锚点被先建的 textContent 写回整块删掉）。串行化顺带保证了"建新锚点
 * 时 DOM 里没有别人的锚点"。
 */
function requestTranslation(range: Range): void {
	if (activeSession === null) {
		startTranslation(range);
		return;
	}
	// latest-wins：用户又划了一段点了按钮，就换成最新这单，不排长队
	queued = { range, text: range.toString() };
	// 类型只能是 success（蓝色）/ error（红色），这里是非错误的中性提示
	showToast("当前翻译结束后自动开始", "success");
}

/**
 * 当前会话收尾后接力下一单（由 onEnded 调用）。
 *
 * 等待期间页面可能重绘、替换文本节点、甚至把选区里的内容改掉：Range 活着但文本
 * 对不上就说明它已经不是用户当初选的那段了，丢弃并提示重划——绝不替用户翻别的文本。
 */
function startQueuedTranslation(): void {
	const next = queued;
	if (next === null || activeSession !== null) return;
	queued = null;

	const { range, text } = next;
	const stillUsable =
		range.startContainer.isConnected &&
		range.endContainer.isConnected &&
		!range.collapsed &&
		range.toString() === text;
	if (!stillUsable) {
		showToast("页面内容已变化，请重新划词", "error");
		return;
	}
	startTranslation(range);
}

/** 开跑一个会话。调用方必须保证当前空闲（requestTranslation / 接力队列） */
function startTranslation(range: Range): void {
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
		// 页级历史：会话开始时抓快照，整场会话（含重试）复用
		getHistory,
		// 成功：把这一对干净的对话写进页级历史，供后续翻译当语境
		onTranslated: ({ user, assistant }) => {
			appendHistory({ role: "user", content: user });
			appendHistory({ role: "assistant", content: assistant });
		},
		// 失败：清空历史并提示（不清 pageMeta，system 前缀保持稳定）
		onFailed: (message) => {
			clearHistory();
			showToast(message, "error");
		},
		// 会话自然结束（成功/失败/放弃）时清活跃句柄，且必须确认它仍是当前会话——
		// 旧会话的迟到回调不能把新会话的句柄清掉（闭包版踩过的时序 bug）。
		// 收尾后接力排队中的下一单（唯一放行点是这里：DOM 上已没有别人的锚点）
		onEnded: () => {
			if (activeSession === session) {
				activeSession = null;
			}
			startQueuedTranslation();
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
// 失败提示也画在这个 Shadow DOM 里：与浮动按钮同域，不受页面样式影响
mountToast(shadowRoot);

function handleMouseDown(e: MouseEvent): void {
	if (isButtonElement(e.target as Node)) return;
	hideButton();
}

function handleMouseUp(e: MouseEvent): void {
	// 只响应左键：右键（button === 2）也会触发 mouseup，不该参与划词流程
	if (e.button !== 0) return;
	if (isButtonElement(e.target as Node)) return;

	requestAnimationFrame(() => {
		// 新的一次划词先把旧按钮收掉，检测结果回来前不显示任何东西
		hideButton();

		const selectedText = getSelectedText();
		// 没有选区就什么都不做：点击页面任意位置（左键/右键）都不该打断进行中的
		// 翻译——abort 会立刻回滚 DOM 并断开端口，等于"点一下就白翻了"
		if (selectedText.length === 0) return;

		// 语言检测之前先过一道预筛：纯 URL、纯数字符号、整块代码块翻不出东西，
		// 既不该弹按钮，也不值得为它跑一次 CLD（同步判断，比检测还快）
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;
		const range = selection.getRangeAt(0);
		if (!shouldOfferTranslation(range, selectedText)) return;
		// 翻译进行中照样可以划词（点按钮也不会打断它，只会排队）：旧会话的锚点带
		// user-select:none，划词根本选不进那些正在改写的文本，所以这里不必
		// 再判"选区是否压在旧会话上"

		void isAlreadyTargetLanguage(selectedText).then((alreadyTarget) => {
			// 检测期间选区变了（多半是又快着划了下一段），这次结果直接作废
			if (getSelectedText() !== selectedText) return;

			// 选中的已经是目标语言就不用翻了
			if (alreadyTarget) return;

			showButton(e.clientX + 8, e.clientY + 8);
			onClick(() => {
				const selection = window.getSelection();
				if (!selection || selection.rangeCount === 0) return;
				// 保留 Range，仅清除高亮
				const range = selection.getRangeAt(0);
				selection.removeAllRanges();
				// 点击浮动按钮即视为开始翻译：立即隐藏按钮，避免残留
				hideButton();
				// 忙则排队（不打断正在跑的会话），闲则立即开始
				requestTranslation(range);
			});
		});
	});
}

function handleSelectionChange(): void {
	// 只处理清空：语言判定要调 CLD（异步），留给 mouseup 一次性做，
	// 否则拖动选择时每个 selectionchange 都会发一次检测。
	// 翻译进行中也要收按钮（隐藏按钮不碰锚点），否则划完再点空白按钮会残留
	if (getSelectedText().length === 0) {
		hideButton();
	}
}

function cleanup(): void {
	document.removeEventListener("mousedown", handleMouseDown);
	document.removeEventListener("mouseup", handleMouseUp);
	document.removeEventListener("selectionchange", handleSelectionChange);
	hideButton();
	// 页面要走了：待办一起丢掉，否则 abort 触发的 onEnded 会把队列又拉起来
	queued = null;
	abortCurrent();
}

window.addEventListener("beforeunload", cleanup);

document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("selectionchange", handleSelectionChange);
