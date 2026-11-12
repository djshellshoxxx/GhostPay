import { createHash } from 'node:crypto';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { backupFromText, decodeBackup, defaultCryptoDeps, parseHeader, VaultError, type DecodedBackup } from '@ghostpay/ux-vault';
import { createKeystoreApi, createReconciliationApi, createTagArchiveApi, PortableVaultError, type KeystoreFile, type ReconciliationScope, type ReconciliationVaultHandle, type ReconciliationVaultStore, type ArchiveContents } from '@ghostpay/ux-vault/portable';
import type { Parsed } from './args.js';
import type { Ctx } from './ctx.js';
import { CliError, failError, usageError } from './io.js';
import { readPassphrase, readSecret } from './secrets.js';

export const keystoreApi = createKeystoreApi();
export const reconciliationApi = createReconciliationApi();
export const tagArchiveApi = createTagArchiveApi();
export const KEY_RULE = { label: 'viewing key', minBytes: 32, maxBytes: 32 } as const;
export const sha256Text = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
export const sha256Bytes = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');
export const decodeText = (bytes: Uint8Array): string => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw failError('BACKUP_INVALID', 'the backup is not valid UTF-8 or a supported binary archive.'); }
};

export type BackupInput =
  | { readonly format: 'seller-keystore'; readonly text: string; readonly envelope: KeystoreFile; readonly bytes: Uint8Array }
  | { readonly format: 'reconciliation'; readonly text: string; readonly scope: ReconciliationScope; readonly bytes: Uint8Array }
  | { readonly format: 'tag-archive'; readonly bytes: Uint8Array }
  | { readonly format: 'address-book'; readonly bytes: Uint8Array; readonly blob: Uint8Array };

/** File names and embedded fields never become output paths; only explicit CLI arguments do. */
export function inspectBackup(bytes: Uint8Array): BackupInput {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 5));
  if (prefix.startsWith('GPA') && !prefix.startsWith('GPA1')) throw new CliError('unsupported', 'BACKUP_UNSUPPORTED_VERSION', 'unsupported tag archive version.');
  if (prefix.startsWith('GPVT')) { parseHeader(defaultCryptoDeps(), bytes, 'backup'); return { format: 'address-book', bytes, blob: bytes }; }
  if (prefix.startsWith('GPA1')) {
    tagArchiveApi.inspectArchive(bytes);
    return { format: 'tag-archive', bytes };
  }
  const text = decodeText(bytes);
  if (/^GPVB[0-9]+\./.test(text.trim()) && !text.trim().startsWith('GPVB1.')) throw new CliError('unsupported', 'BACKUP_UNSUPPORTED_VERSION', 'unsupported address-book backup version.');
  if (text.trim().startsWith('GPVB1.')) {
    const blob = backupFromText(text);
    parseHeader(defaultCryptoDeps(), blob, 'backup');
    return { format: 'address-book', bytes, blob };
  }
  if (text.length > reconciliationApi.MAX_VAULT_BYTES) throw failError('BACKUP_TOO_LARGE', 'encrypted backup exceeds the format limit.');
  const raw: unknown = parseStrictJson(text);
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const object = raw as Record<string, unknown>;
    if ((object['kdf'] === 'scrypt' && object['v'] !== 1) || (object['format'] === 'ghostpay-reconciliation' && object['version'] !== 1))
      throw new CliError('unsupported', 'BACKUP_UNSUPPORTED_VERSION', 'unsupported encrypted backup version.');
  }
  // Try strict existing codecs. Neither parser decrypts or accepts arbitrary extension fields.
  try { return { format: 'seller-keystore', text, envelope: keystoreApi.validateKeystoreEnvelope(text), bytes }; }
  catch { /* Reconciliation has a separate exact envelope. */ }
  const envelope = reconciliationApi.inspectReconciliationEnvelope(text);
  return { format: 'reconciliation', text, scope: { sellerKeyId: envelope.sellerKeyId, chainId: envelope.chainId }, bytes };
}

export class MemoryReconciliationStore implements ReconciliationVaultStore {
  public constructor(public text: string | null = null) {}
  public read(key: string): Promise<string | null> { void key; return Promise.resolve(this.text); }
  public compareAndSwap(_key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if (this.text !== expected) return Promise.resolve(false);
    this.text = next;
    return Promise.resolve(true);
  }
}

export function withBackupErrors<T>(task: () => Promise<T>): Promise<T> {
  return task().catch((error: unknown) => {
    if (error instanceof CliError) throw error;
    if (error instanceof PortableVaultError) {
      const code = error.code;
      if (/wrongPassphrase|authentication|couldNotDecrypt/.test(code))
        throw failError('BACKUP_AUTHENTICATION_FAILED', 'backup authentication failed: wrong credentials or modified data.');
      if (/passphraseShort|passphraseWeak/.test(code)) throw usageError('BAD_PASSPHRASE', 'the new passphrase does not satisfy the existing backup strength policy.');
      if (/newer|AnotherSellerOrChain|anotherScope|AnotherScope|invalidReconciliationScope/i.test(code))
        throw failError('BACKUP_SCOPE_OR_VERSION', 'backup version or seller/chain scope is incompatible.');
      throw failError('BACKUP_INVALID', 'the encrypted backup or protected contents failed validation.');
    }
    if (error instanceof VaultError) {
      if (error.code === 'DECRYPT_FAILED') throw failError('BACKUP_AUTHENTICATION_FAILED', 'backup authentication failed: wrong credentials or modified data.');
      if (error.code === 'UNSUPPORTED_VERSION') throw new CliError('unsupported', 'BACKUP_UNSUPPORTED_VERSION', 'this backup requires an unsupported version.');
      throw failError('BACKUP_INVALID', 'the address-book backup failed validation.');
    }
    throw error;
  });
}

export async function readBackup(ctx: Ctx, a: Parsed, option = 'in'): Promise<BackupInput> {
  const path = a.values.get(option);
  if (path === undefined) throw usageError('MISSING_OPTION', `--${option} is required.`);
  return withBackupErrors(async () => inspectBackup(await ctx.readBytes(path)));
}

/** Existing state is readable history, never independent proof of current chain settlement. */
export async function openReconciliation(ctx: Ctx, a: Parsed, input: Extract<BackupInput, { format: 'reconciliation' }>, imported: boolean): Promise<{ vault: ReconciliationVaultHandle; store: MemoryReconciliationStore }> {
  const key = await readSecret(ctx, a, 'viewing-key', KEY_RULE, true);
  if (key === undefined) throw usageError('SECRET_SOURCE_MISSING', 'a viewing key is required.');
  return openReconciliationWithKey(input, key, imported);
}

export async function openReconciliationWithKey(input: Extract<BackupInput, { format: 'reconciliation' }>, key: Uint8Array, imported: boolean): Promise<{ vault: ReconciliationVaultHandle; store: MemoryReconciliationStore }> {
  const store = new MemoryReconciliationStore(imported ? null : input.text);
  const vault = new reconciliationApi.ReconciliationVault(store, input.scope, () => undefined);
  try {
    await vault.unlock(key);
    if (imported) await vault.activateImport(await vault.previewImport(input.text));
    else await vault.readState();
    return { vault, store };
  } catch (error) { vault.lock(); throw error; }
  finally { key.fill(0); }
}

export type AuthenticatedBackup =
  | { readonly format: 'seller-keystore'; readonly count: number }
  | { readonly format: 'reconciliation'; readonly count: number; readonly invoiceCount: number; readonly receiptCount: number; readonly invalidatedCount: number; readonly readOnly: boolean }
  | { readonly format: 'tag-archive'; readonly count: number; readonly historyCount: number; readonly duplicateCount: number; readonly contents: ArchiveContents }
  | { readonly format: 'address-book'; readonly count: number; readonly decoded: DecodedBackup };

export async function authenticateBackup(ctx: Ctx, a: Parsed, input: BackupInput): Promise<AuthenticatedBackup> {
  return withBackupErrors(async () => {
    if (input.format === 'reconciliation') {
      const { vault } = await openReconciliation(ctx, a, input, false);
      try {
        const state = await vault.readState();
        return { format: input.format, count: state.records.length, invoiceCount: state.invoices.length, receiptCount: state.receipts.length, invalidatedCount: state.records.filter(r => r.evidenceStatus === 'invalidated-after-reorg').length, readOnly: state.readOnly };
      } finally { vault.lock(); }
    }
    const passphrase = await readPassphrase(ctx, a);
    if (input.format === 'seller-keystore') {
      const secrets = await keystoreApi.decryptKeystore(input.text, passphrase);
      try { return { format: input.format, count: 3 }; }
      finally { secrets.spendingKey.fill(0); secrets.viewingKey.fill(0); secrets.signingKey.fill(0); }
    }
    if (input.format === 'tag-archive') {
      const contents = await tagArchiveApi.decodeArchive(input.bytes, passphrase);
      const identities = new Set(contents.records.map(r => `${r.chainId}:${r.payload.stealthAddress}`));
      return { format: input.format, count: identities.size, historyCount: Object.keys(contents.history).length, duplicateCount: contents.records.length - identities.size, contents };
    }
    const decoded = await decodeBackup(defaultCryptoDeps(), input.blob, passphrase);
    return { format: input.format, count: decoded.book.contacts.length, decoded };
  });
}
