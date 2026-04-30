import type { Component, JSX } from 'solid-js';
import styles from './Checkbox.module.scss';

interface CheckboxProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

const Checkbox: Component<CheckboxProps> = (props) => (
  <label for={props.id} class={styles.wrapper}>
    <input
      type="checkbox"
      id={props.id}
      class={styles.checkbox}
      checked={props.checked}
      onChange={props.onChange}
      {...props}
    />
    <span class={styles.text}>{props.label}</span>
  </label>
);

export default Checkbox;
