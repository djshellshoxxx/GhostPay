/**
 * COPY of the minimal `ChainAdapter` contract from `packages/chain-adapters/src/adapter.ts`
 * (docs/MULTICHAIN_SPEC.md section 1). This package does not import `@ghostpay/chain-adapters`.
 * Member NAMES (`family`, `chainId`, `parseRecipient`, `buildPaymentRequest`, `scan`, `fees`)
 * are identical; `adapter-types.test.ts` pins them against the real interface source.
 *
 * Known structural differences, all because the original is EVM-shaped (see DEVIATIONS.md):
 * - `PaymentRequest` there requires `router`, `feeRecipient`, `build()`; here the request carries
 *   `address` instead.
 * - `DetectedPayment` and `ValidatedInvoice` there are EVM-shaped.
 * - `SecretScalar` / `CompressedPoint` are this package's own branded types.
 */
import type { CompressedPoint, SecretScalar } from './secret.js';

/** Chain families a `ChainAdapter` can serve. */
export type ChainFamily = 'evm' | 'bitcoin' | 'solana';

/** Parsed recipient. For Bitcoin: viewing = `B_scan`, spending = `B_m`. */
export interface RecipientAddress {
  readonly family: ChainFamily;
  /** Canonical string form. */
  readonly canonical: string;
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
}

/** Keys needed to detect payments. For Bitcoin the viewing secret is `b_scan`. */
export interface ViewCapability {
  readonly viewingSecret: SecretScalar;
  readonly spendingPublicKey: CompressedPoint;
  /** Bitcoin only: extra label indices in use (the change label is always scanned). */
  readonly labels?: readonly number[];
}

/** Block range to scan (heights for Bitcoin). */
export interface ScanRange {
  readonly fromBlock: bigint;
  /** Inclusive; defaults to the chain head. */
  readonly toBlock?: bigint;
}

/** Status of a fee line on a chain. */
export type FeeStatus = 'enforced' | 'not_enforceable' | 'not_deployed';

/** Which fees can honestly be charged on this chain. */
export interface FeeCapability {
  readonly checkout: FeeStatus;
  readonly checkoutBps?: number;
  readonly gasSponsorship: FeeStatus;
  readonly flatSecurity: FeeStatus;
}

/** Extra inputs for `buildPaymentRequest`. */
export interface RequestOptions {
  /** Amount in satoshis for invoices without a fixed amount, from a fresh quote. */
  readonly quotedTokenAmount?: bigint;
}

/** Invoice accepted by the adapter (amounts in the chain's smallest unit, 'sats'). */
export interface BitcoinInvoice {
  readonly chainId: string;
  /** Silent payment address (chain-specific HRP). */
  readonly address: string;
  /** Fixed amount; omit for quote-based invoices and pass `quotedTokenAmount`. */
  readonly amountSats?: bigint;
  readonly label?: string;
  readonly message?: string;
}

/** The fields of the original `PaymentRequest` that are chain-neutral. */
export interface PaymentRequestCommon {
  readonly family: ChainFamily;
  readonly chainId: string;
  readonly asset: string;
  readonly grossAmount: bigint;
  readonly netAmount: bigint;
  readonly feeAmount: bigint;
}

/** Payment request: the payer pays `address` from a silent-payments-capable wallet. */
export interface BitcoinPaymentRequest extends PaymentRequestCommon {
  readonly family: 'bitcoin';
  readonly asset: 'native';
  /** Equal to `netAmount`; no protocol fee can be enforced. */
  readonly grossAmount: bigint;
  readonly address: string;
  /** True when the chain's HRP is experimental (testnet use only). */
  readonly experimental: boolean;
}

/** A silent payment output detected by `scan`. */
export interface DetectedBitcoinPayment {
  readonly family: 'bitcoin';
  readonly blockHeight: bigint;
  readonly blockHash: string;
  readonly txid?: string;
  readonly vout?: number;
  readonly amountSats?: bigint;
  /** 32-byte x-only taproot output key. */
  readonly xOnlyPublicKey: Uint8Array;
  readonly k: number;
  readonly label: number | null;
  /** Add `b_spend` to get the spend key; see `spendPrivateKey`. */
  readonly spendTweak: SecretScalar;
}

/** Generic adapter shape, same members as the original `ChainAdapter`. */
export interface ChainAdapterShape<Invoice, Request, Detected> {
  readonly family: ChainFamily;
  readonly chainId: string;
  parseRecipient(input: string): RecipientAddress;
  buildPaymentRequest(inv: Invoice, opts?: RequestOptions): Request;
  scan(range: ScanRange, keys: ViewCapability, signal: AbortSignal): AsyncIterable<Detected>;
  readonly fees: FeeCapability;
}

/** The Bitcoin-family adapter type. */
export type BitcoinChainAdapter = ChainAdapterShape<
  BitcoinInvoice,
  BitcoinPaymentRequest,
  DetectedBitcoinPayment
>;
