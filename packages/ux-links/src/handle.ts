import { fail } from './errors.js';

/** Why a handle was rejected. */
export type HandleReason =
  | 'NOT_STRING'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INVISIBLE'
  | 'CONFUSABLE_NON_ASCII'
  | 'NON_ASCII'
  | 'INVALID_CHARS'
  | 'BAD_EDGE'
  | 'DOUBLE_SEPARATOR'
  | 'ALL_DIGITS'
  | 'LOOKS_LIKE_ADDRESS'
  | 'RESERVED'
  | 'LOOKALIKE_RESERVED';

/** Result of {@link checkHandle}. */
export type HandleCheck =
  | { readonly ok: true; readonly handle: string; readonly skeleton: string }
  | { readonly ok: false; readonly reason: HandleReason };

/** Minimum and maximum handle length. */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 32;

const RESERVED = [
  'admin',
  'administrator',
  'root',
  'support',
  'help',
  'ghostpay',
  'ghost',
  'official',
  'security',
  'team',
  'staff',
  'wallet',
  'system',
  'null',
  'undefined',
  'api',
  'www',
  'mod',
  'moderator',
  'service',
  'billing',
  'payments',
  'refund',
  'verify',
  'verified',
];

// Non-ASCII characters commonly used to imitate ASCII letters (Cyrillic, Greek, Latin extensions).
const CONFUSABLES: ReadonlyMap<string, string> = new Map([
  ['а', 'a'],
  ['е', 'e'],
  ['о', 'o'],
  ['р', 'p'],
  ['с', 'c'],
  ['х', 'x'],
  ['у', 'y'],
  ['і', 'i'],
  ['ј', 'j'],
  ['ѕ', 's'],
  ['ԁ', 'd'],
  ['һ', 'h'],
  ['ӏ', 'l'],
  ['ԛ', 'q'],
  ['ԝ', 'w'],
  ['ɡ', 'g'],
  ['ο', 'o'],
  ['α', 'a'],
  ['ν', 'v'],
  ['ι', 'i'],
  ['κ', 'k'],
  ['ρ', 'p'],
  ['υ', 'u'],
  ['ɩ', 'i'],
  ['ı', 'i'],
  ['ǀ', 'l'],
  ['ⅼ', 'l'],
  ['０', '0'],
  ['１', '1'],
]);

/**
 * Visual-confusable skeleton of an ASCII handle: lowercases, drops separators,
 * folds `rn`->`m`, `vv`->`w`, `cl`->`d`, and maps `0`->`o`, `1`/`i`->`l`,
 * `5`->`s`, `3`->`e`. Two handles with equal skeletons are treated as
 * look-alikes. Deliberately aggressive: false positives are safer than spoofs.
 * @security Anti-homograph building block. Input must already be ASCII.
 */
export function skeleton(ascii: string): string {
  return ascii
    .toLowerCase()
    .replace(/[-_]/g, '')
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/cl/g, 'd')
    .replace(/[01i53]/g, (c) => ({ '0': 'o', '1': 'l', i: 'l', '5': 's', '3': 'e' })[c] ?? c);
}

const RESERVED_SKELETONS: ReadonlySet<string> = new Set(RESERVED.map(skeleton));
const RESERVED_SET: ReadonlySet<string> = new Set(RESERVED);

function bad(reason: HandleReason): HandleCheck {
  return { ok: false, reason };
}

/**
 * Validates a local pay-me handle.
 *
 * @remarks Accepted form: optional leading `@`, then 3..32 ASCII characters from
 * `[a-z0-9_-]` (ASCII upper case is lowercased), starting and ending with a
 * letter or digit, no consecutive separators, not all digits, not starting
 * `0x`/`st:`, not reserved and not a look-alike of a reserved word. Any
 * non-ASCII character is rejected, with `CONFUSABLE_NON_ASCII` when it (or its
 * NFKC form) imitates an ASCII letter. No trimming is performed.
 * @param input Untrusted text.
 * @returns A discriminated result; never throws.
 * @security Handles are LOCAL labels (no registry, no resolution over a network),
 * so the threat is a spoofed entry in the user's own book or an imported book.
 * @testVector handle-confusables
 */
export function checkHandle(input: unknown): HandleCheck {
  if (typeof input !== 'string') return bad('NOT_STRING');
  const s = input.startsWith('@') ? input.slice(1) : input;
  if (/[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{M}]/u.test(s)) return bad('INVISIBLE');
  if (/[^\p{ASCII}]/u.test(s)) {
    const lookalike = [...s].some(
      (c) => c.charCodeAt(0) > 0x7f && (CONFUSABLES.has(c) || /^\p{ASCII}+$/u.test(c.normalize('NFKC'))),
    );
    return bad(lookalike ? 'CONFUSABLE_NON_ASCII' : 'NON_ASCII');
  }
  if (s.length < HANDLE_MIN) return bad('TOO_SHORT');
  if (s.length > HANDLE_MAX) return bad('TOO_LONG');
  const h = s.toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(h)) return bad('INVALID_CHARS');
  if (!/^[a-z0-9]/.test(h) || !/[a-z0-9]$/.test(h)) return bad('BAD_EDGE');
  if (/[-_]{2}/.test(h)) return bad('DOUBLE_SEPARATOR');
  if (/^[0-9]+$/.test(h)) return bad('ALL_DIGITS');
  if (h.startsWith('0x')) return bad('LOOKS_LIKE_ADDRESS');
  if (RESERVED_SET.has(h)) return bad('RESERVED');
  const sk = skeleton(h);
  if (RESERVED_SKELETONS.has(sk)) return bad('LOOKALIKE_RESERVED');
  return { ok: true, handle: h, skeleton: sk };
}

/**
 * Like {@link checkHandle} but returns the canonical handle or throws.
 * @throws {LinkError} `HANDLE`; the reason is intentionally not in the message.
 */
export function assertHandle(input: unknown): { handle: string; skeleton: string } {
  const r = checkHandle(input);
  if (!r.ok) return fail('HANDLE', 'handle');
  return { handle: r.handle, skeleton: r.skeleton };
}
