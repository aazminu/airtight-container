import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import styles from './Dialog.module.css';

// Replacement for native window.confirm / window.prompt. Two providers
// expose hooks (useConfirm / usePrompt) that return Promise-resolving
// functions; the dialog itself is rendered at the app root via the
// provider, so call sites just `const ok = await confirm({...})`.

// ── confirm ─────────────────────────────────────────────────────────

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in danger tone. Use for destructive
   *  actions (delete, archive, etc). */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | undefined
>(undefined);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = (value: boolean) => {
    if (pending) {
      pending.resolve(value);
      setPending(null);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={pending != null}
        onClose={() => close(false)}
        title={pending?.title ?? 'Confirm'}
        ariaLabel="Confirm dialog"
      >
        {pending && (
          <>
            <div className={styles.message}>{pending.message}</div>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => close(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={pending.danger ? 'danger' : 'primary'}
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

// ── prompt ──────────────────────────────────────────────────────────

export interface PromptOptions {
  title?: string;
  message?: ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional validator. Returns an error message string, or null when valid. */
  validate?: (value: string) => string | null;
}

interface PendingPrompt extends PromptOptions {
  resolve: (value: string | null) => void;
}

const PromptContext = createContext<
  ((options: PromptOptions) => Promise<string | null>) | undefined
>(undefined);

export function usePrompt() {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error('usePrompt must be used inside <PromptProvider>');
  return ctx;
}

export function PromptProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = useCallback(
    (options: PromptOptions): Promise<string | null> => {
      setValue(options.defaultValue ?? '');
      setError(null);
      return new Promise((resolve) => {
        setPending({ ...options, resolve });
      });
    },
    [],
  );

  const close = (val: string | null) => {
    if (pending) {
      pending.resolve(val);
      setPending(null);
    }
  };

  const submit = () => {
    if (!pending) return;
    if (pending.validate) {
      const msg = pending.validate(value);
      if (msg) {
        setError(msg);
        return;
      }
    }
    close(value);
  };

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      <Modal
        open={pending != null}
        onClose={() => close(null)}
        title={pending?.title ?? 'Enter a value'}
        ariaLabel="Prompt dialog"
      >
        {pending && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {pending.message && (
              <div className={styles.message}>{pending.message}</div>
            )}
            {pending.label && (
              <label className={styles.label} htmlFor="prompt-input">
                {pending.label}
              </label>
            )}
            <input
              ref={inputRef}
              id="prompt-input"
              className={styles.input}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder={pending.placeholder}
              autoFocus
            />
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => close(null)}
              >
                {pending.cancelLabel ?? 'Cancel'}
              </Button>
              <Button type="submit" variant="primary">
                {pending.confirmLabel ?? 'OK'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </PromptContext.Provider>
  );
}

// Convenience for nesting both providers + Toast at the app root.
export function DialogStack({ children }: { children: ReactNode }) {
  return useMemo(
    () => (
      <ConfirmProvider>
        <PromptProvider>{children}</PromptProvider>
      </ConfirmProvider>
    ),
    [children],
  );
}
