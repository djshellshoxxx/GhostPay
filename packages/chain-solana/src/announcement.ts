import { concatBytes } from '@noble/curves/utils.js';
import { base58 } from '@scure/base';
import { fail } from './errors.js';
import { decodePrimeOrderPoint, type PrimeOrderPoint } from './point.js';

/** Announcement layout version. */
export const ANNOUNCEMENT_VERSION = 0x01;
/** Fixed header: version(1) || R(32) || view_tag(1). */
export const ANNOUNCEMENT_HEADER_LENGTH = 34;
/** Maximum opaque metadata length in bytes. */
export const MAX_ANNOUNCEMENT_METADATA = 256;
/** Text prefix of the SPL Memo form (ADR-0017 section 5; the Memo program requires valid UTF-8). */
export const MEMO_PREFIX = 'gpst1:';
/** Memo body: R(32) || view_tag(1), exactly as `@ghostpay/solana-stealth` writes it. */
const MEMO_BODY_LENGTH = 33;
/** Longest memo text accepted (same bound as `@ghostpay/solana-stealth`). */
const MAX_MEMO_LENGTH = 96;

/** Decoded announcement. */
export interface SolanaAnnouncement {
  readonly ephemeralPublicKey: PrimeOrderPoint;
  readonly viewTag: number;
  /** Opaque metadata (0..256 bytes); empty when absent. */
  readonly metadata: Uint8Array;
}

/** Input to {@link encodeAnnouncement}. */
export interface AnnouncementInput {
  readonly ephemeralPublicKey: Uint8Array;
  readonly viewTag: number;
  readonly metadata?: Uint8Array;
}

/**
 * Encodes the binary announcement:
 * `version(1)=0x01 || R(32) || view_tag(1) || metadata(0..256)`.
 *
 * @remarks This package's proposed announcer-program event payload. No such program exists, ADR-0017
 * section 6 specifies a different instruction, and the web app never reads this form: interoperable
 * announcements use the memo form ({@link encodeAnnouncementMemo}). There is no length field: metadata is
 * the remainder, so the encoding is unique per input.
 *
 * @param a R (validated prime-order point), view tag, optional metadata.
 * @returns Encoded bytes.
 * @throws {SolanaStealthError} `INVALID_ANNOUNCEMENT`.
 */
export function encodeAnnouncement(a: AnnouncementInput): Uint8Array {
  const metadata = a.metadata ?? new Uint8Array(0);
  if (!Number.isInteger(a.viewTag) || a.viewTag < 0 || a.viewTag > 255) return fail('INVALID_ANNOUNCEMENT');
  if (!(metadata instanceof Uint8Array) || metadata.length > MAX_ANNOUNCEMENT_METADATA) {
    return fail('INVALID_ANNOUNCEMENT');
  }
  try {
    decodePrimeOrderPoint(a.ephemeralPublicKey);
  } catch {
    return fail('INVALID_ANNOUNCEMENT');
  }
  const out = new Uint8Array(ANNOUNCEMENT_HEADER_LENGTH + metadata.length);
  out[0] = ANNOUNCEMENT_VERSION;
  out.set(a.ephemeralPublicKey, 1);
  out[33] = a.viewTag;
  out.set(metadata, ANNOUNCEMENT_HEADER_LENGTH);
  return out;
}

/**
 * Strictly decodes a binary announcement.
 *
 * @remarks Rejects: length < 34 or > 290, version != 0x01, and any R that is
 * not a canonical prime-order non-identity point. Returns copies.
 *
 * @param bytes Untrusted on-chain bytes.
 * @returns Decoded announcement.
 * @throws {SolanaStealthError} `INVALID_ANNOUNCEMENT`.
 */
export function decodeAnnouncement(bytes: Uint8Array): SolanaAnnouncement {
  if (!(bytes instanceof Uint8Array)) return fail('INVALID_ANNOUNCEMENT');
  if (
    bytes.length < ANNOUNCEMENT_HEADER_LENGTH ||
    bytes.length > ANNOUNCEMENT_HEADER_LENGTH + MAX_ANNOUNCEMENT_METADATA
  ) {
    return fail('INVALID_ANNOUNCEMENT');
  }
  if (bytes[0] !== ANNOUNCEMENT_VERSION) return fail('INVALID_ANNOUNCEMENT');
  const R = bytes.slice(1, 33);
  try {
    decodePrimeOrderPoint(R);
  } catch {
    return fail('INVALID_ANNOUNCEMENT');
  }
  return {
    ephemeralPublicKey: R as PrimeOrderPoint,
    viewTag: bytes[33] as number,
    metadata: bytes.slice(ANNOUNCEMENT_HEADER_LENGTH),
  };
}

/**
 * Encodes the SPL Memo text form exactly as `@ghostpay/solana-stealth` does (ADR-0017 section 5):
 * `gpst1:` + base58(R(32) || view_tag(1)).
 *
 * @remarks The memo carries no metadata (the web scanner rejects a longer body), so a non-empty `metadata` is
 * refused rather than silently dropped. Opaque metadata exists only in the binary announcer-event form
 * ({@link encodeAnnouncement}).
 *
 * @param a Announcement fields.
 * @returns ASCII memo string (at most 52 characters).
 * @throws {SolanaStealthError} `INVALID_ANNOUNCEMENT`.
 */
export function encodeAnnouncementMemo(a: AnnouncementInput): string {
  if (a.metadata !== undefined && a.metadata.length > 0) return fail('INVALID_ANNOUNCEMENT');
  const bin = encodeAnnouncement({ ephemeralPublicKey: a.ephemeralPublicKey, viewTag: a.viewTag });
  return MEMO_PREFIX + base58.encode(bin.subarray(1)); // R || view_tag (metadata is empty)
}

/**
 * Strictly decodes the SPL Memo text form `gpst1:` + base58(R || view_tag).
 *
 * @remarks Exact, case-sensitive prefix; at most 96 characters; base58 body of exactly 33 bytes; R must be a
 * canonical prime-order non-identity point. The retired `gpst1:` + base64url form is rejected (it is not valid
 * base58 or not 33 bytes). The result has empty `metadata`.
 *
 * @param memo Untrusted memo text.
 * @returns Decoded announcement.
 * @throws {SolanaStealthError} `INVALID_ANNOUNCEMENT`.
 */
export function decodeAnnouncementMemo(memo: string): SolanaAnnouncement {
  if (typeof memo !== 'string' || !memo.startsWith(MEMO_PREFIX) || memo.length > MAX_MEMO_LENGTH) {
    return fail('INVALID_ANNOUNCEMENT');
  }
  let body: Uint8Array;
  try {
    body = base58.decode(memo.slice(MEMO_PREFIX.length));
  } catch {
    return fail('INVALID_ANNOUNCEMENT');
  }
  if (body.length !== MEMO_BODY_LENGTH) return fail('INVALID_ANNOUNCEMENT');
  return decodeAnnouncement(concatBytes(Uint8Array.of(ANNOUNCEMENT_VERSION), body));
}
