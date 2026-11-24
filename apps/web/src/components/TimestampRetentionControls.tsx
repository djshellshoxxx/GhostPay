import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { UserFacingError } from '../lib/errors';
import { usePrivacy } from '../lib/privacyMode';
import type { TimestampCategory, TimestampCleanupPreview } from '@ghostpay/ux-vault/portable';
import { parseRetentionDays, POLICY_CHANGE_EVENT, policyKey, readRetentionDays, saveRetentionDays } from '../lib/timestampRetentionPolicy';
import type { ReconciliationVault } from '../lib/reconciliationVault';

export interface TimestampRetentionControlsProps {
  readonly vault: ReconciliationVault;
  readonly category: TimestampCategory;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly run: (action: (vault: ReconciliationVault, guard: () => void) => Promise<void>) => void;
}

/** Consent is local to this mounted, unlocked scope. Presentation-retention preferences never authorize a write. */
export function TimestampRetentionControls(props: TimestampRetentionControlsProps): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const privacy = usePrivacy();
  const masked = privacy.enabled && privacy.masked;
  const visible = useRef(!masked);
  visible.current = !masked;
  const { category } = props;
  const prefix = category === 'invoice-registration-timestamps' ? 'retention.invoiceTimes' : 'retention.receiptTimes';
  const [days, setDays] = useState(() => readRetentionDays(category));
  const currentDays = useRef(days);
  const [saveFailed, setSaveFailed] = useState(false);
  const descriptionId = useId();
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<TimestampCleanupPreview>();
  const [working, setWorking] = useState(false);
  const [completed, setCompleted] = useState(false);
  const allowed = useRef(false);
  const plan = useRef<TimestampCleanupPreview | undefined>(undefined);
  const revision = useRef(0);
  const mounted = useRef(true);
  const discard = (): void => {
    revision.current++;
    if (plan.current !== undefined) props.vault.cancelTimestampCleanup(plan.current);
    plan.current = undefined;
    setPreview(undefined);
    setCompleted(false);
    setWorking(false);
  };
  useEffect(() => {
    function refresh(): void {
      const next = readRetentionDays(category);
      if (next !== currentDays.current) {
        currentDays.current = next;
        setDays(next);
        discard();
      }
    }
    function onStorage(event: StorageEvent): void {
      if (event.key === null || event.key === policyKey(category)) {
        // A later tab write can already have restored the displayed preference.
        discard();
        refresh();
      }
    }
    refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener(POLICY_CHANGE_EVENT, refresh);
    mounted.current = true;
    allowed.current = false;
    setConsent(false);
    setPreview(undefined);
    setCompleted(false);
    setWorking(false);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(POLICY_CHANGE_EVENT, refresh);
      mounted.current = false;
      allowed.current = false;
      revision.current++;
      if (plan.current !== undefined) props.vault.cancelTimestampCleanup(plan.current);
      plan.current = undefined;
    };
  }, [props.vault, masked, category]);
  const currentGuard = (current: ReconciliationVault, expected: number, guard: () => void): (() => void) => () => {
    guard();
    if (!mounted.current || !visible.current || !allowed.current || days === undefined || days !== readRetentionDays(category) || revision.current !== expected || current !== props.vault)
      throw new UserFacingError({ key: 'ledger.ui.reconciliationActionBecameStale' });
  };
  const run = (action: Parameters<typeof props.run>[0]): void => {
    props.run(async (vault, guard) => {
      setWorking(true);
      try { await action(vault, guard); }
      finally { if (mounted.current) setWorking(false); }
    });
  };
  const requestPreview = (): void => {
    if (saveFailed || !allowed.current || days === undefined || masked || props.disabled || props.busy) return;
    discard();
    const expected = revision.current;
    run(async (current, guard) => {
      const check = currentGuard(current, expected, guard);
      check();
      const next = await current.previewTimestampCleanup(category, days);
      try { check(); } catch (error) { current.cancelTimestampCleanup(next); throw error; }
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
    run(async (current, guard) => {
      const check = currentGuard(current, expected, guard);
      check();
      await current.confirmTimestampCleanup(selected, check);
      // The write committed. Only its presentation can still be revoked.
      try { check(); } catch { return; }
      setCompleted(true);
    });
  };
  return (
    <fieldset className="panel">
      <legend>{t(`${prefix}.title`)}</legend>
      <p id={descriptionId} className="hint">{t(`${prefix}.scope`)}</p>
      <p className="hint">{t(`${prefix}.compatibility`)}</p>
      <label>
        {t('retention.age.label')}{' '}
        <select value={saveFailed ? '' : days ?? ''} disabled={masked || props.disabled} onChange={(event) => {
          discard();
          const next = parseRetentionDays(event.target.value);
          if (next !== undefined) setSaveFailed(!saveRetentionDays(category, next));
        }}>
          {(saveFailed || days === undefined) && <option value="">{t('retention.age.choose')}</option>}
          <option value="0">{t('retention.age.all')}</option>
          <option value="30">{t('retention.age.days', { count: 30 })}</option>
          <option value="90">{t('retention.age.days', { count: 90 })}</option>
        </select>
      </label>
      {saveFailed && <p role="alert">{t('retention.storage')}</p>}
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
        />{' '}{t(`${prefix}.consent`)}
      </label>
      <div className="actions">
        <button type="button" className="btn" disabled={saveFailed || !consent || days === undefined || masked || props.disabled || props.busy} onClick={requestPreview}>
          {t(`${prefix}.preview`)}
        </button>
        {(preview !== undefined || (working && consent)) && (
          <button type="button" className="btn" onClick={discard}>{t('retention.cancel')}</button>
        )}
      </div>
      {preview !== undefined && (
        <div role="group" aria-label={t(`${prefix}.confirmTitle`)}>
          <p>{t(`${prefix}.count`, { count: String(preview.count) })}</p>
          <p>{t(`${prefix}.preserved`)}</p>
          <button type="button" className="btn btn-danger" disabled={masked || props.disabled || props.busy || preview.count === 0} onClick={confirm}>
            {t(`${prefix}.confirm`)}
          </button>
        </div>
      )}
      {completed && <p role="status">{t(`${prefix}.completed`)}</p>}
    </fieldset>
  );
}

// i18n-use: retention.invoiceTimes.title retention.invoiceTimes.scope retention.invoiceTimes.compatibility retention.invoiceTimes.consent retention.invoiceTimes.preview retention.invoiceTimes.confirmTitle retention.invoiceTimes.count retention.invoiceTimes.preserved retention.invoiceTimes.confirm retention.invoiceTimes.completed retention.receiptTimes.title retention.receiptTimes.scope retention.receiptTimes.compatibility retention.receiptTimes.consent retention.receiptTimes.preview retention.receiptTimes.confirmTitle retention.receiptTimes.count retention.receiptTimes.preserved retention.receiptTimes.confirm retention.receiptTimes.completed
