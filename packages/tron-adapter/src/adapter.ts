import type { CompressedPoint, RandomSource, SecretScalar } from '@ghostpay/core-crypto';
import { decodeTronAddress } from './address.js';
import { fail } from './errors.js';
import { decodeTronMetaAddress, deriveTronStealth, encodeTronMetaAddress } from './meta.js';
import type { TronRpc } from './rpc.js';
import { scanTron, type DetectedTronPayment } from './scan.js';
import {
  buildTrc20Transfer,
  buildTrxTransfer,
  type RefBlock,
  type UnsignedTronTx,
} from './tx.js';

/** Networks. Mainnet exists only to be refused. */
export type TronNetwork = 'nile' | 'shasta' | 'local' | 'mainnet';

/** Static network table (docs/chains/tron.md). Endpoints are documentation hints, not defaults. */
export const TRON_NETWORKS: Readonly<Record<TronNetwork, { chainId: string; enabled: boolean; endpointHint: string }>> = {
  nile: { chainId: 'tron-nile', enabled: true, endpointHint: 'https://nile.trongrid.io' },
  shasta: { chainId: 'tron-shasta', enabled: true, endpointHint: 'https://api.shasta.trongrid.io' },
  local: { chainId: 'tron-local', enabled: true, endpointHint: 'http://127.0.0.1:9090' },
  mainnet: { chainId: 'tron-mainnet', enabled: false, endpointHint: '' },
};

/** Chain families (copy of chain-adapters' union plus `tron`; see adapter-types test). */
export type ChainFamily = 'evm' | 'bitcoin' | 'solana' | 'tron';
export type FeeStatus = 'enforced' | 'not_enforceable' | 'not_deployed';

export interface RecipientAddress {
  readonly family: ChainFamily;
  readonly canonical: string;
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
}
export interface ViewCapability {
  readonly viewingSecret: SecretScalar;
  readonly spendingPublicKey: CompressedPoint;
}
export interface ScanRange {
  readonly fromBlock: bigint;
  readonly toBlock?: bigint;
  /** EVM-only deep scan option; ignored by the Tron adapter. */
  readonly deep?: boolean;
}
export interface FeeCapability {
  readonly checkout: FeeStatus;
  readonly checkoutBps?: number;
  readonly gasSponsorship: FeeStatus;
  readonly flatSecurity: FeeStatus;
}
export interface RequestOptions {
  readonly quotedTokenAmount?: bigint;
}

/** Asset on TRON. */
export type TronAsset = { readonly kind: 'native' } | { readonly kind: 'trc20'; readonly contract: string };

/** Invoice accepted by the adapter. */
export interface TronInvoice {
  readonly chainId: string;
  /** `st:trx:0x...` meta-address. */
  readonly recipient: string;
  readonly asset: TronAsset;
  /** sun for TRX, token base units for TRC-20. */
  readonly amount?: bigint;
}

/** Per-payment inputs. */
export interface TronBuildOptions {
  readonly payer: string;
  readonly refBlock: RefBlock;
  readonly timestampMs: bigint;
  readonly expirationMs?: bigint;
  /** Required for TRC-20 (max sun burnable for energy). */
  readonly feeLimitSun?: bigint;
  readonly rng?: RandomSource;
}

/** Everything a wallet needs to review and sign, plus the announcement data. */
export interface BuiltTronPayment {
  readonly tx: UnsignedTronTx;
  readonly stealthAddress: string;
  readonly ephemeralPublicKey: CompressedPoint;
  readonly viewTag: number;
  readonly preview: {
    readonly from: string;
    readonly to: string;
    readonly asset: string;
    readonly amount: bigint;
    readonly feeLimitSun: bigint;
  };
}

export interface TronPaymentRequest {
  readonly family: 'tron';
  readonly chainId: string;
  readonly asset: string;
  readonly grossAmount: bigint;
  readonly netAmount: bigint;
  readonly feeAmount: bigint;
  build(opts: TronBuildOptions): BuiltTronPayment;
}

/** Same members as chain-adapters' `ChainAdapter` (pinned by adapter-types.test.ts). */
export interface TronChainAdapter {
  readonly family: 'tron';
  readonly chainId: string;
  parseRecipient(input: string): RecipientAddress;
  buildPaymentRequest(inv: TronInvoice, opts?: RequestOptions): TronPaymentRequest;
  scan(range: ScanRange, keys: ViewCapability, signal: AbortSignal): AsyncIterable<DetectedTronPayment>;
  readonly fees: FeeCapability;
}

/** No fee contract exists on TRON in this PoC, so no fee line is enforceable. */
export const TRON_FEES: FeeCapability = {
  checkout: 'not_deployed',
  gasSponsorship: 'not_deployed',
  flatSecurity: 'not_deployed',
};

/** Adapter dependencies. */
export interface TronAdapterDeps {
  readonly network: TronNetwork;
  /** Without it `scan` fails with `UNSUPPORTED`. */
  readonly rpc?: TronRpc;
  /** Base58 TRC-20 contracts treated as real value when scanning. */
  readonly trustedTokens?: readonly string[];
}

const U64_MAX = (1n << 64n) - 1n;
const U256_MAX = (1n << 256n) - 1n;

/**
 * Creates the TRON ChainAdapter (PROOF OF CONCEPT, NOT AUDITED). Never signs or broadcasts.
 * @throws {TronAdapterError} `CHAIN_DISABLED` for mainnet (unconditionally).
 */
export function createTronAdapter(deps: TronAdapterDeps): TronChainAdapter {
  const net = TRON_NETWORKS[deps.network];
  if (net === undefined || !net.enabled) return fail('CHAIN_DISABLED');
  const chainId = net.chainId;
  return {
    family: 'tron',
    chainId,
    fees: TRON_FEES,
    parseRecipient(input) {
      const k = decodeTronMetaAddress(input);
      return { family: 'tron', canonical: encodeTronMetaAddress(k), spendingPublicKey: k.spendingPublicKey, viewingPublicKey: k.viewingPublicKey };
    },
    buildPaymentRequest(inv, opts = {}) {
      if (inv.chainId !== chainId) return fail('CHAIN_MISMATCH');
      const recipient = decodeTronMetaAddress(inv.recipient);
      void recipient;
      const amount = inv.amount ?? opts.quotedTokenAmount;
      const isNative = inv.asset.kind === 'native';
      if (amount === undefined || amount <= 0n || amount > (isNative ? U64_MAX : U256_MAX)) return fail('INVALID_AMOUNT');
      const contract = inv.asset.kind === 'trc20' ? inv.asset.contract : undefined;
      if (contract !== undefined) decodeTronAddress(contract);
      return {
        family: 'tron',
        chainId,
        asset: contract ?? 'native',
        grossAmount: amount,
        netAmount: amount,
        feeAmount: 0n,
        build(b) {
          decodeTronAddress(b.payer);
          const s = deriveTronStealth(inv.recipient, b.rng);
          if (s.stealthAddress === b.payer) return fail('INVALID_INPUT');
          const common = {
            owner: b.payer,
            refBlock: b.refBlock,
            timestampMs: b.timestampMs,
            ...(b.expirationMs === undefined ? {} : { expirationMs: b.expirationMs }),
            memo: s.memo,
          };
          let tx: UnsignedTronTx;
          let fee = 0n;
          if (contract === undefined) {
            tx = buildTrxTransfer({ ...common, to: s.stealthAddress, amountSun: amount });
          } else {
            if (b.feeLimitSun === undefined) return fail('INVALID_INPUT');
            fee = b.feeLimitSun;
            tx = buildTrc20Transfer({ ...common, contract, to: s.stealthAddress, amount, feeLimitSun: fee });
          }
          return {
            tx,
            stealthAddress: s.stealthAddress,
            ephemeralPublicKey: s.ephemeralPublicKey,
            viewTag: s.viewTag,
            preview: { from: b.payer, to: s.stealthAddress, asset: contract ?? 'native', amount, feeLimitSun: fee },
          };
        },
      };
    },
    scan(range, keys, signal) {
      if (deps.rpc === undefined) return fail('UNSUPPORTED');
      return scanTron(deps.rpc, {
        fromBlock: range.fromBlock,
        ...(range.toBlock === undefined ? {} : { toBlock: range.toBlock }),
        viewingSecret: keys.viewingSecret,
        spendingPublicKey: keys.spendingPublicKey,
        ...(deps.trustedTokens === undefined ? {} : { trustedTokens: deps.trustedTokens }),
        signal,
      });
    },
  };
}

