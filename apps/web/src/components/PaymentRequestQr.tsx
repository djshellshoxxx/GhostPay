import { useId, useState, type ReactNode } from 'react';
import { buildEip681Erc20, buildEip681Native, buildSolanaPay, buildTronUri, type TronNetwork } from '@ghostpay/payment-uri';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { LocalReceipt } from '../lib/payExec';
import { makeQr } from '../lib/qr';
import { kindForPayload } from '../lib/qrKinds';
import { CopyButton, Mono, Notice, downloadText } from './Common';
import { QrFrame } from './QrFrame';

/** One payment request per chain family. Amounts follow each standard: atomic units for EVM, whole units for Solana/TRON. */
export type PaymentRequestSpec =
  | {
      readonly family: 'evm';
      readonly chainId: number;
      readonly recipient: string;
      /** `'native'` or an ERC-20 token address. */
      readonly token: string;
      readonly amountAtomic?: bigint | undefined;
    }
  | {
      readonly family: 'solana';
      readonly recipient: string;
      readonly amount?: string;
      readonly splToken?: string;
      readonly label?: string;
      readonly message?: string;
    }
  | {
      readonly family: 'tron';
      readonly recipient: string;
      readonly amount?: string;
      readonly token?: string;
      readonly network: TronNetwork;
      readonly label?: string;
      readonly message?: string;
    };

/** Builds the per-chain payment URI (EIP-681, Solana Pay, or the GhostPay `tron:` form). Throws `PaymentUriError`. */
export function buildPaymentRequestUri(spec: PaymentRequestSpec): string {
  switch (spec.family) {
    case 'evm':
      return spec.token === 'native'
        ? buildEip681Native({ address: spec.recipient, chainId: spec.chainId, ...(spec.amountAtomic === undefined ? {} : { value: spec.amountAtomic }) })
        : buildEip681Erc20({ token: spec.token, recipient: spec.recipient, chainId: spec.chainId, ...(spec.amountAtomic === undefined ? {} : { amount: spec.amountAtomic }) });
    case 'solana':
      return buildSolanaPay(spec);
    case 'tron':
      return buildTronUri(spec);
  }
}

export interface PaymentRequestQrProps {
  readonly spec: PaymentRequestSpec;
  readonly testnet: boolean;
  readonly title: string;
  readonly note?: string;
}

/** Payment-request QR with a text alternative (the exact URI) and a copy button. Nothing leaves the device. */
export function PaymentRequestQr(props: PaymentRequestQrProps): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  let uri: string;
  try {
    uri = buildPaymentRequestUri(props.spec);
  } catch {
    return <Notice kind="error" title={t('paymentRequest.unavailable.title')}>{t('paymentRequest.unavailable.body')}</Notice>;
  }
  return (
    <div className="payment-request">
      <h4>{props.title}</h4>
      {props.note !== undefined && <p className="hint">{props.note}</p>}
      <QrFrame kind={kindForPayload('payment-request', { testnet: props.testnet })} text={uri} caption={props.title} />
      <p>{t('paymentRequest.textVersion')}</p>
      <p dir="ltr"><Mono><span data-testid="payment-request-text">{uri}</span></Mono></p>
      <CopyButton text={uri} label={t('paymentRequest.copy')} />
    </div>
  );
}

/**
 * Payer-side proof of payment: the local receipt this device built, as a QR and a download. It records what the payer
 * submitted; it is not independent payment proof (only the chain, or a seller-signed receipt, is evidence).
 */
export function PaymentProofQr(props: { readonly receipt: LocalReceipt }): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const textId = useId();
  const text = JSON.stringify(props.receipt, null, 2);
  const compact = JSON.stringify(props.receipt);
  const show = (): void => {
    try {
      makeQr(compact);
      setError(undefined);
      setShown(true);
    } catch {
      setShown(false);
      setError(t('proof.tooLarge'));
    }
  };
  return (
    <section className="payment-proof" aria-label={t('proof.heading')}>
      <h4>{t('proof.heading')}</h4>
      <p className="hint" data-testid="proof-disclaimer">{t('proof.disclaimer')}</p>
      <div className="actions">
        {shown ? (
          <button type="button" className="btn" onClick={() => { setShown(false); }}>{t('proof.hide')}</button>
        ) : (
          <button type="button" className="btn" onClick={show}>{t('proof.show')}</button>
        )}
        <CopyButton text={text} label={t('proof.copy')} />
        <button type="button" className="btn" onClick={() => { downloadText('ghostpay-proof-of-payment.json', text, 'application/json'); }}>{t('proof.download')}</button>
      </div>
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {shown && (
        <>
          <QrFrame kind={kindForPayload('payment-proof', { unverified: props.receipt.status !== 'included' })} text={compact} caption={t('proof.qrCaption')} />
          <label htmlFor={textId}>{t('proof.textLabel')}</label>
          <textarea id={textId} className="mono receipt-json" dir="ltr" readOnly rows={8} value={text} />
        </>
      )}
    </section>
  );
}

export interface PlainPaymentRequestProps {
  readonly family: 'solana' | 'tron';
  /** TRON network the URI names; `undefined` (a local test chain) has no URI form, so no request is offered. */
  readonly tronNetwork?: TronNetwork | undefined;
  readonly testnet: boolean;
  readonly networkLabel: string;
}

/**
 * Optional plain (non-stealth) payment request for the Solana and TRON views. The stealth meta-address cannot be
 * put in a wallet payment URI, so the user supplies an ordinary receive address here.
 */
export function PlainPaymentRequest(props: PlainPaymentRequestProps): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const recipientId = useId();
  const amountId = useId();
  if (props.family === 'tron' && props.tronNetwork === undefined) {
    return <Notice kind="info" title={t('plainRequest.none.title')}>{t('plainRequest.none.body')}</Notice>;
  }
  const to = recipient.trim();
  const amt = amount.trim();
  const spec: PaymentRequestSpec | undefined =
    to === ''
      ? undefined
      : props.family === 'solana'
        ? { family: 'solana', recipient: to, ...(amt === '' ? {} : { amount: amt }) }
        : { family: 'tron', recipient: to, network: props.tronNetwork ?? 'mainnet', ...(amt === '' ? {} : { amount: amt }) };
  return (
    <details className="plain-request">
      <summary>{t('plainRequest.summary')}</summary>
      <p className="hint">{t('plainRequest.hint', { network: props.networkLabel })}</p>
      <div className="field">
        <label htmlFor={recipientId}>{t('plainRequest.recipient')}</label>
        <input id={recipientId} className="mono" dir="ltr" autoComplete="off" spellCheck={false} value={recipient} onChange={(e) => { setRecipient(e.target.value); }} />
      </div>
      <div className="field">
        <label htmlFor={amountId}>{t('plainRequest.amount')}</label>
        <input id={amountId} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => { setAmount(e.target.value); }} />
      </div>
      {spec !== undefined && <PaymentRequestQr spec={spec} testnet={props.testnet} title={t('plainRequest.title', { network: props.networkLabel })} />}
    </details>
  );
}
