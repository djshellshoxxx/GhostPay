import {
  checkAnnouncement,
  decodeMetaAddress,
  deriveStealthPayment,
  encodeMetaAddress,
  parseMetadata,
  type CompressedPoint,
  type DerivedStealthPayment,
  type ParsedMetadata,
  type RandomSource,
  type SecretScalar,
} from '@ghostpay/core-crypto';
import type { Invoice } from '@ghostpay/invoice-schema';
import type { ChainConfig } from './config/chains.js';
import { requireEnabledChain } from './config/chains.js';
import type { DeploymentManifest } from './deployments.js';
import { fail } from './errors.js';
import { FEE_SCHEDULE, grossForNet, routerSplit } from './fees.js';
import { fetchAnnouncements, type ScanCursor, type ScannedAnnouncement } from './logs.js';
import { buildPaymentTx, type BuiltPayment, type PaymentTx } from './router.js';
import type { RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

/** Chain families a `ChainAdapter` can serve (MULTICHAIN_SPEC section 1). */
export type ChainFamily = 'evm' | 'bitcoin' | 'solana';

/** Parsed recipient (EVM: ERC-5564 scheme-1 meta-address). */
export interface RecipientAddress {
  readonly family: ChainFamily;
  /** Canonical string form. */
  readonly canonical: string;
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
}

/** Invoice as accepted by adapters: already schema-validated by `@ghostpay/invoice-schema`. */
export type ValidatedInvoice = Invoice;

/** Description of what a payer must do, independent of the signing wallet. */
export interface PaymentRequest {
  readonly family: ChainFamily;
  readonly chainId: string;
  /** `'native'` or token address. */
  readonly asset: string;
  /** Amount the payer's wallet spends, in asset base units. */
  readonly grossAmount: bigint;
  /** Amount that reaches the recipient's one-time address. */
  readonly netAmount: bigint;
  /** Protocol fee included in `grossAmount` (0n where not enforceable). */
  readonly feeAmount: bigint;
  /** Contract that receives the call (EVM router). */
  readonly router: Address;
  /** Fee recipient from the verified manifest, for disclosure copy. */
  readonly feeRecipient: Address;
  /** Derives a fresh one-time address and builds the transaction + checked preview. */
  build(opts: BuildOptions): BuiltPayment;
}

/** Per-payment options for {@link PaymentRequest.build}. */
export interface BuildOptions {
  readonly deadline: bigint;
  readonly now?: bigint;
  readonly minNet?: bigint;
  readonly permitSignature?: Hex;
  readonly buffer?: { readonly bufferWei: bigint; readonly maxBufferWei?: bigint };
  /** Injectable randomness for the ephemeral key (tests only). */
  readonly rng?: RandomSource;
}

/** Keys needed to detect payments. The viewing secret never leaves this call. */
export interface ViewCapability {
  readonly viewingSecret: SecretScalar;
  readonly spendingPublicKey: CompressedPoint;
}

/** Block range to scan. */
export interface ScanRange {
  readonly fromBlock: bigint;
  /** Inclusive; defaults to the chain head. */
  readonly toBlock?: bigint;
}

/** A payment that matches the viewing key. */
export interface DetectedPayment {
  readonly stealthAddress: Address;
  readonly announcement: ScannedAnnouncement;
  /** Parsed router metadata, or `undefined` if the metadata is not in GhostPay router layout. */
  readonly metadata: ParsedMetadata | undefined;
  /** True when the announce call came from this chain's GhostPay router. */
  readonly viaRouter: boolean;
}

/** Status of a fee line on a chain. */
export type FeeStatus = 'enforced' | 'not_enforceable' | 'not_deployed';

/** Which fees can honestly be charged on this chain (never advertise an uncollectable fee). */
export interface FeeCapability {
  readonly checkout: FeeStatus;
  /** Checkout fee in bps when enforced. */
  readonly checkoutBps?: number;
  readonly gasSponsorship: FeeStatus;
  readonly flatSecurity: FeeStatus;
}

/** Generic adapter (docs/MULTICHAIN_SPEC.md section 1). */
export interface ChainAdapter {
  readonly family: ChainFamily;
  /** EVM numeric id as string; `"btc-mainnet"`; `"sol-mainnet"`. */
  readonly chainId: string;
  parseRecipient(input: string): RecipientAddress;
  buildPaymentRequest(inv: ValidatedInvoice, opts?: RequestOptions): PaymentRequest;
  scan(range: ScanRange, keys: ViewCapability, signal: AbortSignal): AsyncIterable<DetectedPayment>;
  readonly fees: FeeCapability;
}

/** Extra inputs for {@link ChainAdapter.buildPaymentRequest}. */
export interface RequestOptions {
  /** Token amount for `fiat_quote` invoices, computed from a fresh `quote.ts` price by the caller. */
  readonly quotedTokenAmount?: bigint;
}

/** Dependencies of the EVM adapter. */
export interface EvmAdapterDeps {
  readonly chain: ChainConfig;
  readonly deployment: DeploymentManifest;
  readonly client: RpcClient;
}

/**
 * Creates the EVM adapter.
 *
 * @remarks Fails closed unless the chain is enabled and chain, deployment and client agree.
 * Invoice amount semantics (see DEVIATIONS): `fixed_token.tokenAmount` is what the SELLER should
 * receive when `feePolicy = payer_pays` (gross = smallest amount whose net covers it) and the GROSS
 * the payer spends when `seller_pays`. `fiat_quote` invoices need `quotedTokenAmount`, interpreted
 * the same way.
 *
 * @param deps Chain, verified manifest and verified client.
 * @returns A `ChainAdapter` of family `evm`.
 * @throws {ChainAdapterError} `CHAIN_DISABLED` or `CHAIN_MISMATCH`.
 */
export function createEvmAdapter(deps: EvmAdapterDeps): ChainAdapter {
  const chain = requireEnabledChain(deps.chain.chainId);
  if (deps.deployment.chainId !== chain.chainId || deps.client.chainId !== chain.chainId) {
    return fail('CHAIN_MISMATCH', 'chain, deployment and client must agree');
  }
  const { deployment, client } = deps;

  return {
    family: 'evm',
    chainId: String(chain.chainId),
    fees: {
      checkout: 'enforced',
      checkoutBps: Number(FEE_SCHEDULE.ROUTER_FEE_BPS),
      gasSponsorship: 'enforced',
      flatSecurity: 'not_deployed',
    },

    parseRecipient(input) {
      const keys = decodeMetaAddress(input);
      return {
        family: 'evm',
        canonical: encodeMetaAddress(keys),
        spendingPublicKey: keys.spendingPublicKey,
        viewingPublicKey: keys.viewingPublicKey,
      };
    },

    buildPaymentRequest(inv, opts = {}) {
      if (inv.chainId !== chain.chainId) return fail('CHAIN_MISMATCH', 'invoice is for another chain');
      let wanted: bigint;
      if (inv.amountPolicy.mode === 'fixed_token') wanted = BigInt(inv.amountPolicy.tokenAmount);
      else if (opts.quotedTokenAmount !== undefined && opts.quotedTokenAmount > 0n) wanted = opts.quotedTokenAmount;
      else return fail('INVALID_INPUT', 'fiat_quote invoice needs quotedTokenAmount');
      const gross = inv.feePolicy === 'payer_pays' ? grossForNet(wanted) : wanted;
      const split = routerSplit(gross);
      decodeMetaAddress(inv.metaAddress); // fail early on a malformed meta-address
      return {
        family: 'evm',
        chainId: String(chain.chainId),
        asset: inv.token,
        grossAmount: split.gross,
        netAmount: split.net,
        feeAmount: split.fee,
        router: deployment.router,
        feeRecipient: deployment.feeRecipient,
        build(b) {
          const payment: DerivedStealthPayment = deriveStealthPayment(inv.metaAddress, b.rng);
          return buildPaymentTx({
            chain,
            deployment,
            invoice: inv,
            payment,
            grossAmount: split.gross,
            deadline: b.deadline,
            ...(b.now === undefined ? {} : { now: b.now }),
            ...(b.minNet === undefined ? {} : { minNet: b.minNet }),
            ...(b.permitSignature === undefined ? {} : { permitSignature: b.permitSignature }),
            ...(b.buffer === undefined ? {} : { buffer: b.buffer }),
          });
        },
      };
    },

    async *scan(range, keys, signal) {
      let cursor: ScanCursor = { nextBlock: range.fromBlock };
      for (;;) {
        if (signal.aborted) return;
        const res = await fetchAnnouncements({
          chain,
          client,
          announcer: deployment.announcer,
          cursor,
          ...(range.toBlock === undefined ? {} : { toBlock: range.toBlock }),
        });
        // Later pages carry the previous page's cursor hash. A mismatch means payments already yielded may
        // be orphaned and `scan` cannot retract them: fail closed so the caller restarts the scan.
        if (res.reorg !== undefined && cursor.last !== undefined) return fail('RPC_FAILURE', 'chain reorganised during scan; retry');
        for (const a of res.announcements) {
          if (signal.aborted) return;
          if (range.toBlock !== undefined && a.blockNumber > range.toBlock) continue;
          const hit = checkAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey);
          if (!hit.matches) continue;
          let metadata: ParsedMetadata | undefined;
          try {
            metadata = parseMetadata(a.metadata);
          } catch {
            metadata = undefined;
          }
          yield {
            stealthAddress: hit.stealthAddress,
            announcement: a,
            metadata,
            viaRouter: a.caller.toLowerCase() === deployment.router.toLowerCase(),
          };
        }
        cursor = res.cursor;
        if (!res.truncated) return;
      }
    },
  };
}

/** Re-exported for callers that only need the tx shape. */
export type { PaymentTx };
