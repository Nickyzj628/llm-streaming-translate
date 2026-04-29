import type { FC } from 'react';
import styles from './Toast.module.scss';
import type { ToastData } from './useToast';

interface ToastProps {
  toast: ToastData | null;
}

export const Toast: FC<ToastProps> = ({ toast }) => {
  if (!toast) return null;

  return (
    <div
      className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
    >
      {toast.message}
    </div>
  );
};
