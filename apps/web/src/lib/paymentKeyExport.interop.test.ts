import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recoverMessageAddress, verifyMessage, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportEncryptedPayment } from './paymentKeyExport';
import { VECTORS, VECTOR_CHAIN, codeRpc, loadVectorSeller, vectorAnnouncement, vectorMatch } from './paymentKeyExport.testutil';
import { clearSession, exportKeystore, getSessionPublic } from './session';

// Public TEST-ONLY fixtures. The fresh export uses production defaults, never a saved ciphertext or pre-decrypted key.
const CREDENTIAL_PASS = 'interoperability-credential-test-only';
const EXPORT_PASS = 'interoperability-payment-test-only';
const SCRIPT = fileURLToPath(new URL('../../../../scripts/recovery/stealth-export-recover.mjs', import.meta.url));
const SECRET_MARKERS = [
  VECTORS.seller.spendingPrivateKey,
  VECTORS.seller.viewingPrivateKey,
  ...VECTORS.announcements.map((announcement) => announcement.expected.privateKey),
].map((key) => key.slice(2));

interface RecoveredSingle {
  readonly payments: readonly {
    readonly stealthAddress: Address;
    readonly publicKey: Hex;
    readonly privateKey?: Hex;
  }[];
}

function expectNoPrivateKeys(text: string): void {
  for (const key of SECRET_MARKERS) expect(text.toLowerCase().includes(key)).toBe(false);
}

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe('application export interoperability with the documented standalone decoder', () => {
  it('recovers a fresh default-cost export after clearing the session and signs only for its recorded address', async () => {
    clearSession();
    const network = vi.fn(() => { throw new Error('Unexpected network request in offline recovery acceptance'); });
    vi.stubGlobal('fetch', network);
    loadVectorSeller();
    const credential = { kind: 'keystore' as const, text: await exportKeystore(CREDENTIAL_PASS), passphrase: CREDENTIAL_PASS };
    const rpc = codeRpc();
    const expected = vectorAnnouncement('a1').expected;
    const file = await exportEncryptedPayment(vectorMatch('a1'), credential, EXPORT_PASS, { rpc });
    expect(file.filename).toBe('ghostpay-stealth-keypair.json');
    expect(file.type).toBe('application/json');
    expect(JSON.parse(file.text) as unknown).toMatchObject({
      format: 'ghostpay-stealth-keypair-v1', version: 1, scope: 'single', chainId: VECTOR_CHAIN, count: 1,
      kdf: { name: 'scrypt', N: 2 ** 17, r: 8, p: 1, dkLen: 32 },
      payments: [{ stealthAddress: expected.stealthAddress, publicKey: { value: expected.publicKey } }],
    });
    expect(rpc.calls).toEqual([{ method: 'eth_getCode', params: [expected.stealthAddress, 'latest'] }]);
    expectNoPrivateKeys(file.text);
    clearSession();
    expect(getSessionPublic()).toBeUndefined();

    const isolated = mkdtempSync(join(tmpdir(), 'gp-export-interop-'));
    try {
      const script = join(isolated, 'stealth-export-recover.mjs');
      cpSync(SCRIPT, script);
      const vendor = join(isolated, 'node_modules', '@noble');
      mkdirSync(vendor, { recursive: true });
      for (const [name, entry] of [['curves', '@noble/curves/secp256k1.js'], ['hashes', '@noble/hashes/sha3.js']] as const) {
        cpSync(dirname(fileURLToPath(import.meta.resolve(entry))), join(vendor, name), { recursive: true, dereference: true });
      }
      const path = join(isolated, file.filename);
      writeFileSync(path, file.text, { encoding: 'utf8', mode: 0o600 });
      expect(readFileSync(path)).toEqual(Buffer.from(file.text, 'utf8'));
      expect(readFileSync(script)).toEqual(readFileSync(SCRIPT));

      // Reuse the existing independent recovery test's supported Node permission spelling; never drop the restriction.
      const permissionFlag = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
      const processOptions = { cwd: isolated, encoding: 'utf8' as const, env: { PATH: '' }, timeout: 15_000, maxBuffer: 1 << 20 };
      const denied = spawnSync(process.execPath, [permissionFlag, `--allow-fs-read=${isolated}`, '-e',
        "try { require('node:fs').readFileSync(process.argv[1]); process.exitCode = 1; } catch (error) { if (error.code !== 'ERR_ACCESS_DENIED') throw error; }", SCRIPT,
      ], processOptions);
      expect(denied.error).toBeUndefined();
      expect(denied.status, denied.stderr).toBe(0);
      const decode = (flags: readonly string[]) => spawnSync(process.execPath, [
        permissionFlag, `--allow-fs-read=${isolated}`, script, path, ...flags,
      ], { ...processOptions, input: `${EXPORT_PASS}\n` });

      // The guide's default invocation authenticates the new file without disclosing the recovered key.
      const verified = decode(['--expected-chain', String(VECTOR_CHAIN)]);
      expect(verified.error).toBeUndefined();
      expect(verified.status, verified.stderr).toBe(0);
      expect(JSON.parse(verified.stdout) as unknown).toMatchObject({
        format: 'keypair', scope: 'single', chainId: VECTOR_CHAIN, count: 1,
        payments: [{ stealthAddress: expected.stealthAddress, publicKey: expected.publicKey }],
      });
      expect(verified.stdout).not.toContain('privateKey');
      expectNoPrivateKeys(verified.stdout + verified.stderr);

      const wrongChain = decode(['--expected-chain', '1', '--reveal-private-keys']);
      expect(wrongChain.error).toBeUndefined();
      expect(wrongChain.status).toBe(1);
      expect(wrongChain.stdout).toBe('');
      expect(wrongChain.stderr).toMatch(/error: wrongChain:/);
      expectNoPrivateKeys(wrongChain.stderr);

      const revealed = decode(['--expected-chain', String(VECTOR_CHAIN), '--reveal-private-keys']);
      expect(revealed.error).toBeUndefined();
      expect(revealed.status, revealed.stderr).toBe(0);
      expectNoPrivateKeys(revealed.stderr);
      const recovered = JSON.parse(revealed.stdout) as RecoveredSingle;
      expect(recovered.payments).toHaveLength(1);
      const payment = recovered.payments[0];
      if (payment?.privateKey === undefined) throw new Error('The standalone decoder did not return the payment key');
      expect(payment.stealthAddress).toBe(expected.stealthAddress);
      expect(payment.publicKey).toBe(expected.publicKey);
      expect(payment.privateKey === expected.privateKey).toBe(true);

      // Only the decoder's returned scalar enters the independent wallet API. No transaction or RPC client is created.
      const account = privateKeyToAccount(payment.privateKey);
      expect(account.address).toBe(expected.stealthAddress);
      const message = `GhostPay TEST-ONLY offline export interoperability\nChain: ${String(VECTOR_CHAIN)}\nAddress: ${expected.stealthAddress}`;
      const signature = await account.signMessage({ message });
      await expect(recoverMessageAddress({ message, signature })).resolves.toBe(expected.stealthAddress);
      await expect(verifyMessage({ address: account.address, message: `${message}\nmodified`, signature })).resolves.toBe(false);
      expect(getSessionPublic()).toBeUndefined();
      expect(network).not.toHaveBeenCalled();
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });
});
