import { findChain, tokensForChain } from '@ghostpay/chain-adapters';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyButton, Field, Notice, downloadText, Mono } from './Common';
import { QrFrame } from './QrFrame';
import { formatUnits } from '../lib/format';
import { makeQr } from '../lib/qr';
import { checkpointKeyId, type ScanMatch } from '../lib/scanClient';
import { createCurrentReconciliationVault } from '../lib/reconciliationVault';
import { getSessionPublic, withSessionSecrets } from '../lib/session';
import { receiptJson, signReceipt, type SignedReceipt } from '../lib/receipts';

export interface ReceiptPanelProps {
  readonly match: ScanMatch;
  /** Key captured when this scan started; hidden after the active seller keys change. */
  readonly sellerSignerPublicKey: string;
}

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
  const [invoiceDigest, setInvoiceDigest] = useState('');
  const [receipt, setReceipt] = useState<SignedReceipt | undefined>(undefined);
  const [showReceiptQr, setShowReceiptQr] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [archive, setArchive] = useState<'idle' | 'busy' | 'done'>('idle');
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
  ]);
  useEffect(() => {
    setInvoiceDigest('');
    setReceipt(undefined);
    setShowReceiptQr(false);
    setError(undefined);
    setArchive('idle');
    generation.current++;
  }, [matchIdentity, props.sellerSignerPublicKey]);
  useEffect(() => () => { generation.current++; }, []);
  const signerStillCurrent = getSessionPublic()?.signerPublicKey === props.sellerSignerPublicKey;
  const eligible = match.receipt === 'verified' && match.metadata !== undefined && signerStillCurrent;
  const chainName = findChain(match.chainId)?.name ?? `Chain ${String(match.chainId)}`;

  const createReceipt = (): void => {
    setError(undefined);
    try {
      if (!eligible || txHash === undefined || match.metadata === undefined) throw new Error('This verified match is no longer eligible for a receipt.');
      const metadata = match.metadata;
      const digest = invoiceDigest.trim().toLowerCase();
      const created = withSessionSecrets((secrets) => {
        if (getSessionPublic()?.signerPublicKey !== props.sellerSignerPublicKey) throw new Error('Seller keys changed. Scan again before signing a receipt.');
        return signReceipt({
          invoiceDigest: digest,
          chainId: match.chainId,
          txHash: txHash.toLowerCase(),
          stealthAddress: match.stealthAddress.toLowerCase(),
          asset: metadata.kind === 'native' ? 'native' : metadata.token.toLowerCase(),
          amountMinorUnits: metadata.netAmount.toString(),
          issuedAt: Math.floor(Date.now() / 1000),
        }, secrets.signingKey);
      });
      setReceipt(created);
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
      <p className="hint">This is a seller-key attestation of the verified scan record. It does not establish seller identity or independently prove a payment. The invoice digest is entered manually and is not matched against invoice contents.</p>
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
          <Field label="Invoice digest (entered manually)" hint="Paste a 0x-prefixed 32-byte invoice digest. This field is the seller’s assertion; no invoice is opened or checked here.">
            {(id, describedBy) => <input id={id} aria-describedby={describedBy} className="mono" inputMode="text" autoComplete="off" value={invoiceDigest} onChange={(e) => { setInvoiceDigest(e.target.value); }} disabled={!eligible || receipt !== undefined} placeholder="0x…" />}
          </Field>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={createReceipt} disabled={!eligible || txHash === undefined || receipt !== undefined}>Sign receipt</button>
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
                <dt>Invoice digest</dt><dd><Mono>{receipt.invoiceDigest}</Mono> (seller-supplied, not matched)</dd>
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
