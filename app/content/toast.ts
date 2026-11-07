/**
 * content 端的 toast 渲染（纯 DOM，挂进已有 Shadow DOM）。
 *
 * 为什么不复用 options 的 Toast.tsx：那是 Solid 组件 + CSS module，content 是另一份
 * bundle，为一个提示把 Solid 运行时和样式管线拖进来不划算（本文件所在的 content
 * realm 还刻意避免引入框架/custom element，见 index.ts 的 Xray 说明）。
 * 共享的部分是状态（utils/toast.ts 的单例订阅），渲染各管各的。
 *
 * 颜色为什么写死：Shadow DOM 继承不到页面（及 options）的 CSS 变量，反过来页面
 * 同名变量还会污染我们，所以这里不留外部依赖。
 */
import { subscribeToast } from "@/utils/toast";

const STYLE = `
.llm-toast {
	position: fixed;
	top: 20px;
	left: 50%;
	transform: translateX(-50%);
	max-width: min(90vw, 480px);
	box-sizing: border-box;
	padding: 12px 20px;
	border-radius: 10px;
	color: #fff;
	font-size: 14px;
	font-weight: 500;
	line-height: 1.5;
	letter-spacing: -0.01em;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
	z-index: 2147483647;
	overflow-wrap: anywhere;
	animation: llm-toast-in 160ms ease-out;
}
.llm-toast-error {
	background: #ff5b4f;
}
.llm-toast-success {
	background: #0070f3;
}
@keyframes llm-toast-in {
	from { opacity: 0; transform: translate(-50%, -6px); }
	to { opacity: 1; transform: translate(-50%, 0); }
}
`;

let mounted = false;

/**
 * 在给定 Shadow DOM 里挂载 toast 容器并开始订阅共享状态。
 * 重复调用是幂等空操作（content 脚本只该挂一次）。
 */
export function mountToast(parent: ShadowRoot | HTMLElement): void {
	if (mounted) return;
	mounted = true;

	const style = document.createElement("style");
	style.textContent = STYLE;
	parent.appendChild(style);

	// 常驻一层容器：toast 出现/消失只换它的子节点，避免反复创建销毁子树
	const layer = document.createElement("div");
	parent.appendChild(layer);

	subscribeToast((toast) => {
		layer.textContent = "";
		if (toast === null) return;
		const el = document.createElement("div");
		el.className =
			toast.type === "error"
				? "llm-toast llm-toast-error"
				: "llm-toast llm-toast-success";
		el.textContent = toast.message;
		layer.appendChild(el);
	});
}
