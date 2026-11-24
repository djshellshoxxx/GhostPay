import { afterEach, describe, expect, it, vi } from 'vitest';
import { armSessionVault, sessionHasExternalCopy, sessionHasUnverifiedCopy, verifyDownloadedBackup, captureSessionGuard, clearSession, exportKeystore, forgetSessionVaultCopy, getSessionBackup, markKeystoreDownloaded, revealViewingKey, sessionVaultRecord, subscribeSessionBackup, waiveSessionBackup, withSessionSecrets, withSessionSecretsAsync, generateSession, getSessionPublic, hasSession, importKeystore, importSession, subscribeSession } from './session';

afterEach(() => {
  clearSession();
});

const HEX_A = '11'.repeat(32);
const HEX_B = '22'.repeat(32);

describe('session', () => {
  it('has no session initially and refuses use', () => {
    expect(hasSession()).toBe(false);
    expect(getSessionPublic()).toBeUndefined();
    expect(() => withSessionSecrets(() => undefined)).toThrow(/Load or generate/);
  });

  it('generates independent keys and exposes only public data', () => {
    const pub = generateSession();
    expect(pub.metaAddress).toMatch(/^st:eth:0x[0-9a-f]{132}$/);
    expect(pub.signerPublicKey).toMatch(/^0[23][0-9a-f]{64}$/);
    expect(pub.signerPublicKey).not.toBe(pub.spendingPublicKey);
    expect(pub.signerPublicKey).not.toBe(pub.viewingPublicKey);
    expect(getSessionPublic()).toBe(pub);
    expect(JSON.stringify(pub)).not.toMatch(/secret/i);
    withSessionSecrets((secrets) => {
      expect(() => JSON.stringify(secrets.keys.spendingSecret)).toThrow();
      expect(() => String(secrets.signingKey)).toThrow();
    });
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

  it('clears the stored session and wipes a borrowed copy when its callback ends', () => {
    generateSession();
    let borrowed: Uint8Array | undefined;
    withSessionSecrets((keys) => {
      borrowed = keys.keys.spendingSecret;
      clearSession();
      expect(keys.keys.spendingSecret.some((b) => b !== 0)).toBe(true);
    });
    expect(borrowed?.every((b) => b === 0)).toBe(true);
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
    expect(() => withSessionSecrets(() => undefined)).toThrow(/Load or generate/);
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
    expect(getSessionBackup()).toEqual({ backedUp: false, verified: false, signerOnly: false, waived: false, vaultStepUp: false });
    importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B, signingKeyHex: '33'.repeat(32) });
    expect(getSessionBackup()).toEqual({ backedUp: true, verified: true, signerOnly: false, waived: false, vaultStepUp: false });
    const text = await exportKeystore('a long passphrase', { N: 1 << 14 });
    generateSession();
    expect(getSessionBackup()?.backedUp).toBe(false);
    await importKeystore(text, 'a long passphrase');
    expect(getSessionBackup()).toEqual({ backedUp: true, verified: true, signerOnly: false, waived: false, vaultStepUp: false });
    clearSession();
    expect(getSessionBackup()).toBeUndefined();
  });

  it('C-R6, C-R10: a hex import without its signing key leaves only that generated key unsaved, until a backup', () => {
    importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B });
    expect(getSessionBackup()).toEqual({ backedUp: false, verified: false, signerOnly: true, waived: false, vaultStepUp: false });
    const guard = captureSessionGuard();
    armSessionVault('record-a', guard, { stored: true });   // saved to the vault
    expect(getSessionBackup()).toEqual({ backedUp: true, verified: true, signerOnly: false, waived: false, vaultStepUp: true });
    forgetSessionVaultCopy('record-a');                      // deleted in another tab: the typed hex still holds the rest
    expect(getSessionBackup()).toEqual({ backedUp: false, verified: false, signerOnly: true, waived: false, vaultStepUp: true });
    markKeystoreDownloaded(guard);
    expect(getSessionBackup()).toEqual({ backedUp: true, verified: false, signerOnly: false, waived: false, vaultStepUp: true });
    importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B, signingKeyHex: '33'.repeat(32) });
    expect(getSessionBackup()).toEqual({ backedUp: true, verified: true, signerOnly: false, waived: false, vaultStepUp: false });
    generateSession();
    expect(getSessionBackup()).toEqual({ backedUp: false, verified: false, signerOnly: false, waived: false, vaultStepUp: false });
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
    expect(getSessionBackup()).toEqual({ backedUp: false, verified: false, signerOnly: false, waived: true, vaultStepUp: false });
    const guard = captureSessionGuard();
    markKeystoreDownloaded(guard);
    expect(getSessionBackup()).toEqual({ backedUp: true, verified: false, signerOnly: false, waived: true, vaultStepUp: false });
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
    expect(getSessionBackup()).toEqual({ backedUp: false, verified: false, signerOnly: false, waived: false, vaultStepUp: true });
    armSessionVault('record-b', guard, { stored: true });
    expect(sessionVaultRecord()).toBe('record-a');
    expect(getSessionBackup()?.backedUp).toBe(true);
    armSessionVault('record-b', guard, { replace: true });
    expect(sessionVaultRecord()).toBe('record-b');
    forgetSessionVaultCopy('record-a');
    expect(getSessionBackup()?.backedUp).toBe(true);
    forgetSessionVaultCopy('record-b');
    expect(getSessionBackup()).toEqual({ backedUp: false, verified: false, signerOnly: false, waived: false, vaultStepUp: true });
    clearSession();
    expect(sessionVaultRecord()).toBeUndefined();
    forgetSessionVaultCopy('record-b');
    expect(getSessionBackup()).toBeUndefined();
  });
});

describe('GP-PAGES-02: a downloaded keystore is unverified until "Verify backup" opens it again', () => {
  const PASS = 'a long passphrase';
  afterEach(() => { clearSession(); });

  it('a download alone lifts the gate but is not a proven copy; verifying the exact file makes it one', async () => {
    generateSession();
    const guard = captureSessionGuard();
    const text = await exportKeystore(PASS, { N: 1 << 14 });
    markKeystoreDownloaded(guard);
    expect(getSessionBackup()).toMatchObject({ backedUp: true, verified: false });
    expect(sessionHasExternalCopy()).toBe(false);
    expect(sessionHasUnverifiedCopy()).toBe(true);
    const sessionChanged = vi.fn();
    const off = subscribeSession(sessionChanged);
    await verifyDownloadedBackup(text, PASS);
    off();
    expect(getSessionBackup()).toMatchObject({ backedUp: true, verified: true, signerOnly: false });
    expect(sessionHasExternalCopy()).toBe(true);
    expect(sessionHasUnverifiedCopy()).toBe(false);
    expect(sessionChanged).not.toHaveBeenCalled();
    // Still loaded: verification loads nothing.
    expect(hasSession()).toBe(true);
  });

  it('refuses a wrong passphrase, a damaged file and a keystore of other keys, and changes nothing', async () => {
    generateSession();
    const other = await exportKeystore(PASS, { N: 1 << 14 });
    generateSession();
    const guard = captureSessionGuard();
    const pub = getSessionPublic();
    const text = await exportKeystore(PASS, { N: 1 << 14 });
    markKeystoreDownloaded(guard);
    await expect(verifyDownloadedBackup(text, 'wrong passphrase!!')).rejects.toThrow();
    const damaged = JSON.parse(text) as { ciphertext: string };
    damaged.ciphertext = (damaged.ciphertext[0] === '0' ? '1' : '0') + damaged.ciphertext.slice(1);
    await expect(verifyDownloadedBackup(JSON.stringify(damaged), PASS)).rejects.toThrow();
    await expect(verifyDownloadedBackup(text.slice(0, text.length - 40), PASS)).rejects.toThrow();
    await expect(verifyDownloadedBackup(other, PASS)).rejects.toThrow(/does not hold the loaded seller keys|theBackupFileDoesNotHold/);
    expect(getSessionBackup()).toMatchObject({ backedUp: true, verified: false });
    expect(sessionHasExternalCopy()).toBe(false);
    expect(getSessionPublic()).toBe(pub);
  });

  it('a verification that was closed, or whose keys changed meanwhile, records nothing', async () => {
    generateSession();
    const text = await exportKeystore(PASS, { N: 1 << 14 });
    const aborted = new AbortController();
    aborted.abort();
    await expect(verifyDownloadedBackup(text, PASS, aborted.signal)).rejects.toThrow(/verification was closed|theBackupVerificationWasClosed/);
    expect(getSessionBackup()?.verified).toBe(false);
    const pending = verifyDownloadedBackup(text, PASS);
    generateSession();
    await expect(pending).rejects.toThrow(/changed during this action/);
    expect(getSessionBackup()).toMatchObject({ backedUp: false, verified: false });
  });

  it('a verified copy stays verified through a later download; hex keys without their signing key stay signerOnly after a download', () => {
    importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B, signingKeyHex: '33'.repeat(32) });
    const guard = captureSessionGuard();
    markKeystoreDownloaded(guard);
    expect(getSessionBackup()).toMatchObject({ backedUp: true, verified: true });
    importSession({ spendingKeyHex: HEX_A, viewingKeyHex: HEX_B });
    expect(getSessionBackup()).toMatchObject({ backedUp: false, verified: false, signerOnly: true });
    markKeystoreDownloaded(captureSessionGuard());
    // The gate lifts, but the idle lock may still wipe: the typed hex sweeps payments and only the generated signer is at stake (C-R10).
    expect(getSessionBackup()).toMatchObject({ backedUp: true, verified: false, signerOnly: false });
  });
});
