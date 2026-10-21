import { base58 } from '@scure/base';
import { concatBytes } from '@noble/curves/utils.js';
import { fail } from './errors.js';
import { parsePublicPoint, type PublicPoint } from './ed25519.js';

/** Memo text prefix of a version-1 announcement. */
export const ANNOUNCEMENT_PREFIX = 'gpst1:';
const BODY_LEN = 32 + 1;
const MAX_MEMO_LEN = 96;

/** Parsed announcement body. */
export interface Announcement {
  readonly ephemeralPublicKey: PublicPoint;
  readonly viewTag: number;
}

/**
 * Encodes an announcement as SPL Memo UTF-8 text: `gpst1:` + base58(R || viewTag).
 *
 * @remarks Pure ASCII, <= 52 characters. The stealth address itself is NOT included: it is
 * already visible as the transfer destination, and the scanner recomputes it.
 * @param ephemeralPublicKey `R`.
 * @param viewTag Byte 0..255.
 * @returns Memo string.
 * @throws {SolanaStealthError} `INVALID_POINT`, `INVALID_ANNOUNCEMENT`.
 */
export function encodeAnnouncementMemo(ephemeralPublicKey: Uint8Array, viewTag: number): string {
  const R = parsePublicPoint(ephemeralPublicKey);
  if (!Number.isInteger(viewTag) || viewTag < 0 || viewTag > 255) return fail('INVALID_ANNOUNCEMENT');
  return ANNOUNCEMENT_PREFIX + base58.encode(concatBytes(R, Uint8Array.of(viewTag)));
}

/**
 * Parses memo text. Returns `null` for memos that are not GhostPay announcements.
 *
 * @param memo Memo UTF-8 text.
 * @returns Announcement or `null` (foreign memo).
 * @throws {SolanaStealthError} `INVALID_ANNOUNCEMENT` / `INVALID_POINT` for a memo that claims
 * the prefix but is malformed.
 */
export function parseAnnouncementMemo(memo: string): Announcement | null {
  if (typeof memo !== 'string' || !memo.startsWith(ANNOUNCEMENT_PREFIX)) return null;
  if (memo.length > MAX_MEMO_LEN) return fail('INVALID_ANNOUNCEMENT');
  let raw: Uint8Array;
  try {
    raw = base58.decode(memo.slice(ANNOUNCEMENT_PREFIX.length));
  } catch {
    return fail('INVALID_ANNOUNCEMENT');
  }
  if (raw.length !== BODY_LEN) return fail('INVALID_ANNOUNCEMENT');
  return {
    ephemeralPublicKey: parsePublicPoint(raw.subarray(0, 32)),
    viewTag: raw[32] as number,
  };
}
