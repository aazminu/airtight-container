import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  const classes = [styles.badge, styles[tone], className].filter(Boolean).join(' ');
  return <span className={classes}>{children}</span>;
}
