import { type Component, type JSX, splitProps } from "solid-js";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "small" | "medium" | "large";

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	fullWidth?: boolean;
	children: JSX.Element;
}

const Button: Component<ButtonProps> = (props) => {
	// 抽出组件自有 props：variant/size/fullWidth/class 参与样式计算，
	// 不抽出来会被 {...rest} 透传到 DOM（class 还会覆盖计算好的样式串），
	// children 由 JSX children 显式渲染。
	const [local, rest] = splitProps(props, [
		"variant",
		"size",
		"fullWidth",
		"class",
		"type",
		"children",
	]);

	const classNames = () =>
		[
			styles.button,
			styles[local.variant ?? "primary"],
			styles[local.size ?? "medium"],
			local.fullWidth && styles.fullWidth,
			local.class,
		]
			.filter(Boolean)
			.join(" ");

	return (
		<button type={local.type ?? "button"} class={classNames()} {...rest}>
			{props.children}
		</button>
	);
};

export default Button;
