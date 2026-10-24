import {
  fetchAnnouncements,
  getSlot,
  scanAnnouncements,
  zeroize,
  type SecretScalar,
  type SolanaRpc,
} from '@ghostpay/solana-stealth';
import { getBalance, SolViewError } from './rpc';
import type { SolWallet } from './wallet';

/** A detected one-time address that still holds SOL. */
export interface FoundPayment {
  readonly signature: string;
  readonly slot: bigint;
  readonly stealthAddress: string;
  /** Lamports credited by the funding transaction. */
  readonly receivedLamports: bigint;
  /** Current finalized balance of the one-time address. */
  readonly balanceLamports: bigint;
  /** SPL token credits seen in the funding transaction; this view sweeps SOL only. */
  readonly tokenReceiptCount: number;
  /** Tweak `h`: with the spend secret it gives the one-time spend key. Secret. */
  readonly tweak: SecretScalar;
}

export interface ScanResult {
  readonly fromSlot: bigint;
  readonly toSlot: bigint;
  readonly found: readonly FoundPayment[];
  /** Detected payments whose one-time address is already empty (not offered for sweeping). */
  readonly emptiedCount: number;
}

/** Signature pages per scan: each page is up to 1000 transactions fetched one by one. */
export const MAX_SCAN_PAGES = 3;

export interface ScanParams {
  readonly rpc: SolanaRpc;
  readonly wallet: SolWallet;
  readonly fromSlot: bigint;
  readonly signal?: AbortSignal;
  readonly onFound?: (slot: bigint) => void;
}

/** Best-effort wipe of the tweak secrets held by scan results. */
export function wipeFound(found: readonly FoundPayment[]): void {
  for (const f of found) zeroize(f.tweak);
}

/**
 * Scans finalized announcements from `fromSlot` to the finalized head. The view key stays in this
 * process; the server sees the signatures and transactions requested and the balances checked.
 */
export async function scanForPayments(p: ScanParams): Promise<ScanResult> {
  const { rpc, wallet, fromSlot, signal } = p;
  if (fromSlot < 0n) throw new SolViewError('Enter the first slot to scan.');
  const toSlot = await getSlot(rpc, 'finalized', signal);
  if (toSlot < fromSlot) return { fromSlot, toSlot, found: [], emptiedCount: 0 };
  const records = fetchAnnouncements(rpc, {
    fromSlot,
    toSlot,
    maxPages: MAX_SCAN_PAGES,
    ...(signal === undefined ? {} : { signal }),
  });
  const found: FoundPayment[] = [];
  let emptiedCount = 0;
  const seen = new Set<string>();
  try {
    for await (const d of scanAnnouncements(records, wallet.keys.viewSecret, wallet.keys.spendPublicKey, signal)) {
      p.onFound?.(d.slot);
      if (seen.has(d.stealthAddress)) {
        zeroize(d.tweak);
        continue;
      }
      seen.add(d.stealthAddress);
      const balance = await getBalance(rpc, d.stealthAddress, signal);
      if (balance === 0n) {
        emptiedCount++;
        zeroize(d.tweak);
        continue;
      }
      found.push({
        signature: d.signature,
        slot: d.slot,
        stealthAddress: d.stealthAddress,
        receivedLamports: d.lamportsReceived,
        balanceLamports: balance,
        tokenReceiptCount: d.tokenReceipts.length,
        tweak: d.tweak,
      });
    }
  } catch (e) {
    wipeFound(found);
    throw e;
  }
  return { fromSlot, toSlot, found, emptiedCount };
}
