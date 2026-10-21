import { decodeMetaAddress, encodeMetaAddress, type CompressedPoint, type RandomSource, type SecretScalar } from '@ghostpay/core-crypto';
import { parseTronAddress, type TronAddress } from './address.js';
import { fail } from './errors.js';
import {
  checkTronAnnouncement,
  deriveTronStealthPayment,
  type TronAnnouncement,
  type TronStealthPayment,
} from './stealth.js';
import { buildTrc20TransferRequest, type TriggerSmartContractBody } from './trc20.js';

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

/** Result of building a payment. */
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
  build(opts?: { readonly rng?: RandomSource }): TronBuiltPayment;
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
 * @returns Adapter whose fees are all `not_enforceable`.
 * @throws {TronError} `INVALID_INPUT` for an empty chain id.
 * @security Skeleton only: unaudited, testnet proof of concept.
 */
export function createTronAdapter(chainId: string, source: TronAnnouncementSource): TronChainAdapter {
  if (typeof chainId !== 'string' || chainId.length === 0) return fail('INVALID_INPUT');
  return {
    family: 'tron',
    chainId,
    fees: TRON_FEES,
    parseRecipient(input) {
      const keys = decodeMetaAddress(input);
      return {
        family: 'tron',
        canonical: encodeMetaAddress(keys),
        spendingPublicKey: keys.spendingPublicKey,
        viewingPublicKey: keys.viewingPublicKey,
      };
    },
    buildPaymentRequest(input) {
      decodeMetaAddress(input.metaAddress);
      const owner = parseTronAddress(input.owner);
      const token = parseTronAddress(input.tokenContract);
      return {
        family: 'tron',
        chainId,
        asset: token,
        grossAmount: input.amount,
        netAmount: input.amount,
        feeAmount: 0n,
        build(opts = {}) {
          const stealth = deriveTronStealthPayment(input.metaAddress, opts.rng);
          const request = buildTrc20TransferRequest({
            owner,
            contract: token,
            to: stealth.stealthAddress,
            amount: input.amount,
            feeLimit: input.feeLimit,
          });
          return { stealth, request };
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
