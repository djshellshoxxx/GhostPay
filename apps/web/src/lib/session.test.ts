import { afterEach, describe, expect, it, vi } from 'vitest';
import { armSessionVault, captureSessionGuard, clearSession, exportKeystore, forgetSessionVaultCopy, getSessionBackup, markKeystoreDownloaded, notifyIdleLock, revealViewingKey, sessionVaultRecord, subscribeIdleLock, subscribeSessionBackup, waiveSessionBackup, withSessionSecrets, withSessionSecretsAsync, generateSession, getSessionPublic, hasSession, importKeystore, importSession, requireSession, subscribeSession } from './session';

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
    await expect(importKeystore(text, 'a long passphrase')).rejects.toThrow(/not a valid/);
    const zero = await encryptKeystore(
      { spendingKey: new Uint8Array(32), viewingKey: new Uint8Array(32).fill(1), signingKey: new Uint8Array(32).fill(3) },
      { metaAddress: 'x', signer: 'y' },
      'a long passphrase',
      { N: 1 << 14 },
    );
    await expect(importKeystore(zero, 'a long passphrase')).rejects.toThrow(/not a valid/);
  });

  it('does not let a pending unlock replace a session changed while decrypting', async () => {
    const original = generateSession();
    const text = await exportKeystore('a long passphrase', { N: 1 << 15 });
    const pending = importKeystore(text, 'a long passphrase');
    clearSession();
    const replacement = generateSession();
    await expect(pending).rejects.toThrow(/changed while the keystore was unlocking/);
    expect(getSessionPublic()).toBe(replacement);
    expect(getSessionPublic()).not.toBe(original);
  });

  it('G2-05: tells idle-lock subscribers until they unsubscribe, and leaves the keys alone', () => {
    const pub = generateSession();
    const changed = vi.fn();
    const offSession = subscribeSession(changed);
    const locked = vi.fn();
    const off = subscribeIdleLock(locked);
    notifyIdleLock();
    off();
    notifyIdleLock();
    offSession();
    expect(locked).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(getSessionPublic()).toBe(pub);
  });

  it('invalidates a guard across an empty-to-loaded transition', () => {
    generateSession();
    const check = captureSessionGuard();
    clearSession();
    generateSession();
    expect(check).toThrow(/changed during this action/);
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
    const text = await exportKeystore('correct horse battery staple', { N: 1 << 14 });
    clearSession();
    const again = await importKeystore(text, 'correct horse battery staple');
    expect(again.metaAddress).toBe(pub.metaAddress);
    expect(again.signerPublicKey).toBe(pub.signerPublicKey);
  });
});


describe('keystore lifecycle guard', () => {
  it('refuses to install decrypted keys after the caller closes the import', async () => {
    generateSession();
    const text = await exportKeystore('a long passphrase', { N: 1 << 14 });
    clearSession();
    const controller = new AbortController();
    const pending = importKeystore(text, 'a long passphrase', controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/import was closed/);
    expect(getSessionPublic()).toBeUndefined();
  });
});


it('rejects reuse of an invoice-signing scalar as a spending or viewing key', () => {
  for (const signingKeyHex of [HEX_A, HEX_B]) {
    expect(() => importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B, signingKeyHex })).toThrow(/independent/);
  }
});

describe('L1-01: backup state of the loaded keys', () => {
  it('starts unsaved for generated keys and saved for imported ones, and resets with every key change', async () => {
    expect(getSessionBackup()).toBeUndefined();
    generateSession();
    expect(getSessionBackup()).toEqual({ backedUp: false, waived: false, vaultStepUp: false });
    importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B, signingKeyHex: '33'.repeat(32) });
    expect(getSessionBackup()).toEqual({ backedUp: true, waived: false, vaultStepUp: false });
    const text = await exportKeystore('a long passphrase', { N: 1 << 14 });
    generateSession();
    expect(getSessionBackup()?.backedUp).toBe(false);
    await importKeystore(text, 'a long passphrase');
    expect(getSessionBackup()).toEqual({ backedUp: true, waived: false, vaultStepUp: false });
    clearSession();
    expect(getSessionBackup()).toBeUndefined();
  });

  it('C-R6: counts a signing key generated at hex import as unsaved until a keystore download', () => {
    importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B });
    expect(getSessionBackup()).toEqual({ backedUp: false, waived: false, vaultStepUp: false });
    markKeystoreDownloaded(captureSessionGuard());
    expect(getSessionBackup()?.backedUp).toBe(true);
    importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B, signingKeyHex: '33'.repeat(32) });
    expect(getSessionBackup()?.backedUp).toBe(true);
  });

  it('records a downloaded keystore and the typed waiver without signalling a key change', () => {
    generateSession();
    const sessionChanged = vi.fn();
    const backupChanged = vi.fn();
    const offSession = subscribeSession(sessionChanged);
    const offBackup = subscribeSessionBackup(backupChanged);
    const before = getSessionBackup();
    expect(getSessionBackup()).toBe(before);
    waiveSessionBackup();
    expect(getSessionBackup()).toEqual({ backedUp: false, waived: true, vaultStepUp: false });
    const guard = captureSessionGuard();
    markKeystoreDownloaded(guard);
    expect(getSessionBackup()).toEqual({ backedUp: true, waived: true, vaultStepUp: false });
    const stable = getSessionBackup();
    markKeystoreDownloaded(guard);
    expect(getSessionBackup()).toBe(stable);
    expect(sessionChanged).not.toHaveBeenCalled();
    expect(backupChanged).toHaveBeenCalledTimes(2);
    generateSession();
    expect(() => { markKeystoreDownloaded(guard); }).toThrow(/changed during this action/);
    expect(getSessionBackup()?.backedUp).toBe(false);
    expect(sessionChanged).toHaveBeenCalledTimes(1);
    offSession();
    offBackup();
  });

  it('keeps the first vault record armed, replaces it only on request, and forgets only that record\'s copy', () => {
    generateSession();
    const guard = captureSessionGuard();
    armSessionVault('record-a', guard);
    expect(getSessionBackup()).toEqual({ backedUp: false, waived: false, vaultStepUp: true });
    armSessionVault('record-b', guard, { stored: true });
    expect(sessionVaultRecord()).toBe('record-a');
    expect(getSessionBackup()?.backedUp).toBe(true);
    armSessionVault('record-b', guard, { replace: true });
    expect(sessionVaultRecord()).toBe('record-b');
    forgetSessionVaultCopy('record-a');
    expect(getSessionBackup()?.backedUp).toBe(true);
    forgetSessionVaultCopy('record-b');
    expect(getSessionBackup()).toEqual({ backedUp: false, waived: false, vaultStepUp: true });
    clearSession();
    expect(sessionVaultRecord()).toBeUndefined();
    forgetSessionVaultCopy('record-b');
    expect(getSessionBackup()).toBeUndefined();
  });
});
