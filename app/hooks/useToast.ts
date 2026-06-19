import { createSignal, onCleanup } from "solid-js";

export interface ToastData {
	message: string;
	type: "success" | "error";
}

export function useToast(): {
	toast: () => ToastData | null;
	showToast: (message: string, type: "success" | "error") => void;
} {
	const [toast, setToast] = createSignal<ToastData | null>(null);
	let timerId: ReturnType<typeof setTimeout> | null = null;

	const showToast = (message: string, type: "success" | "error"): void => {
		if (timerId) {
			clearTimeout(timerId);
		}
		setToast({ message, type });
		timerId = setTimeout(() => setToast(null), 3000);
	};

	onCleanup(() => {
		if (timerId) {
			clearTimeout(timerId);
		}
	});

	return { toast, showToast };
}
