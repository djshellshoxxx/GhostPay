import { useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Invoice } from '@ghostpay/invoice-schema';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
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
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const inv = props.invoice;
  const policy = printQrPolicy(props.link, props.passphraseProtected);
  const memo = inv.memo === undefined ? undefined : safeText(inv.memo).text;
  const subtotal = inv.lineItems.reduce((sum, li) => sum + BigInt(li.quantity) * BigInt(li.unitMinorUnits), 0n);
  const hasLink = props.link !== undefined && props.link.length > 0;
  return (
    <article className="bill-sheet" data-testid="printable-bill" aria-label={t('bill.aria')}>
      <h2>{t('bill.title')}</h2>
      <dl className="details">
        <dt>{t('bill.reference')}</dt>
        <dd dir="ltr"><Mono>{inv.nonce}</Mono></dd>
        <dt>{t('bill.network')}</dt>
        <dd>{props.chainName}</dd>
        <dt>{t('bill.payWith')}</dt>
        <dd>{props.tokenLabel}</dd>
        <dt>{t('pay.sellerFingerprint')}</dt>
        <dd dir="ltr"><Mono>{payeeFingerprint(inv.metaAddress)}</Mono></dd>
        <dt>{t('bill.expires')}</dt>
        <dd>{formatUnix(inv.expiresAt)}</dd>
      </dl>
      {inv.lineItems.length > 0 && (
        <table>
          <caption>{t('pay.lineItems')}</caption>
          <thead>
            <tr><th scope="col">{t('pay.col.description')}</th><th scope="col">{t('pay.col.qty')}</th><th scope="col">{t('pay.col.unit')}</th></tr>
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
            <dt>{t('bill.subtotal')}</dt>
            <dd>{formatFiat(subtotal, inv.fiat.currency)}</dd>
          </>
        )}
        <dt>{t('bill.tax')}</dt>
        <dd>{formatFiat(BigInt(inv.tax.minorUnits), inv.fiat.currency)}</dd>
        {props.fixedAmount === undefined ? (
          <>
            <dt>{t('bill.total')}</dt>
            <dd><strong>{formatFiat(BigInt(inv.fiat.minorUnits), inv.fiat.currency)}</strong></dd>
          </>
        ) : (
          <>
            <dt>{t('bill.fiatStated')}</dt>
            <dd>{formatFiat(BigInt(inv.fiat.minorUnits), inv.fiat.currency)}</dd>
            <dt>{t('bill.amountDue')}</dt>
            <dd><strong>{props.fixedAmount}</strong></dd>
          </>
        )}
      </dl>
      {memo !== undefined && memo !== '' && <p className="bill-memo">{memo}</p>}
      {hasLink && policy.includeQr && props.link !== undefined && (
        <QrFrame kind={policy.kind} text={props.link} caption={t('bill.qrCaption')} />
      )}
      {hasLink && !policy.includeQr && (
        <p className="bill-note">{t('bill.linkTooLong')}</p>
      )}
      {hasLink && props.passphraseProtected && (
        <p className="bill-note">{t('bill.passphraseNote')}</p>
      )}
      {policy.bearerWarning && (
        <p className="bill-warning" data-testid="bearer-warning">{t('bill.bearerWarning')}</p>
      )}
    </article>
  );
}

/**
 * Button that prints the bill sheet (the print stylesheet hides everything else). The sheet is mounted only while
 * printing, so the page does not hold a second copy of the invoice or its link in the DOM.
 */
export function PrintBillButton(props: PrintableBillProps): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
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
        {t('bill.print')}
      </button>
      {printing && <PrintableBill {...props} />}
    </>
  );
}
