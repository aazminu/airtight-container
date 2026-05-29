import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Flow, FlowStep } from '../components/ui';
import { userContext } from '../context/userContext';
import {
  SalesDetailsStep,
  type ReleaseOption,
  type SalesIntakeForm,
} from '../components/intake/SalesDetailsStep';
import { SalesReviewStep } from '../components/intake/SalesReviewStep';
import {
  ShDetailsStep,
  type ShIntakeForm,
} from '../components/intake/ShDetailsStep';
import { ShReviewStep } from '../components/intake/ShReviewStep';
import {
  PhotoStep,
  type IntakePhoto,
} from '../components/intake/PhotoStep';
import { ConfirmStep, type OcrResult } from '../components/intake/ConfirmStep';
import styles from './Intake.module.css';

type Kind = 'sales' | 'sh' | null;
type SubmitState = 'idle' | 'submitting' | 'error';

interface ReleaseMatch {
  release_number_id: number;
  release_number_value: string;
  sale_company_name: string;
}

const SALES_STEPS = [
  'Choose',
  'Door photo',
  'Other photos',
  'Confirm number',
  'Container details',
  'Review',
] as const;
const SH_STEPS = [
  'Choose',
  'Door photo',
  'Other photos',
  'Confirm number',
  'Storage details',
  'Review',
] as const;

const EMPTY_SALES: SalesIntakeForm = {
  unit_number: '',
  size: '',
  damage: '',
  trucking_company: '',
  release_number_id: null,
  notes: '',
};

const EMPTY_SH: ShIntakeForm = {
  unit_number: '',
  size: '',
  damage: '',
  release_number_id: null,
  notes: '',
};

// Phase 2 intake (revised PR 2.8.1).
// Steps:
//   0 Choose                — pick Sales vs Storage
//   1 Door photo            — required-ish (skippable), runs OCR
//   2 Other photos          — optional, any number
//   3 Confirm number        — confirm/edit the OCR'd (or hand-typed) unit number
//   4 Sales/Storage details — the rest of the form (unit_number is read-only here)
//   5 Review                — summary + Submit
// Admin-only fields (acquisition_price for Sales, rates for S&H) moved
// to the audit screen entirely.
export default function Intake() {
  const { t } = useTranslation();
  const { setPopup } = useContext(userContext);
  const [kind, setKind] = useState<Kind>(null);
  const [step, setStep] = useState(0);
  const [salesForm, setSalesForm] = useState<SalesIntakeForm>(EMPTY_SALES);
  const [shForm, setShForm] = useState<ShIntakeForm>(EMPTY_SH);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [releaseCache, setReleaseCache] = useState<ReleaseOption[]>([]);
  // Photo state — doors photo is its own slot; other photos are a free list.
  const [doorPhoto, setDoorPhoto] = useState<IntakePhoto | null>(null);
  const [otherPhotos, setOtherPhotos] = useState<IntakePhoto[]>([]);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  // Auto-match: filled when the typed unit number is pre-loaded under
  // an active release. Drives the locked-release affordance on Details.
  const [releaseMatch, setReleaseMatch] = useState<ReleaseMatch | null>(null);

  // Cache the release list once so Review can label by value without
  // re-fetching. Both sales and S&H now use releases (migration 0021),
  // so the cache is shared across both kinds.
  useEffect(() => {
    if (!kind || releaseCache.length > 0) return;
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

  // Auto-match the typed unit number against pre-loaded release containers.
  // Both intake paths use the same lookup (S&H mirrors sales after
  // migration 0021). Debounced 300 ms so a rapid typer doesn't fire one
  // request per keystroke.
  const activeUnitNumber =
    kind === 'sales'
      ? salesForm.unit_number
      : kind === 'sh'
        ? shForm.unit_number
        : '';
  useEffect(() => {
    if (kind !== 'sales' && kind !== 'sh') return;
    const number = activeUnitNumber.trim().toUpperCase();
    const clearMatch = () => {
      if (releaseMatch) setReleaseMatch(null);
      if (kind === 'sales') {
        setSalesForm((f) =>
          f.release_number_id == null ? f : { ...f, release_number_id: null },
        );
      } else {
        setShForm((f) =>
          f.release_number_id == null ? f : { ...f, release_number_id: null },
        );
      }
    };
    if (number.length < 4) {
      clearMatch();
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v2/release/by-container?number=${encodeURIComponent(number)}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          data: { match: ReleaseMatch | null };
        };
        if (cancelled) return;
        if (body.data.match) {
          setReleaseMatch(body.data.match);
          const matchedId = body.data.match.release_number_id;
          if (kind === 'sales') {
            setSalesForm((f) => ({ ...f, release_number_id: matchedId }));
          } else {
            setShForm((f) => ({ ...f, release_number_id: matchedId }));
          }
        } else {
          clearMatch();
        }
      } catch {
        /* network errors don't block the flow */
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // releaseMatch intentionally omitted from deps: clearMatch reads it
    // via closure and we don't want to retrigger the network call just
    // because we cleared it ourselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, activeUnitNumber]);

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

  const confirmValid = (() => {
    if (kind === 'sales') return salesForm.unit_number.trim().length > 0;
    if (kind === 'sh') return shForm.unit_number.trim().length > 0;
    return true;
  })();

  const salesDetailsValid =
    salesForm.unit_number.trim() &&
    salesForm.size.trim() &&
    salesForm.damage.trim() &&
    salesForm.release_number_id !== null;

  const shDetailsValid =
    shForm.unit_number.trim() &&
    shForm.size.trim() &&
    shForm.release_number_id !== null;

  const isConfirmStep = step === 3 && (kind === 'sales' || kind === 'sh');
  const isSalesDetailsStep = kind === 'sales' && step === 4;
  const isShDetailsStep = kind === 'sh' && step === 4;
  const canNext =
    !isFinalStep &&
    !(isConfirmStep && !confirmValid) &&
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
    if (doorPhoto?.previewUrl) URL.revokeObjectURL(doorPhoto.previewUrl);
    otherPhotos.forEach(
      (p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl),
    );
    setDoorPhoto(null);
    setOtherPhotos([]);
    setOcr(null);
    setReleaseMatch(null);
    setSubmitState('idle');
    setSubmitError(null);
    setKind(null);
    setStep(0);
  };

  // Doors-photo OCR result lands here. Pre-fill the right form's
  // unit_number + size if the field is still empty.
  const handleOcr = (result: OcrResult) => {
    setOcr(result);
    if (result.unit_number) {
      if (kind === 'sales') {
        setSalesForm((f) =>
          f.unit_number.trim()
            ? f
            : { ...f, unit_number: result.unit_number ?? '' },
        );
      } else if (kind === 'sh') {
        setShForm((f) =>
          f.unit_number.trim()
            ? f
            : { ...f, unit_number: result.unit_number ?? '' },
        );
      }
    }
    if (result.size) {
      if (kind === 'sales') {
        setSalesForm((f) => (f.size.trim() ? f : { ...f, size: result.size ?? '' }));
      } else if (kind === 'sh') {
        setShForm((f) => (f.size.trim() ? f : { ...f, size: result.size ?? '' }));
      }
    }
  };

  const photoKeys = [doorPhoto?.key, ...otherPhotos.map((p) => p.key)].filter(
    (k): k is string => !!k,
  );

  const submitSales = async () => {
    if (!salesForm.release_number_id) return;
    const release = releaseCache.find(
      (r) => r.release_number_id === salesForm.release_number_id,
    );
    if (!release) {
      setSubmitState('error');
      setSubmitError(t('intake.release_unavailable'));
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
            state: 'pending',
            photos: photoKeys.length ? photoKeys : undefined,
          },
          release: [release],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPopup(t('intake.logged_sales'));
      resetForNextBox();
    } catch (e) {
      setSubmitState('error');
      setSubmitError(e instanceof Error ? e.message : 'Submit failed');
    }
  };

  const submitSh = async () => {
    if (shForm.release_number_id == null) return;
    setSubmitState('submitting');
    setSubmitError(null);
    try {
      const res = await fetch('/api/v2/sh-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          box: {
            unit_number: shForm.unit_number.trim(),
            size: shForm.size.trim(),
            damage: shForm.damage.trim() || null,
            notes: shForm.notes.trim() || null,
            release_number_id: shForm.release_number_id,
            photos: photoKeys.length ? photoKeys : undefined,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPopup(t('intake.logged_sh'));
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
    return r?.release_number_value ?? releaseMatch?.release_number_value;
  }, [salesForm.release_number_id, releaseCache, releaseMatch]);

  const pickedShReleaseLabel = useMemo(() => {
    if (!shForm.release_number_id) return undefined;
    const r = releaseCache.find(
      (rel) => rel.release_number_id === shForm.release_number_id,
    );
    return r?.release_number_value ?? releaseMatch?.release_number_value;
  }, [shForm.release_number_id, releaseCache, releaseMatch]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('intake.page_title')}</h1>
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
            <h2 className={styles.h2}>{t('intake.kind_heading')}</h2>
            <div className={styles.kindRow}>
              <button
                type="button"
                className={styles.kindCard}
                onClick={() => choose('sales')}
              >
                <span className={styles.kindIcon} aria-hidden="true">📦</span>
                <span className={styles.kindLabel}>{t('intake.kind_sales')}</span>
                <span className={styles.kindSub}>
                  {t('intake.kind_sales_subtitle')}
                </span>
              </button>
              <button
                type="button"
                className={styles.kindCard}
                onClick={() => choose('sh')}
              >
                <span className={styles.kindIcon} aria-hidden="true">🏷️</span>
                <span className={styles.kindLabel}>{t('intake.kind_storage')}</span>
                <span className={styles.kindSub}>
                  {t('intake.kind_storage_subtitle')}
                </span>
              </button>
            </div>
          </FlowStep>

          {(kind === 'sales' || kind === 'sh') && (
            <>
              <FlowStep>
                <PhotoStep
                  kind={kind}
                  mode="doors"
                  photos={doorPhoto ? [doorPhoto] : []}
                  onChange={(arr) => setDoorPhoto(arr[0] ?? null)}
                  onOcr={handleOcr}
                />
              </FlowStep>
              <FlowStep>
                <PhotoStep
                  kind={kind}
                  mode="other"
                  photos={otherPhotos}
                  onChange={setOtherPhotos}
                />
              </FlowStep>
              <FlowStep>
                <ConfirmStep
                  ocr={ocr}
                  unitNumber={
                    kind === 'sales' ? salesForm.unit_number : shForm.unit_number
                  }
                  onChange={(v) =>
                    kind === 'sales'
                      ? setSalesForm((f) => ({ ...f, unit_number: v }))
                      : setShForm((f) => ({ ...f, unit_number: v }))
                  }
                  releaseMatch={
                    kind === 'sales' && releaseMatch
                      ? {
                          release_number_value: releaseMatch.release_number_value,
                          sale_company_name: releaseMatch.sale_company_name,
                        }
                      : null
                  }
                />
              </FlowStep>
            </>
          )}

          {kind === 'sales' && (
            <>
              <FlowStep>
                <SalesDetailsStep
                  value={salesForm}
                  onChange={(patch) => setSalesForm((f) => ({ ...f, ...patch }))}
                  lockedRelease={releaseMatch}
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
                <ShDetailsStep
                  value={shForm}
                  onChange={(patch) => setShForm((f) => ({ ...f, ...patch }))}
                  lockedRelease={releaseMatch}
                />
              </FlowStep>
              <FlowStep>
                <ShReviewStep value={shForm} releaseLabel={pickedShReleaseLabel} />
                {submitError && <div className={styles.errorBox}>{submitError}</div>}
              </FlowStep>
            </>
          )}
        </Flow>
      </div>

      <footer className={styles.footer}>
        <Button variant="ghost" onClick={back} disabled={!canBack}>
          {t('common.back')}
        </Button>
        <span className={styles.footerHint}>
          {t('common.step_of', { step: step + 1, total: labels.length })}
        </span>

        {isReviewStep ? (
          <Button
            variant="primary"
            onClick={submit}
            disabled={submitState === 'submitting'}
          >
            {submitState === 'submitting' ? t('common.submitting') : t('common.submit')}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={next}
            disabled={!canNext || (step === 0 && kind === null)}
          >
            {t('common.next')}
          </Button>
        )}
      </footer>
    </div>
  );
}
