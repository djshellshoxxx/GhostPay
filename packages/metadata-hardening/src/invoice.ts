import { assertTestnetChain, MetadataHardeningError, requireInput } from './guard.js';

/** Plaintext buckets in bytes (spec MH-INV-1). */
export const DEFAULT_PLAINTEXT_BUCKETS: readonly number[] = [256, 1024, 4096];
const PAD_OVERHEAD = 9; // ,"pad":""
const enc = new TextEncoder();

/** Result of {@link padLengthFor}. */
export interface PadPlan {
  readonly target: number;
  readonly padChars: number;
}

/**
 * MH-INV-1: pad length so a canonical private-part plaintext reaches the next bucket.
 *
 * @param plaintextBytes Canonical UTF-8 length of the private part WITHOUT padding (>= 2).
 * @throws {MetadataHardeningError} `LIMIT_EXCEEDED` when it exceeds the largest bucket.
 */
export function padLengthFor(plaintextBytes: number, buckets: readonly number[] = DEFAULT_PLAINTEXT_BUCKETS): PadPlan {
  requireInput(Number.isInteger(plaintextBytes) && plaintextBytes >= 2, 'plaintext length out of range');
  requireInput(buckets.length > 0 && buckets.every((b) => Number.isInteger(b) && b > 0), 'bad buckets');
  const target = buckets.slice().sort((a, b) => a - b).find((b) => b >= plaintextBytes + PAD_OVERHEAD);
  if (target === undefined) throw new MetadataHardeningError('LIMIT_EXCEEDED', 'private part exceeds the largest bucket');
  return { target, padChars: target - plaintextBytes - PAD_OVERHEAD };
}

/**
 * MH-INV-1: adds `pad` (zeros) to the private part so the canonical plaintext hits a bucket.
 *
 * @param part Private part (`lineItems`, `memo`), no `pad` member.
 * @param canonicalize The invoice-schema canonical-JSON serialiser; keys must sort so `pad` is last
 * (`lineItems` < `memo` < `pad`). The result is verified against the bucket and a mismatch throws.
 *
 * Hides: memo/line-item length from anyone who sees the ciphertext. Does NOT hide that an invoice
 * exists, plaintext fields, or content from whoever holds the link. Only useful with MH-INV-2.
 */
export function padPrivatePart(
  part: Readonly<Record<string, unknown>>,
  canonicalize: (v: unknown) => string,
  buckets: readonly number[] = DEFAULT_PLAINTEXT_BUCKETS,
): Record<string, unknown> {
  requireInput(!('pad' in part), 'private part already has pad');
  const plan = padLengthFor(enc.encode(canonicalize(part)).length, buckets);
  const out = { ...part, pad: '0'.repeat(plan.padChars) };
  if (enc.encode(canonicalize(out)).length !== plan.target) {
    throw new MetadataHardeningError('INVALID_INPUT', 'canonicalizer does not produce bucket-sized output');
  }
  return out;
}

/**
 * MH-INV-1 R3/R4: removes the padding; non-canonical padding (anything but `0` characters) is
 * rejected. Unpadded parts pass through.
 */
export function stripPrivatePad(part: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const { pad, ...rest } = part;
  if (pad === undefined) return rest;
  if (typeof pad !== 'string' || !/^0*$/.test(pad)) {
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

function grid(opts: CoarseTimeOptions): number {
  assertTestnetChain(opts.chainId);
  const g = opts.gridSec ?? 3600;
  requireInput(Number.isInteger(g) && g >= 1 && g <= 86_400, 'grid out of range');
  return g;
}

/**
 * MH-INV-3 R1: rounds `expiresAt` UP to the grid; result in [requested, requested+grid).
 * Cost: expiry up to one grid step later than requested.
 */
export function coarsenExpiry(requestedSec: number, opts: CoarseTimeOptions): number {
  const g = grid(opts);
  requireInput(Number.isSafeInteger(requestedSec) && requestedSec >= 0, 'time out of range');
  return Math.ceil(requestedSec / g) * g;
}

/**
 * MH-INV-3 R2: rounds `quote.timestamp` DOWN to the grid; result <= now, so it is never in the
 * future. Does NOT hide the hour, or chain payment time.
 */
export function coarsenQuoteTimestamp(tsSec: number, nowSec: number, opts: CoarseTimeOptions): number {
  const g = grid(opts);
  requireInput(Number.isSafeInteger(tsSec) && tsSec >= 0 && Number.isSafeInteger(nowSec) && tsSec <= nowSec, 'timestamp must be <= now');
  return Math.floor(tsSec / g) * g;
}
