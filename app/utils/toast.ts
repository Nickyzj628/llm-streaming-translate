/**
 * 跨入口共享的 toast 状态。
 *
 * 为什么从 options 的 hook 里抽出来：报错提示现在有两个消费方——options 页面
 * （配置保存/校验提示）和 content 脚本（翻译失败提示）。原先 useToast 是 Solid
 * hook，content 那份 bundle 里既没有 Solid 渲染根、也不该为一个提示把它拖进来。
 * 这里只用纯 TS 的订阅表，两边各自负责渲染：options 用 createSignal 包一层
 *（hooks/useToast.ts 保持不变），content 用纯 DOM 画进 Shadow DOM。
 *
 * 顺带修掉一个老 bug：useToast 每次调用都建独立的 signal，而 <Toast> 只在
 * App.tsx 里绑了 App 自己那一份，导致 ImportExportPanel 调 showToast 的提示
 * （"设置已保存"）从来没显示过。共享单例后它自然出现。
 */

export interface ToastData {
	message: string;
	/** 错误多留一会儿，用户要读完 */
	type: "success" | "error";
}

type Listener = (toast: ToastData | null) => void;

/** 当前 toast（null = 无） */
let current: ToastData | null = null;
let timerId: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

/** 展示时长：成功 3s，失败 5s（报错信息通常更长） */
const SUCCESS_DURATION = 3000;
const ERROR_DURATION = 5000;

/** 报错文案上限：供应商可能把整段 HTML / 超长 JSON 塞回来 */
const MAX_MESSAGE_LENGTH = 300;

function emit(): void {
	for (const listener of listeners) {
		listener(current);
	}
}

/**
 * 规整要展示的文案：错误信息来自网络（可能是 HTML 页面或 JSON.stringify），
 * 直接铺进 toast 会撑爆布局，所以去标签、压空白、截断。
 */
export function sanitizeToastMessage(message: string): string {
	const flattened = message
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (flattened.length <= MAX_MESSAGE_LENGTH) return flattened;
	return `${flattened.slice(0, MAX_MESSAGE_LENGTH)}…`;
}

export function showToast(message: string, type: ToastData["type"]): void {
	const text = sanitizeToastMessage(message);
	if (text === "") return;

	if (timerId) {
		clearTimeout(timerId);
		timerId = null;
	}
	current = { message: text, type };
	emit();

	const duration = type === "error" ? ERROR_DURATION : SUCCESS_DURATION;
	timerId = setTimeout(() => {
		timerId = null;
		current = null;
		emit();
	}, duration);
}

export function hideToast(): void {
	if (timerId) {
		clearTimeout(timerId);
		timerId = null;
	}
	if (current === null) return;
	current = null;
	emit();
}

/** 订阅 toast 变化（订阅时会立刻收到当前值），返回退订函数 */
export function subscribeToast(listener: Listener): () => void {
	listeners.add(listener);
	listener(current);
	return () => {
		listeners.delete(listener);
	};
}
