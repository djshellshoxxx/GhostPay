import { decodeAddress, encodeAddress } from './address.js';
import type {
  BitcoinChainAdapter,
  BitcoinInvoice,
  BitcoinPaymentRequest,
  DetectedBitcoinPayment,
  FeeCapability,
  RecipientAddress,
  RequestOptions,
  ScanRange,
  ViewCapability,
} from './adapter-types.js';
import { fail } from './errors.js';
import { createLabelTable } from './labels.js';
import { assertFundsAllowed, type ChainParams } from './params.js';
import { scanBlocks, type TweakSource } from './scan.js';

/** Dependencies of {@link createBtcFamilyAdapter}. */
export interface BtcFamilyAdapterDeps {
  /** Where to read block tweak data from. Without it `scan` fails with `UNSUPPORTED`. */
  readonly source?: TweakSource;
}

/** Largest amount accepted in a request (2^63 - 1; no chain here can exceed it). */
const MAX_AMOUNT = (1n << 63n) - 1n;

/**
 * Fee capability for every Bitcoin-family chain: nothing can be enforced because the payer's
 * wallet builds the transaction.
 */
export const BTC_FAMILY_FEES: FeeCapability = {
  checkout: 'not_enforceable',
  gasSponsorship: 'not_enforceable',
  flatSecurity: 'not_enforceable',
};

function toHeight(v: bigint): number {
  if (v < 0n || v > 0xffffffffn) return fail('INVALID_INPUT');
  return Number(v);
}

/**
 * Creates a structural `ChainAdapter`-shaped adapter for one Bitcoin-family chain.
 *
 * @remarks `chainId` is `params.id` (for example `ltc-testnet`). Addresses and invoices of
 * another chain are rejected (`NETWORK_MISMATCH` / `CHAIN_MISMATCH`). `buildPaymentRequest`
 * refuses experimental mainnet params (`EXPERIMENTAL_CHAIN`); `parseRecipient` and `scan` stay
 * available so research tooling can run. Requests carry no fee.
 *
 * @param params Chain parameters.
 * @param deps Optional tweak source.
 * @returns The adapter (`family: 'bitcoin'`).
 * @security Scanning keeps the scan secret inside this process; the source only sees heights.
 */
export function createBtcFamilyAdapter(
  params: ChainParams,
  deps: BtcFamilyAdapterDeps = {},
): BitcoinChainAdapter {
  const { source } = deps;
  return {
    family: 'bitcoin',
    chainId: params.id,
    fees: BTC_FAMILY_FEES,

    parseRecipient(input: string): RecipientAddress {
      const a = decodeAddress(params, input);
      return {
        family: 'bitcoin',
        canonical: encodeAddress(params, a.scanPublicKey, a.spendPublicKey),
        spendingPublicKey: a.spendPublicKey,
        viewingPublicKey: a.scanPublicKey,
      };
    },

    buildPaymentRequest(inv: BitcoinInvoice, opts: RequestOptions = {}): BitcoinPaymentRequest {
      assertFundsAllowed(params);
      if (inv.chainId !== params.id) return fail('CHAIN_MISMATCH');
      const recipient = decodeAddress(params, inv.address);
      const amount = inv.amountSats ?? opts.quotedTokenAmount;
      if (amount === undefined || amount <= 0n || amount > MAX_AMOUNT) return fail('INVALID_AMOUNT');
      return {
        family: 'bitcoin',
        chainId: params.id,
        asset: 'native',
        grossAmount: amount,
        netAmount: amount,
        feeAmount: 0n,
        address: encodeAddress(params, recipient.scanPublicKey, recipient.spendPublicKey),
        experimental: params.experimental,
      };
    },

    async *scan(
      range: ScanRange,
      keys: ViewCapability,
      signal: AbortSignal,
    ): AsyncGenerator<DetectedBitcoinPayment> {
      if (source === undefined) return fail('UNSUPPORTED');
      const labels = createLabelTable(keys.viewingSecret, keys.labels ?? []);
      const iterator = scanBlocks({
        source,
        keys: { scanSecret: keys.viewingSecret, spendPublicKey: keys.spendingPublicKey, labels },
        fromHeight: toHeight(range.fromBlock),
        ...(range.toBlock === undefined ? {} : { toHeight: toHeight(range.toBlock) }),
        signal,
      });
      for await (const r of iterator) {
        yield {
          family: 'bitcoin',
          blockHeight: BigInt(r.height),
          blockHash: r.blockHash,
          ...(r.txid === undefined ? {} : { txid: r.txid }),
          ...(r.vout === undefined ? {} : { vout: r.vout }),
          ...(r.amountSats === undefined ? {} : { amountSats: r.amountSats }),
          xOnlyPublicKey: r.xOnlyPublicKey,
          k: r.k,
          label: r.label,
          spendTweak: r.spendTweak,
        };
      }
    },
  };
}
