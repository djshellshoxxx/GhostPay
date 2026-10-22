/**
 * COPY of the minimal `ChainAdapter` contract from `packages/chain-adapters/src/adapter.ts`
 * (docs/MULTICHAIN_SPEC.md section 1), following the same pattern as
 * `packages/btc-silent-payments/src/adapter-types.ts`.
 *
 * This package does not import `@ghostpay/chain-adapters` (the original is EVM-shaped and would
 * become a circular dependency once chain-adapters registers this adapter). Member NAMES are
 * pinned by `adapter-types.test.ts`, which parses the real interface source.
 *
 * Structural differences (ed25519 instead of secp256k1):
 * - `RecipientAddress` keys are 32-byte ed25519 points, not 33-byte compressed secp256k1.
 * - `PaymentRequest.build` is async (PDA derivation) and returns a Solana transaction.
 * - `DetectedPayment` is Solana-shaped (`signature`, `slot`, lamports/token credits).
 */
import type { PublicPoint } from './ed25519.js';
import type { SecretScalar } from './secret.js';
import type { RandomSource } from './ed25519.js';
import type { DetectedSolanaPayment } from './scan.js';
import type { BlockhashLifetime, BuiltStealthPayment, SolanaAsset } from './tx.js';

/** Chain families a `ChainAdapter` can serve. */
export type ChainFamily = 'evm' | 'bitcoin' | 'solana';

/** Parsed recipient: viewing = `V`, spending = `S` (ed25519). */
export interface RecipientAddress {
  readonly family: ChainFamily;
  readonly canonical: string;
  readonly spendingPublicKey: PublicPoint;
  readonly viewingPublicKey: PublicPoint;
}

/** Keys needed to detect payments. The viewing secret never leaves the process. */
export interface ViewCapability {
  readonly viewingSecret: SecretScalar;
  readonly spendingPublicKey: Uint8Array;
}

/** Slot range to scan. */
export interface ScanRange {
  readonly fromBlock: bigint;
  /** Inclusive; defaults to the finalized head. */
  readonly toBlock?: bigint;
  /** EVM-only deep scan option; ignored by the Solana adapter. */
  readonly deep?: boolean;
}

/** Status of a fee line on a chain. */
export type FeeStatus = 'enforced' | 'available' | 'not_enforceable' | 'not_deployed';

/** Which fees can honestly be charged on this chain. */
export interface FeeCapability {
  readonly checkout: FeeStatus;
  readonly checkoutBps?: number;
  readonly gasSponsorship: FeeStatus;
  readonly flatSecurity: FeeStatus;
}

/** Extra inputs for `buildPaymentRequest`. */
export interface RequestOptions {
  /** Base-unit amount for invoices without a fixed amount, from a fresh quote. */
  readonly quotedTokenAmount?: bigint;
}

/** Solana invoice accepted by the adapter. */
export interface SolanaInvoice {
  /** `sol-mainnet` | `sol-devnet` | `sol-testnet` | `sol-localnet`. */
  readonly chainId: string;
  /** `st:sol:` meta-address. */
  readonly recipient: string;
  readonly asset: SolanaAsset;
  /** Base units; omit for quote-based invoices and pass `quotedTokenAmount`. */
  readonly amount?: bigint;
}

/** Per-payment inputs of {@link SolanaPaymentRequest.build}. */
export interface SolanaBuildOptions {
  readonly payer: string;
  /** Fee sponsor; defaults to the payer. */
  readonly feePayer?: string;
  readonly lifetime: BlockhashLifetime;
  /** Native SOL only. Fetched from RPC by the adapter when omitted and an RPC is configured. */
  readonly rentExemptMinimum?: bigint;
  readonly payerTokenAccount?: string;
  readonly rng?: RandomSource;
}

/** The chain-neutral fields of the original `PaymentRequest`. */
export interface PaymentRequestCommon {
  readonly family: ChainFamily;
  readonly chainId: string;
  readonly asset: string;
  readonly grossAmount: bigint;
  readonly netAmount: bigint;
  readonly feeAmount: bigint;
}

/** Solana payment request: build an unsigned transaction for the payer's wallet to sign. */
export interface SolanaPaymentRequest extends PaymentRequestCommon {
  readonly family: 'solana';
  build(opts: SolanaBuildOptions): Promise<BuiltStealthPayment>;
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

/** The Solana adapter type. */
export type SolanaChainAdapter = ChainAdapterShape<
  SolanaInvoice,
  SolanaPaymentRequest,
  DetectedSolanaPayment
>;
