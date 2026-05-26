import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

type Tone = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastContextValue {
  toast: (message: string, options?: { tone?: Tone; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback<ToastContextValue['toast']>(
    (message, options) => {
      const id = ++idRef.current;
      const tone = options?.tone ?? 'info';
      setItems((prev) => [...prev, { id, message, tone }]);
      const duration = options?.durationMs ?? 4000;
      window.setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, duration);
    },
    []
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ items }: { items: ToastItem[] }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.body);
  }, []);
  if (!container) return null;
  return createPortal(
    <div className={styles.viewport} role="region" aria-label="Notifications">
      {items.map((i) => (
        <div
          key={i.id}
          className={`${styles.toast} ${styles[i.tone]}`}
          role={i.tone === 'error' ? 'alert' : 'status'}
        >
          {i.message}
        </div>
      ))}
    </div>,
    container
  );
}
