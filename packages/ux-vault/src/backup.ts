import { fromBase64Url, toBase64Url, utf8Decode, utf8Encode } from './bytes.js';
import type { AddressBook } from './contacts.js';
import {
  type CryptoDeps,
  newKeyContext,
  normalizeNewPassword,
  normalizePasswordForUnlock,
  open,
  seal,
} from './envelope.js';
import { fail } from './errors.js';
import { parsePayload, serializePayload } from './schema.js';

/** Text prefix for the printable form of a backup. */
export const BACKUP_TEXT_PREFIX = 'GPVB1.';

/** Result of decoding a backup. */
export interface DecodedBackup {
  readonly book: AddressBook;
  /** Profile id the backup was exported from (authenticated via AAD). */
  readonly sourceProfileId: string;
  readonly exportedAt: number | undefined;
  /** Original schema number if a migration ran. */
  readonly migratedFrom: number | undefined;
}

/**
 * Create a versioned encrypted backup blob of an address book.
 * @security Uses a fresh salt + nonce and the supplied backup password (may differ from the profile
 * password). The blob is the only artifact that leaves the vault; it contains no plaintext.
 */
export async function createBackup(
  deps: CryptoDeps,
  book: AddressBook,
  sourceProfileId: string,
  backupPassword: string,
  exportedAt: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const pw = normalizeNewPassword(backupPassword);
  const ctx = await newKeyContext(deps, pw, sourceProfileId, 'backup');
  const pt = utf8Encode(serializePayload(book, exportedAt));
  try {
    return await seal(deps, ctx, pt);
  } finally {
    pt.fill(0);
  }
}

/**
 * Decrypt, authenticate, migrate and strictly validate a backup.
 * @security Wrong password, flipped bits, truncation and header edits all yield the same
 * `DECRYPT_FAILED`; structurally invalid blobs yield `CORRUPT`; newer formats `UNSUPPORTED_VERSION`.
 * Nothing is applied to any profile here.
 */
export async function decodeBackup(
  deps: CryptoDeps,
  blob: Uint8Array,
  password: string,
): Promise<DecodedBackup> {
  const pw = normalizePasswordForUnlock(password);
  const { plaintext, header } = await open(deps, blob, pw, 'backup');
  try {
    const { payload, migratedFrom, exportedAt } = parsePayload(utf8Decode(plaintext));
    return { book: payload.book, sourceProfileId: header.profileId, exportedAt, migratedFrom };
  } finally {
    plaintext.fill(0);
  }
}

/** Printable (base64url) form of a backup blob for copy/paste or text files. */
export function backupToText(blob: Uint8Array): string {
  return BACKUP_TEXT_PREFIX + toBase64Url(blob);
}

/** Inverse of {@link backupToText}; surrounding whitespace is tolerated, anything else is CORRUPT. */
export function backupFromText(text: string): Uint8Array<ArrayBuffer> {
  const t = text.trim();
  if (!t.startsWith(BACKUP_TEXT_PREFIX)) return fail('CORRUPT', 'not a ghostpay vault backup');
  try {
    return fromBase64Url(t.slice(BACKUP_TEXT_PREFIX.length));
  } catch {
    return fail('CORRUPT', 'backup text is not valid base64url');
  }
}
