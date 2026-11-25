import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, exportKeystore, getSessionPublic, importSession } from './session';
import * as stealthExport from './stealthExport';
import { decryptPaymentKeys, inspectPaymentKeys } from './stealthExport';
import { exportEncryptedPayment, exportPublicRecord, exportRawPrivateKey } from './paymentKeyExport';
import { TEST_N, VECTORS, VECTOR_CHAIN, VECTOR_TIME, codeRpc, loadVectorSeller, vectorAnnouncement, vectorMatch } from './paymentKeyExport.testutil';
import type { SecretExportCredential } from './keyVault';
import { UserFacingError, captureUserMessage, userMessage } from './errors';

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
    try {
      expect(Buffer.from(opened.payments[0]?.secret ?? []).toString('hex') === strip(vectorAnnouncement('a1').expected.privateKey)).toBe(true);
    } finally {
      for (const payment of opened.payments) payment.secret.fill(0);
    }
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

  it('keeps contract-code refusals free of the selected payment address', async () => {
    const match = vectorMatch('a1');
    const session = getSessionPublic();
    const error: unknown = await exportEncryptedPayment(match, keystore, EXPORT_PASS, {
      rpc: codeRpc(VECTOR_CHAIN, () => '0xef0100aabbccddeeff00112233445566778899aabbcc'), N: TEST_N,
    }).then(() => undefined, (cause: unknown) => cause);
    expect(error).toBeInstanceOf(UserFacingError);
    expect(userMessage(error)).toMatch(/contract code.*EIP-7702/);
    expect(userMessage(error).toLowerCase()).not.toContain(match.stealthAddress.toLowerCase());
    expect(JSON.stringify(captureUserMessage(error)).toLowerCase()).not.toContain(match.stealthAddress.toLowerCase());
    expect(getSessionPublic()).toEqual(session);
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

  it('refuses a changed scan route before disclosure and discards keys when the route changes during encryption', async () => {
    const base = codeRpc();
    let current = false;
    const rpc = {
      ...base,
      assertCurrent: () => {
        if (!current) throw new UserFacingError({ key: 'error.paymentKeyExport.noRpc' });
      },
    };
    const single = () => exportEncryptedPayment(vectorMatch('a1'), keystore, EXPORT_PASS, { rpc, N: TEST_N });
    await expect(single()).rejects.toThrow(/needs the RPC this scan used/);
    expect(base.calls).toHaveLength(0);

    let derived: Uint8Array | undefined;
    const encrypt = stealthExport.encryptPaymentKeys;
    vi.spyOn(stealthExport, 'encryptPaymentKeys').mockImplementation(async (items, options) => {
      derived = items[0]?.secret;
      const text = await encrypt(items, options);
      current = false;
      return text;
    });
    current = true;
    await expect(single()).rejects.toThrow(/needs the RPC this scan used/);
    expect(base.calls).toHaveLength(1);
    expect(derived?.length).toBe(32);
    expect(derived?.every((byte) => byte === 0)).toBe(true);
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
    expect(file.filename).toBe('ghostpay-stealth-private-key.txt');
    expect(file.type).toBe('text/plain');
    expect(file.text === VECTORS.files.rawPrivateKey.text).toBe(true);
    expect(rpc.calls).toHaveLength(1);
  });

  it('refuses a contract account', async () => {
    await expect(exportRawPrivateKey(vectorMatch('a1'), keystore, true, { rpc: codeRpc(VECTOR_CHAIN, () => '0x00') })).rejects.toThrow(/contract code/);
  });
});
