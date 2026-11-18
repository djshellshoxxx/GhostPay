import { useEffect, useRef, useState, type ReactNode } from 'react';
import { verifyMerchantProfile, type MerchantProfile } from '@ghostpay/invoice-schema';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { fetchMerchantProfile, readProfileFromSearch, startEmbedHost } from '../lib/embedHost';
import { forgetMerchantKey, MERCHANT_PIN_PREFIX, merchantProfileUrl, readMerchantKey, rememberMerchantKey, type MerchantKey } from '../lib/merchantIdentity';
import { useServices } from '../lib/services';
import { Field, Mono, Notice } from './Common';
import { MerchantTemplateIssuer } from './MerchantTemplateIssuer';
import { merchantTemplateAmount } from '../lib/merchantTemplate';
import { MerchantProfileNotice } from './MerchantProfileNotice';

/** Full-profile presentation only. Never changes invoice fields, signer trust or payment authorization. */
export function MerchantProfilePanel(props: { readonly search: string }): ReactNode {
  const services = useServices();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [url, setUrl] = useState(() => {
    const raw = new URLSearchParams(props.search).get('gpmu') ?? '';
    return raw.length <= 2048 ? raw : '';
  });
  const [profile, setProfile] = useState<MerchantProfile | undefined>(() => readProfileFromSearch(props.search, Math.floor(services.nowMs() / 1000)));
  const [origin, setOrigin] = useState<string | undefined>();
  const [requestedAmount] = useState(() => {
    const raw = new URLSearchParams(props.search).get('gpa');
    // Retain a rejected-request marker rather than silently treating oversized input as no request.
    return raw === null ? undefined : raw.length <= 67 ? raw : '!';
  });
  const [templateId, setTemplateId] = useState(() => new URLSearchParams(props.search).get('gpt') ?? '');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pinFailed, setPinFailed] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pin, setPin] = useState<MerchantKey>({ kind: 'absent' });
  const [confirmation, setConfirmation] = useState('');
  const [forgetConfirmed, setForgetConfirmed] = useState(false);
  const [now, setNow] = useState(() => Math.floor(services.nowMs() / 1000));
  const request = useRef(0);
  const pinRevision = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const expired = profile !== undefined && profile.exp <= now;

  useEffect(() => () => { request.current += 1; controller.current?.abort(); }, []);
  useEffect(() => {
    if (profile === undefined) return;
    const timer = setInterval(() => { setNow(Math.floor(services.nowMs() / 1000)); }, 1000);
    return () => { clearInterval(timer); };
  }, [profile, services]);
  useEffect(() => {
    const session = startEmbedHost(window, expired ? undefined : profile, import.meta.env.VITE_EMBED_IFRAME === '1');
    return () => { session?.close(); };
  }, [profile, expired]);
  useEffect(() => {
    if (origin === undefined) return;
    const refresh = (): void => {
      pinRevision.current += 1;
      setPinBusy(false);
      setPin(readMerchantKey(origin));
      setConfirmation('');
      setForgetConfirmed(false);
    };
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || event.key === `${MERCHANT_PIN_PREFIX}${origin}`) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh); };
  }, [origin]);

  const cancel = (): void => {
    request.current += 1;
    controller.current?.abort();
    controller.current = undefined;
    setLoading(false);
    setPinBusy(false);
  };
  const load = (): void => {
    const normalized = merchantProfileUrl(url);
    cancel();
    setProfile(undefined);
    setOrigin(undefined);
    setConfirmation('');
    setForgetConfirmed(false);
    setPinFailed(false);
    setFailed(false);
    if (normalized === undefined) { setFailed(true); return; }
    const revision = request.current;
    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true);
    void fetchMerchantProfile(normalized, Math.floor(services.nowMs() / 1000), services.fetchFn, nextController.signal).then((loaded) => {
      if (revision !== request.current || nextController.signal.aborted) return;
      controller.current = undefined;
      setLoading(false);
      const current = Math.floor(services.nowMs() / 1000);
      setNow(current);
      // Verify expiry again after the network wait, not only at request start.
      if (loaded === undefined || !verifyMerchantProfile(loaded, current).ok) { setFailed(true); return; }
      setProfile(loaded);
      setOrigin(new URL(normalized).origin);
      setPin(readMerchantKey(new URL(normalized).origin));
    });
  };
  const revokePinConsent = (): void => { pinRevision.current += 1; setPinBusy(false); };
  const pinCurrent = (): void => {
    if (profile === undefined || origin === undefined || pinBusy) return;
    const revision = request.current;
    const consent = pinRevision.current;
    const isCurrent = (): boolean => consent === pinRevision.current && revision === request.current && verifyMerchantProfile(profile, Math.floor(services.nowMs() / 1000)).ok;
    setPinBusy(true);
    void rememberMerchantKey(origin, profile.signer, confirmation, undefined, undefined, isCurrent).then((saved) => {
      if (revision !== request.current || consent !== pinRevision.current) return;
      setPinFailed(!saved);
      setPin(readMerchantKey(origin));
      setConfirmation('');
      setPinBusy(false);
    });
  };
  const forget = (): void => {
    if (!forgetConfirmed || origin === undefined || pin.kind !== 'saved' || pinBusy) return;
    const revision = request.current;
    const consent = pinRevision.current;
    setPinBusy(true);
    void forgetMerchantKey(origin, pin.signer, undefined, undefined, () => consent === pinRevision.current && revision === request.current).then((removed) => {
      if (revision !== request.current || consent !== pinRevision.current) return;
      setPinFailed(!removed);
      setPin(readMerchantKey(origin));
      setForgetConfirmed(false);
      setPinBusy(false);
    });
  };
  const selected = profile?.templates.find((value) => value.id === templateId) ?? (templateId === '' ? profile?.templates[0] : undefined);

  return (
    <details open={profile !== undefined || url !== ''} className="card">
      <summary>{t('merchantProfile.load.title')}</summary>
      <Field label={t('merchantProfile.load.url')} hint={t('merchantProfile.load.privacy')}>
        {(id, describedBy) => <input id={id} aria-describedby={describedBy} type="text" inputMode="url" maxLength={2048} autoComplete="off" spellCheck={false} value={url} onChange={(event) => { cancel(); setUrl(event.target.value); setProfile(undefined); setOrigin(undefined); setFailed(false); }} />}
      </Field>
      <button type="button" className="btn" disabled={loading || url.trim() === ''} onClick={load}>{t(loading ? 'merchantProfile.load.loading' : 'merchantProfile.load.action')}</button>
      {loading && <button type="button" className="btn" onClick={cancel}>{t('merchantProfile.load.cancel')}</button>}
      {failed && <Notice kind="error">{t('merchantProfile.load.failed')}</Notice>}
      {expired && <Notice kind="warn">{t('merchantProfile.expired')}</Notice>}
      {profile !== undefined && !expired && <>
        <MerchantProfileNotice profile={profile} />
        <dl className="details">
          <dt>{t('merchantProfile.signerKey')}</dt><dd><Mono>{profile.signer}</Mono></dd>
          {origin !== undefined && <><dt>{t('merchantProfile.source')}</dt><dd><Mono>{origin}</Mono></dd></>}
        </dl>
        <p>{t('merchantProfile.pin.help')}</p>
        {origin === undefined ? <p>{t('merchantProfile.pin.inline')}</p> : <>
          {pin.kind === 'unavailable' && <Notice kind="warn">{t('merchantProfile.pin.unavailable')}</Notice>}
          {pin.kind === 'saved' && <>
            <Notice kind={pin.signer === profile.signer ? 'info' : 'warn'}>{t(pin.signer === profile.signer ? 'merchantProfile.pin.match' : 'merchantProfile.pin.changed')}</Notice>
            <dl className="details"><dt>{t('merchantProfile.pin.savedKey')}</dt><dd><Mono>{pin.signer}</Mono></dd></dl>
            <label><input type="checkbox" checked={forgetConfirmed} onChange={(event) => { revokePinConsent(); setForgetConfirmed(event.target.checked); }} /> {t('merchantProfile.pin.removeConfirm')}</label>
            <button type="button" className="btn" disabled={!forgetConfirmed || pinBusy} onClick={forget}>{t('merchantProfile.pin.remove')}</button>
          </>}
          {pin.kind === 'absent' && <>
            <Field label={t('merchantProfile.pin.confirm')}>
              {(id) => <input id={id} type="text" maxLength={66} value={confirmation} autoComplete="off" spellCheck={false} onChange={(event) => { revokePinConsent(); setConfirmation(event.target.value); }} />}
            </Field>
            <button type="button" className="btn" disabled={confirmation.trim() !== profile.signer || pinBusy} onClick={pinCurrent}>{t('merchantProfile.pin.action')}</button>
          </>}
          {pinFailed && <Notice kind="error">{t('merchantProfile.pin.failed')}</Notice>}
        </>}
        {profile.templates.length > 0 && <section aria-label={t('merchantProfile.templates.title')}>
          <h2>{t('merchantProfile.templates.title')}</h2>
          <p>{t('merchantProfile.templates.notice')}</p>
          {templateId !== '' && selected === undefined && <Notice kind="warn">{t('merchantProfile.templates.unknown')}</Notice>}
          <Field label={t('merchantProfile.templates.select')}>
            {(id) => <select id={id} value={selected?.id ?? ''} onChange={(event) => { setTemplateId(event.target.value); }}>
              {selected === undefined && <option value="" disabled>{t('merchantProfile.templates.select')}</option>}
              {profile.templates.map((template) => <option key={template.id} value={template.id}>{template.id}</option>)}
            </select>}
          </Field>
          {requestedAmount !== undefined && <Notice kind="warn">
            <p>{t('merchantProfile.issue.request')}</p>
            {merchantTemplateAmount(profile, selected?.id ?? '', requestedAmount) === undefined
              ? <p>{t('merchantProfile.issue.requestRejected')}</p>
              : <p>{t('merchantProfile.issue.amountOverride')}: <Mono>{requestedAmount}</Mono></p>}
          </Notice>}
          {selected !== undefined && <dl className="details">
            <dt>{t('merchantProfile.templates.amount')}</dt><dd><Mono>{selected.amountMinor}</Mono></dd>
            <dt>{t('merchantProfile.templates.currency')}</dt><dd><Mono>{selected.currency}</Mono></dd>
            <dt>{t('merchantProfile.templates.expires')}</dt><dd><Mono>{String(selected.expires)}</Mono></dd>
          </dl>}
          {selected !== undefined && <MerchantTemplateIssuer key={`${profile.sig}:${selected.id}:${requestedAmount ?? ''}`} profile={profile} templateId={selected.id} {...(requestedAmount === undefined ? {} : { requestedAmount })} />}
        </section>}
      </>}
    </details>
  );
}
