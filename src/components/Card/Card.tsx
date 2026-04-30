import type { Component, JSX } from 'solid-js';
import { Show } from 'solid-js';
import styles from './Card.module.scss';

interface CardProps {
  title?: string;
  size?: 'default' | 'large';
  children: JSX.Element;
  class?: string;
}

const Card: Component<CardProps> = (props) => {
  const classNames = () =>
    [styles.card, props.size === 'large' && styles.large, props.class]
      .filter(Boolean)
      .join(' ');

  return (
    <div class={classNames()}>
      <Show when={props.title}>
        <div class={styles.header}>
          <span class={styles.title}>{props.title}</span>
        </div>
      </Show>
      {props.children}
    </div>
  );
};

export default Card;
