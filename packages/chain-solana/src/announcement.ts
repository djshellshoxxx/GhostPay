import { base64urlnopad } from '@scure/base';
import { fail } from './errors.js';
import { decodePrimeOrderPoint, type PrimeOrderPoint } from './point.js';

/** Announcement layout version. */
export const ANNOUNCEMENT_VERSION = 0x01;
/** Fixed header: version(1) || R(32) || view_tag(1). */
export const ANNOUNCEMENT_HEADER_LENGTH = 34;
/** Maximum opaque metadata length in bytes. */
export const MAX_ANNOUNCEMENT_METADATA = 256;
/** Text prefix of the SPL Memo form (the Memo program requires valid UTF-8). */
export const MEMO_PREFIX = 'gpst1:';

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
 * @remarks Used verbatim as announcer-program event data. There is no length
 * field: metadata is the remainder, so the encoding is unique per input.
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
 * Encodes the SPL Memo text form: `gpst1:` + base64url-no-padding(binary).
 *
 * @param a Announcement fields.
 * @returns ASCII memo string.
 * @throws {SolanaStealthError} `INVALID_ANNOUNCEMENT`.
 */
export function encodeAnnouncementMemo(a: AnnouncementInput): string {
  return MEMO_PREFIX + base64urlnopad.encode(encodeAnnouncement(a));
}

/**
 * Strictly decodes the SPL Memo text form.
 *
 * @remarks Exact, case-sensitive prefix; base64url alphabet without padding; the
 * text must re-encode identically (rejects non-zero trailing bits).
 *
 * @param memo Untrusted memo text.
 * @returns Decoded announcement.
 * @throws {SolanaStealthError} `INVALID_ANNOUNCEMENT`.
 */
export function decodeAnnouncementMemo(memo: string): SolanaAnnouncement {
  if (typeof memo !== 'string' || !memo.startsWith(MEMO_PREFIX) || memo.length > 512) {
    return fail('INVALID_ANNOUNCEMENT');
  }
  const body = memo.slice(MEMO_PREFIX.length);
  let bytes: Uint8Array;
  try {
    bytes = base64urlnopad.decode(body);
  } catch {
    return fail('INVALID_ANNOUNCEMENT');
  }
  if (base64urlnopad.encode(bytes) !== body) return fail('INVALID_ANNOUNCEMENT');
  return decodeAnnouncement(bytes);
}
