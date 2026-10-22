import type {
  AnnouncementSource,
  DetectedSolanaPayment,
  FeeCapability,
  SolanaChainAdapter,
  SolanaInvoice,
  SolanaPaymentRequest,
} from './adapter-types.js';
import {
  decodeAnnouncement,
  decodeAnnouncementMemo,
  encodeAnnouncementMemo,
  type SolanaAnnouncement,
} from './announcement.js';
import { fail, SolanaStealthError } from './errors.js';
import { decodeMetaAddress, encodeMetaAddress } from './keys.js';
import { getAssociatedTokenAddress } from './pda.js';
import { decodeAddress } from './point.js';
import { checkAnnouncement, deriveStealthPayment } from './stealth.js';

/** Clusters this proof of concept may be used on. Mainnet is deliberately absent. */
export const ENABLED_SOLANA_CHAINS = ['sol-devnet', 'sol-testnet'] as const;
/** An enabled cluster id. */
export type SolanaChainId = (typeof ENABLED_SOLANA_CHAINS)[number];

/**
 * Fee capability: nothing can be enforced until an on-program fee split exists
 * (spec only). Never advertise an uncollectable fee.
 */
export const SOLANA_FEES: FeeCapability = Object.freeze({
  checkout: 'not_enforceable',
  gasSponsorship: 'not_enforceable',
  flatSecurity: 'not_enforceable',
});

/** Dependencies of the Solana adapter skeleton. */
export interface SolanaAdapterDeps {
  readonly chainId: string;
  readonly source: AnnouncementSource;
}

function decodePayload(payload: Uint8Array | string): SolanaAnnouncement | null {
  try {
    return typeof payload === 'string' ? decodeAnnouncementMemo(payload) : decodeAnnouncement(payload);
  } catch (e) {
    if (e instanceof SolanaStealthError) return null;
    throw e;
  }
}

/**
 * Creates the Solana `ChainAdapter`-shaped skeleton.
 *
 * @remarks No RPC code: announcements come from the injected `source`, and
 * `build()` returns addresses + announcement bytes, not a transaction. Fees are
 * zero and `not_enforceable` on every line.
 *
 * @param deps Enabled cluster id and announcement source.
 * @returns Adapter of family `solana`.
 * @throws {SolanaStealthError} `CHAIN_DISABLED`.
 */
export function createSolanaAdapter(deps: SolanaAdapterDeps): SolanaChainAdapter {
  if (!(ENABLED_SOLANA_CHAINS as readonly string[]).includes(deps.chainId)) fail('CHAIN_DISABLED');
  const { chainId, source } = deps;

  return {
    family: 'solana',
    chainId,
    fees: SOLANA_FEES,

    parseRecipient(input) {
      const keys = decodeMetaAddress(input);
      return {
        family: 'solana',
        canonical: encodeMetaAddress(keys),
        spendingPublicKey: keys.spendPublicKey,
        viewingPublicKey: keys.viewPublicKey,
      };
    },

    buildPaymentRequest(inv: SolanaInvoice, opts = {}): SolanaPaymentRequest {
      if (inv.chainId !== chainId) fail('INVALID_INVOICE');
      const amount = inv.amount ?? opts.quotedTokenAmount;
      if (amount === undefined || amount <= 0n || amount >= 1n << 64n) fail('INVALID_INVOICE');
      const isNative = inv.asset === 'native';
      if (!isNative) decodeAddress(inv.asset);
      const meta = decodeMetaAddress(inv.metaAddress);
      return {
        family: 'solana',
        chainId,
        asset: inv.asset,
        grossAmount: amount,
        netAmount: amount,
        feeAmount: 0n,
        build(b = {}) {
          const p = deriveStealthPayment(meta, b.rng);
          const memo = encodeAnnouncementMemo({
            ephemeralPublicKey: p.ephemeralPublicKey,
            viewTag: p.viewTag,
          });
          return {
            stealthAddress: p.stealthAddress,
            ...(isNative
              ? {}
              : { associatedTokenAddress: getAssociatedTokenAddress(p.stealthAddress, inv.asset) }),
            announcement: p.announcement,
            memo,
          };
        },
      };
    },

    async *scan(range, keys, signal): AsyncGenerator<DetectedSolanaPayment> {
      if (signal.aborted) fail('ABORTED');
      const feed = source.announcements(
        { fromSlot: range.fromBlock, ...(range.toBlock === undefined ? {} : { toSlot: range.toBlock }) },
        signal,
      );
      for await (const rec of feed) {
        if (signal.aborted) fail('ABORTED');
        const ann = decodePayload(rec.payload);
        if (ann === null) continue; // malformed or foreign: untrusted input, skip
        let found;
        try {
          found = checkAnnouncement(ann, keys.viewingSecret, keys.spendingPublicKey, rec.destination);
        } catch (e) {
          // A malformed `destination` from the source is skipped; key errors propagate.
          if (e instanceof SolanaStealthError && e.code === 'INVALID_ADDRESS') continue;
          throw e;
        }
        if (found === null) continue;
        yield {
          family: 'solana',
          slot: rec.slot,
          signature: rec.signature,
          stealthAddress: found.stealthAddress,
          metadata: ann.metadata,
          tweak: found.tweak,
        };
      }
    },
  };
}
