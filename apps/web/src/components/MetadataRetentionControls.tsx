import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { invoicePreviewRetention, readRetentionDelay, RETENTION_EVENT, RETENTION_KEY, writeRetentionDelay, type RetentionPreview } from '../lib/metadataRetention';
import { Field, Notice } from './Common';

/** Controls name their limited presentation scope; saved financial and recovery records are excluded. */
export function MetadataRetentionControls(): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [delay, setDelay] = useState(readRetentionDelay);
  const [review, setReview] = useState<{ readonly plan: RetentionPreview; readonly revision: number } | undefined>();
  const [message, setMessage] = useState<'saved' | 'storage' | 'cleared' | 'stale' | 'failed' | undefined>();
  const revision = useSyncExternalStore(invoicePreviewRetention.subscribe, invoicePreviewRetention.getRevision, invoicePreviewRetention.getRevision);
  // Compare captured authority during render; a delayed invalidation effect could erase a newly current plan.
  const preview = review?.revision === revision ? review.plan : undefined;
  useEffect(() => {
    const refresh = (): void => { setDelay(readRetentionDelay()); setReview(undefined); };
    const onStorage = (event: StorageEvent): void => { if (event.key === RETENTION_KEY || event.key === null) refresh(); };
    window.addEventListener(RETENTION_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(RETENTION_EVENT, refresh); window.removeEventListener('storage', onStorage); };
  }, []);
  return <section className="stack" aria-label={t('retention.title')}>
    <Field label={t('retention.label')} hint={t('retention.scope')}>
      {(id, describedBy) => <select id={id} aria-describedby={describedBy} value={delay} onChange={(event) => {
        const next = Number(event.target.value);
        if (next !== 0 && next !== 300_000 && next !== 900_000 && next !== 3_600_000) return;
        setMessage(writeRetentionDelay(next) ? 'saved' : 'storage');
      }}>
        <option value={0}>{t('retention.off')}</option>
        <option value={300_000}>{t('retention.minutes5')}</option>
        <option value={900_000}>{t('retention.minutes15')}</option>
        <option value={3_600_000}>{t('retention.hour1')}</option>
      </select>}
    </Field>
    <button type="button" className="btn" onClick={() => {
      setMessage(undefined);
      const plan = invoicePreviewRetention.preview();
      setReview({ plan, revision: invoicePreviewRetention.getRevision() });
    }}>{t('retention.preview')}</button>
    {preview !== undefined && <div role="group" aria-label={t('retention.confirmTitle')}>
      <p>{t('retention.count', { count: preview.count })}</p>
      <p>{t('retention.preserved')}</p>
      <button type="button" className="btn" disabled={preview.count === 0} onClick={() => {
        if (review?.revision !== invoicePreviewRetention.getRevision()) {
          setReview(undefined); setMessage('stale'); return;
        }
        const result = invoicePreviewRetention.confirm(preview);
        setReview(undefined);
        setMessage(result.kind === 'stale' ? 'stale' : result.failed > 0 ? 'failed' : 'cleared');
      }}>{t('retention.confirm')}</button>
      <button type="button" className="btn" onClick={() => { setReview(undefined); }}>{t('retention.cancel')}</button>
    </div>}
    {message !== undefined && <Notice kind={message === 'saved' || message === 'cleared' ? 'ok' : 'warn'}>{t(`retention.${message}`)}</Notice>}
  </section>;
}
