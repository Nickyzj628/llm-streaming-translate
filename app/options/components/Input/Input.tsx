import { type Component, type JSX, Show, splitProps } from "solid-js";
import styles from "./Input.module.css";

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
	label?: string;
}

const Input: Component<InputProps> = (props) => {
	// label 渲染成 <label>、class 参与样式拼接，都不能随 {...rest} 透传到
	// <input> 上（label 会变成 input 的非法 DOM 属性，class 会覆盖计算样式）
	const [local, rest] = splitProps(props, ["label", "class", "id"]);

	return (
		<div class={styles.wrapper}>
			<Show when={local.label}>
				<label for={local.id} class={styles.label}>
					{local.label}
				</label>
			</Show>
			<input
				id={local.id}
				class={`${styles.input} ${local.class || ""}`.trim()}
				{...rest}
			/>
		</div>
	);
};

export default Input;
