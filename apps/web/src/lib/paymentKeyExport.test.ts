import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, exportKeystore, getSessionBackup, getSessionPublic, importSession } from './session';
import * as stealthExport from './stealthExport';
import { decryptMasterBackup, decryptPaymentKeys, inspectPaymentKeys } from './stealthExport';
import {
  RecoveredMasterKeys,
  RecoveredPaymentKeys,
  describePaymentArchive,
  distinctPayments,
  exportEncryptedPayment,
  exportMasterBackup,
  exportPaymentArchive,
  exportPublicRecord,
  exportRawPrivateKey,
  openStealthExport,
} from './paymentKeyExport';
import { TEST_N, VECTORS, VECTOR_CHAIN, VECTOR_PASS, VECTOR_TIME, codeRpc, loadVectorSeller, vectorAnnouncement, vectorMatch } from './paymentKeyExport.testutil';
import type { SecretExportCredential } from './keyVault';

const EXPORT_PASS = 'orbit-lantern-cobalt-meadow-violet';
const strip = (hex: string): string => hex.replace(/^0x/, '');

let keystore: SecretExportCredential;

beforeEach(async () => {
  clearSession();
  loadVectorSeller();
  keystore = { kind: 'keystore', text: await exportKeystore(EXPORT_PASS, { N: TEST_N }), passphrase: EXPORT_PASS };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearSession();
});

/** Every private key of the vectors, as lowercase hex without 0x: none may appear in a public or encrypted file. */
const SECRETS = [VECTORS.seller.spendingPrivateKey, VECTORS.seller.viewingPrivateKey, ...VECTORS.announcements.map((a) => a.expected.privateKey)].map(strip);
function expectNoSecret(text: string): void {
  for (const secret of SECRETS) expect(text.toLowerCase()).not.toContain(secret);
}

describe('public record export', () => {
  it('reproduces the reference public record byte for byte and holds no secret', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(VECTOR_TIME));
    const file = exportPublicRecord(vectorMatch('a1'));
    expect(file).toEqual({ filename: 'ghostpay-stealth-public.json', text: VECTORS.files.public.text, type: 'application/json' });
    expectNoSecret(file.text);
    expect(file.text).not.toMatch(/private/i);
  });

  it('needs loaded keys and refuses another seller, another scheme, an unknown chain or a relabelled address', () => {
    expect(() => exportPublicRecord(vectorMatch('a1', { schemeId: 2n }))).toThrow(/Only ERC-5564 scheme-1/);
    expect(() => exportPublicRecord(vectorMatch('a1', {}, 999_999_999))).toThrow(/known chain/);
    expect(() => exportPublicRecord({ ...vectorMatch('a1'), stealthAddress: vectorAnnouncement('a2').announcement.stealthAddress as `0x${string}` })).toThrow(/malformed/);
    importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    expect(() => exportPublicRecord(vectorMatch('a1'))).toThrow(/does not match its stealth address/);
    clearSession();
    expect(() => exportPublicRecord(vectorMatch('a1'))).toThrow(/Load or generate seller keys first/);
  });
});

describe('single encrypted keypair', () => {
  it('re-authenticates, checks eth_getCode at latest through the given RPC, and seals exactly the derived key', async () => {
    const rpc = codeRpc();
    const file = await exportEncryptedPayment(vectorMatch('a1'), keystore, EXPORT_PASS, { rpc, N: TEST_N });
    expect(file.filename).toBe('ghostpay-stealth-keypair.json');
    expect(rpc.calls).toEqual([{ method: 'eth_getCode', params: [vectorAnnouncement('a1').announcement.stealthAddress, 'latest'] }]);
    expectNoSecret(file.text);
    const opened = await decryptPaymentKeys(file.text, EXPORT_PASS, { expectedChainId: VECTOR_CHAIN });
    expect(opened.header.scope).toBe('single');
    expect(Buffer.from(opened.payments[0]?.secret ?? []).toString('hex')).toBe(strip(vectorAnnouncement('a1').expected.privateKey));
  });

  it('exports a deep-scan payment whose announced view tag differs (ownership is the derived address)', async () => {
    const file = await exportEncryptedPayment(vectorMatch('a4'), keystore, EXPORT_PASS, { rpc: codeRpc(), N: TEST_N });
    expect(inspectPaymentKeys(file.text).payments[0]?.viewTag).toBe(vectorAnnouncement('a4').expected.announcedViewTag);
  });

  it('refuses an address with code, a failed or malformed code check, a missing RPC and an RPC of another chain', async () => {
    const m = vectorMatch('a1');
    await expect(exportEncryptedPayment(m, keystore, EXPORT_PASS, { rpc: codeRpc(VECTOR_CHAIN, () => '0xef0100aabbccddeeff00112233445566778899aabbcc'), N: TEST_N })).rejects.toThrow(/contract code.*EIP-7702/);
    await expect(exportEncryptedPayment(m, keystore, EXPORT_PASS, { rpc: codeRpc(VECTOR_CHAIN, () => '0x6001600155'), N: TEST_N })).rejects.toThrow(/contract code/);
    await expect(exportEncryptedPayment(m, keystore, EXPORT_PASS, { rpc: codeRpc(VECTOR_CHAIN, () => { throw new Error('rpc down'); }), N: TEST_N })).rejects.toThrow(/could not confirm/);
    for (const bad of [null, 42, '0x0', 'zz', `0x${'00'.repeat(24_577)}`]) {
      await expect(exportEncryptedPayment(m, keystore, EXPORT_PASS, { rpc: codeRpc(VECTOR_CHAIN, () => bad), N: TEST_N })).rejects.toThrow(/could not confirm/);
    }
    const noRpc = codeRpc();
    await expect(exportEncryptedPayment(m, keystore, EXPORT_PASS, { rpc: undefined, N: TEST_N })).rejects.toThrow(/needs the RPC this scan used/);
    await expect(exportEncryptedPayment(m, keystore, EXPORT_PASS, { rpc: codeRpc(84532), N: TEST_N })).rejects.toThrow(/serves a different chain/);
    expect(noRpc.calls).toEqual([]);
  });

  it('checks the new passphrase and the credential before any request', async () => {
    const rpc = codeRpc();
    await expect(exportEncryptedPayment(vectorMatch('a1'), keystore, 'short', { rpc, N: TEST_N })).rejects.toThrow(/at least 14/);
    await expect(exportEncryptedPayment(vectorMatch('a1'), { kind: 'vault', passphrase: EXPORT_PASS }, EXPORT_PASS, { rpc, N: TEST_N })).rejects.toThrow(/No encrypted vault for the loaded keys/);
    await expect(exportEncryptedPayment(vectorMatch('a1'), { ...keystore, passphrase: 'not the keystore passphrase' }, EXPORT_PASS, { rpc, N: TEST_N })).rejects.toThrow(/Wrong passphrase/);
    expect(rpc.calls).toEqual([]);
  });

  it('discards the result and wipes the key when the keys are wiped while the file is being sealed', async () => {
    let captured: Uint8Array | undefined;
    let release: () => void = () => undefined;
    let reached: () => void = () => undefined;
    const sealing = new Promise<void>((resolve) => { reached = resolve; });
    const actual = stealthExport.encryptPaymentKeys;
    vi.spyOn(stealthExport, 'encryptPaymentKeys').mockImplementation(async (items, options) => {
      captured = items[0]?.secret;
      expect(captured?.some((b) => b !== 0)).toBe(true);
      reached();
      await new Promise<void>((resolve) => { release = resolve; });
      return actual(items, options);
    });
    const pending = exportEncryptedPayment(vectorMatch('a1'), keystore, EXPORT_PASS, { rpc: codeRpc(), N: TEST_N });
    const rejected = expect(pending).rejects.toThrow(/changed during this action/);
    try {
      await Promise.race([sealing, pending]);
      clearSession();
    } finally {
      release();
      await rejected;
    }
    expect(captured?.every((b) => b === 0)).toBe(true);
  });

  it('discards the result of a cancelled operation, also when the cancellation lands during the code check', async () => {
    const controller = new AbortController();
    const rpc = codeRpc(VECTOR_CHAIN, () => { controller.abort(); return '0x'; });
    await expect(exportEncryptedPayment(vectorMatch('a1'), keystore, EXPORT_PASS, { rpc, signal: controller.signal, N: TEST_N })).rejects.toThrow(/export was cancelled/);
    const failing = new AbortController();
    await expect(exportEncryptedPayment(vectorMatch('a1'), keystore, EXPORT_PASS, { rpc: codeRpc(VECTOR_CHAIN, () => { failing.abort(); throw new Error('down'); }), signal: failing.signal, N: TEST_N })).rejects.toThrow(/export was cancelled/);
    const before = new AbortController();
    before.abort();
    await expect(exportEncryptedPayment(vectorMatch('a1'), keystore, EXPORT_PASS, { rpc: codeRpc(), signal: before.signal, N: TEST_N })).rejects.toThrow(/export was cancelled/);
  });

  it('refuses keys replaced during re-authentication without contacting the RPC', async () => {
    const rpc = codeRpc();
    const pending = exportEncryptedPayment(vectorMatch('a1'), keystore, EXPORT_PASS, { rpc, N: TEST_N });
    importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    await expect(pending).rejects.toThrow(/changed during this action/);
    expect(rpc.calls).toEqual([]);
  });
});

describe('raw private key', () => {
  it('needs the explicit second confirmation, then yields exactly the section-6 text', async () => {
    const rpc = codeRpc();
    await expect(exportRawPrivateKey(vectorMatch('a1'), keystore, false as unknown as true, { rpc })).rejects.toThrow(/Confirm the private key warning/);
    expect(rpc.calls).toEqual([]);
    const file = await exportRawPrivateKey(vectorMatch('a1'), keystore, true, { rpc });
    expect(file).toEqual({ filename: 'ghostpay-stealth-private-key.txt', text: VECTORS.files.rawPrivateKey.text, type: 'text/plain' });
    expect(rpc.calls).toHaveLength(1);
  });

  it('refuses a contract account', async () => {
    await expect(exportRawPrivateKey(vectorMatch('a1'), keystore, true, { rpc: codeRpc(VECTOR_CHAIN, () => '0x00') })).rejects.toThrow(/contract code/);
  });
});

describe('payment key archive', () => {
  it('deduplicates replays to the earliest locator, sorts by address and refuses conflicts', () => {
    const a1 = vectorMatch('a1');
    const replay = vectorMatch('a1', { blockNumber: a1.announcement.blockNumber + 5n, id: 'replay' });
    const sameBlockEarlierLog = vectorMatch('a1', { logIndex: 0, id: 'earlier' });
    const kept = distinctPayments([replay, vectorMatch('a2'), sameBlockEarlierLog, a1, vectorMatch('a4')]);
    expect(kept.map((m) => m.stealthAddress.toLowerCase())).toEqual([...kept.map((m) => m.stealthAddress.toLowerCase())].sort());
    expect(kept).toHaveLength(3);
    expect(kept.find((m) => m.stealthAddress === a1.stealthAddress)?.announcement.id).toBe('earlier');
    const lowerHash = vectorMatch('a1', { blockHash: `0x${'00'.repeat(32)}`, id: 'lower-hash' });
    expect(distinctPayments([a1, lowerHash])[0]?.announcement.id).toBe('lower-hash');
    const conflict = vectorMatch('a1', { ephemeralPublicKey: vectorAnnouncement('a2').announcement.ephemeralPublicKey });
    expect(() => distinctPayments([a1, conflict])).toThrow(/different announcement keys/);
  });

  it('describes the count and chain before confirming, and refuses mixed chains, no payments and too many', () => {
    expect(describePaymentArchive([vectorMatch('a1'), vectorMatch('a1', { id: 'x', logIndex: 9 }), vectorMatch('a2')])).toEqual({ chainId: VECTOR_CHAIN, count: 2 });
    expect(() => describePaymentArchive([])).toThrow(/no payments/);
    expect(() => describePaymentArchive([vectorMatch('a1'), vectorMatch('a2', {}, 84532)])).toThrow(/same chain/);
    const many = Array.from({ length: 1025 }, (_, i) => vectorMatch('a1', { stealthAddress: `0x${(i + 1).toString(16).padStart(40, '0')}` }));
    expect(() => describePaymentArchive(many.map((m) => ({ ...m, stealthAddress: m.announcement.stealthAddress })))).toThrow(/at most 1024/);
  });

  it('exports every distinct payment once, checks each address once and never includes master keys', async () => {
    const rpc = codeRpc();
    const matches = [vectorMatch('a2'), vectorMatch('a1'), vectorMatch('a1', { id: 'replay', blockNumber: 7_000_000n }), vectorMatch('a4')];
    const file = await exportPaymentArchive(matches, 'all-discovered', keystore, EXPORT_PASS, { rpc, N: TEST_N });
    expect(file.filename).toBe('ghostpay-stealth-keypairs.json');
    expect(rpc.calls.map((c) => (c.params[0] as string).toLowerCase()).sort()).toEqual(['a1', 'a2', 'a4'].map((id) => vectorAnnouncement(id as 'a1').announcement.stealthAddress.toLowerCase()).sort());
    expectNoSecret(file.text);
    const opened = await decryptPaymentKeys(file.text, EXPORT_PASS);
    expect(opened.header).toMatchObject({ scope: 'all-discovered', chainId: VECTOR_CHAIN, count: 3 });
    expect(opened.payments.find((p) => p.record.stealthAddress === vectorAnnouncement('a1').announcement.stealthAddress)?.record.announcement.blockNumber).toBe(vectorAnnouncement('a1').announcement.blockNumber);
    expect(file.text).not.toContain('spendingKey');
  });

  it('refuses the whole archive when one address has code, and wipes every derived key', async () => {
    const bad = vectorAnnouncement('a2').announcement.stealthAddress;
    const rpc = codeRpc(VECTOR_CHAIN, (address) => (address === bad ? '0x60016001' : '0x'));
    await expect(exportPaymentArchive([vectorMatch('a1'), vectorMatch('a2')], 'all-discovered', keystore, EXPORT_PASS, { rpc, N: TEST_N })).rejects.toThrow(new RegExp(bad));
    let captured: Uint8Array[] = [];
    vi.spyOn(stealthExport, 'encryptPaymentKeys').mockImplementation((items) => { captured = items.map((i) => i.secret); return Promise.reject(new Error('sealing failed')); });
    await expect(exportPaymentArchive([vectorMatch('a1'), vectorMatch('a2')], 'selected', keystore, EXPORT_PASS, { rpc: codeRpc(), N: TEST_N })).rejects.toThrow(/sealing failed/);
    expect(captured).toHaveLength(2);
    expect(captured.every((s) => s.every((b) => b === 0))).toBe(true);
  });

  it('keeps the single scope to exactly one payment', async () => {
    await expect(exportPaymentArchive([vectorMatch('a1'), vectorMatch('a2')], 'single', keystore, EXPORT_PASS, { rpc: codeRpc(), N: TEST_N })).rejects.toThrow(/does not match the export scope/);
    const file = await exportPaymentArchive([vectorMatch('a1')], 'single', keystore, EXPORT_PASS, { rpc: codeRpc(), N: TEST_N });
    expect(file.filename).toBe('ghostpay-stealth-keypair.json');
  });
});

describe('master backup', () => {
  it('holds exactly the loaded spending and viewing keys and never the signing key', async () => {
    const file = await exportMasterBackup(keystore, EXPORT_PASS, { N: TEST_N });
    expect(file.filename).toBe('ghostpay-stealth-master.json');
    expectNoSecret(file.text);
    const opened = await decryptMasterBackup(file.text, EXPORT_PASS);
    expect(opened.header.metaAddress).toBe(VECTORS.seller.metaAddress);
    expect(Buffer.from(opened.spendingSecret).toString('hex')).toBe(strip(VECTORS.seller.spendingPrivateKey));
    expect(Buffer.from(opened.viewingSecret).toString('hex')).toBe(strip(VECTORS.seller.viewingPrivateKey));
    expect(file.text).not.toContain('33'.repeat(32));
  });

  it('refuses without a valid credential and discards a backup sealed after the keys changed', async () => {
    await expect(exportMasterBackup({ kind: 'vault', passphrase: 'x'.repeat(20) }, EXPORT_PASS, { N: TEST_N })).rejects.toThrow(/No encrypted vault/);
    const actual = stealthExport.encryptMasterBackup;
    vi.spyOn(stealthExport, 'encryptMasterBackup').mockImplementation(async (keys, options) => {
      const text = await actual(keys, options);
      clearSession();
      return text;
    });
    await expect(exportMasterBackup(keystore, EXPORT_PASS, { N: TEST_N })).rejects.toThrow(/Load or generate seller keys first|changed during this action/);
  });
});

describe('opening an export (recovery)', () => {
  beforeEach(() => { clearSession(); });

  it('opens every reference file in a session with no keys loaded', async () => {
    const pub = await openStealthExport(VECTORS.files.public.text, '');
    expect(pub.kind === 'public' && pub.record.stealthAddress).toBe(vectorAnnouncement('a1').announcement.stealthAddress);

    const archive = await openStealthExport(VECTORS.files.archive.text, VECTOR_PASS);
    if (archive.kind !== 'keypair') throw new Error('expected keypair');
    expect(archive.keys).toBeInstanceOf(RecoveredPaymentKeys);
    expect(archive.keys.header.count).toBe(3);
    const index = archive.keys.header.payments.findIndex((p) => p.stealthAddress === vectorAnnouncement('a1').announcement.stealthAddress);
    expect(() => archive.keys.rawKeyFile(index, false as unknown as true)).toThrow(/Confirm the private key warning/);
    expect(archive.keys.rawKeyFile(index, true).text).toBe(VECTORS.files.rawPrivateKey.text);
    expect(() => archive.keys.rawKeyFile(99, true)).toThrow(/was closed/);
    archive.keys.dispose();
    expect(archive.keys.disposed).toBe(true);
    expect(() => archive.keys.rawKeyFile(index, true)).toThrow(/was closed/);

    const single = await openStealthExport(VECTORS.files.single.text, VECTOR_PASS, { expectedChainId: VECTOR_CHAIN });
    expect(single.kind).toBe('keypair');
    await expect(openStealthExport(VECTORS.files.single.text, VECTOR_PASS, { expectedChainId: 84532 })).rejects.toThrow(/different chain/);
  });

  it('loads master keys through the hex-import path with a new signing key and recovers the payment omitted from the archive', async () => {
    const master = await openStealthExport(VECTORS.files.master.text, VECTOR_PASS);
    if (master.kind !== 'master') throw new Error('expected master');
    expect(master.keys).toBeInstanceOf(RecoveredMasterKeys);
    expect(master.keys.loaded).toBe(false);
    const installed = master.keys.install();
    expect(master.keys.disposed).toBe(true);
    expect(installed.metaAddress).toBe(VECTORS.seller.metaAddress);
    expect(getSessionPublic()?.metaAddress).toBe(VECTORS.seller.metaAddress);
    // Only the generated invoice-signing key lacks a copy (C-R10).
    expect(getSessionBackup()).toMatchObject({ backedUp: false, signerOnly: true });
    expect(() => master.keys.install()).toThrow(/was closed/);
    const omitted = VECTORS.files.archive.omitted[0] as 'a3';
    expect(exportPublicRecord(vectorMatch(omitted)).text).toContain(vectorAnnouncement(omitted).announcement.stealthAddress);
    const again = await openStealthExport(VECTORS.files.master.text, VECTOR_PASS);
    expect(again.kind === 'master' && again.keys.loaded).toBe(true);
  });

  it('fails closed on every reference refusal, a foreign file, an oversized file and a cancelled open', async () => {
    for (const bad of VECTORS.invalid) {
      await expect(openStealthExport(bad.text, bad.passphrase ?? ''), bad.id).rejects.toThrow();
    }
    await expect(openStealthExport('{"v":1}', VECTOR_PASS)).rejects.toThrow(/not a valid GhostPay stealth key export/);
    await expect(openStealthExport(' '.repeat(1_048_577), VECTOR_PASS)).rejects.toThrow(/larger than the stealth key export limit/);
    const controller = new AbortController();
    controller.abort();
    await expect(openStealthExport(VECTORS.files.archive.text, VECTOR_PASS, { signal: controller.signal })).rejects.toThrow(/cancelled/);
    for (const text of [VECTORS.files.archive.text, VECTORS.files.master.text]) {
      const late = new AbortController();
      const actualPayments = stealthExport.decryptPaymentKeys;
      const actualMaster = stealthExport.decryptMasterBackup;
      const spies = [
        vi.spyOn(stealthExport, 'decryptPaymentKeys').mockImplementation(async (...args) => { const r = await actualPayments(...args); late.abort(); return r; }),
        vi.spyOn(stealthExport, 'decryptMasterBackup').mockImplementation(async (...args) => { const r = await actualMaster(...args); late.abort(); return r; }),
      ];
      await expect(openStealthExport(text, VECTOR_PASS, { signal: late.signal })).rejects.toThrow(/cancelled/);
      for (const spy of spies) spy.mockRestore();
    }
  });
});
