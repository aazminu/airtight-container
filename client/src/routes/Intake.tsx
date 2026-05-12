import { useMemo, useState } from 'react';
import { Button, Flow, FlowStep } from '../components/ui';
import styles from './Intake.module.css';

type Kind = 'sales' | 'sh' | null;

const SALES_STEPS = ['Choose', 'Photos', 'Confirm details', 'Container details', 'Review'] as const;
const SH_STEPS = ['Choose', 'Client', 'Rates', 'Review'] as const;

/**
 * Phase 2 PR 2.1 — intake flow skeleton. The structural shell only:
 *  - Step 0 picks Sales vs Storage
 *  - Each branch has placeholder steps with Back/Next
 *  - No submit, no upload, no OCR, no S&H DB writes yet
 *
 * Submit logic lands in PR 2.2 (Sales) and PR 2.4 (S&H). S3 photos +
 * Textract OCR in PR 2.6. /add 301s to /intake in PR 2.2.
 */
export default function Intake() {
  const [kind, setKind] = useState<Kind>(null);
  const [step, setStep] = useState(0);

  const labels = useMemo<readonly string[]>(() => {
    if (kind === 'sh') return SH_STEPS;
    if (kind === 'sales') return SALES_STEPS;
    return ['Choose'];
  }, [kind]);

  const canBack = step > 0;
  const canNext = step < labels.length - 1;

  const back = () => {
    if (step === 1) {
      // Going back from the first branch step clears the kind selection
      // so the user can re-pick Sales vs Storage cleanly.
      setKind(null);
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const next = () => setStep((s) => Math.min(labels.length - 1, s + 1));

  const choose = (k: Exclude<Kind, null>) => {
    setKind(k);
    setStep(1);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Add a box</h1>
        <ol className={styles.stepper} aria-label="Intake progress">
          {labels.map((label, i) => (
            <li
              key={`${kind ?? 'none'}-${i}`}
              className={styles.stepperItem}
              data-active={i === step || undefined}
              data-done={i < step || undefined}
            >
              <span className={styles.stepperDot} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.stepperLabel}>{label}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className={styles.body}>
        <Flow step={step}>
          <FlowStep>
            <h2 className={styles.h2}>What kind of box is this?</h2>
            <div className={styles.kindRow}>
              <button
                type="button"
                className={styles.kindCard}
                onClick={() => choose('sales')}
              >
                <span className={styles.kindIcon} aria-hidden="true">📦</span>
                <span className={styles.kindLabel}>Sales</span>
                <span className={styles.kindSub}>
                  Container we buy in and resell. Tracks acquisition price,
                  release number, and final sale.
                </span>
              </button>
              <button
                type="button"
                className={styles.kindCard}
                onClick={() => choose('sh')}
              >
                <span className={styles.kindIcon} aria-hidden="true">🏷️</span>
                <span className={styles.kindLabel}>Storage</span>
                <span className={styles.kindSub}>
                  Customer's container we hold on the yard. Tracks daily
                  rate, in/out fees, and billed month-end.
                </span>
              </button>
            </div>
          </FlowStep>

          {kind === 'sales' && (
            <>
              <FlowStep>
                <Placeholder
                  title="Take photos"
                  body="S3 upload + Textract OCR land in PR 2.6. For now this step is structural only."
                />
              </FlowStep>
              <FlowStep>
                <Placeholder
                  title="Confirm OCR'd details"
                  body="The user confirms or corrects fields Textract pulled off the container plate."
                />
              </FlowStep>
              <FlowStep>
                <Placeholder
                  title="Container details"
                  body="Size, damage, release number, trucking, notes. Real fields land in PR 2.2."
                />
              </FlowStep>
              <FlowStep>
                <Placeholder
                  title="Review and submit"
                  body="Submits as pending_audit=true. PR 2.2 wires this to POST /api/v1/inventory/add."
                />
              </FlowStep>
            </>
          )}

          {kind === 'sh' && (
            <>
              <FlowStep>
                <Placeholder
                  title="Pick a client"
                  body="Client picker with typeahead and 'Add new' shortcut. Pulls from /api/v2/clients."
                />
              </FlowStep>
              <FlowStep>
                <Placeholder
                  title="Confirm rates"
                  body="Pre-fills in_fee / out_fee / daily_rate from client.default_*. Admin override happens in PR 2.5 audit."
                />
              </FlowStep>
              <FlowStep>
                <Placeholder
                  title="Review and submit"
                  body="Submits into sh_inventory with state='pending'. PR 2.4 wires this up."
                />
              </FlowStep>
            </>
          )}
        </Flow>
      </div>

      <footer className={styles.footer}>
        <Button variant="ghost" onClick={back} disabled={!canBack}>
          Back
        </Button>
        <span className={styles.footerHint}>
          {step + 1} of {labels.length}
        </span>
        <Button
          variant="primary"
          onClick={next}
          disabled={!canNext || (step === 0 && kind === null)}
        >
          {step === labels.length - 1 ? 'Submit (coming soon)' : 'Next'}
        </Button>
      </footer>
    </div>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.placeholder}>
      <h2 className={styles.h2}>{title}</h2>
      <p className={styles.placeholderBody}>{body}</p>
    </div>
  );
}
