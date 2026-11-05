import {
  scanBlocks,
  SilentPaymentError,
  zeroize,
  type SpendableOutput,
} from '@ghostpay/btc-silent-payments';
import type { EsploraClient } from './esplora';
import { EsploraTweakSource } from './esplora';
import type { BtcWallet } from './wallet';

/** A detected, still-unspent silent payment output. */
export interface FoundPayment extends SpendableOutput {
  readonly height: number;
  readonly blockHash: string;
  readonly label: number | null;
  /** The source reported multiple outputs with this same x-only key, or replayed it at another height. */
  readonly duplicateKey: boolean;
}

/** Blocks per scan request: each block means downloading all of its transactions. */
export const MAX_SCAN_BLOCKS = 500;

export interface ScanParams {
  readonly client: EsploraClient;
  readonly wallet: BtcWallet;
  readonly fromHeight: number;
  /** Inclusive; defaults to the server tip. */
  readonly toHeight?: number;
  readonly signal?: AbortSignal;
  readonly onBlock?: (height: number) => void;
}

export interface ScanResult {
  readonly fromHeight: number;
  readonly toHeight: number;
  readonly found: readonly FoundPayment[];
  /** Detected outputs that were already spent (not offered for sweeping). */
  readonly spentCount: number;
}

/** Best-effort wipe of the spend tweaks held by scan results (used on lock, a new scan and unmount). */
export function wipeFound(found: readonly FoundPayment[]): void {
  for (const f of found) zeroize(f.spendTweak);
}

/**
 * Scans a block range for silent payments to the wallet and drops outputs that are already spent.
 * The scan secret stays in this process; the server sees block heights and outpoints only.
 * Every spend tweak the scanner produced that is not in the returned `found` (spent, skipped, or all of them when
 * the scan fails) is wiped before this returns; the caller owns, and must wipe, the returned ones ({@link wipeFound}).
 */
export async function scanForPayments(p: ScanParams): Promise<ScanResult> {
  const { client, wallet, fromHeight, signal } = p;
  if (!Number.isInteger(fromHeight) || fromHeight < 0) throw new SilentPaymentError('INVALID_INPUT');
  const source = new EsploraTweakSource(client, wallet.net);
  const tip = await client.tipHeight(signal);
  const toHeight = Math.min(p.toHeight ?? tip, tip);
  if (toHeight < fromHeight) return { fromHeight, toHeight, found: [], spentCount: 0 };
  if (toHeight - fromHeight + 1 > MAX_SCAN_BLOCKS) throw new SilentPaymentError('INVALID_INPUT');

  const candidates: FoundPayment[] = [];
  const seen = new Set<string>();
  const tweaks = new Set<Uint8Array>();
  const found: FoundPayment[] = [];
  let returned = false;
  try {
    const gen = scanBlocks({
      source,
      keys: { scanSecret: wallet.keys.scanSecret, spendPublicKey: wallet.keys.spendPublicKey },
      fromHeight,
      toHeight,
      ...(signal === undefined ? {} : { signal }),
    });
    for await (const r of gen) {
      tweaks.add(r.spendTweak);
      p.onBlock?.(r.height);
      if (r.txid === undefined || r.vout === undefined || r.amountSats === undefined) continue;
      const id = `${r.txid}:${String(r.vout)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({
        txid: r.txid,
        vout: r.vout,
        amountSats: r.amountSats,
        xOnlyPublicKey: r.xOnlyPublicKey,
        spendTweak: r.spendTweak,
        height: r.height,
        blockHash: r.blockHash,
        label: r.label,
        duplicateKey: r.duplicateKey,
      });
    }
    let spentCount = 0;
    for (const c of candidates) {
      if (await client.isUnspent(c.txid, c.vout, signal)) found.push(c);
      else spentCount++;
    }
    returned = true;
    return { fromHeight, toHeight, found, spentCount };
  } finally {
    // Outputs paying the same key share one tweak buffer: keep every buffer a returned output still uses.
    const kept = new Set<Uint8Array>(returned ? found.map((f) => f.spendTweak) : []);
    for (const t of tweaks) if (!kept.has(t)) zeroize(t);
  }
}
