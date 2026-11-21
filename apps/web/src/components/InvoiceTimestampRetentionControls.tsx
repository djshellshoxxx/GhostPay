import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { UserFacingError } from '../lib/errors';
import { usePrivacy } from '../lib/privacyMode';
import type { InvoiceTimestampCleanupPreview, ReconciliationVault } from '../lib/reconciliationVault';

export interface InvoiceTimestampRetentionControlsProps {
  readonly vault: ReconciliationVault;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly run: (action: (vault: ReconciliationVault, guard: () => void) => Promise<void>) => void;
}

/** Consent is local to this mounted, unlocked scope. Presentation-retention preferences never authorize a write. */
export function InvoiceTimestampRetentionControls(props: InvoiceTimestampRetentionControlsProps): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const privacy = usePrivacy();
  const masked = privacy.enabled && privacy.masked;
  const visible = useRef(!masked);
  visible.current = !masked;
  const descriptionId = useId();
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<InvoiceTimestampCleanupPreview>();
  const [completed, setCompleted] = useState(false);
  const allowed = useRef(false);
  const plan = useRef<InvoiceTimestampCleanupPreview | undefined>(undefined);
  const revision = useRef(0);
  const mounted = useRef(true);
  const discard = (): void => {
    revision.current++;
    if (plan.current !== undefined) props.vault.cancelInvoiceTimestampCleanup(plan.current);
    plan.current = undefined;
    setPreview(undefined);
    setCompleted(false);
  };
  useEffect(() => {
    mounted.current = true;
    allowed.current = false;
    setConsent(false);
    setPreview(undefined);
    setCompleted(false);
    return () => {
      mounted.current = false;
      allowed.current = false;
      revision.current++;
      if (plan.current !== undefined) props.vault.cancelInvoiceTimestampCleanup(plan.current);
      plan.current = undefined;
    };
  }, [props.vault, masked]);
  const currentGuard = (current: ReconciliationVault, expected: number, guard: () => void): (() => void) => () => {
    guard();
    if (!mounted.current || !visible.current || !allowed.current || revision.current !== expected || current !== props.vault)
      throw new UserFacingError({ key: 'ledger.ui.reconciliationActionBecameStale' });
  };
  const requestPreview = (): void => {
    if (!allowed.current || masked || props.disabled || props.busy) return;
    discard();
    const expected = revision.current;
    props.run(async (current, guard) => {
      const check = currentGuard(current, expected, guard);
      check();
      const next = await current.previewInvoiceTimestampCleanup();
      try { check(); } catch (error) { current.cancelInvoiceTimestampCleanup(next); throw error; }
      plan.current = next;
      setPreview(next);
    });
  };
  const confirm = (): void => {
    const selected = plan.current;
    if (!allowed.current || masked || props.disabled || props.busy || selected === undefined || selected.count === 0) return;
    const expected = revision.current;
    plan.current = undefined;
    setPreview(undefined);
    props.run(async (current, guard) => {
      const check = currentGuard(current, expected, guard);
      check();
      await current.confirmInvoiceTimestampCleanup(selected, check);
      check();
      setCompleted(true);
    });
  };
  return (
    <fieldset className="panel">
      <legend>{t('retention.invoiceTimes.title')}</legend>
      <p id={descriptionId} className="hint">{t('retention.invoiceTimes.scope')}</p>
      <p className="hint">{t('retention.invoiceTimes.compatibility')}</p>
      <label>
        <input
          type="checkbox"
          checked={consent}
          disabled={props.disabled || masked}
          aria-describedby={descriptionId}
          onChange={(event) => {
            discard();
            allowed.current = event.target.checked;
            setConsent(event.target.checked);
          }}
        />{' '}{t('retention.invoiceTimes.consent')}
      </label>
      <div className="actions">
        <button type="button" className="btn" disabled={!consent || masked || props.disabled || props.busy} onClick={requestPreview}>
          {t('retention.invoiceTimes.preview')}
        </button>
        {(preview !== undefined || (props.busy && consent)) && (
          <button type="button" className="btn" onClick={discard}>{t('retention.cancel')}</button>
        )}
      </div>
      {preview !== undefined && (
        <div role="group" aria-label={t('retention.invoiceTimes.confirmTitle')}>
          <p>{t('retention.invoiceTimes.count', { count: String(preview.count) })}</p>
          <p>{t('retention.invoiceTimes.preserved')}</p>
          <button type="button" className="btn btn-danger" disabled={masked || props.disabled || props.busy || preview.count === 0} onClick={confirm}>
            {t('retention.invoiceTimes.confirm')}
          </button>
        </div>
      )}
      {completed && <p role="status">{t('retention.invoiceTimes.completed')}</p>}
    </fieldset>
  );
}
