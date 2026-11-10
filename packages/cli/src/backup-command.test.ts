import { describe, expect, it } from 'vitest';
import { run } from './run.js';
import { G, G2, makeIo, SIGNER, stdoutJson } from './fixtures.testutil.js';

const envelope = {
  v: 1, kdf: 'scrypt', kdfParams: { N: 16384, r: 8, p: 1, salt: 'ab'.repeat(16) },
  cipher: 'AES-256-GCM', iv: 'cd'.repeat(12),
  meta: { metaAddress: `st:eth:0x${G}${G2}`, signer: SIGNER }, ciphertext: '11'.repeat(200),
};
describe('backup operator commands', () => {
  it('inspects a bounded seller-key envelope without claiming its authentication', async () => {
    const io = makeIo({ backup: JSON.stringify(envelope) });
    expect(await run(['backup', 'inspect', '--in', 'backup', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, format: 'seller-keystore', authenticated: false, version: 1 });
    expect(io.out.join('')).not.toContain(envelope.ciphertext);
    expect(io.out.join('')).not.toContain(envelope.kdfParams.salt);
  });
});

import { beforeAll } from 'vitest';
import { createKeystoreApi, createTagArchiveApi, createReconciliationApi } from '@ghostpay/ux-vault/portable';
import { backupFromText, backupToText, createBackup, decodeBackup, defaultCryptoDeps } from '@ghostpay/ux-vault';
import { KEY_HEX, allOutput } from './fixtures.testutil.js';
import { MemoryReconciliationStore } from './backup-data.js';
const PASS = 'birch-velvet-otter-copper-archer-quartz';
const OTHER = 'larch-silver-ocean-butter-lantern-thrush';
const STORE_KEYS = { spendingKey: Uint8Array.from(Buffer.from('00'.repeat(31) + '01', 'hex')), viewingKey: Uint8Array.from(Buffer.from('00'.repeat(31) + '02', 'hex')), signingKey: Uint8Array.from(Buffer.from(KEY_HEX, 'hex')) };
const keys = createKeystoreApi();
let encrypted: string;
beforeAll(async () => { encrypted = await keys.encryptKeystore(STORE_KEYS, envelope.meta, PASS, { N: 16384 }); });
const defaults = (): Record<string, string> => ({ backup: encrypted, pass: PASS, wrong: 'incorrect credential value', next: OTHER, spend: '00'.repeat(31) + '01', view: '00'.repeat(31) + '02', sign: KEY_HEX });

it('authenticates a GUI keystore and shows only counts', async () => {
  const io = makeIo(defaults());
  expect(await run(['backup', 'verify', '--in', 'backup', '--passphrase-file', 'pass', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ ok: true, authenticated: true, recordCount: 3, currentChainVerified: false });
  for (const secret of [PASS, KEY_HEX, 'spendingKey', 'viewingKey', 'signingKey']) expect(allOutput(io)).not.toContain(secret);
});
it('detects wrong credentials and ciphertext modification with the same safe authentication error', async () => {
  const tampered = JSON.parse(encrypted) as { ciphertext: string };
  tampered.ciphertext = (tampered.ciphertext[0] === '0' ? '1' : '0') + tampered.ciphertext.slice(1);
  for (const files of [{ ...defaults(), pass: 'incorrect credential value' }, { ...defaults(), backup: JSON.stringify(tampered) }]) {
    const io = makeIo(files);
    expect(await run(['backup', 'verify', '--in', 'backup', '--passphrase-file', 'pass', '--json'], io)).toBe(1);
    expect(JSON.parse(io.err.join(''))).toMatchObject({ error: { code: 'BACKUP_AUTHENTICATION_FAILED' } });
    expect(allOutput(io)).not.toContain('incorrect credential value');
  }
});
it('rejects unsupported versions, truncated inputs and malicious extension fields', async () => {
  for (const value of [{ ...envelope, v: 2 }, { ...envelope, v: 1, path: '../../overwritten' }]) {
    const io = makeIo({ backup: JSON.stringify(value) });
    expect(await run(['backup', 'inspect', '--in', 'backup', '--json'], io)).toBe(value.v === 2 ? 5 : 1);
    expect(io.files.size).toBe(1);
  }
  const io = makeIo({ backup: encrypted.slice(0, -20) });
  expect(await run(['backup', 'inspect', '--in', 'backup', '--json'], io)).toBe(1);
});
it('dry-runs restoration without writing and requires explicit approval before a new encrypted copy', async () => {
  const io = makeIo(defaults());
  const start = io.files.size;
  expect(await run(['backup', 'restore', '--in', 'backup', '--passphrase-file', 'pass', '--dry-run', '--json'], io)).toBe(0);
  expect(io.files.size).toBe(start);
  expect(stdoutJson(io)).toMatchObject({ dryRun: true, browserStorageChanged: false, target: 'portable-encrypted-file' });
  const no = makeIo(defaults());
  expect(await run(['backup', 'restore', '--in', 'backup', '--passphrase-file', 'pass', '--out', 'new', '--json'], no)).toBe(2);
  expect(no.files.has('new')).toBe(false);
  const yes = makeIo(defaults());
  expect(await run(['backup', 'restore', '--in', 'backup', '--passphrase-file', 'pass', '--out', 'new', '--approve', '--json'], yes)).toBe(0);
  expect(yes.files.get('new')).toBe(encrypted);
});
it('preserves existing files and refuses forced restoration', async () => {
  for (const force of [[], ['--force']]) {
    const io = makeIo({ ...defaults(), new: 'original' });
    const result = await run(['backup', 'restore', '--in', 'backup', '--passphrase-file', 'pass', '--out', 'new', '--approve', '--json', ...force], io);
    expect(result).toBe(force.length ? 2 : 3);
    expect(io.files.get('new')).toBe('original');
  }
});
it('does not leave partial outputs when publication fails', async () => {
  const io = makeIo(defaults()); io.failWrites = true;
  expect(await run(['backup', 'restore', '--in', 'backup', '--passphrase-file', 'pass', '--out', 'new', '--approve', '--json'], io)).toBe(3);
  expect(io.files.has('new')).toBe(false); expect(io.files.get('backup')).toBe(encrypted);
});
it('creates a GUI-compatible keystore from protected independent keys', async () => {
  const io = makeIo(defaults());
  expect(await run(['backup', 'create', '--spending-key-file', 'spend', '--viewing-key-file', 'view', '--signing-key-file', 'sign', '--passphrase-file', 'pass', '--out', 'new', '--json'], io)).toBe(0);
  const decoded = await keys.decryptKeystore(io.files.get('new')!, PASS);
  expect(decoded).toEqual(STORE_KEYS);
  for (const key of [decoded.spendingKey, decoded.viewingKey, decoded.signingKey]) key.fill(0);
  expect(allOutput(io)).not.toContain(KEY_HEX); expect(allOutput(io)).not.toContain(PASS);
});
it('refuses an invoice signer that reuses a spending key', async () => {
  const io = makeIo(defaults());
  expect(await run(['backup', 'create', '--spending-key-file', 'spend', '--viewing-key-file', 'view', '--signing-key-file', 'spend', '--passphrase-file', 'pass', '--out', 'new', '--json'], io)).toBe(2);
  expect(io.files.has('new')).toBe(false);
});
it('rekeys a valid backup without changing any seller key', async () => {
  const io = makeIo(defaults());
  expect(await run(['backup', 'rekey', '--in', 'backup', '--passphrase-file', 'pass', '--new-passphrase-file', 'next', '--out', 'new', '--json'], io)).toBe(0);
  const result = io.files.get('new')!;
  expect(result).not.toBe(encrypted);
  const decoded = await keys.decryptKeystore(result, OTHER);
  expect(decoded).toEqual(STORE_KEYS); [decoded.spendingKey, decoded.viewingKey, decoded.signingKey].forEach(k => k.fill(0));
  await expect(keys.decryptKeystore(result, PASS)).rejects.toThrow();
});
it('authenticates and restores GPA archives without printing labels or opaque history', async () => {
  const binary = await createTagArchiveApi().encodeArchive({ createdAt: 1, keyVersion: 1, records: [{ chainId: 8453, createdAt: 1, updatedAt: 1, payload: { stealthAddress: '0x' + 'ab'.repeat(20), announcementId: '0x' + 'cd'.repeat(32) + ':1', logIndex: 1, clientLabel: 'PRIVATE CLIENT NAME' } }], history: { '8453': 'OPAQUE PRIVATE HISTORY' } }, PASS, { N: 16384 });
  const io = { ...makeIo(defaults()), readBinaryFile: () => Promise.resolve(binary) };
  const writes = new Map<string, Uint8Array>();
  const effects = { ...io, writeBinaryFile: (p: string, b: Uint8Array) => { writes.set(p, b.slice()); return Promise.resolve(); } };
  expect(await run(['backup', 'restore', '--in', 'archive', '--passphrase-file', 'pass', '--out', 'new', '--approve', '--json'], effects)).toBe(0);
  expect(writes.get('new')).toEqual(binary);
  expect(stdoutJson(effects)).toMatchObject({ recordCount: 1, opaqueHistoryCount: 1, historyAuthenticated: false });
  expect(allOutput(effects)).not.toContain('PRIVATE CLIENT NAME'); expect(allOutput(effects)).not.toContain('OPAQUE PRIVATE HISTORY');
});
it('handles address-book backups using the existing authenticated schema', async () => {
  const binary = await createBackup(defaultCryptoDeps(), { contacts: [] }, 'ab'.repeat(16), PASS, 10);
  const io = makeIo({ ...defaults(), backup: backupToText(binary) });
  expect(await run(['backup', 'verify', '--in', 'backup', '--passphrase-file', 'pass', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ format: 'address-book', recordCount: 0, authenticated: true });
});
it('authenticates reconciliation backups without converting them into current payment proof', async () => {
  const api = createReconciliationApi();
  const scope = { sellerKeyId: 'ab'.repeat(32), chainId: 8453 };
  const store = new MemoryReconciliationStore();
  const vault = new api.ReconciliationVault(store, scope, () => undefined);
  await vault.unlock(STORE_KEYS.viewingKey.slice());
  const serialized = await vault.exportEncrypted(); vault.lock();
  const io = makeIo({ ...defaults(), backup: serialized });
  expect(await run(['backup', 'restore', '--in', 'backup', '--viewing-key-file', 'view', '--out', 'new', '--approve', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ provenance: 'imported-history', currentChainVerified: false, recordCount: 0 });
  expect(io.files.get('new')).not.toBe(serialized);
});

it('rejects unsupported binary versions, invalid UTF-8 and unbounded KDF headers before credentials are read', async () => {
  const gpa = new Uint8Array(52); gpa.set(new TextEncoder().encode('GPA1')); gpa.set([1, 30, 8, 1], 4);
  const gpvt = new Uint8Array(70); gpvt.set(new TextEncoder().encode('GPVT')); gpvt[4] = 2;
  const entries: readonly [Uint8Array, number][] = [[new Uint8Array([0xff, 0xfe]), 1], [new TextEncoder().encode('GPA2'), 5], [new TextEncoder().encode('GPVB2.invalid'), 5], [gpa, 1], [gpvt, 5], [new TextEncoder().encode('GPVB1.invalid'), 1], [new TextEncoder().encode('x'.repeat(8_000_001)), 1]];
  for (const [bytes, exit] of entries) {
    const io = Object.assign(makeIo(), { readBinaryFile: () => Promise.resolve(bytes) });
    expect(await run(['backup', 'inspect', '--in', 'bad', '--json'], io)).toBe(exit);
    expect(io.out).toHaveLength(0); expect(io.files.size).toBe(0); expect(io.stdinReads).toBe(0);
  }
  const io = makeIo();
  expect(await run(['backup', 'inspect', '--json'], io)).toBe(2);
});

it('restores and rekeys binary address books without exposing contacts or accepting wrong credentials', async () => {
  const source = await createBackup(defaultCryptoDeps(), { contacts: [] }, 'ab'.repeat(16), PASS, 10);
  const io = Object.assign(makeIo(defaults()), { readBinaryFile: () => Promise.resolve(source) });
  expect(await run(['backup', 'restore', '--in', 'backup', '--passphrase-file', 'pass', '--approve', '--out', 'restored', '--json'], io)).toBe(0);
  expect(io.files.get('restored')).toBe(backupToText(source));
  expect(await run(['backup', 'rekey', '--in', 'backup', '--passphrase-file', 'pass', '--new-passphrase-file', 'next', '--out', 'rekeyed', '--json'], io)).toBe(0);
  const next = backupFromText(io.files.get('rekeyed')!);
  expect(next).not.toEqual(source);
  expect(await decodeBackup(defaultCryptoDeps(), next, OTHER)).toMatchObject({ book: { contacts: [] }, sourceProfileId: 'ab'.repeat(16) });
  const bad = makeIo({ backup: backupToText(source), wrong: 'not the backup password' });
  expect(await run(['backup', 'verify', '--in', 'backup', '--passphrase-file', 'wrong', '--json'], bad)).toBe(1);
  expect(JSON.parse(bad.err.join(''))).toMatchObject({ error: { code: 'BACKUP_AUTHENTICATION_FAILED' } });
});

it('rekeys GPA archives while retaining duplicate tags and opaque encrypted history', async () => {
  const codec = createTagArchiveApi();
  const entry = { chainId: 8453, createdAt: 1, updatedAt: 1, payload: { stealthAddress: '0x' + 'ab'.repeat(20), announcementId: '0x' + 'cd'.repeat(32) + ':1', logIndex: 1, clientLabel: 'PRIVATE LABEL' } };
  const contents = { createdAt: 1, keyVersion: 1, records: [entry, entry], history: { '8453': 'encrypted nested history' } };
  const source = await codec.encodeArchive(contents, PASS, { N: 16384 });
  const writes = new Map<string, Uint8Array>();
  const io = Object.assign(makeIo(defaults()), {
    readBinaryFile: () => Promise.resolve(source),
    writeBinaryFile: (p: string, b: Uint8Array) => { writes.set(p, b.slice()); return Promise.resolve(); },
  });
  expect(await run(['backup', 'verify', '--in', 'backup', '--passphrase-file', 'pass', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ recordCount: 1, duplicateCount: 1, historyAuthenticated: false });
  io.out.length = 0;
  expect(await run(['backup', 'rekey', '--in', 'backup', '--passphrase-file', 'pass', '--new-passphrase-file', 'next', '--out', 'next.gpa', '--json'], io)).toBe(0);
  expect(await codec.decodeArchive(writes.get('next.gpa')!, OTHER)).toEqual(contents);
  expect(allOutput(io)).not.toContain('PRIVATE LABEL'); expect(allOutput(io)).not.toContain('encrypted nested history');
});

it('authenticates reconciliation counts and dry-run import while rejecting viewing-key rekey and wrong keys', async () => {
  const codec = createReconciliationApi();
  const vault = new codec.ReconciliationVault(new MemoryReconciliationStore(), { sellerKeyId: 'ab'.repeat(32), chainId: 8453 }, () => undefined);
  await vault.unlock(STORE_KEYS.viewingKey.slice());
  const source = await vault.exportEncrypted(); vault.lock();
  const io = makeIo({ ...defaults(), backup: source, wrongkey: 'ab'.repeat(32) });
  expect(await run(['backup', 'verify', '--in', 'backup', '--viewing-key-file', 'view', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ recordCount: 0, invoiceCount: 0, receiptCount: 0, authenticated: true, currentChainVerified: false });
  io.out.length = 0;
  expect(await run(['backup', 'restore', '--in', 'backup', '--viewing-key-file', 'view', '--dry-run', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ dryRun: true, browserStorageChanged: false, provenance: 'imported-history' });
  expect(await run(['backup', 'rekey', '--in', 'backup', '--out', 'new', '--json'], io)).toBe(2);
  expect(await run(['backup', 'verify', '--in', 'backup', '--viewing-key-file', 'wrongkey', '--json'], io)).toBe(1);
  expect(io.files.has('new')).toBe(false);
});

it('rejects a weak replacement passphrase and ambiguous secret sources before publishing any backup', async () => {
  const io = makeIo({ ...defaults(), next: 'short' });
  expect(await run(['backup', 'rekey', '--in', 'backup', '--passphrase-file', 'pass', '--new-passphrase-file', 'next', '--out', 'new', '--json'], io)).toBe(2);
  expect(io.files.has('new')).toBe(false);
  expect(JSON.parse(io.err.join(''))).toMatchObject({ error: { code: 'BAD_PASSPHRASE' } });
  const absent = makeIo(defaults());
  expect(await run(['backup', 'create', '--out', 'new', '--json'], absent)).toBe(2);
  expect(await run(['backup', 'verify', '--in', 'backup', '--passphrase-file', 'pass', '--passphrase-stdin', '--json'], absent)).toBe(2);
  expect(absent.stdinReads).toBe(0); expect(absent.files.has('new')).toBe(false);
});

it('keeps in-memory vault compare-and-swap transactional when a guard fails or a source changed', async () => {
  const store = new MemoryReconciliationStore('old');
  expect(await store.compareAndSwap('scope', 'stale', 'new', () => undefined)).toBe(false);
  expect(await store.read('scope')).toBe('old');
  expect(() => store.compareAndSwap('scope', 'old', 'new', () => { throw new Error('cancelled'); })).toThrow('cancelled');
  expect(await store.read('scope')).toBe('old');
});
