import type { Component, JSX } from "solid-js";
import { Show } from "solid-js";
import styles from "./Input.module.scss";

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
	label?: string;
}

const Input: Component<InputProps> = (props) => (
	<div class={styles.wrapper}>
		<Show when={props.label}>
			<label for={props.id} class={styles.label}>
				{props.label}
			</label>
		</Show>
		<input
			id={props.id}
			class={`${styles.input} ${props.class || ""}`.trim()}
			{...props}
		/>
	</div>
);

export default Input;
