import styles from './Stepper.module.css';

export interface StepperProps {
  labels: readonly string[];
  /** Zero-based index of the currently-active step. */
  current: number;
  ariaLabel?: string;
}

/**
 * Visual progress indicator for multi-step flows. Mirrors the Intake
 * stepper so users see a consistent shape across /intake and
 * /invoices/create. Numbered dot per step, label below, connecting
 * line behind, active/done states change color.
 */
export function Stepper({ labels, current, ariaLabel }: StepperProps) {
  return (
    <ol className={styles.stepper} aria-label={ariaLabel ?? 'Progress'}>
      {labels.map((label, i) => (
        <li
          key={i}
          className={styles.item}
          data-active={i === current || undefined}
          data-done={i < current || undefined}
        >
          <span className={styles.dot} aria-hidden="true">{i + 1}</span>
          <span className={styles.label}>{label}</span>
        </li>
      ))}
    </ol>
  );
}
