import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MAX_PROFILE_BYTES, verifyMerchantProfile, type MerchantProfile } from '@ghostpay/invoice-schema';
import { Field, Mono, Notice, SafeText } from '../../../components/Common';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../../../i18n/context';

type Review =
  | { kind: 'empty' | 'reading' | 'size' | 'invalid' | 'expired' | 'unreadable' }
  | { kind: 'verified'; profile: MerchantProfile };

function reviewTime(nowMs: () => number): number {
  const seconds = Math.floor(nowMs() / 1000);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : NaN;
}

async function readProfile(file: File, nowMs: () => number): Promise<Review> {
  if (file.size > MAX_PROFILE_BYTES) return { kind: 'size' };
  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); } catch { return { kind: 'unreadable' }; }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { return { kind: 'invalid' }; }
  const now = reviewTime(nowMs);
  if (!Number.isFinite(now)) return { kind: 'invalid' };
  const result = verifyMerchantProfile(text, now);
  if (result.ok) return { kind: 'verified', profile: result.profile };
  return { kind: result.reason === 'expired' || result.reason === 'size' ? result.reason : 'invalid' };
}

/** Offline review of the user's chosen v1 file. The comparison has no pin or invoice authority. */
export function OfflineProfileReview({ nowMs }: { readonly nowMs: () => number }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [review, setReview] = useState<Review>({ kind: 'empty' });
  const [expectedKey, setExpectedKey] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  useEffect(() => () => { selection.current += 1; }, []);

  const checkExpiry = useCallback(() => {
    const now = reviewTime(nowMs);
    setReview((current) => {
      if (current.kind !== 'verified') return current;
      if (!Number.isFinite(now)) return { kind: 'invalid' };
      return current.profile.exp <= now ? { kind: 'expired' } : current;
    });
  }, [nowMs]);

  useEffect(() => {
    if (review.kind !== 'verified') return;
    const timer = window.setInterval(checkExpiry, 1000);
    window.addEventListener('focus', checkExpiry);
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkExpiry);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [review.kind, checkExpiry]);

  const open = (file: File | undefined): void => {
    const revision = ++selection.current;
    setReview({ kind: file === undefined ? 'empty' : 'reading' });
    if (file === undefined) {
      setExpectedKey('');
      return;
    }
    void readProfile(file, nowMs).then((result) => {
      if (revision === selection.current) setReview(result);
    });
  };

  const clear = (): void => {
    if (fileInput.current !== null) fileInput.current.value = '';
    open(undefined);
    fileInput.current?.focus();
  };

  let comparison = '';
  if (review.kind === 'verified' && expectedKey !== '') {
    if (!/^0[23][0-9a-f]{64}$/.test(expectedKey)) comparison = t('ghostId.review.fullKey');
    else comparison = expectedKey === review.profile.signer ? t('ghostId.review.match') : t('ghostId.review.conflict');
  }

  return (
    <fieldset>
      <legend>{t('ghostId.review.title')}</legend>
      <Field label={t('ghostId.review.file')} hint={t('ghostId.review.hint')}>
        {(id, describedBy) => <input ref={fileInput} id={id} aria-describedby={describedBy} type="file" accept=".json,application/json"
          onChange={(event) => open(event.currentTarget.files?.[0])} />}
      </Field>
      {review.kind !== 'empty' && <button type="button" className="btn" onClick={clear}>{t('ghostId.review.clear')}</button>}
      {review.kind === 'reading' && <p role="status">{t('ghostId.review.reading')}</p>}
      {review.kind === 'expired' && <Notice kind="error">{t('merchantProfile.expired')}</Notice>}
      {review.kind === 'invalid' && <Notice kind="error">{t('ghostId.review.invalid')}</Notice>}
      {review.kind === 'size' && <Notice kind="error">{t('ghostId.review.size')}</Notice>}
      {review.kind === 'unreadable' && <Notice kind="error">{t('ghostId.review.unreadable')}</Notice>}
      {review.kind === 'verified' && <>
        <p role="status">{t('ghostId.review.authentic')}</p>
        <dl className="details">
          <dt>{t('merchantProfile.name')}</dt><dd><SafeText value={review.profile.name} /></dd>
          <dt>{t('merchantProfile.signerKey')}</dt><dd><Mono>{review.profile.signer}</Mono></dd>
          <dt>{t('ghostId.review.origins')}</dt><dd><Mono>{review.profile.origins.join(', ')}</Mono></dd>
          <dt>{t('ghostId.review.expires')}</dt><dd><time dateTime={new Date(review.profile.exp * 1000).toISOString()}>
            {new Date(review.profile.exp * 1000).toISOString()}</time></dd>
        </dl>
        <Field label={t('merchantProfile.pin.confirm')}>
          {(id) => <input id={id} type="text" autoComplete="off" spellCheck={false} value={expectedKey}
            onChange={(event) => { checkExpiry(); setExpectedKey(event.currentTarget.value); }} />}
        </Field>
        <p role="status">{comparison}</p>
      </>}
    </fieldset>
  );
}
