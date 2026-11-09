import { encodeMetaAddress, generateKeySet, parseCompressedPoint, randomScalar, secretScalarFromBytes, zeroize, type SecretScalar } from '@ghostpay/core-crypto';
import { signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { backupToText, createBackup, defaultCryptoDeps } from '@ghostpay/ux-vault';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { failError, usageError } from '../io.js';
import { readPassphrase, readSecret, secretOpts } from '../secrets.js';
import { authenticateBackup, keystoreApi, openReconciliation, readBackup, sha256Bytes, tagArchiveApi, withBackupErrors, type AuthenticatedBackup } from '../backup-data.js';
import type { Command } from './types.js';

const credentials = { ...secretOpts('passphrase'), ...secretOpts('viewing-key') } as const;
const recordSummary = (verified: AuthenticatedBackup): Readonly<Record<string, unknown>> => {
  if (verified.format === 'reconciliation') return { recordCount: verified.count, invoiceCount: verified.invoiceCount, receiptCount: verified.receiptCount, invalidatedCount: verified.invalidatedCount, readOnly: verified.readOnly };
  if (verified.format === 'tag-archive') return { recordCount: verified.count, duplicateCount: verified.duplicateCount, opaqueHistoryCount: verified.historyCount, historyAuthenticated: false };
  return { recordCount: verified.count };
};

async function inspect(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const input = await readBackup(ctx, a);
  ctx.out({ ok: true, format: input.format, version: 1, bytes: input.bytes.byteLength, authenticated: false, sha256: sha256Bytes(input.bytes) }, `${input.format}: bounded structure valid; contents and integrity not authenticated. Run backup verify with credentials.`);
  return 0;
}
async function verify(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const input = await readBackup(ctx, a);
  const checked = await authenticateBackup(ctx, a, input);
  ctx.out({ ok: true, format: input.format, authenticated: true, ...recordSummary(checked), currentChainVerified: false }, `${input.format}: authentication and protected schema verified (${checked.count} records). Stored history is not independent current-chain evidence.`);
  return 0;
}
async function restore(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  if (!a.flags.has('dry-run') && !a.flags.has('approve')) throw usageError('APPROVAL_REQUIRED', 'restoration requires --approve or --dry-run.');
  if (!a.flags.has('dry-run')) requireValue(a, 'out');
  if (a.flags.has('force')) throw usageError('OVERWRITE_REFUSED', 'restoration requires a new output path; existing backups are never replaced.');
  const input = await readBackup(ctx, a);
  return withBackupErrors(async () => {
    if (input.format === 'reconciliation') {
      const { vault } = await openReconciliation(ctx, a, input, true);
      try {
        const state = await vault.readState();
        if (!a.flags.has('dry-run')) await ctx.writeOut(a, await vault.exportEncrypted());
        ctx.out({ ok: true, format: input.format, dryRun: a.flags.has('dry-run'), recordCount: state.records.length, invoiceCount: state.invoices.length, receiptCount: state.receipts.length, readOnly: state.readOnly, provenance: 'imported-history', currentChainVerified: false, target: 'portable-encrypted-file', browserStorageChanged: false }, `${a.flags.has('dry-run') ? 'Dry-run: validated' : 'Restored encrypted portable copy:'} ${state.records.length} historical records. Import the encrypted copy through the GUI to populate browser storage.`);
      } finally { vault.lock(); }
      return 0;
    }
    const checked = await authenticateBackup(ctx, a, input);
    if (!a.flags.has('dry-run')) {
      if (input.format === 'tag-archive') await ctx.writeBytesOut(a, input.bytes);
      else if (input.format === 'address-book') await ctx.writeOut(a, backupToText(input.blob));
      else await ctx.writeOut(a, input.text);
    }
    ctx.out({ ok: true, format: input.format, dryRun: a.flags.has('dry-run'), ...recordSummary(checked), target: 'portable-encrypted-file', browserStorageChanged: false }, `${a.flags.has('dry-run') ? 'Dry-run: validated' : 'Restored encrypted portable copy:'} ${checked.count} records. Browser storage is populated only by an explicit GUI import.`);
    return 0;
  });
}
async function rekey(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  requireValue(a, 'out');
  const input = await readBackup(ctx, a);
  if (input.format === 'reconciliation') throw usageError('REKEY_UNSUPPORTED', 'reconciliation encryption is bound to the seller viewing key; restore with the same seller key instead.');
  return withBackupErrors(async () => {
    const current = await readPassphrase(ctx, a);
    const next = await readPassphrase(ctx, a, 'new-passphrase');
    let count: number;
    if (input.format === 'seller-keystore') {
      const secrets = await keystoreApi.decryptKeystore(input.text, current);
      try { await ctx.writeOut(a, await keystoreApi.encryptKeystore(secrets, input.envelope.meta, next)); count = 3; }
      finally { zeroize(secrets.spendingKey, secrets.viewingKey, secrets.signingKey); }
    } else if (input.format === 'tag-archive') {
      const contents = await tagArchiveApi.decodeArchive(input.bytes, current);
      await ctx.writeBytesOut(a, await tagArchiveApi.encodeArchive(contents, next)); count = contents.records.length;
    } else {
      // Reuse the full validator and migration path; no contact text is printed.
      const { decodeBackup } = await import('@ghostpay/ux-vault');
      const decoded = await decodeBackup(defaultCryptoDeps(), input.blob, current);
      const encrypted = await createBackup(defaultCryptoDeps(), decoded.book, decoded.sourceProfileId, next, ctx.io.nowSeconds() * 1000);
      await ctx.writeOut(a, backupToText(encrypted)); count = decoded.book.contacts.length;
    }
    ctx.out({ ok: true, format: input.format, recordCount: count, reencrypted: true, out: a.values.get('out') }, 'Wrote a newly authenticated encrypted backup using the new passphrase.');
    return 0;
  });
}
async function create(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  requireValue(a, 'out');
  const keys: Uint8Array[] = [];
  return withBackupErrors(async () => {
    try {
      for (const prefix of ['spending-key', 'viewing-key', 'signing-key']) {
        const key = await readSecret(ctx, a, prefix, { label: prefix, minBytes: 32, maxBytes: 32 }, true);
        if (key === undefined) throw usageError('SECRET_SOURCE_MISSING', 'all three independent seller keys are required.');
        keys.push(key);
      }
      const [spendingKey, viewingKey, signingKey] = keys as [Uint8Array, Uint8Array, Uint8Array];
      const publicOf = (key: Uint8Array): string => { const scalar = secretScalarFromBytes(key); try { return signerPublicKeyHex(scalar); } finally { zeroize(scalar); } };
      const spending = publicOf(spendingKey); const viewing = publicOf(viewingKey); const signer = publicOf(signingKey);
      if (signer === spending || signer === viewing) throw usageError('INDEPENDENT_SIGNER_REQUIRED', 'the signing key must be independent of the spending and viewing keys.');
      const metaAddress = encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(Buffer.from(spending, 'hex')), viewingPublicKey: parseCompressedPoint(Buffer.from(viewing, 'hex')) });
      const passphrase = await readPassphrase(ctx, a);
      const text = await keystoreApi.encryptKeystore({ spendingKey, viewingKey, signingKey }, { metaAddress, signer }, passphrase);
      await ctx.writeOut(a, text);
      ctx.out({ ok: true, format: 'seller-keystore', recordCount: 3, out: a.values.get('out') }, 'Wrote an encrypted seller-key backup. Keep the file and its passphrase separately.');
      return 0;
    } finally { for (const key of keys) key.fill(0); }
  });
}
async function generate(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a); requireValue(a, 'out');
  const passphrase = await readPassphrase(ctx, a);
  let receiving: ReturnType<typeof generateKeySet> | undefined; let signingKey: SecretScalar | undefined;
  return withBackupErrors(async () => {
    try {
      let metaAddress: string; let signer: string;
      try {
        receiving = generateKeySet(ctx.io.random); signingKey = randomScalar(ctx.io.random);
        metaAddress = encodeMetaAddress(receiving); signer = signerPublicKeyHex(signingKey);
        if ([receiving.spendingPublicKey, receiving.viewingPublicKey].some(key => Buffer.from(key).toString('hex') === signer)) throw new Error('reused key');
      } catch { throw failError('KEY_GENERATION_FAILED', 'could not generate three independent seller keys from the secure random source.'); }
      const text = await keystoreApi.encryptKeystore({ spendingKey: receiving.spendingSecret, viewingKey: receiving.viewingSecret, signingKey }, { metaAddress, signer }, passphrase);
      await ctx.writeOut(a, text);
      ctx.out({ ok: true, schemaVersion: 1, generated: true, format: 'seller-keystore', recordCount: 3,
        metaAddress, signerPublicKey: signer, out: a.values.get('out') }, 'Generated independent receiving and signing keys and saved the encrypted seller keystore. Only public keys are reported; keep the encrypted file and passphrase separately.');
      return 0;
    } finally {
      if (receiving !== undefined) zeroize(receiving.spendingSecret, receiving.viewingSecret);
      if (signingKey !== undefined) zeroize(signingKey);
    }
  });
}
export const backupCommands: readonly Command[] = [
  { path: ['backup', 'generate'], summary: 'generate independent seller keys directly into a new encrypted GUI-compatible keystore', usage: 'ghostpay backup generate --passphrase-file FILE|--passphrase-env NAME|--passphrase-stdin --out NEW_FILE\n  Example: ghostpay backup generate --passphrase-stdin --out seller.json --json\n  Uses the same key-generation primitives and encrypted format as the GUI. Existing outputs are never replaced. No plaintext key export, signing or network operation occurs; only public keys and counts are reported.', opts: { out: 'value', ...secretOpts('passphrase') }, handler: generate },
  { path: ['backup', 'inspect'], summary: 'inspect supported encrypted backup structure without credentials', usage: 'ghostpay backup inspect --in FILE [--json]\n  Supports seller keystore JSON, GPA1 tags, reconciliation JSON and GPVB1 address books. Inspection does not authenticate ciphertext.\n  Example: ghostpay backup inspect --in seller-keystore.json --json', opts: { in: 'value' }, handler: inspect },
  { path: ['backup', 'verify'], summary: 'authenticate backup contents and report counts without revealing secrets', usage: 'ghostpay backup verify --in FILE (--passphrase-file FILE | --passphrase-stdin | --viewing-key-file FILE) [--json]\n  Reconciliation needs its seller viewing key; the other formats use their backup passphrase.\n  Example: ghostpay backup verify --in tags.gpa --passphrase-file pass.txt --json', opts: { in: 'value', ...credentials }, handler: verify },
  { path: ['backup', 'restore'], summary: 'validate and restore a new encrypted portable copy with explicit approval', usage: 'ghostpay backup restore --in FILE [--out NEW_FILE] (--approve | --dry-run) [credential options]\n  Existing outputs are never replaced. Imports retain historical provenance and reorg invalidation. This writes a portable encrypted file; browser storage still needs an explicit GUI import.\n  Example: ghostpay backup restore --in backup.json --viewing-key-file view.hex --out recovered.json --approve', opts: { in: 'value', ...credentials, out: 'value', approve: 'flag', 'dry-run': 'flag', force: 'flag' }, handler: restore },
  { path: ['backup', 'rekey'], summary: 'authenticate and re-encrypt a backup with a new passphrase', usage: 'ghostpay backup rekey --in FILE --out NEW_FILE --passphrase-file OLD --new-passphrase-file NEW\n  Reconciliation follows seller-key scope and does not support passphrase rekey.\n  Example: ghostpay backup rekey --in seller.json --out seller-new.json --passphrase-file old.txt --new-passphrase-file new.txt', opts: { in: 'value', ...OUT_OPTS, ...secretOpts('passphrase'), ...secretOpts('new-passphrase') }, handler: rekey },
  { path: ['backup', 'create'], summary: 'encrypt independent seller keys in the existing GUI keystore format', usage: 'ghostpay backup create --spending-key-file FILE --viewing-key-file FILE --signing-key-file FILE --passphrase-file FILE --out FILE\n  No key or passphrase values are accepted on argv. Uses the existing scrypt/AES-GCM profile.\n  Example: ghostpay backup create --spending-key-file spend.hex --viewing-key-file view.hex --signing-key-file sign.hex --passphrase-file pass.txt --out seller.json', opts: { ...OUT_OPTS, ...secretOpts('spending-key'), ...secretOpts('viewing-key'), ...secretOpts('signing-key'), ...secretOpts('passphrase') }, handler: create },
];
