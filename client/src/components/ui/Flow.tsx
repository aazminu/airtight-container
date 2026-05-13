import { Children, Fragment, isValidElement, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Flow.module.css';

export interface FlowProps {
  /** Zero-based index of the active step. */
  step: number;
  /** One child per step — only the active child is rendered. */
  children: ReactNode;
  /** Optional class name for the outer wrapper. */
  className?: string;
}

// Children.toArray flattens nested arrays but does not flatten React.Fragment.
// Callers like Intake wrap conditional step groups in a fragment so React's
// JSX type-checker stays happy; we need a flat per-step array so step indexing
// works through those fragments.
function flattenSteps(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === Fragment) {
      const props = child.props as { children?: ReactNode };
      out.push(...flattenSteps(props.children));
    } else if (child !== null && child !== undefined && child !== false) {
      out.push(child);
    }
  });
  return out;
}

/**
 * Multi-step container with fade-with-shift transitions. Direction is
 * inferred from step-index change; forward steps shift in from the right,
 * back from the left. CSS uses prefers-reduced-motion to disable motion.
 */
export function Flow({ step, children, className }: FlowProps) {
  const childArray = flattenSteps(children);
  const prev = useRef(step);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  useEffect(() => {
    if (step > prev.current) setDirection('forward');
    else if (step < prev.current) setDirection('back');
    prev.current = step;
  }, [step]);

  const current = childArray[step] ?? null;
  const wrapperClass = [styles.flow, className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClass}>
      <div key={step} className={styles.step} data-direction={direction}>
        {current}
      </div>
    </div>
  );
}

/**
 * Thin wrapper for step content. Optional today — `<Flow>` accepts any
 * children — but lets consumers tag steps for clarity and gives a hook
 * for future per-step affordances (titles, dirty-state tracking, etc).
 */
export interface FlowStepProps {
  children: ReactNode;
  className?: string;
}

export function FlowStep({ children, className }: FlowStepProps) {
  const cls = [styles.stepInner, className].filter(Boolean).join(' ');
  return <div className={cls}>{children}</div>;
}
