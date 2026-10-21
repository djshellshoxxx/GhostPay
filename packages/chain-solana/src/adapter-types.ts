/**
 * COPY of the minimal `ChainAdapter` contract from `packages/chain-adapters/src/adapter.ts`
 * (docs/MULTICHAIN_SPEC.md section 1).
 *
 * This package does not depend on `@ghostpay/chain-adapters` (EVM-shaped `PaymentRequest`,
 * `DetectedPayment` and `ValidatedInvoice`). Member NAMES are pinned by `adapter-types.test.ts`,
 * which parses the source of the real interface. `SecretScalar` / `PrimeOrderPoint` are this
 * package's own ed25519 types (core-crypto's are secp256k1).
 */
import type { PrimeOrderPoint } from './point.js';
import type { SecretScalar } from './secret.js';

/** Chain families a `ChainAdapter` can serve. */
export type ChainFamily = 'evm' | 'bitcoin' | 'solana';

/** Parsed recipient: ed25519 spend key S and view key V. */
export interface RecipientAddress {
  readonly family: ChainFamily;
  /** Canonical string form. */
  readonly canonical: string;
  readonly spendingPublicKey: PrimeOrderPoint;
  readonly viewingPublicKey: PrimeOrderPoint;
}

/** Keys needed to detect payments: v and S. */
export interface ViewCapability {
  readonly viewingSecret: SecretScalar;
  readonly spendingPublicKey: PrimeOrderPoint;
}

/** Slot range to scan. */
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
  /** Amount in base units for invoices without a fixed amount, from a fresh quote. */
  readonly quotedTokenAmount?: bigint;
}

/** Solana invoice accepted by the adapter skeleton. */
export interface SolanaInvoice {
  readonly chainId: string;
  /** `gpsol:` meta-address. */
  readonly metaAddress: string;
  /** `'native'` (lamports) or a base58 SPL mint. */
  readonly asset: string;
  /** Fixed amount in base units; omit for quote-based invoices and pass `quotedTokenAmount`. */
  readonly amount?: bigint;
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

/** Everything a wallet needs to pay one fresh stealth address (no transaction is built here). */
export interface BuiltSolanaPayment {
  /** System account P (destination of a SOL transfer, owner of the token account). */
  readonly stealthAddress: string;
  /** ATA of (P, mint) for SPL assets; absent for native SOL. */
  readonly associatedTokenAddress?: string;
  /** Binary announcement for an announcer program. */
  readonly announcement: Uint8Array;
  /** SPL Memo text form of the same announcement. */
  readonly memo: string;
}

/** Solana payment request. Fees are always zero (nothing on chain can enforce them yet). */
export interface SolanaPaymentRequest extends PaymentRequestCommon {
  readonly family: 'solana';
  build(opts?: { readonly rng?: Pick<Crypto, 'getRandomValues'> }): BuiltSolanaPayment;
}

/** One announcement as delivered by an {@link AnnouncementSource}. */
export interface AnnouncementRecord {
  readonly slot: bigint;
  /** Transaction signature (base58), opaque here. */
  readonly signature: string;
  /** Binary announcer event data, or SPL Memo text. Untrusted. */
  readonly payload: Uint8Array | string;
  /** The system account / token-account owner the transaction funded, if known. Untrusted. */
  readonly destination?: string;
}

/** Injected announcement feed. Implementations own all RPC / indexer access. */
export interface AnnouncementSource {
  announcements(
    range: { readonly fromSlot: bigint; readonly toSlot?: bigint },
    signal: AbortSignal,
  ): AsyncIterable<AnnouncementRecord>;
}

/** A payment that matches the viewing key. */
export interface DetectedSolanaPayment {
  readonly family: 'solana';
  readonly slot: bigint;
  readonly signature: string;
  readonly stealthAddress: string;
  readonly metadata: Uint8Array;
  /** h; spend key x = s + h (see `deriveStealthSpendScalar`). */
  readonly tweak: SecretScalar;
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
