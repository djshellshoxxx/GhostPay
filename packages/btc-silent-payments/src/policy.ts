/**
 * Wallet policy for BIP-352 spends (spec 11): destination-reuse warnings and consolidation by label.
 * Pure and side-effect free: nothing here persists, logs or touches a key. The caller stores
 * {@link DestinationHistory} (it holds addresses only) and shows the warnings before signing.
 */
import { fail, SilentPaymentError } from './errors.js';
import { checkLabel } from './labels.js';
import { checkAmountSats, DEFAULT_WALLET_DUST_SATS } from './spend.js';

/** Upper bound on {@link DestinationHistory} entries; the oldest is evicted beyond it. */
export const MAX_DESTINATION_HISTORY_ENTRIES = 1024;
/** Longest accepted destination string (a testnet silent payment address is 118 characters). */
export const MAX_DESTINATION_LENGTH = 256;

/** One destination this wallet has paid before and how many times. */
export interface DestinationHistoryEntry {
  /** Normalized address ({@link normalizeDestination}). */
  readonly destination: string;
  /** Times paid, at least 1. */
  readonly count: number;
}

/**
 * Bounded, JSON-serializable record of destinations paid so far, oldest first. Contains addresses only:
 * no keys, amounts, txids or timestamps. Private data all the same (it is the wallet's payee list).
 */
export interface DestinationHistory {
  readonly version: 1;
  readonly entries: readonly DestinationHistoryEntry[];
}

/** The empty history. */
export const EMPTY_DESTINATION_HISTORY: DestinationHistory = Object.freeze({ version: 1, entries: Object.freeze([]) });

const BECH32_LIKE = /^(bc1|tb1|bcrt1|sp1|tsp1)/i;
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

/**
 * Canonical form of a destination for comparison: trimmed; bech32/bech32m strings (`bc1`, `tb1`, `bcrt1`,
 * `sp1`, `tsp1`) lowercased, base58 kept as is (it is case-sensitive).
 *
 * @throws {SilentPaymentError} `INVALID_INPUT` when empty after trimming, longer than
 * {@link MAX_DESTINATION_LENGTH}, or not printable ASCII without spaces.
 */
export function normalizeDestination(destination: string): string {
  if (typeof destination !== 'string') return fail('INVALID_INPUT');
  const d = destination.trim();
  if (d.length === 0 || d.length > MAX_DESTINATION_LENGTH || !PRINTABLE_ASCII.test(d)) return fail('INVALID_INPUT');
  return BECH32_LIKE.test(d) ? d.toLowerCase() : d;
}

/**
 * Returns a new history with `destination` recorded once more. Bounded: when a new destination would
 * exceed {@link MAX_DESTINATION_HISTORY_ENTRIES}, the oldest entry is dropped. The input is not modified.
 *
 * @throws {SilentPaymentError} `INVALID_INPUT` as {@link normalizeDestination}.
 */
export function recordDestination(history: DestinationHistory, destination: string): DestinationHistory {
  const d = normalizeDestination(destination);
  const i = history.entries.findIndex((e) => e.destination === d);
  const entries = [...history.entries];
  if (i >= 0) {
    const e = entries[i] as DestinationHistoryEntry;
    entries[i] = { destination: d, count: Math.min(e.count + 1, Number.MAX_SAFE_INTEGER) };
  } else {
    if (entries.length >= MAX_DESTINATION_HISTORY_ENTRIES) entries.splice(0, entries.length - MAX_DESTINATION_HISTORY_ENTRIES + 1);
    entries.push({ destination: d, count: 1 });
  }
  return freezeHistory(entries);
}

/** JSON text of `history` (what {@link parseDestinationHistory} accepts). */
export function serializeDestinationHistory(history: DestinationHistory): string {
  return JSON.stringify({ version: history.version, entries: history.entries });
}

/**
 * Validates untrusted stored data into a fresh {@link DestinationHistory}: JSON text or an already parsed
 * value. Everything is checked (version, exact key sets, entry count, each destination as
 * {@link normalizeDestination} already normalized, positive safe-integer counts, no duplicates); anything
 * else fails closed. The result shares nothing with the input.
 *
 * @throws {SilentPaymentError} `INVALID_INPUT`.
 */
export function parseDestinationHistory(input: unknown): DestinationHistory {
  let v: unknown = input;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return fail('INVALID_INPUT');
    }
  }
  if (!isPlainObject(v) || !hasExactKeys(v, ['version', 'entries'])) return fail('INVALID_INPUT');
  const { version, entries } = v;
  if (version !== 1 || !Array.isArray(entries) || entries.length > MAX_DESTINATION_HISTORY_ENTRIES) return fail('INVALID_INPUT');
  const seen = new Set<string>();
  const out: DestinationHistoryEntry[] = [];
  for (const e of entries as unknown[]) {
    if (!isPlainObject(e) || !hasExactKeys(e, ['destination', 'count'])) return fail('INVALID_INPUT');
    const { destination, count } = e;
    if (typeof destination !== 'string' || normalizeDestination(destination) !== destination) return fail('INVALID_INPUT');
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) return fail('INVALID_INPUT');
    if (seen.has(destination)) return fail('INVALID_INPUT');
    seen.add(destination);
    out.push({ destination, count });
  }
  return freezeHistory(out);
}

function freezeHistory(entries: DestinationHistoryEntry[]): DestinationHistory {
  return Object.freeze({ version: 1, entries: Object.freeze(entries.map((e) => Object.freeze(e))) });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasExactKeys(o: Record<string, unknown>, keys: readonly string[]): boolean {
  const ks = Object.keys(o);
  return ks.length === keys.length && keys.every((k) => Object.hasOwn(o, k));
}

/**
 * - `FRESH`: never paid before.
 * - `ADDRESS_REUSED`: a regular address paid before; a second payment is linkable on-chain to the first.
 * - `SILENT_PAYMENT_REPEATED`: a silent payment address paid before; each payment gets a fresh output key, so
 *   nothing links on-chain, but this wallet has paid that recipient before.
 */
export type DestinationReuseCode = 'FRESH' | 'ADDRESS_REUSED' | 'SILENT_PAYMENT_REPEATED';

/** What to show the user before signing (fixed codes; no caller data). */
export interface DestinationReuseWarning {
  readonly reused: boolean;
  /** Times this destination was paid before (0 when fresh). */
  readonly firstSeenCount: number;
  readonly code: DestinationReuseCode;
}

/**
 * Looks `destination` up in `history`. Pure: the history is not changed (record it after the send with
 * {@link recordDestination}).
 *
 * @throws {SilentPaymentError} `INVALID_INPUT` as {@link normalizeDestination}.
 */
export function checkDestinationReuse(destination: string, history: DestinationHistory): DestinationReuseWarning {
  const d = normalizeDestination(destination);
  const hit = history.entries.find((e) => e.destination === d);
  if (hit === undefined) return { reused: false, firstSeenCount: 0, code: 'FRESH' };
  const sp = /^t?sp1/.test(d);
  return { reused: true, firstSeenCount: hit.count, code: sp ? 'SILENT_PAYMENT_REPEATED' : 'ADDRESS_REUSED' };
}

/** Label index of a detected output: `null` for the unlabeled address, `0` for change, `m >= 1` for labels. */
export type OutputLabel = number | null;

/**
 * What label grouping needs from a detected output. Callers map their own records to it: a `ScanState` match or a
 * `FoundOutput` does not qualify as is (no or optional `amountSats`); pass only outputs whose amount is known.
 */
export interface LabeledOutput {
  readonly label: OutputLabel;
  readonly amountSats: bigint;
}

function checkOutput(o: LabeledOutput): void {
  if (o.label !== null) checkLabel(o.label);
  checkAmountSats(o.amountSats);
}

/**
 * Groups outputs by label, in order of first appearance; `null` (unlabeled) and `0` (change) are their own
 * groups. Spending outputs of different labels together links those labels on-chain.
 *
 * @throws {SilentPaymentError} `INVALID_LABEL`, `INVALID_AMOUNT`.
 */
export function groupOutputsByLabel<T extends LabeledOutput>(outputs: readonly T[]): ReadonlyMap<OutputLabel, readonly T[]> {
  const groups = new Map<OutputLabel, T[]>();
  for (const o of outputs) {
    checkOutput(o);
    const g = groups.get(o.label);
    if (g === undefined) groups.set(o.label, [o]);
    else g.push(o);
  }
  return groups;
}

/** Policy refusals of {@link selectOutputsForSweep}. */
export type SpendPolicyCode = 'LABEL_MIX';

const POLICY_MESSAGES: Readonly<Record<SpendPolicyCode, string>> = {
  LABEL_MIX: 'outputs of different labels would be spent in one transaction, which links the labels on-chain; pass force to accept',
};

/** A {@link SilentPaymentError} (`code: 'INVALID_INPUT'`) that also names the policy rule in `policy`. */
export class SpendPolicyError extends SilentPaymentError {
  public readonly policy: SpendPolicyCode;

  public constructor(policy: SpendPolicyCode) {
    super('INVALID_INPUT');
    this.name = 'SpendPolicyError';
    this.message = POLICY_MESSAGES[policy];
    this.policy = policy;
  }
}

/** Parameters of {@link selectOutputsForSweep}. */
export interface SelectOutputsParams<T extends LabeledOutput> {
  readonly outputs: readonly T[];
  /** `single-label`: only outputs of `label`. `all`: every output, refused when labels would mix unless `force`. */
  readonly mode: 'single-label' | 'all';
  /** Required with `single-label` (`null` = the unlabeled address), forbidden with `all`. */
  readonly label?: OutputLabel;
  /** With `all`: accept linking several labels in one transaction. Default false. */
  readonly force?: boolean;
  /** Outputs below this are left out. Default {@link DEFAULT_WALLET_DUST_SATS}. */
  readonly walletDustSats?: bigint;
  /** Keep outputs below `walletDustSats` too. Default false. */
  readonly includeDust?: boolean;
}

/** Result of {@link selectOutputsForSweep}; `outputs` is what to pass to `buildSpendTransaction` / `previewSweep`. */
export interface SweepSelection<T extends LabeledOutput> {
  readonly outputs: readonly T[];
  /** Distinct labels of `outputs`, in order of first appearance. */
  readonly labels: readonly OutputLabel[];
  /** Outputs left out as wallet dust. */
  readonly excludedDust: readonly T[];
  readonly totalSats: bigint;
  /** `true` only when `force` accepted several labels. */
  readonly mixesLabels: boolean;
}

/**
 * Chooses which detected outputs one sweep may spend together: wallet dust is excluded (override with
 * `includeDust` or a lower `walletDustSats`) and outputs of different labels are never mixed unless `force`
 * is set. Order is preserved. An empty selection is a valid answer (nothing to sweep).
 *
 * @throws {SpendPolicyError} `LABEL_MIX` (a `SilentPaymentError` with code `INVALID_INPUT`).
 * @throws {SilentPaymentError} `INVALID_INPUT` (bad mode, label missing or misplaced, bad dust limit),
 * `INVALID_LABEL`, `INVALID_AMOUNT`.
 */
export function selectOutputsForSweep<T extends LabeledOutput>(p: SelectOutputsParams<T>): SweepSelection<T> {
  if (p.mode !== 'single-label' && p.mode !== 'all') return fail('INVALID_INPUT');
  if (p.mode === 'single-label' ? p.label === undefined : p.label !== undefined) return fail('INVALID_INPUT');
  if (p.label !== undefined && p.label !== null) checkLabel(p.label);
  const dust = p.walletDustSats ?? DEFAULT_WALLET_DUST_SATS;
  if (typeof dust !== 'bigint' || dust < 0n) return fail('INVALID_INPUT');
  const outputs: T[] = [];
  const excludedDust: T[] = [];
  const labels: OutputLabel[] = [];
  let totalSats = 0n;
  for (const o of p.outputs) {
    checkOutput(o);
    if (p.mode === 'single-label' && o.label !== p.label) continue;
    if (p.includeDust !== true && o.amountSats < dust) {
      excludedDust.push(o);
      continue;
    }
    outputs.push(o);
    totalSats += o.amountSats;
    if (!labels.includes(o.label)) labels.push(o.label);
  }
  const mixesLabels = labels.length > 1;
  if (mixesLabels && p.force !== true) throw new SpendPolicyError('LABEL_MIX');
  return Object.freeze({
    outputs: Object.freeze(outputs),
    labels: Object.freeze(labels),
    excludedDust: Object.freeze(excludedDust),
    totalSats,
    mixesLabels,
  });
}
