import type { ButtonHTMLAttributes } from 'react';
import styles from './IconButton.module.css';

// Square icon-only button. Today only the trash variant is shipped
// (operator's standardized "remove row" affordance); extend the icon
// switch when new ones land.

type IconName = 'trash';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Visual tone. `danger` is the standard for destructive actions. */
  tone?: 'default' | 'danger';
  /** Accessible label — required, since there's no visible text. */
  label: string;
}

function Icon({ name }: { name: IconName }) {
  switch (name) {
    case 'trash':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      );
  }
}

export function IconButton({
  icon,
  tone = 'default',
  label,
  className,
  type = 'button',
  ...rest
}: Props) {
  const cls = [
    styles.btn,
    tone === 'danger' ? styles.danger : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...rest} type={type} className={cls} aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}
