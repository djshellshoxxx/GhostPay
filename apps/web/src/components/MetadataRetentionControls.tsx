import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { readRetentionDelay, RETENTION_POLICIES, RETENTION_REGISTRIES, writeRetentionDelay, type RetentionPreview, type RetentionScope } from '../lib/metadataRetention';
import { Field, Notice } from './Common';

/**
 * Controls name their limited presentation scope; saved financial and recovery records are excluded. `manual` (default
 * true) adds the preview/confirm cleanup, which can only act where the previews are shown; Settings passes false.
 */
export function MetadataRetentionControls({ scope = 'invoice', manual = true }: { readonly scope?: RetentionScope; readonly manual?: boolean } = {}): ReactNode {
  // A changed category never inherits the other category's preference display or confirmation plan.
  return <PresentationRetentionControls key={scope} scope={scope} manual={manual} />;
}

function PresentationRetentionControls({ scope, manual }: { readonly scope: RetentionScope; readonly manual: boolean }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const registry = RETENTION_REGISTRIES[scope];
  const policy = RETENTION_POLICIES[scope];
  const prefix = scope === 'proof' ? 'retention.proof' : 'retention';
  const [delay, setDelay] = useState(() => readRetentionDelay(undefined, scope));
  const [review, setReview] = useState<{ readonly plan: RetentionPreview; readonly revision: number } | undefined>();
  const [message, setMessage] = useState<'saved' | 'storage' | 'cleared' | 'stale' | 'failed' | undefined>();
  const revision = useSyncExternalStore(registry.subscribe, registry.getRevision, registry.getRevision);
  // The confirm and cancel buttons unmount on use; focus returns here instead of falling to the document body.
  const previewButton = useRef<HTMLButtonElement>(null);
  const closeReview = (): void => { setReview(undefined); previewButton.current?.focus(); };
  // Compare captured authority during render; a delayed invalidation effect could erase a newly current plan.
  const preview = review?.revision === revision ? review.plan : undefined;
  useEffect(() => {
    const refresh = (): void => { setDelay(readRetentionDelay(undefined, scope)); setReview(undefined); };
    const onStorage = (event: StorageEvent): void => { if (event.key === policy.key || event.key === null) refresh(); };
    const onReturn = (): void => {
      // A returning tab may not have received the storage event that expiry already accounts for.
      const current = readRetentionDelay(undefined, scope);
      setDelay(current);
      if (current !== delay) setReview(undefined);
    };
    window.addEventListener(policy.event, refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    document.addEventListener('resume', onReturn);
    return () => {
      window.removeEventListener(policy.event, refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
      document.removeEventListener('resume', onReturn);
    };
  }, [delay, policy, scope]);
  return <section className="stack" aria-label={t(`${prefix}.title`)}>
    <Field label={t(`${prefix}.label`)} hint={t(`${prefix}.scope`)}>
      {(id, describedBy) => <select id={id} aria-describedby={describedBy} value={delay} onChange={(event) => {
        const next = Number(event.target.value);
        if (next !== 0 && next !== 300_000 && next !== 900_000 && next !== 3_600_000) return;
        setMessage(writeRetentionDelay(next, undefined, scope) ? 'saved' : 'storage');
      }}>
        <option value={0}>{t('retention.off')}</option>
        <option value={300_000}>{t('retention.minutes5')}</option>
        <option value={900_000}>{t('retention.minutes15')}</option>
        <option value={3_600_000}>{t('retention.hour1')}</option>
      </select>}
    </Field>
    {!manual && <p className="hint">{t('retention.settings.where')}</p>}
    {manual && <button ref={previewButton} type="button" className="btn" onClick={() => {
      setMessage(undefined);
      const plan = registry.preview();
      setReview({ plan, revision: registry.getRevision() });
    }}>{t(`${prefix}.preview`)}</button>}
    {manual && preview !== undefined && <div role="group" aria-label={t(`${prefix}.confirmTitle`)}>
      <p>{t(`${prefix}.count`, { count: preview.count })}</p>
      <p>{t(`${prefix}.preserved`)}</p>
      <button type="button" className="btn" disabled={preview.count === 0} onClick={() => {
        if (review?.revision !== registry.getRevision()) {
          closeReview(); setMessage('stale'); return;
        }
        const result = registry.confirm(preview);
        closeReview();
        setMessage(result.kind === 'stale' ? 'stale' : result.failed > 0 ? 'failed' : 'cleared');
      }}>{t(`${prefix}.confirm`)}</button>
      <button type="button" className="btn" onClick={closeReview}>{t('retention.cancel')}</button>
    </div>}
    {/* Always mounted, so a screen reader announces each outcome when it appears (Notice itself is not live). */}
    <div aria-live="polite">
      {message !== undefined && <Notice kind={message === 'saved' || message === 'cleared' ? 'ok' : 'warn'}>{t(message === 'saved' || message === 'cleared' ? `${prefix}.${message}` : `retention.${message}`)}</Notice>}
    </div>
  </section>;
}

// i18n-use: retention.off retention.minutes5 retention.minutes15 retention.hour1 retention.cancel retention.storage retention.stale retention.failed retention.settings.where retention.title retention.label retention.scope retention.preview retention.confirmTitle retention.count retention.preserved retention.confirm retention.saved retention.cleared retention.proof.title retention.proof.label retention.proof.scope retention.proof.preview retention.proof.confirmTitle retention.proof.count retention.proof.preserved retention.proof.confirm retention.proof.saved retention.proof.cleared
