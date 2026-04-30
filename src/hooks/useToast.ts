import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastData {
  message: string;
  type: 'success' | 'error';
}

export function useToast(): {
  toast: ToastData | null;
  showToast: (message: string, type: 'success' | 'error') => void;
} {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error'): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setToast({ message, type });
      timerRef.current = setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { toast, showToast };
}
