import {
  assertTestnetChain,
  MetadataHardeningError,
  parseEndpoint,
  randomBelow,
  randomInt,
  requireInput,
  resolveRng,
  shuffle,
  type RandomSource,
} from './guard.js';

/** A sweep waiting to be released. */
export interface PendingSweep {
  readonly id: string;
  /** Signed-order deadline, unix seconds. */
  readonly deadlineSec: number;
}

/** One planned release. */
export type ReleaseDecision =
  | { readonly id: string; readonly status: 'scheduled'; readonly releaseAtMs: number; readonly rank: number }
  | { readonly id: string; readonly status: 'rejected'; readonly reason: 'DEADLINE_TOO_CLOSE' };

/** Options for {@link planRelease}. */
export interface ReleaseOptions {
  readonly chainId: number;
  /** Current time, unix milliseconds. */
  readonly nowMs: number;
  /** Operator `releaseWindowSec`, 1..3600. */
  readonly windowSec: number;
}

/**
 * MH-REL-2: random release time (uniform in the window) and unbiased order per sweep.
 *
 * @remarks Timing only: still one tx per sweep, never a multicall (HY-CON-5). A sweep whose
 * remaining deadline is not longer than the window is rejected with `DEADLINE_TOO_CLOSE` rather
 * than released late. Ties are broken by a shuffle so the order is a uniform permutation.
 * The plan is plain data: keep it in memory only (PO-LOG-2).
 *
 * Hides: arrival time/order versus chain order against a party that sees both edges. Does NOT hide
 * content or the payer-knows-S1 link.
 */
export function planRelease(sweeps: readonly PendingSweep[], opts: ReleaseOptions, rng?: RandomSource): ReleaseDecision[] {
  assertTestnetChain(opts.chainId);
  requireInput(Number.isInteger(opts.windowSec) && opts.windowSec >= 1 && opts.windowSec <= 3600, 'window out of range');
  requireInput(Number.isFinite(opts.nowMs), 'now must be finite');
  const windowMs = opts.windowSec * 1000;
  const ids = new Set<string>();
  for (const s of sweeps) {
    requireInput(!ids.has(s.id), 'duplicate sweep id');
    ids.add(s.id);
    requireInput(Number.isFinite(s.deadlineSec), 'deadline must be finite');
  }
  const decisions: ReleaseDecision[] = [];
  const ok: { id: string; at: number }[] = [];
  for (const s of shuffle(sweeps, rng)) {
    if (s.deadlineSec * 1000 - opts.nowMs <= windowMs) {
      decisions.push({ id: s.id, status: 'rejected', reason: 'DEADLINE_TOO_CLOSE' });
      continue;
    }
    ok.push({ id: s.id, at: opts.nowMs + Number(randomBelow(BigInt(windowMs) + 1n, rng)) });
  }
  const sorted = ok.slice().sort((a, b) => a.at - b.at); // stable: ties keep shuffled order
  sorted.forEach((o, rank) => decisions.push({ id: o.id, status: 'scheduled', releaseAtMs: o.at, rank }));
  return decisions;
}

/** Default body buckets in bytes (spec MH-REL-3 example). */
export const DEFAULT_BODY_BUCKETS: readonly number[] = [1024, 2048, 4096];
const MAX_BODY_BYTES = 16 * 1024;
const PAD_OVERHEAD = 9; // ,"pad":""
const enc = new TextEncoder();

/**
 * MH-REL-3: pads a JSON object so its serialised UTF-8 length is exactly a bucket size, by adding
 * a `pad` member of random lowercase hex.
 *
 * @remarks The relayer must accept `pad` only as bounded hex and discard it ({@link stripPad}).
 * Does NOT hide IP, timing or destination host. Gain is small (spec).
 *
 * @throws {MetadataHardeningError} `LIMIT_EXCEEDED` when the body exceeds the largest bucket;
 * `INVALID_INPUT` when `body` already has `pad`.
 */
export function padBody(
  body: Readonly<Record<string, unknown>>,
  buckets: readonly number[] = DEFAULT_BODY_BUCKETS,
  rng?: RandomSource,
): string {
  requireInput(!('pad' in body), 'body already has a pad member');
  requireInput(buckets.length > 0 && buckets.every((b) => Number.isInteger(b) && b > 0 && b <= MAX_BODY_BYTES), 'bad buckets');
  const base = JSON.stringify(body);
  const baseLen = enc.encode(base).length;
  const empty = base === '{}';
  const overhead = empty ? PAD_OVERHEAD - 1 : PAD_OVERHEAD;
  const target = buckets.slice().sort((a, b) => a - b).find((b) => b >= baseLen + overhead);
  if (target === undefined) throw new MetadataHardeningError('LIMIT_EXCEEDED', 'body exceeds the largest bucket');
  const n = target - baseLen - overhead;
  const bytes = new Uint8Array(Math.ceil(n / 2));
  resolveRng(rng).getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, n);
  return empty ? `{"pad":"${hex}"}` : `${base.slice(0, -1)},"pad":"${hex}"}`;
}

/**
 * MH-REL-3 R1: removes `pad` from a parsed body after checking it is bounded lowercase hex.
 *
 * @throws {MetadataHardeningError} `INVALID_INPUT` when `pad` is not a string of 0..16384 hex digits.
 */
export function stripPad(parsed: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const { pad, ...rest } = parsed;
  if (pad === undefined) return rest;
  requireInput(typeof pad === 'string' && pad.length <= MAX_BODY_BYTES && /^[0-9a-f]*$/.test(pad), 'pad must be bounded hex');
  return rest;
}

const MAX_RELAYERS = 8;

/**
 * MH-REL-4 R1: validates a relayer URL list (1..8 entries, https or loopback http, no credentials,
 * no duplicates).
 *
 * @returns Normalised URLs.
 */
export function validateRelayerUrls(urls: readonly string[]): string[] {
  requireInput(urls.length >= 1 && urls.length <= MAX_RELAYERS, 'relayer list must have 1..8 entries');
  const out = urls.map((u) => parseEndpoint(u));
  requireInput(new Set(out).size === out.length, 'duplicate relayer URL');
  return out;
}

/**
 * MH-REL-4: pins each sweep to one relayer chosen by CSPRNG, so quote and sweep always share it
 * (quote tokens are HMACs of one relayer's secret). Failover needs explicit user confirmation and
 * never silently resends a signed order.
 *
 * Does NOT hide a sweep from its chosen relayer; operators may collude.
 */
export class RelayerPinning {
  private readonly urls: readonly string[];
  private readonly pins = new Map<string, string>();
  private readonly rng: RandomSource | undefined;

  /** @param urls Relayer URLs (validated). @param rng Optional random source. */
  public constructor(urls: readonly string[], rng?: RandomSource) {
    this.urls = validateRelayerUrls(urls);
    this.rng = rng;
  }

  /** Relayer for `sweepId`; the same URL on every call for that id. */
  public assign(sweepId: string): string {
    requireInput(sweepId.length > 0 && sweepId.length <= 128, 'bad sweep id');
    const have = this.pins.get(sweepId);
    if (have !== undefined) return have;
    const pick = this.urls[randomInt(this.urls.length, this.rng)] as string;
    this.pins.set(sweepId, pick);
    return pick;
  }

  /**
   * Re-pins to a different relayer only after the user confirmed.
   *
   * @throws {MetadataHardeningError} `POLICY_REJECTED` without `userConfirmed`, `CONFLICT` with one relayer.
   */
  public failover(sweepId: string, userConfirmed: boolean): string {
    if (!userConfirmed) throw new MetadataHardeningError('POLICY_REJECTED', 'failover needs user confirmation');
    const cur = this.assign(sweepId);
    const others = this.urls.filter((u) => u !== cur);
    if (others.length === 0) throw new MetadataHardeningError('CONFLICT', 'no other relayer configured');
    const pick = others[randomInt(others.length, this.rng)] as string;
    this.pins.set(sweepId, pick);
    return pick;
  }

  /** Forgets a finished sweep (memory only). */
  public release(sweepId: string): void {
    this.pins.delete(sweepId);
  }
}
