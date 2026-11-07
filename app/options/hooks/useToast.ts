import { createSignal, onCleanup } from "solid-js";
import { showToast, subscribeToast, type ToastData } from "@/utils/toast";

export type { ToastData };

/**
 * options 页面的 toast hook：状态本体已抽到 utils/toast.ts 的共享单例
 * （content 脚本也要用），这里只把它包成 Solid signal。
 *
 * 为什么要订阅而不是直接用共享信号：utils 是纯 TS 模块（不能依赖 Solid，
 * 否则 content 那份 bundle 会被拖进框架运行时），所以 signal 在消费侧建。
 * 订阅时立刻收到当前值，保证热更新/切换页面时不会丢提示。
 */
export function useToast(): {
	toast: () => ToastData | null;
	showToast: (message: string, type: "success" | "error") => void;
} {
	const [toast, setToast] = createSignal<ToastData | null>(null);
	onCleanup(subscribeToast(setToast));

	return { toast, showToast };
}
