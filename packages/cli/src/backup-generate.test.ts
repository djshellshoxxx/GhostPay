import { describe, expect, it } from 'vitest';
import { createKeystoreApi } from '@ghostpay/ux-vault/portable';
import { signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { allOutput, makeIo, stdoutJson } from './fixtures.testutil.js';
import { run } from './run.js';

const passphrase = 'birch-velvet-otter-copper-archer-quartz';
const args = ['backup', 'generate', '--passphrase-env', 'TEST_PASSPHRASE', '--out', 'seller.json', '--json'];

describe('encrypted seller key generation', () => {
  it('generates three independent keys using the GUI-compatible encrypted keystore without disclosing secrets', async () => {
    const io = makeIo(); io.env['TEST_PASSPHRASE'] = passphrase;
    expect(await run(args, io)).toBe(0);
    const encrypted = io.files.get('seller.json')!;
    const keys = await createKeystoreApi().decryptKeystore(encrypted, passphrase);
    const publicKeys = [keys.spendingKey, keys.viewingKey, keys.signingKey].map(signerPublicKeyHex);
    expect(new Set(publicKeys).size).toBe(3);
    expect(stdoutJson(io)).toMatchObject({ ok: true, schemaVersion: 1, generated: true, format: 'seller-keystore', recordCount: 3 });
    expect(allOutput(io)).not.toContain(passphrase);
    for (const key of [keys.spendingKey, keys.viewingKey, keys.signingKey]) {
      expect(allOutput(io)).not.toContain(Buffer.from(key).toString('hex')); key.fill(0);
    }
    io.out.length = 0;
    expect(await run(['backup', 'verify', '--in', 'seller.json', '--passphrase-env', 'TEST_PASSPHRASE', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ authenticated: true, recordCount: 3 });
  });
  it('requires a new explicit encrypted output and preserves existing files', async () => {
    const io = makeIo({ 'seller.json': 'existing key backup' }); io.env['TEST_PASSPHRASE'] = passphrase;
    expect(await run(args, io)).toBe(3);
    expect(io.files.get('seller.json')).toBe('existing key backup');
    expect(await run([...args, '--force'], io)).toBe(2);
    expect(await run(['backup', 'generate', '--passphrase-env', 'TEST_PASSPHRASE', '--json'], io)).toBe(2);
    expect(io.files.size).toBe(1);
  });
  it('refuses missing or weak credentials without publishing plaintext or an unencrypted fallback', async () => {
    const io = makeIo();
    expect(await run(args, io)).toBe(3);
    io.env['TEST_PASSPHRASE'] = 'weak';
    expect(await run(args, io)).toBe(2);
    expect(io.files.size).toBe(0); expect(allOutput(io)).not.toContain('weak');
  });
  it('fails closed when the random source repeats keys or throws', async () => {
    const io = makeIo(); io.env['TEST_PASSPHRASE'] = passphrase; io.constantRandom = true;
    expect(await run(args, io)).toBe(1);
    expect(io.files.size).toBe(0);
    expect(io.err.join('')).toContain('KEY_GENERATION_FAILED');
    const broken = { ...makeIo(), env: { TEST_PASSPHRASE: passphrase }, random: { getRandomValues: () => { throw new Error('PRIVATE_RNG_DETAIL'); } } };
    expect(await run(args, broken)).toBe(1);
    expect(broken.files.size).toBe(0); expect(allOutput(broken)).not.toContain('PRIVATE_RNG_DETAIL');
  });
  it('rejects a signing key repeated from either receiving key even when the first two draws differ', async () => {
    for (const repeat of [1, 2]) {
      const io = makeIo(); io.env['TEST_PASSPHRASE'] = passphrase; let draw = 0;
      const random = { getRandomValues<T extends ArrayBufferView | null>(value: T): T {
        if (value === null) return value;
        const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength); bytes.fill(0);
        bytes[bytes.length - 1] = ++draw <= 2 ? draw : repeat; return value;
      } };
      expect(await run(args, { ...io, random })).toBe(1);
      expect(io.files.size).toBe(0);
      expect(io.err.join('')).toContain('KEY_GENERATION_FAILED');
    }
  });
});
