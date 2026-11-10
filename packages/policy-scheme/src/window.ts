import { fail } from './errors.js';
import { UNLIMITED } from './limits.js';
import { MAX_UINT256, MAX_UINT64 } from './types.js';

/** `PolicyAccount.windowState(token)`: `(window, bucket, current, previous)`. */
export interface WindowState {
  /** Window length recorded at first use (0 if never used). */
  readonly window: bigint;
  /** Index `timestamp / window` of the bucket `current` belongs to. */
  readonly bucket: bigint;
  /** Amount executed in `bucket`. */
  readonly current: bigint;
  /** Amount executed in `bucket - 1`. */
  readonly previous: bigint;
}

/** The limit fields of a leaf (`TokenLimit` without the token). */
export interface WindowLeaf {
  readonly limit: bigint;
  readonly windowSeconds: bigint;
}

/** @internal */
function checkState(s: WindowState): WindowState {
  for (const k of ['window', 'bucket'] as const) {
    if (typeof s[k] !== 'bigint' || s[k] < 0n || s[k] > MAX_UINT64) fail('INVALID_INPUT', `state.${k}`);
  }
  for (const k of ['current', 'previous'] as const) {
    if (typeof s[k] !== 'bigint' || s[k] < 0n || s[k] > MAX_UINT256) fail('INVALID_INPUT', `state.${k}`);
  }
  return s;
}

/** @internal Limited leaf only. */
function checkLeaf(l: WindowLeaf): WindowLeaf {
  if (typeof l.limit !== 'bigint' || l.limit < 1n || l.limit > MAX_UINT256) return fail('INVALID_LIMIT', 'limit');
  if (typeof l.windowSeconds !== 'bigint' || l.windowSeconds < 0n || l.windowSeconds > MAX_UINT64) return fail('INVALID_LIMIT', 'windowSeconds');
  if (l.limit !== UNLIMITED && l.windowSeconds === 0n) return fail('INVALID_LIMIT', 'windowSeconds');
  return l;
}

/** @internal State after rolling to `at`, exactly as `_consume` does before the comparison. */
function roll(s: WindowState, window: bigint, at: bigint): WindowState {
  if (s.window !== 0n && s.window !== window) return fail('INVALID_LIMIT', 'window mismatch');
  if (typeof at !== 'bigint' || at < 0n || at > MAX_UINT64) return fail('INVALID_INPUT', 'at');
  const bucket = at / window;
  if (bucket === s.bucket) return { window, bucket, current: s.current, previous: s.previous };
  return { window, bucket, current: 0n, previous: bucket === s.bucket + 1n ? s.current : 0n };
}

/**
 * How much of `token` may still leave the account at timestamp `at` under one limit leaf.
 *
 * @remarks Mirrors `PolicyAccount._consume` (two fixed buckets of `windowSeconds`): roll the stored
 * state to bucket `floor(at / windowSeconds)`, then `limit - (previous + current)`, clamped at 0.
 * Unlimited leaves return {@link UNLIMITED}. Consumption happens at **execution**, so pass the
 * earliest execution time (`now + delay`), and subtract other pending requests of the same token:
 * the result is then a conservative bound (rolling only ever frees capacity).
 *
 * @param state `windowState(token)` read from the account.
 * @param leaf The token's leaf.
 * @param at Unix seconds of the execution being planned.
 * @returns Headroom in base units.
 * @throws {PolicySchemeError} `INVALID_LIMIT` (bad leaf or the account already uses another window
 * length for this token, which makes every execution revert with `WindowMismatch`), `INVALID_INPUT`.
 * @security Public data. A thief holding the owner key can consume headroom first; this is a
 * planning aid, not a reservation.
 * @testVector client-v1.window
 */
export function windowHeadroom(state: WindowState, leaf: WindowLeaf, at: bigint): bigint {
  const l = checkLeaf(leaf);
  const s = checkState(state);
  if (l.limit === UNLIMITED) return UNLIMITED;
  const r = roll(s, l.windowSeconds, at);
  const used = r.previous + r.current;
  return used >= l.limit ? 0n : l.limit - used;
}

/**
 * State after executing `amount` at `at`, or an error where `_consume` would revert.
 *
 * @param state Current state.
 * @param leaf Limited leaf (unlimited leaves are never consumed on-chain).
 * @param amount Executed amount.
 * @param at Execution timestamp.
 * @returns New state.
 * @throws {PolicySchemeError} `INVALID_LIMIT` (`WindowLimitExceeded`, `WindowMismatch`, unlimited or bad leaf), `INVALID_INPUT`.
 * @security Public data.
 * @testVector client-v1.window
 */
export function consumeWindow(state: WindowState, leaf: WindowLeaf, amount: bigint, at: bigint): WindowState {
  const l = checkLeaf(leaf);
  const s = checkState(state);
  if (l.limit === UNLIMITED) return fail('INVALID_LIMIT', 'unlimited leaves are not consumed');
  if (typeof amount !== 'bigint' || amount < 0n || amount > MAX_UINT256) return fail('INVALID_INPUT', 'amount');
  const r = roll(s, l.windowSeconds, at);
  const used = r.previous + r.current;
  if (used > l.limit || amount > l.limit - used) return fail('INVALID_LIMIT', 'window limit exceeded');
  return { ...r, current: r.current + amount };
}
