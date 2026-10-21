import type {
  FeeCapability,
  RecipientAddress,
  RequestOptions,
  ScanRange,
  SolanaBuildOptions,
  SolanaChainAdapter,
  SolanaInvoice,
  SolanaPaymentRequest,
  ViewCapability,
} from './adapter-types.js';
import { fail } from './errors.js';
import { decodeMetaAddress, encodeMetaAddress, type SolanaCluster } from './meta-address.js';
import { getMinimumBalanceForRentExemption, type SolanaRpc } from './rpc.js';
import { fetchAnnouncements, scanAnnouncements, type DetectedSolanaPayment } from './scan.js';
import { buildStealthPaymentTx, parseSolanaAddress, type BuiltStealthPayment } from './tx.js';

/** Dependencies of {@link createSolanaAdapter}. */
export interface SolanaAdapterDeps {
  readonly cluster: SolanaCluster;
  /** Without it, `scan` fails with `UNSUPPORTED` and native builds need `rentExemptMinimum`. */
  readonly rpc?: SolanaRpc;
  /** Mainnet is refused unless explicitly enabled (proof of concept, not audited). */
  readonly allowMainnet?: boolean;
  /** Address whose history `scan` pages (default: SPL memo program). */
  readonly announcementIndexAddress?: string;
}

/**
 * Fee capability: no fee program is deployed (an on-chain fee split needs an audited program,
 * MULTICHAIN_SPEC section 4), and sponsored fee payment exists only as a transaction option with
 * no relayer service behind it.
 */
export const SOLANA_FEES: FeeCapability = {
  checkout: 'not_deployed',
  gasSponsorship: 'not_deployed',
  flatSecurity: 'not_deployed',
};

const U64_MAX = (1n << 64n) - 1n;

/** Chain id string for a cluster. */
export function solanaChainId(cluster: SolanaCluster): string {
  return `sol-${cluster}`;
}

/**
 * Creates the Solana stealth {@link SolanaChainAdapter} (PROOF OF CONCEPT, NOT AUDITED).
 *
 * @remarks Never sends transactions: `build()` returns an unsigned transaction for the payer's
 * wallet. Invoices and meta-addresses for another cluster are rejected.
 * @throws {SolanaStealthError} `CHAIN_DISABLED` for mainnet without `allowMainnet`.
 */
export function createSolanaAdapter(deps: SolanaAdapterDeps): SolanaChainAdapter {
  const { cluster, rpc } = deps;
  if (cluster === 'mainnet' && deps.allowMainnet !== true) return fail('CHAIN_DISABLED');
  const chainId = solanaChainId(cluster);
  return {
    family: 'solana',
    chainId,
    fees: SOLANA_FEES,

    parseRecipient(input: string): RecipientAddress {
      const m = decodeMetaAddress(input, cluster);
      return {
        family: 'solana',
        canonical: encodeMetaAddress(m.cluster, m.spendPublicKey, m.viewPublicKey),
        spendingPublicKey: m.spendPublicKey,
        viewingPublicKey: m.viewPublicKey,
      };
    },

    buildPaymentRequest(inv: SolanaInvoice, opts: RequestOptions = {}): SolanaPaymentRequest {
      if (inv.chainId !== chainId) return fail('CHAIN_MISMATCH');
      const recipient = decodeMetaAddress(inv.recipient, cluster);
      const amount = inv.amount ?? opts.quotedTokenAmount;
      if (amount === undefined || amount <= 0n || amount > U64_MAX) return fail('INVALID_AMOUNT');
      const asset = inv.asset.kind === 'native' ? 'native' : parseSolanaAddress(inv.asset.mint);
      return {
        family: 'solana',
        chainId,
        asset,
        grossAmount: amount,
        netAmount: amount,
        feeAmount: 0n,
        async build(b: SolanaBuildOptions): Promise<BuiltStealthPayment> {
          let rentExemptMinimum = b.rentExemptMinimum;
          if (inv.asset.kind === 'native' && rentExemptMinimum === undefined) {
            if (rpc === undefined) return fail('INVALID_INPUT');
            rentExemptMinimum = await getMinimumBalanceForRentExemption(rpc, 0);
          }
          return buildStealthPaymentTx({
            payer: b.payer,
            ...(b.feePayer === undefined ? {} : { feePayer: b.feePayer }),
            spendPublicKey: recipient.spendPublicKey,
            viewPublicKey: recipient.viewPublicKey,
            asset: inv.asset,
            amount,
            lifetime: b.lifetime,
            ...(rentExemptMinimum === undefined ? {} : { rentExemptMinimum }),
            ...(b.payerTokenAccount === undefined ? {} : { payerTokenAccount: b.payerTokenAccount }),
            ...(b.rng === undefined ? {} : { rng: b.rng }),
          });
        },
      };
    },

    scan(range: ScanRange, keys: ViewCapability, signal: AbortSignal): AsyncIterable<DetectedSolanaPayment> {
      if (rpc === undefined) return fail('UNSUPPORTED');
      const records = fetchAnnouncements(rpc, {
        fromSlot: range.fromBlock,
        ...(range.toBlock === undefined ? {} : { toSlot: range.toBlock }),
        ...(deps.announcementIndexAddress === undefined
          ? {}
          : { indexAddress: deps.announcementIndexAddress }),
        signal,
      });
      return scanAnnouncements(records, keys.viewingSecret, keys.spendingPublicKey, signal);
    },
  };
}
