import type { Component } from "solid-js";
import { Show } from "solid-js";
import type { ToastData } from "../../hooks/useToast";
import styles from "./Toast.module.css";

interface ToastProps {
	toast: ToastData | null;
}

const Toast: Component<ToastProps> = (props) => (
	<Show when={props.toast}>
		{(toast) => (
			<div
				class={`${styles.toast} ${toast().type === "success" ? styles.toastSuccess : styles.toastError}`}
			>
				{toast().message}
			</div>
		)}
	</Show>
);

export default Toast;
