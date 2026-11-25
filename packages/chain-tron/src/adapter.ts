import type { CompressedPoint, RandomSource, SecretScalar } from '@ghostpay/core-crypto';
import { parseTronAddress, type TronAddress } from './address.js';
import { fail } from './errors.js';
import { decodeTronMetaAddress, encodeTronMetaAddress } from './meta.js';
import { checkTronAnnouncement, type TronAnnouncement, type TronStealthPayment } from './stealth.js';
import { MAX_FEE_LIMIT_SUN, UINT256_MAX, type TriggerSmartContractBody } from './trc20.js';

/**
 * Proposed `ChainFamily` union member for Tron.
 * The shared union in `@ghostpay/chain-adapters` is `'evm' | 'bitcoin' | 'solana'`;
 * see docs/remote/chain-ports/tron-impl.md for the proposed extension.
 */
export type TronFamily = 'tron';

/** Local copy of `FeeStatus` (chain-adapters). */
export type FeeStatus = 'enforced' | 'not_enforceable' | 'not_deployed';

/** Local copy of `FeeCapability` (chain-adapters). */
export interface FeeCapability {
  readonly checkout: FeeStatus;
  readonly checkoutBps?: number;
  readonly gasSponsorship: FeeStatus;
  readonly flatSecurity: FeeStatus;
}

/** Parsed recipient (mirrors `RecipientAddress`, family narrowed to Tron). */
export interface TronRecipient {
  readonly family: TronFamily;
  readonly canonical: string;
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
}

/** Minimal payment intent (stand-in for the schema-validated invoice). */
export interface TronPaymentInput {
  readonly metaAddress: string;
  readonly owner: string;
  /** TRC-20 contract address. */
  readonly tokenContract: string;
  readonly amount: bigint;
  readonly feeLimit: bigint;
}

/** Result of building a payment (shape kept for callers; {@link TronPaymentRequest.build} currently always throws). */
export interface TronBuiltPayment {
  readonly stealth: TronStealthPayment;
  readonly request: TriggerSmartContractBody;
}

/** Mirrors `PaymentRequest`; no router exists on Tron so gross equals net and fee is 0. */
export interface TronPaymentRequest {
  readonly family: TronFamily;
  readonly chainId: string;
  readonly asset: string;
  readonly grossAmount: bigint;
  readonly netAmount: bigint;
  readonly feeAmount: bigint;
  /**
   * @throws {TronAdapterError} `MEMO_NOT_BOUND`, always: see {@link TronAdapterError}.
   */
  build(opts?: { readonly rng?: RandomSource }): TronBuiltPayment;
}

/** Failure codes of the adapter skeleton itself (the address/meta/TRC-20 codecs throw {@link TronError}). */
export type TronAdapterErrorCode = 'MEMO_NOT_BOUND';

const ADAPTER_MESSAGES: Readonly<Record<TronAdapterErrorCode, string>> = {
  MEMO_NOT_BOUND:
    'TRON payment building is disabled: the GPT1 announcement memo cannot be bound into the transaction raw_data.data (ADR-0019), so the receiver could never detect the payment',
};

/**
 * Thrown by {@link TronPaymentRequest.build}, which fails closed.
 *
 * @remarks ADR-0019 section 2 puts the `"GPT1" || R || viewTag` announcement in the payment transaction's own
 * `raw_data.data`, and the web scanner (`@ghostpay/tron-adapter` `parseCandidate`) reads the memo only from there,
 * from the hashed `raw_data_hex`. This package can only emit a node `triggersmartcontract` body, which has no memo
 * field, and has no local `Transaction.raw` encoder (tron-adapter's `buildTrc20Transfer` takes the memo, a
 * reference block and timestamps). A transfer sent as built would pay a stealth address its receiver can never
 * detect, so no payable request is returned until the memo is bound into the signed bytes.
 * @security Fixed message; never embeds caller-supplied values.
 */
export class TronAdapterError extends Error {
  /** Machine-readable failure code. */
  public readonly code: TronAdapterErrorCode;

  public constructor(code: TronAdapterErrorCode) {
    super(ADAPTER_MESSAGES[code]);
    this.name = 'TronAdapterError';
    this.code = code;
  }
}

/** Keys needed to detect payments. */
export interface TronViewCapability {
  readonly viewingSecret: SecretScalar;
  readonly spendingPublicKey: CompressedPoint;
}

/** A matched payment. */
export interface TronDetectedPayment {
  readonly stealthAddress: TronAddress;
  readonly announcement: TronAnnouncement;
}

/**
 * Injected announcement source. The adapter performs NO network access; a caller
 * supplies announcements (for example decoded from TronGrid event queries).
 */
export type TronAnnouncementSource = (range: {
  readonly fromBlock: bigint;
  readonly toBlock?: bigint;
}) => AsyncIterable<TronAnnouncement>;

/** Structural counterpart of `ChainAdapter` for Tron. */
export interface TronChainAdapter {
  readonly family: TronFamily;
  readonly chainId: string;
  parseRecipient(input: string): TronRecipient;
  buildPaymentRequest(input: TronPaymentInput): TronPaymentRequest;
  scan(
    range: { readonly fromBlock: bigint; readonly toBlock?: bigint },
    keys: TronViewCapability,
    signal: AbortSignal,
  ): AsyncIterable<TronDetectedPayment>;
  readonly fees: FeeCapability;
}

/** Fee capability: nothing is enforceable until a Tron fee-split contract exists (spec-only). */
export const TRON_FEES: FeeCapability = Object.freeze({
  checkout: 'not_enforceable',
  gasSponsorship: 'not_enforceable',
  flatSecurity: 'not_enforceable',
});

/**
 * Creates the Tron adapter skeleton.
 *
 * @param chainId Free-form id such as `tron-nile` (testnet). Non-empty.
 * @param source Injected announcement source (no network in this package).
 * @returns Adapter whose fees are all `not_enforceable`; its payment requests quote but never build (see
 * {@link TronAdapterError}).
 * @throws {TronError} `INVALID_INPUT` for an empty chain id or any chain id naming mainnet.
 * @security Skeleton only: unaudited, testnet proof of concept.
 */
export function createTronAdapter(chainId: string, source: TronAnnouncementSource): TronChainAdapter {
  if (typeof chainId !== 'string' || chainId.length === 0) return fail('INVALID_INPUT');
  // ADR-0019: mainnet is refused unconditionally (testnet proof of concept).
  if (chainId.toLowerCase().includes('mainnet')) return fail('INVALID_INPUT');
  return {
    family: 'tron',
    chainId,
    fees: TRON_FEES,
    parseRecipient(input) {
      const keys = decodeTronMetaAddress(input);
      return {
        family: 'tron',
        canonical: encodeTronMetaAddress(keys),
        spendingPublicKey: keys.spendingPublicKey,
        viewingPublicKey: keys.viewingPublicKey,
      };
    },
    buildPaymentRequest(input) {
      decodeTronMetaAddress(input.metaAddress);
      parseTronAddress(input.owner);
      const token = parseTronAddress(input.tokenContract);
      if (typeof input.amount !== 'bigint' || input.amount < 1n || input.amount > UINT256_MAX) fail('INVALID_AMOUNT');
      if (typeof input.feeLimit !== 'bigint' || input.feeLimit < 1n || input.feeLimit > MAX_FEE_LIMIT_SUN) {
        fail('INVALID_FEE_LIMIT');
      }
      return {
        family: 'tron',
        chainId,
        asset: token,
        grossAmount: input.amount,
        netAmount: input.amount,
        feeAmount: 0n,
        build(): never {
          // Fail closed before deriving anything: see TronAdapterError.
          throw new TronAdapterError('MEMO_NOT_BOUND');
        },
      };
    },
    async *scan(range, keys, signal) {
      for await (const a of source(range)) {
        if (signal.aborted) return;
        const hit = checkTronAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey);
        if (hit.matches) yield { stealthAddress: hit.stealthAddress, announcement: a };
      }
    },
  };
}
