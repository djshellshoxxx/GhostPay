import { getAddress, isAddress, type Address } from 'viem';
import { AddressSafetyError, reject, type Reason } from './errors.js';

const HEX40 = /^0x[0-9a-fA-F]{40}$/;
const MAX_ADDRESS_TEXT = 1024;

/** Destination classification, see {@link classifyDestination}. */
export type DestinationClass = 'saved' | 'own_stealth' | 'fee_recipient' | 'lookalike_of_saved' | 'new';

/** Result of {@link lookalikeScore}. */
export interface LookalikeScore {
  /** Number of equal leading nibbles (after `0x`). */
  readonly prefix: number;
  /** Number of equal trailing nibbles. */
  readonly suffix: number;
  /** Number of differing nibbles. */
  readonly hamming: number;
}

/** Options for {@link findLookalikes}. */
export interface LookalikeOptions {
  /** Leading nibbles that must match (default 4). */
  readonly prefix?: number;
  /** Trailing nibbles that must match (default 4). */
  readonly suffix?: number;
}

/** Context for {@link classifyDestination}. */
export interface DestinationContext {
  readonly saved: readonly Address[];
  readonly ownStealth: readonly Address[];
  readonly feeRecipients: readonly Address[];
  /** Accepted for API compatibility; not used for classification (see DEVIATIONS.md). */
  readonly recentCounterparties?: readonly Address[];
}

/**
 * Strictly parses an EVM address: `0x` + 40 hex. All-lowercase is accepted, mixed case must be a
 * valid EIP-55 checksum, all-uppercase letters are rejected.
 * @param s Candidate text (no trimming is performed).
 * @returns The EIP-55 checksummed address, or a {@link Reason}.
 * @security Rejects whitespace, `0X`, short/long input and wrong checksums; the returned value is
 * the canonical form and should be the only form stored or compared by callers.
 */
export function parseStrictAddress(s: string): Address | Reason {
  if (typeof s !== 'string') return reject('not_a_string');
  if (s.length !== 42) return reject('bad_length');
  if (!HEX40.test(s)) return reject('bad_format');
  const body = s.slice(2);
  const lower = body.toLowerCase();
  if (body === lower) return getAddress(s);
  if (body === body.toUpperCase()) return reject('all_uppercase');
  const checksummed = getAddress(s);
  return checksummed === s ? checksummed : reject('bad_checksum');
}

function nibbles(a: Address): string {
  if (!isAddress(a, { strict: false })) throw new AddressSafetyError('invalid address argument');
  return a.slice(2).toLowerCase();
}

/**
 * Compares two addresses nibble by nibble, case-insensitively.
 * @param a First address.
 * @param b Second address.
 * @returns Matching prefix/suffix lengths and number of differing nibbles.
 * @throws {AddressSafetyError} If either argument is not a well-formed address.
 * @security Pure and constant-size; use it to detect address-poisoning lookalikes.
 */
export function lookalikeScore(a: Address, b: Address): LookalikeScore {
  const x = nibbles(a);
  const y = nibbles(b);
  let prefix = 0;
  while (prefix < x.length && x[prefix] === y[prefix]) prefix++;
  let suffix = 0;
  while (suffix < x.length && x[x.length - 1 - suffix] === y[y.length - 1 - suffix]) suffix++;
  let hamming = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) hamming++;
  return { prefix, suffix, hamming };
}

function checkN(n: number, name: string): void {
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new AddressSafetyError(`${name} must be an integer in 1..20`);
  }
}

/**
 * Finds known addresses that share the first and last N nibbles with `candidate` but differ.
 * @param candidate Address to check.
 * @param known Trusted addresses (saved, own, fee recipients).
 * @param opts Nibble counts, default 4 and 4.
 * @returns Lookalikes in input order; an identical address (any case) is never a lookalike.
 * @throws {AddressSafetyError} On malformed addresses or counts outside 1..20.
 * @security A non-empty result must be a hard stop in the sweep UI (address poisoning).
 */
export function findLookalikes(
  candidate: Address,
  known: readonly Address[],
  opts: LookalikeOptions = {},
): Address[] {
  const p = opts.prefix ?? 4;
  const s = opts.suffix ?? 4;
  checkN(p, 'prefix');
  checkN(s, 'suffix');
  return known.filter((k) => {
    const sc = lookalikeScore(candidate, k);
    return sc.hamming > 0 && sc.prefix >= p && sc.suffix >= s;
  });
}

function includesAddr(list: readonly Address[], a: Address): boolean {
  const n = nibbles(a);
  return list.some((x) => nibbles(x) === n);
}

/**
 * Classifies a sweep destination against what the user already knows.
 * @param dest Destination address.
 * @param ctx Known address sets.
 * @returns `saved`, `own_stealth`, `fee_recipient`, `lookalike_of_saved` or `new`.
 * @security Exact matches win over lookalike checks; `lookalike_of_saved` must be refused and
 * `new` must carry the D1 linkability warning.
 */
export function classifyDestination(dest: Address, ctx: DestinationContext): DestinationClass {
  if (includesAddr(ctx.saved, dest)) return 'saved';
  if (includesAddr(ctx.ownStealth, dest)) return 'own_stealth';
  if (includesAddr(ctx.feeRecipients, dest)) return 'fee_recipient';
  if (findLookalikes(dest, ctx.saved).length > 0) return 'lookalike_of_saved';
  return 'new';
}

/**
 * Formats an address in fixed groups of four nibbles, never truncated.
 * @param a Address.
 * @returns EIP-55 checksummed text such as `0xAbCd 1234 ...` (ten groups).
 * @throws {AddressSafetyError} If `a` is malformed or longer than the sane limit.
 * @security Confirmation views must show this full form, never `0x1234...abcd`.
 */
export function fingerprint(a: Address): string {
  if (typeof a !== 'string' || a.length > MAX_ADDRESS_TEXT || !isAddress(a, { strict: false })) {
    throw new AddressSafetyError('invalid address argument');
  }
  const body = getAddress(a).slice(2);
  const groups = body.match(/.{4}/g) ?? [];
  return `0x${groups.join(' ')}`;
}
