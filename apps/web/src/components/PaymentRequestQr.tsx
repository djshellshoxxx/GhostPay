import type { ReactNode } from 'react';
import { buildEip681Erc20, buildEip681Native, buildSolanaPay, buildTronUri, type TronNetwork } from '@ghostpay/payment-uri';
import { kindForPayload } from '../lib/qrKinds';
import { CopyButton, Mono, Notice } from './Common';
import { QrFrame } from './QrFrame';

/** One payment request per chain family. Amounts follow each standard: atomic units for EVM, whole units for Solana/TRON. */
export type PaymentRequestSpec =
  | {
      readonly family: 'evm';
      readonly chainId: number;
      readonly recipient: string;
      /** `'native'` or an ERC-20 token address. */
      readonly token: string;
      readonly amountAtomic?: bigint;
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
        ? buildEip681Native({ address: spec.recipient, chainId: spec.chainId, value: spec.amountAtomic })
        : buildEip681Erc20({ token: spec.token, recipient: spec.recipient, chainId: spec.chainId, amount: spec.amountAtomic });
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
