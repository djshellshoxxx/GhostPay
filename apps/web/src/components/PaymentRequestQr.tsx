import { useId, useState, type ReactNode } from 'react';
import { buildEip681Erc20, buildEip681Native, buildSolanaPay, buildTronUri, type TronNetwork } from '@ghostpay/payment-uri';
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
  let uri: string;
  try {
    uri = buildPaymentRequestUri(props.spec);
  } catch {
    return <Notice kind="error" title="Payment request unavailable">The payment request cannot be shown because the address or amount is not valid for this chain.</Notice>;
  }
  return (
    <div className="payment-request">
      <h4>{props.title}</h4>
      {props.note !== undefined && <p className="hint">{props.note}</p>}
      <QrFrame kind={kindForPayload('payment-request', { testnet: props.testnet })} text={uri} caption={props.title} />
      <p>Text version of this payment request:</p>
      <p><Mono><span data-testid="payment-request-text">{uri}</span></Mono></p>
      <CopyButton text={uri} label="Copy payment request" />
    </div>
  );
}

/**
 * Payer-side proof of payment: the local receipt this device built, as a QR and a download. It records what the payer
 * submitted; it is not independent payment proof (only the chain, or a seller-signed receipt, is evidence).
 */
export function PaymentProofQr(props: { readonly receipt: LocalReceipt }): ReactNode {
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
      setError('This proof is too large for one QR code. Use the JSON copy or download instead.');
    }
  };
  return (
    <section className="payment-proof" aria-label="Proof of payment">
      <h4>Proof of payment</h4>
      <p className="hint" data-testid="proof-disclaimer">
        This is your own record of what this device submitted. It is not independent proof of payment: it is not signed by the
        seller and can be edited by anyone who holds it. It contains the amount and time, so show it only to the person who needs it.
      </p>
      <div className="actions">
        {shown ? (
          <button type="button" className="btn" onClick={() => { setShown(false); }}>Hide proof QR</button>
        ) : (
          <button type="button" className="btn" onClick={show}>Show proof QR</button>
        )}
        <CopyButton text={text} label="Copy proof JSON" />
        <button type="button" className="btn" onClick={() => { downloadText('ghostpay-proof-of-payment.json', text, 'application/json'); }}>Download proof JSON</button>
      </div>
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {shown && (
        <>
          <QrFrame kind={kindForPayload('payment-proof', { unverified: props.receipt.status !== 'included' })} text={compact} caption="Payer proof of payment (not independent proof)" />
          <label htmlFor={textId}>Proof of payment text</label>
          <textarea id={textId} className="mono receipt-json" readOnly rows={8} value={text} />
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
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const recipientId = useId();
  const amountId = useId();
  if (props.family === 'tron' && props.tronNetwork === undefined) {
    return <Notice kind="info" title="No payment request">This local test chain has no payment-request link format.</Notice>;
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
      <summary>Plain payment request QR (optional)</summary>
      <p className="hint">
        This is a normal wallet payment link to an ordinary address on {props.networkLabel}. It is not a stealth payment: the
        payment is visible on-chain and this app will not find it by scanning.
      </p>
      <div className="field">
        <label htmlFor={recipientId}>Receive address</label>
        <input id={recipientId} className="mono" autoComplete="off" spellCheck={false} value={recipient} onChange={(e) => { setRecipient(e.target.value); }} />
      </div>
      <div className="field">
        <label htmlFor={amountId}>Amount (optional, whole units)</label>
        <input id={amountId} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => { setAmount(e.target.value); }} />
      </div>
      {spec !== undefined && <PaymentRequestQr spec={spec} testnet={props.testnet} title={`${props.networkLabel} payment request`} />}
    </details>
  );
}
