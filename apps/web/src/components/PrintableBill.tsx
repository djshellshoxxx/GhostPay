import { useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Invoice } from '@ghostpay/invoice-schema';
import { payeeFingerprint, safeText } from '../lib/displayText';
import { formatFiat, formatUnix } from '../lib/format';
import { printQrPolicy } from '../lib/qrKinds';
import '../styles/print.css';
import { Mono } from './Common';
import { QrFrame } from './QrFrame';

export interface PrintableBillProps {
  readonly invoice: Invoice;
  /** Full invoice link (or fragment). Printed only as a QR, and only when short. */
  readonly link: string | undefined;
  readonly passphraseProtected: boolean;
  readonly chainName: string;
  readonly tokenLabel: string;
  /**
   * Formatted token amount of a `fixed_token` invoice (for example `1000 USDC`; for a token off the allowlist, whose
   * decimals are unknown, its base units and address): printed as the amount due, with the fiat total labelled as the
   * seller's unchecked statement (L2-F4, B2-R3). Omit for a fiat-priced invoice.
   */
  readonly fixedAmount?: string | undefined;
}

/**
 * Invoice print layout. Hidden on screen; the print stylesheet shows only this sheet.
 * A printed link is a bearer link unless it is passphrase protected, so the sheet says so.
 */
export function PrintableBill(props: PrintableBillProps): ReactNode {
  const inv = props.invoice;
  const policy = printQrPolicy(props.link, props.passphraseProtected);
  const memo = inv.memo === undefined ? undefined : safeText(inv.memo).text;
  const subtotal = inv.lineItems.reduce((sum, li) => sum + BigInt(li.quantity) * BigInt(li.unitMinorUnits), 0n);
  const hasLink = props.link !== undefined && props.link.length > 0;
  return (
    <article className="bill-sheet" data-testid="printable-bill" aria-label="Printable bill">
      <h2>Invoice</h2>
      <dl className="details">
        <dt>Reference</dt>
        <dd><Mono>{inv.nonce}</Mono></dd>
        <dt>Network</dt>
        <dd>{props.chainName}</dd>
        <dt>Pay with</dt>
        <dd>{props.tokenLabel}</dd>
        <dt>Seller fingerprint</dt>
        <dd><Mono>{payeeFingerprint(inv.metaAddress)}</Mono></dd>
        <dt>Expires</dt>
        <dd>{formatUnix(inv.expiresAt)}</dd>
      </dl>
      {inv.lineItems.length > 0 && (
        <table>
          <caption>Line items</caption>
          <thead>
            <tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Unit</th></tr>
          </thead>
          <tbody>
            {inv.lineItems.map((li, i) => (
              <tr key={`${String(i)}:${li.description}`}>
                <td>{safeText(li.description).text}</td>
                <td>{li.quantity}</td>
                <td>{formatFiat(BigInt(li.unitMinorUnits), inv.fiat.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <dl className="details bill-totals">
        {inv.lineItems.length > 0 && (
          <>
            <dt>Subtotal</dt>
            <dd>{formatFiat(subtotal, inv.fiat.currency)}</dd>
          </>
        )}
        <dt>Tax</dt>
        <dd>{formatFiat(BigInt(inv.tax.minorUnits), inv.fiat.currency)}</dd>
        {props.fixedAmount === undefined ? (
          <>
            <dt>Total</dt>
            <dd><strong>{formatFiat(BigInt(inv.fiat.minorUnits), inv.fiat.currency)}</strong></dd>
          </>
        ) : (
          <>
            <dt>Seller-stated fiat total (not checked)</dt>
            <dd>{formatFiat(BigInt(inv.fiat.minorUnits), inv.fiat.currency)}</dd>
            <dt>Amount due</dt>
            <dd><strong>{props.fixedAmount}</strong></dd>
          </>
        )}
      </dl>
      {memo !== undefined && memo !== '' && <p className="bill-memo">{memo}</p>}
      {hasLink && policy.includeQr && props.link !== undefined && (
        <QrFrame kind={policy.kind} text={props.link} caption="Scan to open this invoice in GhostPay" />
      )}
      {hasLink && !policy.includeQr && (
        <p className="bill-note">The invoice link is too long to print as a QR code. Share it digitally instead.</p>
      )}
      {hasLink && props.passphraseProtected && (
        <p className="bill-note">This link is passphrase protected. The passphrase is not printed: give it to the payer separately.</p>
      )}
      {policy.bearerWarning && (
        <p className="bill-warning" data-testid="bearer-warning">
          Warning: this printed link is a bearer link. Anyone who sees this paper can read the invoice and open the payment
          page. Keep it private, or create a passphrase-protected link for paper copies.
        </p>
      )}
    </article>
  );
}

/**
 * Button that prints the bill sheet (the print stylesheet hides everything else). The sheet is mounted only while
 * printing, so the page does not hold a second copy of the invoice or its link in the DOM.
 */
export function PrintBillButton(props: PrintableBillProps): ReactNode {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = (): void => { setPrinting(false); };
    window.addEventListener('afterprint', done);
    return () => { window.removeEventListener('afterprint', done); };
  }, [printing]);
  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => {
          flushSync(() => { setPrinting(true); });
          window.print();
        }}
      >
        Print bill
      </button>
      {printing && <PrintableBill {...props} />}
    </>
  );
}
