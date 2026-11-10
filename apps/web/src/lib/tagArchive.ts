import { createTagArchiveApi, type ArchiveContents, type ArchiveOptions } from '@ghostpay/ux-vault/portable';
export type { ArchiveContents, ArchiveOptions } from '@ghostpay/ux-vault/portable';
export const { ARCHIVE_MAGIC, MAX_ARCHIVE_BYTES, MAX_ARCHIVE_RECORDS, encodeArchive, decodeArchive } = createTagArchiveApi(UserFacingError);
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';
import { passphraseProblemMessage } from './keystore';
import { type TagImportPreview, type TagVault } from './tags';

export interface ExportedArchive {
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Fixed pattern; never contains labels or addresses. */
  readonly filename: string;
  readonly recordCount: number;
  /** SHA-256 of the whole file, for the user to compare after copying it. */
  readonly sha256: string;
}

/**
 * Exports every tag (and optional scan-history vault texts) as an encrypted archive. Requires an unlocked vault and
 * re-authentication with the viewing key (consumed and zeroized), which must be the profile's key.
 */
export async function exportArchive(
  vault: TagVault,
  viewingKey: Uint8Array,
  passphrase: string,
  options: ArchiveOptions & { readonly history?: Readonly<Record<string, string>>; readonly now?: () => number } = {},
): Promise<ExportedArchive> {
  try {
    if (!vault.unlocked) throw new UserFacingError({ key: 'error.tagArchive.tagsAreLockedUnlockThemFirst' });
    const problem = passphraseProblemMessage(passphrase);
    if (problem !== undefined) throw new UserFacingError(problem);
    if (!(await vault.verifyKey(viewingKey.slice()))) throw new UserFacingError({ key: 'error.tagArchive.reAuthenticationFailedThatIsNotTheViewingKeyOf' });
    const records = await vault.snapshot();
    const createdAt = (options.now ?? Date.now)();
    const bytes = await encodeArchive({ createdAt, keyVersion: await vault.keyVersion(), records, history: options.history ?? {} }, passphrase, options);
    const d = new Date(createdAt);
    const ymd = `${String(d.getUTCFullYear())}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    return { bytes, filename: `ghostpay-tags-${ymd}.gpa`, recordCount: records.length, sha256: bytesToHex(sha256(bytes)) };
  } finally {
    viewingKey.fill(0);
  }
}

export interface ArchiveImportPreview {
  readonly tags: TagImportPreview;
  readonly keyVersion: number;
  readonly createdAt: number;
  /** Chain ids that carry scan history in this archive. */
  readonly historyChains: readonly string[];
  /** The decoded contents, for applying history; not for display. */
  readonly contents: ArchiveContents;
}

/**
 * Decrypts an archive and dry-runs the import. Nothing is written; commit with `vault.applyImport(preview.tags)`, which
 * rejects the preview if anything changed in between.
 */
export async function previewArchiveImport(vault: TagVault, bytes: Uint8Array, passphrase: string, mode: 'merge' | 'replace', signal?: AbortSignal): Promise<ArchiveImportPreview> {
  if (!vault.unlocked) throw new UserFacingError({ key: 'error.tagArchive.tagsAreLockedUnlockThemFirst' });
  const contents = await decodeArchive(bytes, passphrase, signal);
  const tags = await vault.previewImport(contents.records, mode);
  return { tags, keyVersion: contents.keyVersion, createdAt: contents.createdAt, historyChains: Object.keys(contents.history), contents };
}

// i18n-use: error.tagArchive.thisBrowserHasNoWebCryptoSupport error.tagArchive.invalidScryptCost error.tagArchive.thisArchiveWouldExceedThe20MBLimit error.tagArchive.importCancelled error.tagArchive.thisArchiveWasMadeByANewerGhostPayAndCannot error.tagArchive.tagsAreLockedUnlockThemFirst error.tagArchive.reAuthenticationFailedThatIsNotTheViewingKeyOf

// i18n-use: error.tagArchive.capacity

// i18n-use: error.tagArchive.invalidFile

// i18n-use: error.tagArchive.authentication
