import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, exportKeystore, revealViewingKey, withSessionSecrets, withSessionSecretsAsync, generateSession, getSessionPublic, hasSession, importKeystore, importSession, requireSession, subscribeSession } from './session';

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
      { metaAddress: 'x', signer: 'y' },
      'a long passphrase',
      { N: 1 << 14 },
    );
    await expect(importKeystore(text, 'a long passphrase')).rejects.toThrow(/must differ/);
    const zero = await encryptKeystore(
      { spendingKey: new Uint8Array(32), viewingKey: new Uint8Array(32).fill(1), signingKey: new Uint8Array(32).fill(3) },
      { metaAddress: 'x', signer: 'y' },
      'a long passphrase',
      { N: 1 << 14 },
    );
    await expect(importKeystore(zero, 'a long passphrase')).rejects.toThrow(/invalid keys/);
  });
});

describe('boxed key storage (S3-08)', () => {
  it('lends temporary scalars that are wiped after the callback, also on error', () => {
    generateSession();
    let kept: Uint8Array | undefined;
    withSessionSecrets((s) => {
      kept = s.keys.spendingSecret;
      expect(kept.some((b) => b !== 0)).toBe(true);
    });
    expect(kept?.every((b) => b === 0)).toBe(true);
    let keptOnError: Uint8Array | undefined;
    expect(() =>
      withSessionSecrets((s) => {
        keptOnError = s.signingKey;
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(keptOnError?.every((b) => b === 0)).toBe(true);
  });

  it('wipes the async temporaries once the promise settles', async () => {
    generateSession();
    let kept: Uint8Array | undefined;
    await withSessionSecretsAsync(async (s) => {
      await Promise.resolve();
      kept = s.keys.viewingSecret;
    });
    expect(kept?.every((b) => b === 0)).toBe(true);
  });

  it('hands out independent copies: wiping one never corrupts the stored key', () => {
    const pub = importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B });
    const copy = revealViewingKey();
    expect(Buffer.from(copy).toString('hex')).toBe(HEX_B);
    copy.fill(0);
    expect(Buffer.from(revealViewingKey()).toString('hex')).toBe(HEX_B);
    withSessionSecrets((s) => s.keys.viewingSecret.fill(0));
    expect(Buffer.from(revealViewingKey()).toString('hex')).toBe(HEX_B);
    expect(getSessionPublic()).toBe(pub);
  });

  it('keeps no readable key bytes on the module surface and refuses use after clear', () => {
    generateSession();
    clearSession();
    expect(() => revealViewingKey()).toThrow(/Load or generate/);
    expect(() => withSessionSecrets(() => 1)).toThrow(/Load or generate/);
    expect(() => requireSession()).toThrow(/Load or generate/);
  });

  it('bounds and wipes compatibility copies from requireSession', () => {
    generateSession();
    const first = requireSession().keys.spendingSecret;
    for (let i = 0; i < 10; i++) requireSession();
    expect(first.every((b) => b === 0)).toBe(true); // evicted copies are wiped
    const last = requireSession().keys.viewingSecret;
    clearSession();
    expect(last.every((b) => b === 0)).toBe(true);
  });

  it('exports a keystore from the boxed keys and re-imports it', async () => {
    const pub = importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B, signingKeyHex: '33'.repeat(32) });
    const text = await exportKeystore('correct horse battery staple');
    clearSession();
    const again = await importKeystore(text, 'correct horse battery staple');
    expect(again.metaAddress).toBe(pub.metaAddress);
    expect(again.signerPublicKey).toBe(pub.signerPublicKey);
  });
});
