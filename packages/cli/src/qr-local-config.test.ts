import { beforeAll, describe, expect, it } from 'vitest';
import { createKeystoreApi } from '@ghostpay/ux-vault/portable';
import { exportSettingsExchange, parseSettingsExchange } from '@ghostpay/qr-exchange';
import { G, G2, KEY_BYTES, KEY_HEX, SIGNER, allOutput, makeIo, stdoutJson } from './fixtures.testutil.js';
import { run } from './run.js';

const passphrase = 'birch-velvet-otter-copper-archer-quartz';
const keys = { spendingKey: Uint8Array.from(Buffer.from('00'.repeat(31) + '01', 'hex')), viewingKey: Uint8Array.from(Buffer.from('00'.repeat(31) + '02', 'hex')), signingKey: KEY_BYTES };
const preferences = { delayMinSec: 3, delayMaxSec: 8, lockTimeoutMin: 10, theme: 'dark' as const, autoClearFragment: true };
let encrypted: string;
beforeAll(async () => { encrypted = await createKeystoreApi().encryptKeystore(keys, { metaAddress: `st:eth:0x${G}${G2}`, signer: SIGNER }, passphrase, { N: 16384 }); });

describe('encrypted keystore and safe settings QR parity', () => {
  it('rejects invalid or excessive frame scans before reading any additional file', async () => {
    for (const first of ['GPQ1/invalid', new Array<string>(129).fill('GPQ1/invalid').join('\n')]) {
      const io = makeIo({ first }); const reads: string[] = [];
      const observed = { ...io, readFile: (path: string) => { reads.push(path); return io.readFile(path); } };
      expect(await run(['qr', 'decode', '--kind', 'settings', '--in', 'first', '--frame-file', 'must-not-read', '--json'], observed)).toBe(1);
      expect(reads).toEqual(['first']);
      expect(io.out).toEqual([]);
    }
  });
  it('transfers the GUI encrypted envelope through actual SVG decoding without decrypting or authenticating it', async () => {
    const io = makeIo({ encrypted });
    expect(await run(['qr', 'encode', '--kind', 'keystore', '--in', 'encrypted', '--out', 'keys.svg', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ encrypted: true, authenticationVerified: false });
    io.out.length = 0;
    expect(await run(['qr', 'decode', '--kind', 'keystore', '--in', 'keys.svg', '--out', 'restored.json', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ encrypted: true, authenticationVerified: false, paymentVerified: false });
    expect(await createKeystoreApi().decryptKeystore(io.files.get('restored.json')!, passphrase)).toEqual(keys);
    expect(allOutput(io)).not.toContain(KEY_HEX); expect(allOutput(io)).not.toContain(passphrase);
  });
  it('exports and decodes only the safe settings exchange without applying device settings or trust', async () => {
    const settings = exportSettingsExchange(preferences); const io = makeIo({ settings });
    expect(await run(['qr', 'encode', '--kind', 'settings', '--in', 'settings', '--format', 'multipart', '--chunk-chars', '100', '--out', 'transfer', '--json'], io)).toBe(0);
    io.out.length = 0;
    expect(await run(['qr', 'decode', '--kind', 'settings', '--in', 'transfer', '--out', 'settings.json', '--json'], io)).toBe(0);
    expect(parseSettingsExchange(io.files.get('settings.json')!)).toEqual(preferences);
    expect(stdoutJson(io)).toMatchObject({ settingsApplied: false, trustEstablished: false, paymentVerified: false });
  });
  it.each(['keystore', 'settings'])('never accepts plaintext key fields or endpoint credentials as %s', async kind => {
    const io = makeIo({ bad: JSON.stringify({ spendingKey: KEY_HEX, endpoint: 'https://secret.test/token' }) });
    expect(await run(['qr', 'encode', '--kind', kind, '--in', 'bad', '--format', 'text', '--json'], io)).toBe(1);
    expect(allOutput(io)).not.toContain(KEY_HEX); expect(allOutput(io)).not.toContain('secret.test');
    expect(io.files.size).toBe(1);
  });
  it('rejects unsupported keystore versions, malicious extensions and costly KDF headers before any credential prompt', async () => {
    const envelope = JSON.parse(encrypted) as Record<string, unknown>;
    for (const value of [{ ...envelope, v: 2 }, { ...envelope, filename: '../private' },
      { ...envelope, kdfParams: { N: 2 ** 30, r: 8, p: 1, salt: 'ab'.repeat(16) } }]) {
      const io = makeIo({ bad: JSON.stringify(value) });
      expect(await run(['qr', 'decode', '--kind', 'keystore', '--in', 'bad', '--out', 'output', '--json'], io)).toBe(1);
      expect(io.files.has('output')).toBe(false); expect(io.stdinReads).toBe(0);
    }
  });
  it('requires backup verify for ciphertext authentication and rejects passphrase flags on a transfer', async () => {
    const envelope = JSON.parse(encrypted) as { ciphertext: string };
    envelope.ciphertext = (envelope.ciphertext[0] === '0' ? '1' : '0') + envelope.ciphertext.slice(1);
    const io = makeIo({ tampered: JSON.stringify(envelope) }); io.env['TEST_PASSPHRASE'] = passphrase;
    expect(await run(['qr', 'encode', '--kind', 'keystore', '--in', 'tampered', '--format', 'text', '--out', 'copy', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ authenticationVerified: false });
    expect(await run(['backup', 'verify', '--in', 'copy', '--passphrase-env', 'TEST_PASSPHRASE', '--json'], io)).toBe(1);
    expect(await run(['qr', 'encode', '--kind', 'keystore', '--in', 'tampered', '--passphrase-stdin', '--json'], io)).toBe(2);
    expect(io.stdinReads).toBe(0);
  });
});
