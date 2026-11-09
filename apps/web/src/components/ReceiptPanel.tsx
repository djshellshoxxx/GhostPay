import { findChain, tokensForChain } from '@ghostpay/chain-adapters';
import { openFragment, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyButton, Field, Notice, downloadText, Mono } from './Common';
import { QrFrame } from './QrFrame';
import { formatUnits } from '../lib/format';
import { useEffectiveProfile, type BuildProfile } from '../lib/buildProfile';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { makeQr } from '../lib/qr';
import { LocalizedTypeError, UserFacingError, userMessage } from '../lib/errors';
import type { Translator } from '../i18n/translator';
import { checkpointKeyId, type ScanMatch } from '../lib/scanClient';
import { createCurrentReconciliationVault } from '../lib/reconciliationVault';
import { captureSessionGuard, getSessionPublic, withSessionSecrets } from '../lib/session';
import { bindReceiptToInvoice, MAX_RECEIPT_INVOICE_BYTES, receiptBindingForInvoice, receiptInvoiceFragment, receiptJson, signReceipt, type ReceiptInvoiceBinding, type SignedReceipt } from '../lib/receipts';

export interface ReceiptPanelProps {
  readonly match: ScanMatch;
  /** Key captured when this scan started; hidden after the active seller keys change. */
  readonly sellerSignerPublicKey: string;
  /** Build profile; defaults to the shell/compile-time profile (lean if either is lean). Lean refuses receipts that are not bound to a validated invoice. */
  readonly profile?: BuildProfile;
}

// openFragment's production KDF has no abort signal. Keep one permit across panels and unmounts until it settles.
let invoiceValidationInFlight = false;

function amountLabel(match: ScanMatch, t: Translator['t']): string {
  const metadata = match.metadata;
  if (metadata === undefined) return t('receipt.amount.unavailable');
  if (metadata.kind === 'native') return `${formatUnits(metadata.netAmount, 18)} ${findChain(match.chainId)?.nativeSymbol ?? t('receipt.amount.native')}`;
  const token = tokensForChain(match.chainId).find((t) => t.address.toLowerCase() === metadata.token.toLowerCase());
  return token === undefined
    ? t('receipt.amount.base', { amount: metadata.netAmount.toString(), token: metadata.token })
    : `${formatUnits(metadata.netAmount, token.decimals)} ${token.symbol}`;
}

/** Creates and displays a local signed attestation from immutable verified scan fields. */
export function ReceiptPanel(props: ReceiptPanelProps): ReactNode {
  const tr = useI18nOptional() ?? SOURCE_TRANSLATOR;
  const trRef = useRef(tr);
  trRef.current = tr;
  const t: Translator['t'] = (key, values) => trRef.current.t(key, values);
  const lean = useEffectiveProfile(props.profile) === 'lean';
  const [invoiceDigest, setInvoiceDigest] = useState('');
  const [receipt, setReceipt] = useState<SignedReceipt | undefined>(undefined);
  const [showReceiptQr, setShowReceiptQr] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [archive, setArchive] = useState<'idle' | 'busy' | 'done'>('idle');
  const [invoiceInput, setInvoiceInput] = useState('');
  const [invoicePassphrase, setInvoicePassphrase] = useState('');
  const [invoiceConsent, setInvoiceConsent] = useState(false);
  const [signConsent, setSignConsent] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [receiptBound, setReceiptBound] = useState(false);
  const [boundInvoice, setBoundInvoice] = useState<{ readonly parsed: ParsedInvoice; readonly binding: ReceiptInvoiceBinding; readonly guard: () => void; readonly identity: string } | undefined>(undefined);
  const invoiceRevision = useRef(0);
  const mounted = useRef(true);
  const generation = useRef(0);
  const match = props.match;
  const txHash = match.announcement.transactionHash;
  const matchIdentity = JSON.stringify([
    match.chainId,
    match.announcement.id,
    txHash ?? null,
    match.stealthAddress,
    match.metadata?.kind ?? null,
    match.metadata?.token ?? null,
    match.metadata?.netAmount.toString() ?? null,
    match.receipt,
    match.viaRouter,
    match.announcement.ephemeralPublicKey,
    match.announcement.metadata,
  ]);
  const currentIdentity = useRef('');
  currentIdentity.current = `${matchIdentity}|${props.sellerSignerPublicKey}`;
  useEffect(() => {
    setInvoiceDigest('');
    setReceipt(undefined);
    setShowReceiptQr(false);
    setError(undefined);
    setArchive('idle');
    setInvoiceInput('');
    setInvoicePassphrase('');
    setInvoiceConsent(false);
    setSignConsent(false);
    setBoundInvoice(undefined);
    setReceiptBound(false);
    invoiceRevision.current++;
    generation.current++;
  }, [matchIdentity, props.sellerSignerPublicKey]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; invoiceRevision.current++; };
  }, []);
  const signerStillCurrent = getSessionPublic()?.signerPublicKey === props.sellerSignerPublicKey;
  const eligible = match.receipt === 'verified' && match.metadata !== undefined && signerStillCurrent;
  const chainName = findChain(match.chainId)?.name ?? t('receipt.chain.unknown', { id: String(match.chainId) });

  const invalidateInvoice = (): void => {
    invoiceRevision.current++;
    setBoundInvoice(undefined);
    setInvoiceDigest('');
    setSignConsent(false);
    setReceipt(undefined);
    setReceiptBound(false);
    setShowReceiptQr(false);
    setError(undefined);
  };

  const loadInvoice = (readText: () => Promise<string>, size?: number): void => {
    setError(undefined);
    if (!eligible || !invoiceConsent) {
      setError(new UserFacingError({ key: 'receipt.error.consent' }));
      return;
    }
    if (invoiceValidationInFlight) {
      setError(new UserFacingError({ key: 'receipt.error.busy' }));
      return;
    }
    let guard: () => void;
    try { guard = captureSessionGuard(); } catch (e) { setError(e ?? new Error()); return; }
    const revision = ++invoiceRevision.current;
    const identity = currentIdentity.current;
    const passphrase = invoicePassphrase;
    invoiceValidationInFlight = true;
    setBoundInvoice(undefined);
    setInvoiceDigest('');
    setSignConsent(false);
    setInvoiceBusy(true);
    setReceipt(undefined);
    setReceiptBound(false);
    setShowReceiptQr(false);
    const current = (): boolean => invoiceRevision.current === revision && currentIdentity.current === identity;
    void (async () => {
      if (size !== undefined && size > MAX_RECEIPT_INVOICE_BYTES) throw new UserFacingError({ key: 'receipt.error.invoiceLarge' });
      const text = await readText();
      if (!current()) return;
      guard();
      const opened = await openFragment(receiptInvoiceFragment(text), passphrase === '' ? {} : { passphrase });
      if (!current()) return;
      guard();
      if (opened.status !== 'ok') throw new UserFacingError({ key: 'receipt.error.passphrase' });
      const session = getSessionPublic();
      if (session === undefined) throw new UserFacingError({ key: 'receipt.error.keysUnavailable' });
      const binding = withSessionSecrets((secrets) => receiptBindingForInvoice(opened.parsed, match, session.signerPublicKey, secrets.keys, Math.floor(Date.now() / 1000)));
      guard();
      if (!current()) return;
      setBoundInvoice({ parsed: opened.parsed, binding, guard, identity });
      setInvoiceDigest(binding.invoiceDigest);
    })().catch((e: unknown) => {
      if (current()) setError(e ?? new Error());
    }).finally(() => {
      invoiceValidationInFlight = false;
      if (mounted.current) {
        setInvoiceBusy(false);
        if (current()) setInvoicePassphrase('');
      }
    });
  };

  const createReceipt = (): void => {
    setError(undefined);
    try {
      if (!eligible || txHash === undefined || match.metadata === undefined) throw new UserFacingError({ key: 'receipt.error.ineligible' });
      if (lean && boundInvoice === undefined) throw new UserFacingError({ key: 'receipt.lean.refused' });
      if (boundInvoice !== undefined) {
        if (!signConsent) throw new UserFacingError({ key: 'receipt.error.signConsent' });
        if (boundInvoice.identity !== currentIdentity.current) throw new UserFacingError({ key: 'receipt.error.scanChanged' });
        boundInvoice.guard();
      }
      const metadata = match.metadata;
      const digest = invoiceDigest.trim().toLowerCase();
      const created = withSessionSecrets((secrets) => {
        const session = getSessionPublic();
        if (session?.signerPublicKey !== props.sellerSignerPublicKey) throw new UserFacingError({ key: 'receipt.error.keysChanged' });
        const binding = boundInvoice === undefined ? undefined : receiptBindingForInvoice(boundInvoice.parsed, match, session.signerPublicKey, secrets.keys, Math.floor(Date.now() / 1000));
        const signed = signReceipt({
          invoiceDigest: binding?.invoiceDigest ?? digest,
          chainId: match.chainId,
          txHash: txHash.toLowerCase(),
          stealthAddress: match.stealthAddress.toLowerCase(),
          asset: metadata.kind === 'native' ? 'native' : metadata.token.toLowerCase(),
          amountMinorUnits: metadata.netAmount.toString(),
          issuedAt: Math.floor(Date.now() / 1000),
        }, secrets.signingKey);
        if (binding !== undefined) bindReceiptToInvoice(signed, binding);
        return signed;
      });
      setReceipt(created);
      setReceiptBound(boundInvoice !== undefined);
      setShowReceiptQr(false);
    } catch (e) {
      setError(e ?? new Error());
    }
  };

  /** Opt-in encrypted archive of a receipt this seller just issued. The archive is never payment evidence. */
  const archiveReceipt = (): void => {
    const session = getSessionPublic();
    if (receipt === undefined || session === undefined || session.signerPublicKey !== receipt.signerPublicKey) {
      setError(new UserFacingError({ key: 'receipt.error.archiveKeys' }));
      return;
    }
    const current = ++generation.current;
    setArchive('busy');
    setError(undefined);
    void (async () => {
      const vault = await createCurrentReconciliationVault(receipt.chainId, checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey));
      try {
        await vault.archiveReceipt(receipt);
      } finally {
        vault.lock();
      }
    })().then(
      () => { if (generation.current === current) setArchive('done'); },
      (e: unknown) => {
        if (generation.current !== current) return;
        setArchive('idle');
        setError(e instanceof UserFacingError || e instanceof LocalizedTypeError ? e : new UserFacingError({ key: 'receipt.error.archiveFailed' }));
      },
    );
  };

  const receiptText = receipt === undefined ? undefined : receiptJson(receipt);
  const showQr = (): void => {
    if (receiptText === undefined) return;
    try {
      // Check the actual payload before rendering/exporting it as a QR. The JSON remains available if it does not fit.
      makeQr(receiptText);
      setShowReceiptQr(true);
      setError(undefined);
    } catch {
      setShowReceiptQr(false);
      setError(new UserFacingError({ key: 'receipt.error.qrLarge' }));
    }
  };

  return (
    <section className="receipt-panel" aria-label={t('receipt.title')}>
      <h4>{t('receipt.title')}</h4>
      <p className="hint">{t('receipt.intro')} {boundInvoice === undefined ? (lean ? t('receipt.lean.hint') : t('receipt.manualHint')) : t('receipt.boundHint')}</p>
      {!signerStillCurrent && <Notice kind="warn">{t('receipt.keysChanged')}</Notice>}
      {match.receipt !== 'verified' && <Notice kind="warn">{t('receipt.verifiedOnly')}</Notice>}
      {match.metadata === undefined && <Notice kind="warn">{t('receipt.metadataMissing')}</Notice>}
      {txHash === undefined ? (
        <>
          <Notice kind="info">{t('receipt.hashMissing')}</Notice>
          <button type="button" className="btn btn-primary" disabled>{t('receipt.sign')}</button>
        </>
      ) : (
        <>
          <dl className="details receipt-facts">
            <dt>{t('receipt.network')}</dt><dd>{t('receipt.chain.named', { name: chainName, id: String(match.chainId) })}</dd>
            <dt>{t('receipt.transaction')}</dt><dd><Mono>{txHash}</Mono></dd>
            <dt>{t('receipt.recipient')}</dt><dd><Mono>{match.stealthAddress}</Mono></dd>
            <dt>{t('receipt.assetAmount')}</dt><dd>{t('receipt.amount.summary', { amount: amountLabel(match, t), units: match.metadata?.netAmount.toString() ?? t('receipt.amount.missing') })}</dd>
          </dl>
          <h5>{t('receipt.bindHeading')}</h5>
          <p className="hint">{t('receipt.bindHint')}</p>
          <Field label={t('receipt.invoiceLink')}>
            {(id) => <textarea id={id} dir="ltr" rows={3} autoComplete="off" value={invoiceInput} onChange={(e) => { invalidateInvoice(); setInvoiceInput(e.target.value); setInvoicePassphrase(''); }} disabled={!eligible} />}
          </Field>
          <Field label={t('receipt.passphrase')}>
            {(id) => <input id={id} type="password" autoComplete="off" value={invoicePassphrase} onChange={(e) => { invalidateInvoice(); setInvoicePassphrase(e.target.value); }} disabled={!eligible} />}
          </Field>
          <label><input type="checkbox" checked={invoiceConsent} onChange={(e) => { invalidateInvoice(); setInvoiceConsent(e.target.checked); }} disabled={!eligible} /> {t('receipt.openConsent')}</label>
          <div className="actions">
            <button type="button" className="btn" disabled={!eligible || !invoiceConsent || invoiceBusy || invoiceInput.trim() === ''} onClick={() => { loadInvoice(() => Promise.resolve(invoiceInput)); }}>{t('receipt.validate')}</button>
            {invoiceBusy && <button type="button" className="btn" onClick={() => { invalidateInvoice(); setInvoicePassphrase(''); }}>{t('receipt.cancel')}</button>}
          </div>
          <Field label={t('receipt.invoiceFile')} hint={t('receipt.invoiceFileHint')}>
            {(id, describedBy) => <input id={id} aria-describedby={describedBy} type="file" accept="text/plain,.txt" disabled={!eligible || !invoiceConsent || invoiceBusy} onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file !== undefined) loadInvoice(() => file.text(), file.size); }} />}
          </Field>
          {boundInvoice === undefined ? (lean ? null : (
            <Field label={t('receipt.manualDigest')} hint={t('receipt.manualDigestHint')}>
              {(id, describedBy) => <input id={id} aria-describedby={describedBy} className="mono" inputMode="text" autoComplete="off" value={invoiceDigest} onChange={(e) => { invalidateInvoice(); setInvoiceDigest(e.target.value); }} disabled={!eligible || receipt !== undefined} placeholder="0x…" />}
            </Field>
          )) : (
            <>
              <Notice kind="ok">{t('receipt.validated')}</Notice>
              <dl className="details"><dt>{t('receipt.validatedDigest')}</dt><dd><Mono>{boundInvoice.binding.invoiceDigest}</Mono></dd><dt>{t('receipt.invoiceSigner')}</dt><dd><Mono>{boundInvoice.binding.invoiceSignerPublicKey}</Mono></dd></dl>
              <label><input type="checkbox" checked={signConsent} onChange={(e) => { setSignConsent(e.target.checked); }} disabled={receipt !== undefined} /> {t('receipt.signConsent')}</label>
              <p><button type="button" className="btn" onClick={() => { invalidateInvoice(); setInvoiceDigest(''); }}>{t('receipt.clearBinding')}</button></p>
            </>
          )}
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={createReceipt} disabled={!eligible || txHash === undefined || receipt !== undefined || invoiceBusy || (boundInvoice !== undefined && !signConsent)}>{t('receipt.sign')}</button>
          </div>
          {error !== undefined && <Notice kind="error">{userMessage(error, t)}</Notice>}
          {receipt !== undefined && (
            <article className="receipt-print">
              <h5>{t('receipt.paymentHeading')}</h5>
              <p className="hint">{t('receipt.attestation')}</p>
              <dl className="details receipt-facts">
                <dt>{t('receipt.network')}</dt><dd>{t('receipt.chain.named', { name: chainName, id: String(receipt.chainId) })}</dd>
                <dt>{t('receipt.transaction')}</dt><dd><Mono>{receipt.txHash}</Mono></dd>
                <dt>{t('receipt.recipient')}</dt><dd><Mono>{receipt.stealthAddress}</Mono></dd>
                <dt>{t('receipt.assetAmount')}</dt><dd>{t('receipt.amount.summary', { amount: amountLabel(match, t), units: receipt.amountMinorUnits })}</dd>
                <dt>{t('receipt.digest')}</dt><dd><Mono>{receipt.invoiceDigest}</Mono> {receiptBound ? t('receipt.matched') : t('receipt.unmatched')}</dd>
                <dt>{t('receipt.issued')}</dt><dd>{new Date(receipt.issuedAt * 1000).toISOString()}</dd>
                <dt>{t('receipt.signerKey')}</dt><dd><Mono>{receipt.signerPublicKey}</Mono></dd>
              </dl>
              <Field label={t('receipt.json')}>{(id) => <textarea id={id} dir="ltr" className="mono receipt-json" readOnly rows={8} value={receiptText ?? ''} onFocus={(e) => { e.currentTarget.select(); }} />}</Field>
              <div className="actions receipt-actions">
                <CopyButton text={receiptText ?? ''} label={t('receipt.copy')} />
                <button type="button" className="btn" onClick={() => { downloadText('ghostpay-receipt.json', receiptText ?? '', 'application/json'); }}>{t('receipt.download')}</button>
                <button type="button" className="btn" onClick={showQr}>{t('receipt.showQr')}</button>
                <button type="button" className="btn" onClick={() => { window.print(); }}>{t('receipt.print')}</button>
                <button type="button" className="btn" onClick={archiveReceipt} disabled={archive !== 'idle'}>
                  {archive === 'done' ? t('receipt.archived') : t('receipt.archive')}
                </button>
              </div>
              <p className="hint">{t('receipt.archiveHint')}</p>
              <p className="hint">{t('receipt.qrHint')}</p>
              {showReceiptQr && receiptText !== undefined && <QrFrame kind="proof" text={receiptText} caption={t('receipt.qrCaption')} />}
            </article>
          )}
        </>
      )}
    </section>
  );
}

// i18n-use: receipt.error.archiveFailed receipt.error.consent receipt.error.busy receipt.error.invoiceLarge receipt.error.passphrase receipt.error.keysUnavailable receipt.error.ineligible receipt.lean.refused receipt.error.signConsent receipt.error.scanChanged receipt.error.keysChanged receipt.error.archiveKeys receipt.error.qrLarge
