import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { parseEvmAddress, parseMetaAddress } from './address.js';
import { assertNoFormula, DEFAULT_CSV_LIMITS, parseCsv, type CsvLimits } from './csv.js';
import { BillingError } from './errors.js';
import { parseDecimal } from './money.js';

export interface PayoutLimits {
  /** Smallest allowed single payout (base units), > 0. */
  readonly minAmount: bigint;
  /** Per-recipient cap per batch file (after merging). */
  readonly perRecipientMax: bigint;
  readonly maxRecipients: number;
  readonly maxTotal: bigint;
}

export interface ImportOptions {
  readonly chainId: number;
  readonly token: string;
  readonly decimals: number;
  readonly limits: PayoutLimits;
  /** `reject` (default): duplicate destinations are an error. `merge`: amounts are summed. */
  readonly duplicates?: 'reject' | 'merge';
  readonly allowLowercaseAddress?: boolean;
  readonly csv?: CsvLimits;
}

export interface PayoutItem {
  readonly destination: string;
  readonly kind: 'address' | 'meta';
  readonly amount: bigint;
  readonly label: string;
}

export interface ImportIssue {
  readonly row: number;
  readonly field: string;
  readonly code: string;
}

export interface BatchPreview {
  readonly ok: true;
  readonly chainId: number;
  readonly token: string;
  readonly decimals: number;
  readonly items: readonly PayoutItem[];
  readonly total: bigint;
  /** sha256 over the canonical content. The user must confirm this exact value. */
  readonly previewHash: string;
  readonly merged: number;
}

export interface ImportFailure {
  readonly ok: false;
  readonly issues: readonly ImportIssue[];
}

/** Confirmed payout plan: the only object from which payments may be created. */
export interface PayoutPlan {
  readonly planId: string;
  readonly chainId: number;
  readonly token: string;
  readonly items: readonly PayoutItem[];
  readonly total: bigint;
}

const HEADER = ['destination', 'amount', 'label'];
const LABEL_RE = /^[\p{L}\p{N} .,'_()/&:#-]{0,64}$/u;

/**
 * Computes the canonical preview hash of a payout set.
 *
 * @remarks Domain separated; amounts are decimal strings; field separators cannot occur
 * in validated cells, so the encoding is unambiguous.
 */
export function hashItems(chainId: number, token: string, decimals: number, items: readonly PayoutItem[]): string {
  const body = items.map((i) => `${i.destination}|${i.amount.toString()}|${i.label}`).join('\n');
  return bytesToHex(sha256(utf8ToBytes(`ghostpay-payout-v1\n${chainId}\n${token}\n${decimals}\n${body}`)));
}

/**
 * Step 1 of batch CSV import: parse, validate and preview. Creates no payment object.
 *
 * @remarks Header must be exactly `destination,amount,label`. Destination: EIP-55 EVM
 * address (non-ASCII/homoglyph/wrong checksum rejected) or a canonical meta-address.
 * Amount: plain decimal, at most `decimals` places, within limits. Label: no
 * formula-leading characters, restricted character class. All row errors are collected
 * (row number, field, code only; no cell contents are echoed).
 *
 * @security Untrusted file. Nothing is returned that can be paid until {@link confirmBatch}.
 */
export function previewBatch(csvText: string, opts: ImportOptions): BatchPreview | ImportFailure {
  let rows: string[][];
  try {
    rows = parseCsv(csvText, opts.csv ?? DEFAULT_CSV_LIMITS);
  } catch (e) {
    if (e instanceof BillingError)
      return { ok: false, issues: [{ row: Number(/\d+/.exec(e.where ?? '')?.[0] ?? 0), field: 'file', code: e.message }] };
    throw e;
  }
  const issues: ImportIssue[] = [];
  const header = rows[0] as string[];
  if (header.length !== 3 || header.some((h, i) => h !== HEADER[i]))
    return { ok: false, issues: [{ row: 1, field: 'header', code: 'bad header' }] };
  const L = opts.limits;
  const seen = new Map<string, number>();
  const items: PayoutItem[] = [];
  let merged = 0;
  rows.slice(1).forEach((r, k) => {
    const row = k + 2;
    const [dest = '', amt = '', label = ''] = r;
    let destination = '';
    let kind: PayoutItem['kind'] = 'address';
    try {
      if (dest.startsWith('st:eth:')) {
        destination = parseMetaAddress(dest);
        kind = 'meta';
      } else destination = parseEvmAddress(dest, opts.allowLowercaseAddress === true);
    } catch {
      issues.push({ row, field: 'destination', code: 'invalid destination' });
    }
    let amount = 0n;
    try {
      amount = parseDecimal(amt, opts.decimals);
      if (amount < L.minAmount) throw new BillingError('LIMIT', 'below min');
      if (amount > L.perRecipientMax) throw new BillingError('LIMIT', 'above per-recipient max');
    } catch {
      issues.push({ row, field: 'amount', code: 'invalid amount' });
    }
    try {
      assertNoFormula(label, `row ${row}`);
      if (!LABEL_RE.test(label)) throw new BillingError('CSV', 'label chars');
    } catch {
      issues.push({ row, field: 'label', code: 'invalid label' });
    }
    if (destination === '' || amount === 0n) return;
    const key = destination.toLowerCase();
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, items.length);
      items.push({ destination, kind, amount, label });
    } else if (opts.duplicates === 'merge') {
      const prev = items[at] as PayoutItem;
      const sum = prev.amount + amount;
      if (sum > L.perRecipientMax) issues.push({ row, field: 'amount', code: 'merged above max' });
      items[at] = { ...prev, amount: sum };
      merged++;
    } else issues.push({ row, field: 'destination', code: 'duplicate destination' });
  });
  if (items.length === 0 && issues.length === 0) issues.push({ row: 1, field: 'file', code: 'no data rows' });
  if (items.length > L.maxRecipients) issues.push({ row: 0, field: 'file', code: 'too many recipients' });
  const total = items.reduce((a, i) => a + i.amount, 0n);
  if (total > L.maxTotal) issues.push({ row: 0, field: 'file', code: 'total above max' });
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    chainId: opts.chainId,
    token: opts.token,
    decimals: opts.decimals,
    items,
    total,
    previewHash: hashItems(opts.chainId, opts.token, opts.decimals, items),
    merged,
  };
}

/**
 * Step 2: turns a preview into a payout plan only if `confirmedHash` (what the user
 * saw and approved) equals the recomputed hash of the preview contents.
 *
 * @throws {BillingError} `CSV` when the hash does not match or the preview was altered.
 * @security Defeats preview/submit swaps: any edit to items between steps changes the hash.
 */
export function confirmBatch(preview: BatchPreview, confirmedHash: string): PayoutPlan {
  const actual = hashItems(preview.chainId, preview.token, preview.decimals, preview.items);
  const total = preview.items.reduce((a, i) => a + i.amount, 0n);
  if (actual !== preview.previewHash || actual !== confirmedHash || total !== preview.total)
    throw new BillingError('CSV', 'confirmation mismatch');
  return {
    planId: actual,
    chainId: preview.chainId,
    token: preview.token,
    items: preview.items,
    total,
  };
}

export interface Batch {
  readonly batchId: string;
  readonly items: readonly PayoutItem[];
  readonly total: bigint;
}

/**
 * Greedy, order-preserving chunking by item count and batch total. Deterministic:
 * the same plan always yields the same batches and ids, so retries are idempotent.
 *
 * @throws {BillingError} `LIMIT` when a single item exceeds `maxBatchTotal`.
 */
export function chunkBatches(plan: PayoutPlan, maxPerBatch: number, maxBatchTotal: bigint): readonly Batch[] {
  if (!Number.isSafeInteger(maxPerBatch) || maxPerBatch < 1 || maxPerBatch > 1000)
    throw new BillingError('LIMIT', 'invalid batch size');
  const out: Batch[] = [];
  let cur: PayoutItem[] = [];
  let sum = 0n;
  const flush = (): void => {
    if (cur.length === 0) return;
    out.push({
      batchId: bytesToHex(sha256(utf8ToBytes(`${plan.planId}\n${out.length}\n${hashItems(plan.chainId, plan.token, 0, cur)}`))),
      items: cur,
      total: sum,
    });
    cur = [];
    sum = 0n;
  };
  for (const it of plan.items) {
    if (it.amount > maxBatchTotal) throw new BillingError('LIMIT', 'item exceeds batch total');
    if (cur.length >= maxPerBatch || sum + it.amount > maxBatchTotal) flush();
    cur.push(it);
    sum += it.amount;
  }
  flush();
  return out;
}
