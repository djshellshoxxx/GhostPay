import { findChain, tokensForChain } from '@ghostpay/chain-adapters';
import { openFragment, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyButton, Field, Notice, downloadText, Mono } from './Common';
import { QrFrame } from './QrFrame';
import { formatUnits } from '../lib/format';
import { BUILD_PROFILE, type BuildProfile } from '../lib/buildProfile';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { makeQr } from '../lib/qr';
import { checkpointKeyId, type ScanMatch } from '../lib/scanClient';
import { createCurrentReconciliationVault } from '../lib/reconciliationVault';
import { captureSessionGuard, getSessionPublic, withSessionSecrets } from '../lib/session';
import { bindReceiptToInvoice, MAX_RECEIPT_INVOICE_BYTES, receiptBindingForInvoice, receiptInvoiceFragment, receiptJson, signReceipt, type ReceiptInvoiceBinding, type SignedReceipt } from '../lib/receipts';

export interface ReceiptPanelProps {
  readonly match: ScanMatch;
  /** Key captured when this scan started; hidden after the active seller keys change. */
  readonly sellerSignerPublicKey: string;
  /** Build profile; defaults to the compile-time profile. Lean refuses receipts that are not bound to a validated invoice. */
  readonly profile?: BuildProfile;
}

// openFragment's production KDF has no abort signal. Keep one permit across panels and unmounts until it settles.
let invoiceValidationInFlight = false;

function amountLabel(match: ScanMatch): string {
  const metadata = match.metadata;
  if (metadata === undefined) return 'Unavailable';
  if (metadata.kind === 'native') return `${formatUnits(metadata.netAmount, 18)} ${findChain(match.chainId)?.nativeSymbol ?? 'native'}`;
  const token = tokensForChain(match.chainId).find((t) => t.address.toLowerCase() === metadata.token.toLowerCase());
  return token === undefined
    ? `${metadata.netAmount.toString()} base units of ${metadata.token}`
    : `${formatUnits(metadata.netAmount, token.decimals)} ${token.symbol}`;
}

/** Creates and displays a local signed attestation from immutable verified scan fields. */
export function ReceiptPanel(props: ReceiptPanelProps): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const lean = (props.profile ?? BUILD_PROFILE) === 'lean';
  const [invoiceDigest, setInvoiceDigest] = useState('');
  const [receipt, setReceipt] = useState<SignedReceipt | undefined>(undefined);
  const [showReceiptQr, setShowReceiptQr] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
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
  const chainName = findChain(match.chainId)?.name ?? `Chain ${String(match.chainId)}`;

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
      setError('Consent and a current verified payment are required before opening an invoice.');
      return;
    }
    if (invoiceValidationInFlight) {
      setError('Invoice validation is still running. Wait for it to finish before retrying.');
      return;
    }
    let guard: () => void;
    try { guard = captureSessionGuard(); } catch (e) { setError(e instanceof Error ? e.message : 'Seller keys are unavailable.'); return; }
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
      if (size !== undefined && size > MAX_RECEIPT_INVOICE_BYTES) throw new Error('The invoice link is too large.');
      const text = await readText();
      if (!current()) return;
      guard();
      const opened = await openFragment(receiptInvoiceFragment(text), passphrase === '' ? {} : { passphrase });
      if (!current()) return;
      guard();
      if (opened.status !== 'ok') throw new Error('This invoice requires its passphrase. Enter it and validate again.');
      const session = getSessionPublic();
      if (session === undefined) throw new Error('Seller keys are unavailable.');
      const binding = withSessionSecrets((secrets) => receiptBindingForInvoice(opened.parsed, match, session.signerPublicKey, secrets.keys, Math.floor(Date.now() / 1000)));
      guard();
      if (!current()) return;
      setBoundInvoice({ parsed: opened.parsed, binding, guard, identity });
      setInvoiceDigest(binding.invoiceDigest);
    })().catch((e: unknown) => {
      if (current()) setError(e instanceof Error ? e.message : 'The invoice could not be validated.');
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
      if (!eligible || txHash === undefined || match.metadata === undefined) throw new Error('This verified match is no longer eligible for a receipt.');
      if (lean && boundInvoice === undefined) throw new Error(t('receipt.lean.refused'));
      if (boundInvoice !== undefined) {
        if (!signConsent) throw new Error('Consent is required before signing the matched invoice and payment facts.');
        if (boundInvoice.identity !== currentIdentity.current) throw new Error('The scan changed. Validate the invoice again.');
        boundInvoice.guard();
      }
      const metadata = match.metadata;
      const digest = invoiceDigest.trim().toLowerCase();
      const created = withSessionSecrets((secrets) => {
        const session = getSessionPublic();
        if (session?.signerPublicKey !== props.sellerSignerPublicKey) throw new Error('Seller keys changed. Scan again before signing a receipt.');
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
      setError(e instanceof Error ? e.message : 'The receipt could not be signed.');
    }
  };

  /** Opt-in encrypted archive of a receipt this seller just issued. The archive is never payment evidence. */
  const archiveReceipt = (): void => {
    const session = getSessionPublic();
    if (receipt === undefined || session === undefined || session.signerPublicKey !== receipt.signerPublicKey) {
      setError('Seller keys changed. The receipt was not archived.');
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
        setError(e instanceof Error ? e.message : 'The receipt could not be archived.');
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
      setError('This receipt is too large for one QR code. Use the JSON copy or download instead.');
    }
  };

  return (
    <section className="receipt-panel" aria-label="Seller-signed receipt">
      <h4>Seller-signed receipt</h4>
      <p className="hint">This is a seller-key attestation of the verified scan record. It does not establish seller identity or independently prove a payment. {boundInvoice === undefined ? (lean ? t('receipt.lean.hint') : 'The invoice digest is entered manually and is not matched against invoice contents.') : 'The loaded signed invoice and verified scan facts are checked again immediately before signing.'}</p>
      {!signerStillCurrent && <Notice kind="warn">Seller keys changed after this scan. Scan again with the current keys before signing.</Notice>}
      {match.receipt !== 'verified' && <Notice kind="warn">Receipts are available only for verified scan matches.</Notice>}
      {match.metadata === undefined && <Notice kind="warn">The scan metadata is unavailable, so this match cannot be used for a receipt.</Notice>}
      {txHash === undefined ? (
        <>
          <Notice kind="info">The RPC did not provide a transaction hash. A receipt cannot be signed for this match.</Notice>
          <button type="button" className="btn btn-primary" disabled>Sign receipt</button>
        </>
      ) : (
        <>
          <dl className="details receipt-facts">
            <dt>Network</dt><dd>{chainName} (chain {String(match.chainId)})</dd>
            <dt>Transaction</dt><dd><Mono>{txHash}</Mono></dd>
            <dt>Recipient</dt><dd><Mono>{match.stealthAddress}</Mono></dd>
            <dt>Asset and amount</dt><dd>{amountLabel(match)} ({match.metadata?.netAmount.toString() ?? 'unavailable'} base units)</dd>
          </dl>
          <h5>Bind a signed invoice</h5>
          <p className="hint">Open a signed invoice locally to check its signature, seller keys, chain, asset, exact seller amount, recipient and expiry. Links are never followed. Fixed-token invoices only; no verified fiat quote is retained here.</p>
          <Field label="Signed invoice link or fragment">
            {(id) => <textarea id={id} rows={3} autoComplete="off" value={invoiceInput} onChange={(e) => { invalidateInvoice(); setInvoiceInput(e.target.value); setInvoicePassphrase(''); }} disabled={!eligible} />}
          </Field>
          <Field label="Invoice passphrase (if needed)">
            {(id) => <input id={id} type="password" autoComplete="off" value={invoicePassphrase} onChange={(e) => { invalidateInvoice(); setInvoicePassphrase(e.target.value); }} disabled={!eligible} />}
          </Field>
          <label><input type="checkbox" checked={invoiceConsent} onChange={(e) => { invalidateInvoice(); setInvoiceConsent(e.target.checked); }} disabled={!eligible} /> I consent to opening this invoice locally to bind the receipt.</label>
          <div className="actions">
            <button type="button" className="btn" disabled={!eligible || !invoiceConsent || invoiceBusy || invoiceInput.trim() === ''} onClick={() => { loadInvoice(() => Promise.resolve(invoiceInput)); }}>Validate invoice for receipt</button>
            {invoiceBusy && <button type="button" className="btn" onClick={() => { invalidateInvoice(); setInvoicePassphrase(''); }}>Cancel invoice validation</button>}
          </div>
          <Field label="Signed invoice link file" hint="A text file containing the signed invoice link or fragment. The same local validation and byte limit apply.">
            {(id, describedBy) => <input id={id} aria-describedby={describedBy} type="file" accept="text/plain,.txt" disabled={!eligible || !invoiceConsent || invoiceBusy} onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file !== undefined) loadInvoice(() => file.text(), file.size); }} />}
          </Field>
          {boundInvoice === undefined ? (lean ? null : (
            <Field label="Invoice digest (entered manually)" hint="Paste a 0x-prefixed 32-byte invoice digest. This field is the seller’s assertion; no invoice is opened or checked here.">
              {(id, describedBy) => <input id={id} aria-describedby={describedBy} className="mono" inputMode="text" autoComplete="off" value={invoiceDigest} onChange={(e) => { invalidateInvoice(); setInvoiceDigest(e.target.value); }} disabled={!eligible || receipt !== undefined} placeholder="0x…" />}
            </Field>
          )) : (
            <>
              <Notice kind="ok">Validated invoice matches this scan. Its signature proves control of the current seller key, not seller identity or independent payment proof.</Notice>
              <dl className="details"><dt>Validated invoice digest</dt><dd><Mono>{boundInvoice.binding.invoiceDigest}</Mono></dd><dt>Invoice signer</dt><dd><Mono>{boundInvoice.binding.invoiceSignerPublicKey}</Mono></dd></dl>
              <label><input type="checkbox" checked={signConsent} onChange={(e) => { setSignConsent(e.target.checked); }} disabled={receipt !== undefined} /> I consent to signing these invoice and payment facts.</label>
              <p><button type="button" className="btn" onClick={() => { invalidateInvoice(); setInvoiceDigest(''); }}>Clear invoice binding</button></p>
            </>
          )}
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={createReceipt} disabled={!eligible || txHash === undefined || receipt !== undefined || invoiceBusy || (boundInvoice !== undefined && !signConsent)}>Sign receipt</button>
          </div>
          {error !== undefined && <Notice kind="error">{error}</Notice>}
          {receipt !== undefined && (
            <article className="receipt-print">
              <h5>GhostPay payment receipt</h5>
              <p className="hint">Attestation signed by the included public key. This signature proves key control only; it is not a seller identity credential or independent payment proof.</p>
              <dl className="details receipt-facts">
                <dt>Network</dt><dd>{chainName} (chain {String(receipt.chainId)})</dd>
                <dt>Transaction</dt><dd><Mono>{receipt.txHash}</Mono></dd>
                <dt>Recipient</dt><dd><Mono>{receipt.stealthAddress}</Mono></dd>
                <dt>Asset and amount</dt><dd>{amountLabel(match)} ({receipt.amountMinorUnits} base units)</dd>
                <dt>Invoice digest</dt><dd><Mono>{receipt.invoiceDigest}</Mono> {receiptBound ? '(matched to the validated signed invoice)' : '(seller-supplied, not matched)'}</dd>
                <dt>Issued</dt><dd>{new Date(receipt.issuedAt * 1000).toISOString()}</dd>
                <dt>Signer public key</dt><dd><Mono>{receipt.signerPublicKey}</Mono></dd>
              </dl>
              <Field label="Signed receipt JSON">{(id) => <textarea id={id} className="mono receipt-json" readOnly rows={8} value={receiptText ?? ''} onFocus={(e) => { e.currentTarget.select(); }} />}</Field>
              <div className="actions receipt-actions">
                <CopyButton text={receiptText ?? ''} label="Copy receipt JSON" />
                <button type="button" className="btn" onClick={() => { downloadText('ghostpay-receipt.json', receiptText ?? '', 'application/json'); }}>Download JSON</button>
                <button type="button" className="btn" onClick={showQr}>Show receipt QR</button>
                <button type="button" className="btn" onClick={() => { window.print(); }}>Print receipt</button>
                <button type="button" className="btn" onClick={archiveReceipt} disabled={archive !== 'idle'}>
                  {archive === 'done' ? 'Receipt archived' : 'Archive in encrypted vault'}
                </button>
              </div>
              <p className="hint">Archiving stores this receipt encrypted with your viewing key on this device, in the reconciliation vault for this seller and chain. You can export or delete it there. An archived receipt never counts as payment evidence.</p>
              <p className="hint">This QR contains the transaction, recipient, amount and invoice digest. Show it only to the intended recipient; the signature is a seller-key attestation, not independent payment proof.</p>
              {showReceiptQr && receiptText !== undefined && <QrFrame kind="proof" text={receiptText} caption="Signed seller receipt JSON" />}
            </article>
          )}
        </>
      )}
    </section>
  );
}
