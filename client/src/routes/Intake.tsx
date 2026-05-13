import { useContext, useEffect, useMemo, useState } from 'react';
import { Button, Flow, FlowStep } from '../components/ui';
import { userContext } from '../context/restaurantcontext';
import {
  SalesDetailsStep,
  type ReleaseOption,
  type SalesIntakeForm,
} from '../components/intake/SalesDetailsStep';
import { SalesReviewStep } from '../components/intake/SalesReviewStep';
import {
  ShDetailsStep,
  type ClientOption,
  type ShIntakeForm,
} from '../components/intake/ShDetailsStep';
import { ShReviewStep } from '../components/intake/ShReviewStep';
import styles from './Intake.module.css';

type Kind = 'sales' | 'sh' | null;
type SubmitState = 'idle' | 'submitting' | 'error';

const SALES_STEPS = ['Choose', 'Photos', 'Confirm details', 'Container details', 'Review'] as const;
const SH_STEPS = ['Choose', 'Photos', 'Confirm details', 'Storage details', 'Review'] as const;

const EMPTY_SALES: SalesIntakeForm = {
  unit_number: '',
  size: '',
  damage: '',
  trucking_company: '',
  release_number_id: null,
  acquisition_price: '',
  notes: '',
};

const EMPTY_SH: ShIntakeForm = {
  client_id: null,
  unit_number: '',
  size: '',
  damage: '',
  in_fee: '',
  out_fee: '',
  daily_rate: '',
  notes: '',
};

// Phase 2 intake. PR 2.1 shipped the skeleton + Flow primitive; PR 2.2 wired
// Sales end-to-end; PR 2.4 wires the S&H branch (this PR). Photos + Confirm
// remain placeholders on both branches until PR 2.6 (S3 + Textract).
export default function Intake() {
  const { setPopup } = useContext(userContext);
  const [kind, setKind] = useState<Kind>(null);
  const [step, setStep] = useState(0);
  const [salesForm, setSalesForm] = useState<SalesIntakeForm>(EMPTY_SALES);
  const [shForm, setShForm] = useState<ShIntakeForm>(EMPTY_SH);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [releaseCache, setReleaseCache] = useState<ReleaseOption[]>([]);
  const [clientCache, setClientCache] = useState<ClientOption[]>([]);

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

  // Same idea for S&H: cache the client list so Review can label the picked
  // client without re-fetching.
  useEffect(() => {
    if (kind !== 'sh' || clientCache.length > 0) return;
    let cancelled = false;
    fetch('/api/v2/clients', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) setClientCache(body.data.clients);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kind, clientCache.length]);

  const labels = useMemo<readonly string[]>(() => {
    if (kind === 'sh') return SH_STEPS;
    if (kind === 'sales') return SALES_STEPS;
    return ['Choose'];
  }, [kind]);

  const canBack = step > 0 && submitState !== 'submitting';
  const isReviewStep =
    (kind === 'sales' && step === SALES_STEPS.length - 1) ||
    (kind === 'sh' && step === SH_STEPS.length - 1);
  const isFinalStep = step === labels.length - 1;

  const salesDetailsValid =
    salesForm.unit_number.trim() &&
    salesForm.size.trim() &&
    salesForm.damage.trim() &&
    salesForm.release_number_id !== null;

  const shDetailsValid =
    shForm.client_id !== null &&
    shForm.unit_number.trim() &&
    shForm.size.trim() &&
    shForm.in_fee.trim() &&
    shForm.out_fee.trim() &&
    shForm.daily_rate.trim();

  // Going forward from the Details step is blocked until the form validates.
  const isSalesDetailsStep = kind === 'sales' && step === 3;
  const isShDetailsStep = kind === 'sh' && step === 3;
  const canNext =
    !isFinalStep &&
    !(isSalesDetailsStep && !salesDetailsValid) &&
    !(isShDetailsStep && !shDetailsValid) &&
    submitState !== 'submitting';

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
    setShForm(EMPTY_SH);
    setSubmitState('idle');
    setSubmitError(null);
    setKind(null);
    setStep(0);
  };

  const submitSales = async () => {
    if (!salesForm.release_number_id) return;
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
      setPopup('Box logged. An admin will review it before it goes available.');
      resetForNextBox();
    } catch (e) {
      setSubmitState('error');
      setSubmitError(e instanceof Error ? e.message : 'Submit failed');
    }
  };

  const submitSh = async () => {
    if (shForm.client_id === null) return;
    setSubmitState('submitting');
    setSubmitError(null);
    try {
      const res = await fetch('/api/v2/sh-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          box: {
            client_id: shForm.client_id,
            unit_number: shForm.unit_number.trim(),
            size: shForm.size.trim(),
            damage: shForm.damage.trim() || null,
            notes: shForm.notes.trim() || null,
            in_fee: shForm.in_fee,
            out_fee: shForm.out_fee,
            daily_rate: shForm.daily_rate,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPopup('Box logged. An admin will review it before it starts billing.');
      resetForNextBox();
    } catch (e) {
      setSubmitState('error');
      setSubmitError(e instanceof Error ? e.message : 'Submit failed');
    }
  };

  const submit = () => {
    if (kind === 'sales') return submitSales();
    if (kind === 'sh') return submitSh();
  };

  const pickedReleaseLabel = useMemo(() => {
    if (!salesForm.release_number_id) return undefined;
    const r = releaseCache.find(
      (rel) => rel.release_number_id === salesForm.release_number_id,
    );
    return r?.release_number_value;
  }, [salesForm.release_number_id, releaseCache]);

  const pickedClientLabel = useMemo(() => {
    if (shForm.client_id === null) return undefined;
    const c = clientCache.find((cl) => cl.id === shForm.client_id);
    if (!c) return undefined;
    return c.business_name ? `${c.client_name} — ${c.business_name}` : c.client_name;
  }, [shForm.client_id, clientCache]);

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
              </FlowStep>
            </>
          )}

          {kind === 'sh' && (
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
                <ShDetailsStep
                  value={shForm}
                  onChange={(patch) => setShForm((f) => ({ ...f, ...patch }))}
                />
              </FlowStep>
              <FlowStep>
                <ShReviewStep value={shForm} clientLabel={pickedClientLabel} />
                {submitError && <div className={styles.errorBox}>{submitError}</div>}
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
          <Button
            variant="primary"
            onClick={submit}
            disabled={submitState === 'submitting'}
          >
            {submitState === 'submitting' ? 'Submitting…' : 'Submit'}
          </Button>
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
