import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ParsedInvoice } from '@ghostpay/invoice-schema';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { changeInvoiceSignerPin, type InvoiceSignerPinsSnapshot } from '../lib/invoiceSignerPins';
import { INVOICE_VERIFICATION_MESSAGES, type InvoiceVerificationStatus } from '../lib/invoiceVerification';
import { Field, Mono, Notice } from './Common';

// i18n-use: pay.signer.confirmRemove pay.signer.confirmSave

interface PinChange {
  readonly label: string;
  readonly expectedSigner: string | null;
  readonly signer: string | null;
  readonly confirmation: string;
  readonly scope: object;
}

export function InvoiceSignerVerification(props: {
  readonly snapshot: InvoiceSignerPinsSnapshot;
  readonly selected: string;
  readonly onSelect: (label: string) => void;
  readonly parsed: ParsedInvoice | undefined;
  readonly status: InvoiceVerificationStatus | undefined;
  readonly scope: object;
  readonly identityScope: object;
  readonly isCurrent: () => boolean;
}): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const heading = useId();
  const [mode, setMode] = useState<'add' | 'replace' | undefined>();
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [pending, setPending] = useState<PinChange | undefined>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = useRef(props); current.current = props;
  const operation = useRef(0);
  const identity = useRef(props.identityScope);
  if (identity.current !== props.identityScope) { identity.current = props.identityScope; operation.current += 1; }
  const mounted = useRef(true);
  const chosen = props.snapshot.pins.find((pin) => pin.label === props.selected);
  useEffect(() => {
    setMode(undefined); setLabel(''); setKey(''); setPending(undefined); setBusy(false); setFailed(false);
  }, [props.scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const confirm = async (): Promise<void> => {
    const change = pending;
    if (change === undefined || busy || change.scope !== current.current.scope || !props.isCurrent()) return;
    const request = ++operation.current;
    setBusy(true); setFailed(false);
    const result = await changeInvoiceSignerPin(change, () => mounted.current && current.current.scope === change.scope && props.isCurrent());
    if (!mounted.current || operation.current !== request || current.current.identityScope !== props.identityScope) return;
    if (result === 'saved' || result === 'removed') {
      setBusy(false);
      setMode(undefined); setKey(''); setLabel(''); setPending(undefined);
      // Removal deliberately leaves the selected identity unavailable. Disabling the requirement is a separate action.
      if (result === 'saved' && current.current.identityScope === props.identityScope && current.current.selected === props.selected) current.current.onSelect(change.label);
    } else if (current.current.scope === change.scope) {
      setBusy(false); setPending(undefined); setFailed(true);
    }
  };

  return <section className="stack" aria-labelledby={heading}>
    <h3 id={heading}>{t('pay.signer.title')}</h3>
    {props.status !== undefined && <div role="status" aria-live="polite">
      <Notice kind={props.status === 'valid-pinned' ? 'ok' : props.status === 'valid-unpinned' || props.status === 'checking' ? 'info' : 'warn'}>
        {t(INVOICE_VERIFICATION_MESSAGES[props.status])}
      </Notice>
    </div>}
    <p className="hint">{t('pay.signer.meaning')}</p>
    {props.parsed !== undefined && <p>{t('pay.signer.invoiceKey')} <Mono>{props.parsed.invoice.signer}</Mono></p>}
    <Field label={t('pay.signer.expected')} hint={t('pay.signer.expectedHint')}>
      {(id, hint) => <select id={id} aria-describedby={hint} value={props.selected} onChange={(event) => { props.onSelect(event.target.value); }}>
        <option value="">{t('pay.signer.none')}</option>
        {props.selected !== '' && chosen === undefined && <option value={props.selected}>{t('pay.signer.unavailableSelection', { label: props.selected })}</option>}
        {props.snapshot.pins.map((pin) => <option value={pin.label} key={pin.label}>{pin.label}</option>)}
      </select>}
    </Field>
    {chosen !== undefined && <p>{t('pay.signer.savedKey')} <Mono>{chosen.signer}</Mono></p>}
    <p className="hint">{t('pay.signer.persistence')}</p>
    {props.snapshot.status === 'unavailable' && <Notice kind="warn">{t('pay.signer.storageUnavailable')}</Notice>}
    {failed && <Notice kind="error">{t('pay.signer.changeFailed')}</Notice>}
    {pending?.scope === props.scope ? <div className="stack">
      <Notice kind="warn" title={t('pay.signer.confirmTitle')}>
        <p>{t('pay.signer.confirmMeaning', { label: pending.label })}</p>
        {pending.expectedSigner !== null && <p>{t('pay.signer.previousKey')} <Mono>{pending.expectedSigner}</Mono></p>}
        {pending.signer !== null && <p>{t('pay.signer.newKey')} <Mono>{pending.signer}</Mono></p>}
        {pending.signer === null && <p>{t('pay.signer.removeMeaning')}</p>}
      </Notice>
      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={() => { void confirm(); }}>{t(pending.signer === null ? 'pay.signer.confirmRemove' : 'pay.signer.confirmSave')}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => { operation.current += 1; setPending(undefined); }}>{t('pay.signer.cancel')}</button>
      </div>
    </div> : mode !== undefined ? <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      if (!props.isCurrent()) return;
      const name = mode === 'replace' ? chosen?.label : label.trim().normalize('NFC');
      if (name === undefined || name === '' || (mode === 'add' && props.snapshot.pins.some((pin) => pin.label === name))) { setFailed(true); return; }
      operation.current += 1;
      setPending({ label: name, expectedSigner: mode === 'replace' ? chosen?.signer ?? null : null, signer: key.trim(), confirmation: key.trim(), scope: props.scope });
    }}>
      {mode === 'add' && <Field label={t('pay.signer.label')}>
        {(id, hint) => <input id={id} aria-describedby={hint} maxLength={128} autoComplete="off" value={label} onChange={(event) => { setLabel(event.target.value); }} required />}
      </Field>}
      <Field label={t('pay.signer.trustedKey')} hint={t('pay.signer.keySource')}>
        {(id, hint) => <input id={id} aria-describedby={hint} dir="ltr" value={key} onChange={(event) => { setKey(event.target.value); }} maxLength={66} pattern="(02|03)[0-9a-f]{64}" autoComplete="off" spellCheck={false} required />}
      </Field>
      <div className="actions">
        <button type="submit" className="btn">{t('pay.signer.reviewChange')}</button>
        <button type="button" className="btn" onClick={() => { operation.current += 1; setMode(undefined); setKey(''); }}>{t('pay.signer.cancel')}</button>
      </div>
    </form> : <div className="actions">
      <button type="button" className="btn" disabled={props.snapshot.status !== 'ready'} onClick={() => { operation.current += 1; setMode('add'); setFailed(false); }}>{t('pay.signer.add')}</button>
      {chosen !== undefined && <>
        <button type="button" className="btn" onClick={() => { operation.current += 1; setMode('replace'); setFailed(false); }}>{t('pay.signer.replace')}</button>
        <button type="button" className="btn" onClick={() => { operation.current += 1; setPending({ label: chosen.label, expectedSigner: chosen.signer, signer: null, confirmation: chosen.signer, scope: props.scope }); }}>{t('pay.signer.remove')}</button>
      </>}
    </div>}
  </section>;
}
