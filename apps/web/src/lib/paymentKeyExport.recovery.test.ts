import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretBox } from '@ghostpay/secret-box';
import { clearSession, exportKeystore, getSessionBackup, getSessionPublic, isSessionSuspended, suspendSession } from './session';
import * as stealthExport from './stealthExport';
import { decryptMasterBackup, decryptPaymentKeys } from './stealthExport';
import {
  RecoveredMasterKeys,
  RecoveredPaymentKeys,
  describePaymentArchive,
  distinctPayments,
  exportMasterBackup,
  exportPaymentArchive,
  exportPublicRecord,
  openStealthExport,
  verifyStealthExport,
} from './paymentKeyExport';
import { TEST_N, VECTORS, VECTOR_CHAIN, VECTOR_PASS, codeRpc, loadVectorSeller, vectorAnnouncement, vectorMatch } from './paymentKeyExport.testutil';
import type { SecretExportCredential } from './keyVault';
import { UserFacingError, captureUserMessage, userMessage } from './errors';

// Spec 18 archive, master backup and recovery cases. Source: 055d33e0:apps/web/src/lib/paymentKeyExport.test.ts
// (describe blocks from "payment key archive" on); the single-payment cases stay in main's paymentKeyExport.test.ts.

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
  for (const secret of SECRETS) expect(text.toLowerCase().includes(secret)).toBe(false);
}

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

  it('resolves same-locator replay metadata deterministically regardless of scan input order', () => {
    const first = vectorMatch('a1', { transactionHash: `0x${'11'.repeat(32)}`, metadata: '0xff' });
    const lowerTransaction = vectorMatch('a1', { transactionHash: `0x${'00'.repeat(32)}`, metadata: '0xff' });
    const lowerViewTag = vectorMatch('a1', { transactionHash: `0x${'00'.repeat(32)}`, metadata: '0x00' });
    expect(distinctPayments([first, lowerTransaction, lowerViewTag])).toEqual([lowerViewTag]);
    expect(distinctPayments([lowerViewTag, lowerTransaction, first])).toEqual([lowerViewTag]);
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
    expect(file.text.includes('spendingKey')).toBe(false);
    for (const payment of opened.payments) payment.secret.fill(0);
  });

  it('refuses the whole archive when one address has code, and wipes every derived key', async () => {
    const bad = vectorAnnouncement('a2').announcement.stealthAddress;
    const rpc = codeRpc(VECTOR_CHAIN, (address) => (address === bad ? '0x60016001' : '0x'));
    const error: unknown = await exportPaymentArchive([vectorMatch('a1'), vectorMatch('a2')], 'all-discovered', keystore, EXPORT_PASS, { rpc, N: TEST_N })
      .then(() => undefined, (cause: unknown) => cause);
    expect(error).toBeInstanceOf(UserFacingError);
    expect(userMessage(error)).toMatch(/contract code/);
    expect(userMessage(error).toLowerCase()).not.toContain(bad.toLowerCase());
    expect(JSON.stringify(captureUserMessage(error)).toLowerCase()).not.toContain(bad.toLowerCase());
    let captured: Uint8Array[] = [];
    vi.spyOn(stealthExport, 'encryptPaymentKeys').mockImplementation((items) => { captured = items.map((i) => i.secret); return Promise.reject(new Error('sealing failed')); });
    await expect(exportPaymentArchive([vectorMatch('a1'), vectorMatch('a2')], 'selected', keystore, EXPORT_PASS, { rpc: codeRpc(), N: TEST_N })).rejects.toThrow(/sealing failed/);
    expect(captured).toHaveLength(2);
    expect(captured.every((s) => s.every((b) => b === 0))).toBe(true);
  });

  it('refuses a changed scan route before any address is sent and discards an archive sealed after the route changed', async () => {
    const base = codeRpc();
    let current = false;
    const rpc = { ...base, assertCurrent: () => { if (!current) throw new UserFacingError({ key: 'error.paymentKeyExport.noRpc' }); } };
    const archive = () => exportPaymentArchive([vectorMatch('a1'), vectorMatch('a2')], 'all-discovered', keystore, EXPORT_PASS, { rpc, N: TEST_N });
    await expect(archive()).rejects.toThrow(/needs the RPC this scan used/);
    expect(base.calls).toHaveLength(0);
    let derived: Uint8Array[] = [];
    const encrypt = stealthExport.encryptPaymentKeys;
    vi.spyOn(stealthExport, 'encryptPaymentKeys').mockImplementation(async (items, options) => {
      derived = items.map((item) => item.secret);
      const text = await encrypt(items, options);
      current = false;
      return text;
    });
    current = true;
    await expect(archive()).rejects.toThrow(/needs the RPC this scan used/);
    expect(base.calls).toHaveLength(2);
    expect(derived).toHaveLength(2);
    expect(derived.every((secret) => secret.every((byte) => byte === 0))).toBe(true);
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
    try {
      expect(Buffer.from(opened.spendingSecret).toString('hex') === strip(VECTORS.seller.spendingPrivateKey)).toBe(true);
      expect(Buffer.from(opened.viewingSecret).toString('hex') === strip(VECTORS.seller.viewingPrivateKey)).toBe(true);
    } finally {
      opened.spendingSecret.fill(0);
      opened.viewingSecret.fill(0);
    }
    expect(file.text.includes('33'.repeat(32))).toBe(false);
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

describe('secret exports while idle-suspended (#689)', () => {
  it('refuses the master backup and the payment archive while suspended and keeps the retained keys', async () => {
    const before = getSessionPublic();
    suspendSession();
    const sealMaster = vi.spyOn(stealthExport, 'encryptMasterBackup');
    const sealArchive = vi.spyOn(stealthExport, 'encryptPaymentKeys');
    await expect(exportMasterBackup(keystore, EXPORT_PASS, { N: TEST_N })).rejects.toThrow(/locked after inactivity/);
    await expect(exportPaymentArchive([vectorMatch('a1'), vectorMatch('a2')], 'all-discovered', keystore, EXPORT_PASS, { rpc: codeRpc(), N: TEST_N })).rejects.toThrow(/locked after inactivity/);
    expect(sealMaster).not.toHaveBeenCalled();
    expect(sealArchive).not.toHaveBeenCalled();
    expect(isSessionSuspended()).toBe(true);
    expect(getSessionPublic()).toBe(before);
  });

  it('discards a master backup sealed while the idle lock suspended the session', async () => {
    const actual = stealthExport.encryptMasterBackup;
    vi.spyOn(stealthExport, 'encryptMasterBackup').mockImplementation(async (keys, options) => {
      const text = await actual(keys, options);
      suspendSession();
      return text;
    });
    await expect(exportMasterBackup(keystore, EXPORT_PASS, { N: TEST_N })).rejects.toThrow(/changed during this action/);
    expect(isSessionSuspended()).toBe(true);
  });
});

describe('opening an export (recovery)', () => {
  beforeEach(() => { clearSession(); });

  it('wipes the decrypted payment scalars after boxing while keeping each boxed key usable', async () => {
    const opened = await decryptPaymentKeys(VECTORS.files.archive.text, VECTOR_PASS);
    const keys = RecoveredPaymentKeys.take(opened.header, opened.payments);
    try {
      expect(opened.payments.every((payment) => payment.secret.every((byte) => byte === 0))).toBe(true);
      const index = opened.header.payments.findIndex((payment) => payment.stealthAddress === vectorAnnouncement('a1').announcement.stealthAddress);
      expect(keys.rawKeyFile(index, true).text === VECTORS.files.rawPrivateKey.text).toBe(true);
    } finally {
      keys.dispose();
    }
  });

  it('disposes partial master boxes and wipes source scalars if boxing the second key fails', async () => {
    const opened = await decryptMasterBackup(VECTORS.files.master.text, VECTOR_PASS);
    const actual = SecretBox.copyOf.bind(SecretBox);
    let first: SecretBox | undefined;
    vi.spyOn(SecretBox, 'copyOf').mockImplementation((bytes, options) => {
      if (first !== undefined) throw new Error('simulated allocation failure');
      first = actual(bytes, options);
      return first;
    });
    expect(() => RecoveredMasterKeys.take(opened.header, opened.spendingSecret, opened.viewingSecret)).toThrow('simulated allocation failure');
    expect(first?.disposed).toBe(true);
    expect(opened.spendingSecret.every((byte) => byte === 0)).toBe(true);
    expect(opened.viewingSecret.every((byte) => byte === 0)).toBe(true);
  });

  it('opens every reference file in a session with no keys loaded', async () => {
    const pub = await openStealthExport(VECTORS.files.public.text, '');
    expect(pub.kind === 'public' && pub.record.stealthAddress).toBe(vectorAnnouncement('a1').announcement.stealthAddress);

    const archive = await openStealthExport(VECTORS.files.archive.text, VECTOR_PASS);
    if (archive.kind !== 'keypair') throw new Error('expected keypair');
    expect(archive.keys).toBeInstanceOf(RecoveredPaymentKeys);
    expect(archive.keys.header.count).toBe(3);
    const index = archive.keys.header.payments.findIndex((p) => p.stealthAddress === vectorAnnouncement('a1').announcement.stealthAddress);
    expect(() => archive.keys.rawKeyFile(index, false as unknown as true)).toThrow(/Confirm the private key warning/);
    expect(archive.keys.rawKeyFile(index, true).text === VECTORS.files.rawPrivateKey.text).toBe(true);
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

  it('applies an explicit chain constraint to public records and rejects chain-neutral master backups before decryption', async () => {
    const publicRecord = await openStealthExport(VECTORS.files.public.text, '', { expectedChainId: VECTOR_CHAIN });
    expect(publicRecord.kind).toBe('public');
    await expect(openStealthExport(VECTORS.files.public.text, '', { expectedChainId: 84532 })).rejects.toThrow(/different chain/);
    const decrypt = vi.spyOn(stealthExport, 'decryptMasterBackup');
    await expect(openStealthExport(VECTORS.files.master.text, VECTOR_PASS, { expectedChainId: VECTOR_CHAIN })).rejects.toThrow(/different chain/);
    expect(decrypt).not.toHaveBeenCalled();
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

  it('reports a later version of each export family as unsupported, not as an invalid file, before any decryption (UX-01)', async () => {
    const refusal = async (text: string): Promise<unknown> => {
      const error = await openStealthExport(text, VECTOR_PASS).then(() => undefined, (e: unknown) => e);
      expect(error).toBeInstanceOf(UserFacingError);
      return captureUserMessage(error);
    };
    const relabel = (text: string, change: Record<string, unknown>): string => JSON.stringify({ ...(JSON.parse(text) as object), ...change }, null, 2);
    const payments = vi.spyOn(stealthExport, 'decryptPaymentKeys');
    const master = vi.spyOn(stealthExport, 'decryptMasterBackup');
    for (const text of [
      relabel(VECTORS.files.public.text, { format: 'ghostpay-stealth-public-v2', version: 2 }),
      relabel(VECTORS.files.archive.text, { format: 'ghostpay-stealth-keypair-v2', version: 2 }),
      relabel(VECTORS.files.master.text, { format: 'ghostpay-stealth-master-v3', version: 3, futureField: true }),
      '{"format":"ghostpay-stealth-keypair-v10"}',
    ]) {
      expect(await refusal(text)).toEqual({ key: 'error.stealthExport.unsupportedVersion' });
      await expect(verifyStealthExport(text, VECTOR_PASS)).rejects.toThrow(/made by a newer GhostPay/);
    }
    expect(payments).not.toHaveBeenCalled();
    expect(master).not.toHaveBeenCalled();
    // A later `version` inside a v1 identifier is refused by the v1 parser, before its KDF; near misses stay invalid.
    expect(await refusal(relabel(VECTORS.files.archive.text, { version: 2 }))).toEqual({ key: 'error.stealthExport.unsupportedVersion' });
    for (const text of ['{"format":"ghostpay-stealth-keypair-v2x"}', '{"format":"ghostpay-stealth-wallet-v2"}', '{"v":2}', '\u00e9{"format":"ghostpay-stealth-keypair-v2"}']) {
      expect(await refusal(text)).toEqual({ key: 'error.stealthExport.invalidFile' });
    }
  });
});

describe('verifying an export without importing', () => {
  it('checks payment and master keys, disposes every key box, and leaves the current wallet and custody unchanged', async () => {
    const session = getSessionPublic();
    const custody = getSessionBackup();
    const paymentDispose = vi.spyOn(RecoveredPaymentKeys.prototype, 'dispose');
    const masterDispose = vi.spyOn(RecoveredMasterKeys.prototype, 'dispose');
    const payment = await verifyStealthExport(VECTORS.files.archive.text, VECTOR_PASS, { expectedChainId: VECTOR_CHAIN });
    expect(payment.kind === 'keypair' && payment.header.count).toBe(3);
    expect(payment).not.toHaveProperty('keys');
    expect(paymentDispose).toHaveBeenCalledTimes(1);
    expect(paymentDispose.mock.instances[0]).toHaveProperty('disposed', true);
    const master = await verifyStealthExport(VECTORS.files.master.text, VECTOR_PASS);
    expect(master.kind === 'master' && master.header.metaAddress).toBe(VECTORS.seller.metaAddress);
    expect(master).not.toHaveProperty('keys');
    expect(masterDispose).toHaveBeenCalledTimes(1);
    expect(masterDispose.mock.instances[0]).toHaveProperty('disposed', true);
    expect(getSessionPublic()).toBe(session);
    expect(getSessionBackup()).toEqual(custody);
  });

  it('never verifies a public record, wrong password, corrupt file or wrong chain as a backup', async () => {
    await expect(verifyStealthExport(VECTORS.files.public.text, '')).rejects.toThrow(/contains no private keys/);
    await expect(verifyStealthExport(VECTORS.files.single.text, 'wrong password')).rejects.toThrow(/Wrong passphrase/);
    await expect(verifyStealthExport('{"v":1}', VECTOR_PASS)).rejects.toThrow(/not a valid GhostPay stealth key export/);
    await expect(verifyStealthExport(VECTORS.files.single.text, VECTOR_PASS, { expectedChainId: 84532 })).rejects.toThrow(/different chain/);
  });

  it('disposes keys and refuses a verification result after the wallet changes during decryption', async () => {
    const actual = stealthExport.decryptMasterBackup;
    const dispose = vi.spyOn(RecoveredMasterKeys.prototype, 'dispose');
    vi.spyOn(stealthExport, 'decryptMasterBackup').mockImplementation(async (...args) => {
      const opened = await actual(...args);
      clearSession();
      return opened;
    });
    await expect(verifyStealthExport(VECTORS.files.master.text, VECTOR_PASS)).rejects.toThrow(/changed during this action/);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose.mock.instances[0]).toHaveProperty('disposed', true);
  });

  it('never reports success when cancellation arrives during decryption', async () => {
    const controller = new AbortController();
    const actual = stealthExport.decryptPaymentKeys;
    const dispose = vi.spyOn(RecoveredPaymentKeys.prototype, 'dispose');
    vi.spyOn(stealthExport, 'decryptPaymentKeys').mockImplementation(async (...args) => {
      const opened = await actual(...args);
      controller.abort();
      return opened;
    });
    await expect(verifyStealthExport(VECTORS.files.archive.text, VECTOR_PASS, { signal: controller.signal })).rejects.toThrow(/cancelled/);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose.mock.instances[0]).toHaveProperty('disposed', true);
  });
});
