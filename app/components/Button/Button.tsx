import type { Component, JSX } from "solid-js";
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
	const classNames = () =>
		[
			styles.button,
			styles[props.variant ?? "primary"],
			styles[props.size ?? "medium"],
			props.fullWidth && styles.fullWidth,
			props.class,
		]
			.filter(Boolean)
			.join(" ");

	return (
		<button type="button" class={classNames()} {...props}>
			{props.children}
		</button>
	);
};

export default Button;
