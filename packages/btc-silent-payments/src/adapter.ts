import {
  decodeSilentPaymentAddress,
  encodeSilentPaymentAddress,
  type SilentPaymentNetwork,
} from './address.js';
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
import { scanBlocks } from './scan/scanner.js';
import type { TweakSource } from './scan/types.js';
import { MAX_MONEY_SATS } from './units.js';
import { buildBitcoinUri } from './uri.js';

/** Dependencies of {@link createBitcoinAdapter}. */
export interface BitcoinAdapterDeps {
  readonly network: SilentPaymentNetwork;
  /** Where to read block tweak data from. Without it `scan` fails with `UNSUPPORTED`. */
  readonly source?: TweakSource;
}

/**
 * Bitcoin fee capability (MULTICHAIN_SPEC section 4): "none" — nothing can be enforced because
 * the payer's wallet builds the transaction. Mapped to the shared `FeeStatus` vocabulary as
 * `not_enforceable` on every line; a voluntary tip output is outside this adapter.
 */
export const BITCOIN_FEES: FeeCapability = {
  checkout: 'not_enforceable',
  gasSponsorship: 'not_enforceable',
  flatSecurity: 'not_enforceable',
};

function toHeight(v: bigint): number {
  if (v < 0n || v > 0xffffffffn) return fail('INVALID_INPUT');
  return Number(v);
}

/**
 * Creates the Bitcoin (BIP-352) {@link BitcoinChainAdapter}.
 *
 * @remarks `chainId` is `btc-mainnet` or `btc-testnet`. Invoices and addresses of another network
 * are rejected (`CHAIN_MISMATCH` / `NETWORK_MISMATCH`): an invoice for one chain is never payable
 * through another adapter. Payment requests carry no fee (`feeAmount` 0n). Scanning keeps the
 * scan secret inside this process; the source only sees block heights.
 *
 * @param deps Network and optional tweak source.
 * @returns The adapter.
 * @security See {@link scanBlocks}.
 */
export function createBitcoinAdapter(deps: BitcoinAdapterDeps): BitcoinChainAdapter {
  const chainId = deps.network === 'mainnet' ? 'btc-mainnet' : 'btc-testnet';
  const { network, source } = deps;
  return {
    family: 'bitcoin',
    chainId,
    fees: BITCOIN_FEES,

    parseRecipient(input: string): RecipientAddress {
      const a = decodeSilentPaymentAddress(input, network);
      return {
        family: 'bitcoin',
        canonical: encodeSilentPaymentAddress(a.network, a.scanPublicKey, a.spendPublicKey),
        spendingPublicKey: a.spendPublicKey,
        viewingPublicKey: a.scanPublicKey,
      };
    },

    buildPaymentRequest(inv: BitcoinInvoice, opts: RequestOptions = {}): BitcoinPaymentRequest {
      if (inv.chainId !== chainId) return fail('CHAIN_MISMATCH');
      const recipient = decodeSilentPaymentAddress(inv.address, network);
      const amount = inv.amountSats ?? opts.quotedTokenAmount;
      if (amount === undefined || amount <= 0n || amount > MAX_MONEY_SATS) return fail('INVALID_AMOUNT');
      const canonical = encodeSilentPaymentAddress(
        recipient.network,
        recipient.scanPublicKey,
        recipient.spendPublicKey,
      );
      return {
        family: 'bitcoin',
        chainId,
        asset: 'native',
        grossAmount: amount,
        netAmount: amount,
        feeAmount: 0n,
        address: canonical,
        uri: buildBitcoinUri({
          address: canonical,
          amountSats: amount,
          ...(inv.label === undefined ? {} : { label: inv.label }),
          ...(inv.message === undefined ? {} : { message: inv.message }),
        }),
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
          duplicateKey: r.duplicateKey,
          verified: r.verified,
          xOnlyPublicKey: r.xOnlyPublicKey,
          k: r.k,
          label: r.label,
          spendTweak: r.spendTweak,
        };
      }
    },
  };
}
