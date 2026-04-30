import type { FC, InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.scss';

interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

const Checkbox: FC<CheckboxProps> = ({
  label,
  id,
  checked,
  onChange,
  ...props
}) => (
  <label htmlFor={id} className={styles.wrapper}>
    <input
      type="checkbox"
      id={id}
      className={styles.checkbox}
      checked={checked}
      onChange={onChange}
      {...props}
    />
    <span className={styles.text}>{label}</span>
  </label>
);

export default Checkbox;
