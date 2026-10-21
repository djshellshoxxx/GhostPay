import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, exportKeystore, generateSession, getSessionPublic, hasSession, importKeystore, importSession, onSessionCleared, requireSession, subscribeSession } from './session';

afterEach(() => {
  clearSession();
});

const HEX_A = '11'.repeat(32);
const HEX_B = '22'.repeat(32);

describe('session', () => {
  it('has no session initially and refuses use', () => {
    expect(hasSession()).toBe(false);
    expect(getSessionPublic()).toBeUndefined();
    expect(() => requireSession()).toThrow(/Load or generate/);
  });

  it('generates independent keys and exposes only public data', () => {
    const pub = generateSession();
    expect(pub.metaAddress).toMatch(/^st:eth:0x[0-9a-f]{132}$/);
    expect(pub.signerPublicKey).toMatch(/^0[23][0-9a-f]{64}$/);
    expect(pub.signerPublicKey).not.toBe(pub.spendingPublicKey);
    expect(pub.signerPublicKey).not.toBe(pub.viewingPublicKey);
    expect(getSessionPublic()).toBe(pub);
    expect(JSON.stringify(pub)).not.toMatch(/secret/i);
    expect(() => JSON.stringify(requireSession().keys.spendingSecret)).toThrow();
    expect(() => String(requireSession().signingKey)).toThrow();
  });

  it('notifies subscribers on change and wipe', () => {
    const fn = vi.fn();
    const off = subscribeSession(fn);
    generateSession();
    clearSession();
    off();
    generateSession();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('wipes secrets on clear', () => {
    generateSession();
    const keys = requireSession();
    const spending = keys.keys.spendingSecret;
    clearSession();
    expect(spending.every((b) => b === 0)).toBe(true);
    expect(hasSession()).toBe(false);
  });

  it('imports hex keys and accepts a 0x prefix', () => {
    const pub = importSession({ spendingKeyHex: `0x${HEX_A}`, viewingKeyHex: HEX_B, signingKeyHex: '33'.repeat(32) });
    expect(pub.metaAddress).toMatch(/^st:eth:0x/);
    const again = importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B });
    expect(again.metaAddress).toBe(pub.metaAddress);
    expect(again.signerPublicKey).not.toBe(pub.signerPublicKey);
  });

  it('rejects malformed, zero, out-of-range and identical keys', () => {
    expect(() => importSession({ spendingKeyHex: 'zz', viewingKeyHex: HEX_B })).toThrow(/64 hexadecimal/);
    expect(() => importSession({ spendingKeyHex: '00'.repeat(32), viewingKeyHex: HEX_B })).toThrow(/not a valid/);
    expect(() => importSession({ spendingKeyHex: 'ff'.repeat(32), viewingKeyHex: HEX_B })).toThrow(/not a valid/);
    expect(() => importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_A })).toThrow(/must differ/);
    expect(() => importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B, signingKeyHex: 'nope' })).toThrow(/Signing key/);
  });

  it('exports and re-imports an encrypted keystore', async () => {
    const pub = generateSession();
    const text = await exportKeystore('a long passphrase', { N: 1 << 14 });
    clearSession();
    await expect(exportKeystore('a long passphrase')).rejects.toThrow(/Load or generate/);
    const back = await importKeystore(text, 'a long passphrase');
    expect(back).toEqual(pub);
    await expect(importKeystore(text, 'bad passphrase!!')).rejects.toThrow(/Wrong passphrase/);
  });

  it('rejects a keystore holding invalid keys', async () => {
    const { encryptKeystore } = await import('./keystore');
    const text = await encryptKeystore(
      { spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(1), signingKey: new Uint8Array(32).fill(3) },
      { metaAddress: 'st:eth:0xabc', signer: '02' + 'ab'.repeat(32) }, // round 4: import validates meta format
      'a long passphrase',
      { N: 1 << 14 },
    );
    await expect(importKeystore(text, 'a long passphrase')).rejects.toThrow(/must differ/);
    const zero = await encryptKeystore(
      { spendingKey: new Uint8Array(32), viewingKey: new Uint8Array(32).fill(1), signingKey: new Uint8Array(32).fill(3) },
      { metaAddress: 'st:eth:0xabc', signer: '02' + 'ab'.repeat(32) }, // round 4: import validates meta format
      'a long passphrase',
      { N: 1 << 14 },
    );
    await expect(importKeystore(zero, 'a long passphrase')).rejects.toThrow(/invalid keys/);
  });

  it('notifies wipe listeners on clear and when one identity replaces another', () => {
    const seen = vi.fn();
    const off = onSessionCleared(seen);
    generateSession();
    expect(seen).toHaveBeenCalledTimes(1);
    importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B });
    expect(seen).toHaveBeenCalledTimes(2);
    clearSession();
    expect(seen).toHaveBeenCalledTimes(3);
    off();
    clearSession();
    expect(seen).toHaveBeenCalledTimes(3);
  });

  it('still wipes keys when a wipe listener throws', () => {
    generateSession();
    const s = requireSession();
    const off = onSessionCleared(() => { throw new Error('listener bug'); });
    expect(() => { clearSession(); }).toThrow(/listener bug/);
    expect(hasSession()).toBe(false);
    expect(s.keys.spendingSecret.every((b) => b === 0)).toBe(true);
    off();
  });

  it('does not install new keys past a failing wipe listener', () => {
    let calls = 0;
    const off = onSessionCleared(() => {
      calls++;
      if (calls === 1) throw new Error('listener bug');
    });
    expect(() => generateSession()).toThrow(/listener bug/);
    expect(hasSession()).toBe(false);
    expect(getSessionPublic()).toBeUndefined();
    off();
  });
});
