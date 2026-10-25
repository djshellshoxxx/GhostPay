import { toHex } from '../ecc.js';
import { fail } from '../errors.js';
import type { HeaderNetwork } from '../header.js';
import { scanBlocks, type ReceivedOutput, type ScanBlocksParams } from './scanner.js';

/** Blocks remembered for reorg detection (spec 12). */
export const SCAN_REORG_WINDOW = 100;

/** A received output remembered across sessions. Contains no secret (the spend tweak is re-derived by scanning). */
export interface ScanStateMatch {
  readonly height: number;
  readonly blockHash: string;
  /** 32-byte x-only output key, hex. */
  readonly xOnlyPublicKey: string;
  readonly k: number;
  readonly label: number | null;
  readonly txid?: string;
  readonly vout?: number;
  readonly amountSats?: bigint;
  /** `pending`: its block left the best chain; it is confirmed again only if a rescan finds it. */
  readonly status: 'confirmed' | 'pending';
}

/**
 * Resumable scan progress (spec 12 `ScanState`).
 *
 * @security Not secret, but private: it reveals which outputs belong to the wallet. Encrypt it at rest
 * (the caller's store does this; this module only serializes).
 */
export interface ScanState {
  readonly version: 1;
  readonly network: HeaderNetwork;
  /** Wallet birth height: nothing below it is scanned. */
  readonly birthHeight: number;
  /** Last fully scanned height (`birthHeight - 1` before the first block). */
  readonly lastHeight: number;
  readonly lastHash: string | null;
  /** Up to {@link SCAN_REORG_WINDOW} most recent scanned blocks, ascending. */
  readonly recent: readonly { readonly height: number; readonly hash: string }[];
  readonly matches: readonly ScanStateMatch[];
}

const NETWORKS: readonly HeaderNetwork[] = ['mainnet', 'testnet4', 'signet', 'regtest'];
const HEX64 = /^[0-9a-f]{64}$/;
const MAX_HEIGHT = 0xffffffff;
const MAX_SATS = 21_000_000n * 100_000_000n;
const MAX_MATCHES = 1_000_000;

const isHeight = (h: unknown): h is number => Number.isSafeInteger(h) && (h as number) >= 0 && (h as number) <= MAX_HEIGHT;

export function createScanState(network: HeaderNetwork, birthHeight: number): ScanState {
  if (!NETWORKS.includes(network) || !isHeight(birthHeight)) return fail('INVALID_INPUT');
  return { version: 1, network, birthHeight, lastHeight: birthHeight - 1, lastHash: null, recent: [], matches: [] };
}

const matchKey = (m: { readonly txid?: string; readonly vout?: number; readonly xOnlyPublicKey: string }): string =>
  m.txid !== undefined && m.vout !== undefined ? `${m.txid}:${String(m.vout)}` : `key:${m.xOnlyPublicKey}`;

/** Appends one fully scanned block (must be `lastHeight + 1`) and its outputs. Outputs seen before are re-confirmed in place. */
export function recordScannedBlock(state: ScanState, height: number, hash: string, found: readonly ReceivedOutput[]): ScanState {
  if (height !== state.lastHeight + 1 || !HEX64.test(hash)) return fail('INVALID_INPUT');
  const matches = new Map(state.matches.map((m) => [matchKey(m), m]));
  for (const f of found) {
    if (f.height !== height || f.blockHash !== hash) return fail('INVALID_INPUT');
    const m: ScanStateMatch = {
      height,
      blockHash: hash,
      xOnlyPublicKey: toHex(f.xOnlyPublicKey),
      k: f.k,
      label: f.label,
      ...(f.txid === undefined ? {} : { txid: f.txid }),
      ...(f.vout === undefined ? {} : { vout: f.vout }),
      ...(f.amountSats === undefined ? {} : { amountSats: f.amountSats }),
      status: 'confirmed',
    };
    matches.delete(matchKey(m));
    matches.set(matchKey(m), m);
  }
  const recent = [...state.recent, { height, hash }].slice(-SCAN_REORG_WINDOW);
  return { ...state, lastHeight: height, lastHash: hash, recent, matches: [...matches.values()] };
}

export interface ReconcileResult {
  readonly state: ScanState;
  readonly rolledBack: boolean;
  /** Next height to scan. */
  readonly resumeHeight: number;
}

/**
 * Compares remembered blocks with the current best chain (`hashAt`, e.g. a verified {@link HeaderChain}).
 * On a mismatch it rolls back to the highest remembered block still on the chain and marks every match above
 * it `pending`; with no common block inside the window it restarts from `birthHeight` and marks all `pending`.
 */
export async function reconcileScanState(
  state: ScanState,
  hashAt: (height: number) => string | undefined | Promise<string | undefined>,
): Promise<ReconcileResult> {
  if (state.recent.length === 0) return { state, rolledBack: false, resumeHeight: state.lastHeight + 1 };
  let ancestor: { height: number; hash: string } | undefined;
  for (let i = state.recent.length - 1; i >= 0; i--) {
    const r = state.recent[i] as { height: number; hash: string };
    if ((await hashAt(r.height)) === r.hash) {
      ancestor = r;
      break;
    }
  }
  if (ancestor !== undefined && ancestor.height === state.lastHeight) return { state, rolledBack: false, resumeHeight: state.lastHeight + 1 };
  const keepTo = ancestor?.height ?? state.birthHeight - 1;
  const next: ScanState = {
    ...state,
    lastHeight: keepTo,
    lastHash: ancestor?.hash ?? null,
    recent: state.recent.filter((r) => r.height <= keepTo),
    matches: state.matches.map((m) => (m.height > keepTo ? { ...m, status: 'pending' as const } : m)),
  };
  return { state: next, rolledBack: true, resumeHeight: keepTo + 1 };
}

/** JSON text of a {@link ScanState} (amounts as decimal strings). */
export function serializeScanState(state: ScanState): string {
  return JSON.stringify({
    ...state,
    matches: state.matches.map((m) => (m.amountSats === undefined ? m : { ...m, amountSats: m.amountSats.toString() })),
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseMatch(v: unknown): ScanStateMatch {
  if (!isRecord(v)) return fail('INVALID_INPUT');
  const { height, blockHash, xOnlyPublicKey, k, label, txid, vout, amountSats, status } = v;
  if (!isHeight(height) || typeof blockHash !== 'string' || !HEX64.test(blockHash) || typeof xOnlyPublicKey !== 'string' || !HEX64.test(xOnlyPublicKey)) {
    return fail('INVALID_INPUT');
  }
  if (!Number.isSafeInteger(k) || (k as number) < 0 || (label !== null && !isHeight(label)) || (status !== 'confirmed' && status !== 'pending')) {
    return fail('INVALID_INPUT');
  }
  if (txid !== undefined && (typeof txid !== 'string' || !HEX64.test(txid))) return fail('INVALID_INPUT');
  if (vout !== undefined && !isHeight(vout)) return fail('INVALID_INPUT');
  let amount: bigint | undefined;
  if (amountSats !== undefined) {
    if (typeof amountSats !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(amountSats)) return fail('INVALID_INPUT');
    amount = BigInt(amountSats);
    if (amount > MAX_SATS) return fail('INVALID_INPUT');
  }
  return {
    height,
    blockHash,
    xOnlyPublicKey,
    k: k as number,
    label: label,
    ...(txid === undefined ? {} : { txid: txid }),
    ...(vout === undefined ? {} : { vout: vout }),
    ...(amount === undefined ? {} : { amountSats: amount }),
    status,
  };
}

/** Strict inverse of {@link serializeScanState}; anything malformed or inconsistent is `INVALID_INPUT`. */
export function parseScanState(text: string): ScanState {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return fail('INVALID_INPUT');
  }
  if (!isRecord(v) || v['version'] !== 1) return fail('INVALID_INPUT');
  const { network, birthHeight, lastHeight, lastHash, recent, matches } = v;
  if (!NETWORKS.includes(network as HeaderNetwork) || !isHeight(birthHeight)) return fail('INVALID_INPUT');
  if (!Number.isSafeInteger(lastHeight) || (lastHeight as number) < birthHeight - 1 || (lastHeight as number) > MAX_HEIGHT) return fail('INVALID_INPUT');
  if (!Array.isArray(recent) || recent.length > SCAN_REORG_WINDOW || !Array.isArray(matches) || matches.length > MAX_MATCHES) return fail('INVALID_INPUT');
  const rec = recent.map((r: unknown) => {
    if (!isRecord(r) || !isHeight(r['height']) || typeof r['hash'] !== 'string' || !HEX64.test(r['hash'])) return fail('INVALID_INPUT');
    return { height: r['height'], hash: r['hash'] };
  });
  for (let i = 1; i < rec.length; i++) if ((rec[i] as { height: number }).height !== (rec[i - 1] as { height: number }).height + 1) return fail('INVALID_INPUT');
  const top = rec[rec.length - 1];
  const empty = lastHeight === birthHeight - 1;
  if (empty ? lastHash !== null || rec.length > 0 : top === undefined || top.height !== lastHeight || top.hash !== lastHash) return fail('INVALID_INPUT');
  if (rec.some((r) => r.height < birthHeight)) return fail('INVALID_INPUT');
  const parsed = matches.map(parseMatch);
  if (parsed.some((m) => m.height < birthHeight || (m.status === 'confirmed' && m.height > (lastHeight as number)))) return fail('INVALID_INPUT');
  return {
    version: 1,
    network: network as HeaderNetwork,
    birthHeight,
    lastHeight: lastHeight as number,
    lastHash: lastHash as string | null,
    recent: rec,
    matches: parsed,
  };
}

/** Persistence seam. Implementations must encrypt at rest (see {@link ScanState} security note). */
export interface ScanStateStore {
  load(): Promise<string | undefined>;
  save(serialized: string): Promise<void>;
}

/** Non-persistent store for tests and sessions that opt out of persistence. */
export class MemoryScanStateStore implements ScanStateStore {
  public value: string | undefined;
  public load(): Promise<string | undefined> {
    return Promise.resolve(this.value);
  }
  public save(serialized: string): Promise<void> {
    this.value = serialized;
    return Promise.resolve();
  }
}

export interface ResumeScanParams extends Omit<ScanBlocksParams, 'fromHeight' | 'onBlock'> {
  readonly state: ScanState;
  /**
   * Best-chain hash lookup for reorg reconciliation, ideally a verified `HeaderChain` (`h => chain.hashAt(h)`).
   * Defaults to asking `source` for each remembered block's hash (trusts the source).
   */
  readonly hashAt?: (height: number) => string | undefined | Promise<string | undefined>;
  /** Receives the new state after reconciliation and after every scanned block. */
  readonly onState?: (state: ScanState) => void | Promise<void>;
}

/**
 * Resumable scan: reconciles `state` with the best chain, scans from the next unscanned height (never below
 * `birthHeight`) and reports progress after every block, so a crash or cancel loses at most one block.
 *
 * @returns Yields received outputs; the generator's return value is the final state.
 */
export async function* resumeScan(p: ResumeScanParams): AsyncGenerator<ReceivedOutput, ScanState> {
  const hashAt = p.hashAt ?? (async (h: number) => (await p.source.getTweaks(h, p.signal)).blockHash);
  const rec = await reconcileScanState(p.state, hashAt);
  let state = rec.state;
  if (rec.rolledBack && p.onState !== undefined) await p.onState(state);
  const from = rec.resumeHeight;
  const tip = p.toHeight ?? (await p.source.getTipHeight(p.signal));
  if (from > tip) return state;
  let pending: ReceivedOutput[] = [];
  for await (const r of scanBlocks({
    ...p,
    fromHeight: from,
    toHeight: tip,
    onBlock: async ({ height, blockHash }) => {
      state = recordScannedBlock(state, height, blockHash, pending);
      pending = [];
      if (p.onState !== undefined) await p.onState(state);
    },
  })) {
    pending.push(r);
    yield r;
  }
  return state;
}
