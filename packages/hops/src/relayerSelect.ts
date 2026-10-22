import { randomDelayMs } from './rand.js';
import { HopError, type CryptoLike } from './types.js';

/** Id used for a leg sent by the source stealth key itself. */
export const DIRECT_RELAYER_ID = 'direct';

/**
 * Chooses a relayer id per leg.
 *
 * @remarks `rotate`: uniform, never equal to the previous leg's relayer when >= 2 exist.
 * `same`: one uniformly chosen relayer for all legs (user override; the UI warns). `direct`:
 * only valid for a single hop (HOP-REQ-12).
 *
 * @param relayers Configured relayers.
 * @param selection Policy.
 * @param hops Number of legs.
 * @param rng Random source.
 * @returns One relayer id per leg.
 * @throws {HopError} `INVALID_INPUT` (no relayers) or `ILLEGAL_TRANSITION` (`direct` with hops != 1).
 */
export function assignRelayers(
  relayers: readonly { readonly id: string }[],
  selection: 'rotate' | 'same' | 'direct',
  hops: number,
  rng: CryptoLike,
): string[] {
  if (selection === 'direct') {
    if (hops !== 1) throw new HopError('ILLEGAL_TRANSITION', 'direct relayer selection requires exactly one hop');
    return [DIRECT_RELAYER_ID];
  }
  if (hops === 0) return [];
  const ids = [...new Set(relayers.map((r) => r.id))];
  if (ids.length === 0) throw new HopError('INVALID_INPUT', 'no relayers configured');
  const pick = (pool: readonly string[]): string => pool[randomDelayMs(0, pool.length - 1, rng)] as string;
  if (selection === 'same') {
    const one = pick(ids);
    return Array.from({ length: hops }, () => one);
  }
  const out: string[] = [];
  for (let i = 0; i < hops; i++) {
    const prev = out[i - 1];
    const pool = ids.length >= 2 && prev !== undefined ? ids.filter((x) => x !== prev) : ids;
    out.push(pick(pool));
  }
  return out;
}
