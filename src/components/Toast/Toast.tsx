import type { FC } from 'react';
import type { ToastData } from '../../hooks/useToast';
import styles from './Toast.module.scss';

interface ToastProps {
  toast: ToastData | null;
}

const Toast: FC<ToastProps> = ({ toast }) => {
  if (!toast) return null;

  return (
    <div
      className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
    >
      {toast.message}
    </div>
  );
};

export default Toast;
