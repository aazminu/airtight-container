import { useEffect, useMemo, useState } from 'react';
import { Button, Flow, FlowStep } from '../components/ui';
import {
  SalesDetailsStep,
  type ReleaseOption,
  type SalesIntakeForm,
} from '../components/intake/SalesDetailsStep';
import { SalesReviewStep } from '../components/intake/SalesReviewStep';
import styles from './Intake.module.css';

type Kind = 'sales' | 'sh' | null;
type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const SALES_STEPS = ['Choose', 'Photos', 'Confirm details', 'Container details', 'Review'] as const;
const SH_STEPS = ['Choose', 'Client', 'Rates', 'Review'] as const;

const EMPTY_SALES: SalesIntakeForm = {
  unit_number: '',
  size: '',
  damage: '',
  trucking_company: '',
  release_number_id: null,
  acquisition_price: '',
  notes: '',
};

/**
 * Phase 2 intake. PR 2.1 shipped the skeleton + Flow primitive.
 * PR 2.2 wires the Sales branch end-to-end:
 *  - Step 3 Container details: real form
 *  - Step 4 Review: read-only summary + Submit
 *  - Submit POSTs /api/v1/inventory/add with state='pending' so the
 *    audit screen (PR 2.5) can pick it up.
 *  - Steps 1 (Photos) and 2 (Confirm) remain placeholders for PR 2.6
 *    (S3 + Textract). Users can tap Next through them today.
 *
 * S&H branch remains a placeholder chain until PR 2.4.
 */
export default function Intake() {
  const [kind, setKind] = useState<Kind>(null);
  const [step, setStep] = useState(0);
  const [salesForm, setSalesForm] = useState<SalesIntakeForm>(EMPTY_SALES);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [releaseCache, setReleaseCache] = useState<ReleaseOption[]>([]);

  // Cache the release list once so the Review step can label the picked
  // release by value without re-fetching. SalesDetailsStep also fetches —
  // both share the same network response; the duplicate request on a
  // single intake session is negligible and avoids prop-drilling for now.
  useEffect(() => {
    if (kind !== 'sales' || releaseCache.length > 0) return;
    let cancelled = false;
    fetch('/api/v2/release/numbers', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) setReleaseCache(body.data.releases);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kind, releaseCache.length]);

  const labels = useMemo<readonly string[]>(() => {
    if (kind === 'sh') return SH_STEPS;
    if (kind === 'sales') return SALES_STEPS;
    return ['Choose'];
  }, [kind]);

  const canBack = step > 0 && submitState !== 'submitting';
  const isReviewStep = kind === 'sales' && step === SALES_STEPS.length - 1;
  const isFinalStep = step === labels.length - 1;

  const salesDetailsValid =
    salesForm.unit_number.trim() &&
    salesForm.size.trim() &&
    salesForm.damage.trim() &&
    salesForm.release_number_id !== null;

  // Going forward from the Details step is blocked until the form validates.
  const isSalesDetailsStep = kind === 'sales' && step === 3;
  const canNext =
    !isFinalStep && !(isSalesDetailsStep && !salesDetailsValid) && submitState !== 'submitting';

  const back = () => {
    if (step === 1) setKind(null);
    setStep((s) => Math.max(0, s - 1));
    setSubmitState('idle');
    setSubmitError(null);
  };

  const next = () => setStep((s) => Math.min(labels.length - 1, s + 1));

  const choose = (k: Exclude<Kind, null>) => {
    setKind(k);
    setStep(1);
  };

  const resetForNextBox = () => {
    setSalesForm(EMPTY_SALES);
    setSubmitState('idle');
    setSubmitError(null);
    setKind(null);
    setStep(0);
  };

  const submit = async () => {
    if (kind !== 'sales' || !salesForm.release_number_id) return;
    const release = releaseCache.find(
      (r) => r.release_number_id === salesForm.release_number_id,
    );
    if (!release) {
      setSubmitState('error');
      setSubmitError('Picked release is no longer available — pick another.');
      return;
    }
    setSubmitState('submitting');
    setSubmitError(null);
    try {
      const res = await fetch('/api/v1/inventory/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          container: {
            unit_number: salesForm.unit_number.trim(),
            size: salesForm.size.trim(),
            damage: salesForm.damage.trim(),
            trucking_company: salesForm.trucking_company.trim() || null,
            notes: salesForm.notes.trim() || null,
            acquisition_price: salesForm.acquisition_price || null,
            state: 'pending',
          },
          release: [release],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSubmitState('success');
    } catch (e) {
      setSubmitState('error');
      setSubmitError(e instanceof Error ? e.message : 'Submit failed');
    }
  };

  const pickedReleaseLabel = useMemo(() => {
    if (!salesForm.release_number_id) return undefined;
    const r = releaseCache.find(
      (rel) => rel.release_number_id === salesForm.release_number_id,
    );
    return r?.release_number_value;
  }, [salesForm.release_number_id, releaseCache]);

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
                  body="S3 upload + Textract OCR land in PR 2.6. Tap Next to skip for now."
                />
              </FlowStep>
              <FlowStep>
                <Placeholder
                  title="Confirm OCR'd details"
                  body="The user confirms or corrects fields Textract pulled off the container plate."
                />
              </FlowStep>
              <FlowStep>
                <SalesDetailsStep
                  value={salesForm}
                  onChange={(patch) => setSalesForm((f) => ({ ...f, ...patch }))}
                />
              </FlowStep>
              <FlowStep>
                <SalesReviewStep value={salesForm} releaseLabel={pickedReleaseLabel} />
                {submitError && <div className={styles.errorBox}>{submitError}</div>}
                {submitState === 'success' && (
                  <div className={styles.successBox}>
                    Box logged. An admin will review it before it goes available.
                  </div>
                )}
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

        {isReviewStep ? (
          submitState === 'success' ? (
            <Button variant="primary" onClick={resetForNextBox}>
              Add another box
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={submit}
              disabled={submitState === 'submitting'}
            >
              {submitState === 'submitting' ? 'Submitting…' : 'Submit'}
            </Button>
          )
        ) : (
          <Button
            variant="primary"
            onClick={next}
            disabled={!canNext || (step === 0 && kind === null)}
          >
            Next
          </Button>
        )}
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
