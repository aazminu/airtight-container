import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './PhotoLightbox.module.css';

interface Props {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

// Lightweight image lightbox. Backdrop click closes, Esc closes, X button
// closes. Image is centered and capped at 90vh/90vw. PR 2.8.1.
export function PhotoLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Prevent background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [src, onClose]);

  if (!src) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={alt ?? 'Photo'}
    >
      <button
        type="button"
        className={styles.closeBtn}
        onClick={onClose}
        aria-label="Close photo"
      >
        ×
      </button>
      <img src={src} alt={alt ?? ''} className={styles.image} />
    </div>,
    document.body,
  );
}
