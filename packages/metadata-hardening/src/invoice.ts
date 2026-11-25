import { assertTestnetChain, MetadataHardeningError, requireInput } from './guard.js';
import { fail, requireArray, requireFunction, requireRecord } from './validate.js';

/** Plaintext buckets in bytes (spec MH-INV-1). Frozen. */
export const DEFAULT_PLAINTEXT_BUCKETS: readonly number[] = Object.freeze([256, 1024, 4096]);
const PAD_OVERHEAD = 9; // ,"pad":""
/** Largest bucket accepted: the invoice link limit is 16 KiB (`envelope.ts`), so more is unusable. */
const MAX_BUCKET = 16_384;
const MAX_BUCKETS = 16;
const enc = new TextEncoder();

/** Result of {@link padLengthFor}. */
export interface PadPlan {
  readonly target: number;
  readonly padChars: number;
}

function checkBuckets(buckets: unknown): asserts buckets is readonly number[] {
  requireArray(buckets, 'buckets', MAX_BUCKETS, 'INVALID_INPUT');
  requireInput(buckets.length > 0 && buckets.every((b) => Number.isInteger(b) && (b as number) > 0 && (b as number) <= MAX_BUCKET), 'bad buckets');
}

/**
 * MH-INV-1: pad length so a canonical private-part plaintext reaches the next bucket.
 *
 * @param plaintextBytes Canonical UTF-8 length of the private part WITHOUT padding (>= 2).
 * @param buckets Ascending-or-not list of 1..16 bucket sizes, each 1..16384 bytes.
 * @throws {MetadataHardeningError} `INVALID_INPUT`; `LIMIT_EXCEEDED` when it exceeds the largest bucket.
 */
export function padLengthFor(plaintextBytes: number, buckets: readonly number[] = DEFAULT_PLAINTEXT_BUCKETS): PadPlan {
  requireInput(Number.isInteger(plaintextBytes) && plaintextBytes >= 2, 'plaintext length out of range');
  checkBuckets(buckets);
  const target = buckets.slice().sort((a, b) => a - b).find((b) => b >= plaintextBytes + PAD_OVERHEAD);
  if (target === undefined) throw new MetadataHardeningError('LIMIT_EXCEEDED', 'private part exceeds the largest bucket');
  return { target, padChars: target - plaintextBytes - PAD_OVERHEAD };
}

/** Runs the caller's canonicalizer; a throw or a non-string result becomes a typed error with no caller text. */
function canonicalBytes(canonicalize: (v: unknown) => string, value: unknown): number {
  let text: unknown;
  try {
    text = canonicalize(value);
  } catch {
    throw new MetadataHardeningError('INVALID_INPUT', 'canonicalizer failed');
  }
  if (typeof text !== 'string') fail('canonicalizer must return a string');
  return enc.encode(text).length;
}

/**
 * MH-INV-1: adds `pad` (zeros) to the private part so the canonical plaintext hits a bucket.
 *
 * @param part Private part (`lineItems`, `memo`), no `pad` member (own or inherited).
 * @param canonicalize The invoice-schema canonical-JSON serialiser; keys must sort so `pad` is last
 * (`lineItems` < `memo` < `pad`). The result is verified against the bucket and a mismatch throws.
 * A throwing canonicalizer is reported as `INVALID_INPUT` without its message.
 *
 * Hides: memo/line-item length from anyone who sees the ciphertext. Does NOT hide that an invoice
 * exists, plaintext fields, or content from whoever holds the link. Only useful with MH-INV-2.
 */
export function padPrivatePart(
  part: Readonly<Record<string, unknown>>,
  canonicalize: (v: unknown) => string,
  buckets: readonly number[] = DEFAULT_PLAINTEXT_BUCKETS,
): Record<string, unknown> {
  requireRecord(part, 'private part');
  requireFunction(canonicalize, 'canonicalize');
  requireInput(!('pad' in part), 'private part already has pad');
  const plan = padLengthFor(canonicalBytes(canonicalize, part), buckets);
  const out = { ...part, pad: '0'.repeat(plan.padChars) };
  if (canonicalBytes(canonicalize, out) !== plan.target) {
    throw new MetadataHardeningError('INVALID_INPUT', 'canonicalizer does not produce bucket-sized output');
  }
  return out;
}

/**
 * MH-INV-1 R3/R4: removes the padding; non-canonical padding (anything but up to 16384 `0`
 * characters) is rejected. Unpadded parts pass through. Returns a new object.
 */
export function stripPrivatePad(part: Readonly<Record<string, unknown>>): Record<string, unknown> {
  requireRecord(part, 'private part');
  const { pad, ...rest } = part;
  if (pad === undefined) return rest;
  if (typeof pad !== 'string' || pad.length > MAX_BUCKET || !/^0*$/.test(pad)) {
    throw new MetadataHardeningError('INVALID_INPUT', 'non-canonical padding');
  }
  return rest;
}

/** Options for the coarse-time helpers. */
export interface CoarseTimeOptions {
  readonly chainId: number;
  /** Grid in seconds, default 3600 (hour). */
  readonly gridSec?: number;
}

function grid(opts: CoarseTimeOptions): bigint {
  requireRecord(opts, 'options');
  assertTestnetChain(opts.chainId);
  const g = opts.gridSec ?? 3600;
  requireInput(Number.isInteger(g) && g >= 1 && g <= 86_400, 'grid out of range');
  return BigInt(g);
}

/** Integer seconds as bigint, or an `INVALID_INPUT` error. */
function seconds(v: unknown): bigint {
  requireInput(Number.isSafeInteger(v) && (v as number) >= 0, 'time out of range');
  return BigInt(v as number);
}

/** Back to a number; a result past 2^53 would be inexact, so it is refused. */
function toSafeNumber(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new MetadataHardeningError('LIMIT_EXCEEDED', 'time out of range');
  return Number(v);
}

/**
 * MH-INV-3 R1: rounds `expiresAt` UP to the grid; result in [requested, requested+grid).
 * Cost: expiry up to one grid step later than requested.
 *
 * @remarks Integer arithmetic (bigint): float division loses the remainder near 2^53.
 * @throws {MetadataHardeningError} `INVALID_INPUT`, `UNSUPPORTED_CHAIN`, `LIMIT_EXCEEDED` when the
 * rounded value would exceed 2^53 - 1.
 */
export function coarsenExpiry(requestedSec: number, opts: CoarseTimeOptions): number {
  const g = grid(opts);
  const t = seconds(requestedSec);
  return toSafeNumber(((t + g - 1n) / g) * g);
}

/**
 * MH-INV-3 R2: rounds `quote.timestamp` DOWN to the grid; result <= now, so it is never in the
 * future. Does NOT hide the hour, or chain payment time.
 */
export function coarsenQuoteTimestamp(tsSec: number, nowSec: number, opts: CoarseTimeOptions): number {
  const g = grid(opts);
  requireInput(Number.isSafeInteger(tsSec) && tsSec >= 0 && Number.isSafeInteger(nowSec) && tsSec <= nowSec, 'timestamp must be <= now');
  return toSafeNumber((BigInt(tsSec) / g) * g);
}
