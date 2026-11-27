// @vitest-environment jsdom
import { act, cleanup, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLean } from '../AppLean';
import { makeServices, renderWith, setHash } from '../test/render';
import * as session from './session';
import { authorizeEncryptedVault, authorizeKeyExport, MemoryKeyVaultStore, requireSecretExportAuthorization, saveEncryptedVault, setKeyVaultStoreForTests, unlockEncryptedVault, type KeyVaultStore } from './keyVault';
import { SETTINGS_KEY } from './settings';

const PASS = 'violet comet maple lantern';
const COST = { N: 1 << 14 };
let wall: number;

beforeEach(() => {
  session.clearSession();
  localStorage.clear();
  setHash('');
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
  wall = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => wall);
});

afterEach(() => {
  cleanup();
  session.clearSession();
  setKeyVaultStoreForTests(undefined);
  vi.restoreAllMocks();
});

function mount(): void {
  renderWith(createElement(AppLean), makeServices());
}

async function expire(): Promise<void> {
  wall += 60_000;
  await act(async () => {
    fireEvent.focus(window);
    await Promise.resolve();
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

describe('idle lock revokes session authority before retaining or disposing keys', () => {
  it('allows an empty payer session and invalidates its active version guard at suspension', () => {
    const guard = session.captureActiveSessionVersionGuard();
    expect(guard).not.toThrow();
    session.suspendSession();
    expect(guard).toThrow(/changed during this action/);
    expect(session.isSessionSuspended()).toBe(false);
    expect(session.captureActiveSessionVersionGuard()).not.toThrow();
  });

  it('allows revision tracking and encrypted recovery, but refuses new ordinary authority for retained keys', () => {
    session.generateSession();
    const active = session.captureActiveSessionVersionGuard();
    session.suspendSession();
    expect(active).toThrow(/changed during this action/);
    expect(session.captureSessionVersionGuard()).not.toThrow();
    expect(session.captureSessionBackupGuard()).not.toThrow();
    expect(() => session.captureActiveSessionVersionGuard()).toThrow(/locked after inactivity/);
  });

  it('checks expiry synchronously before granting payer authority for a retained session', () => {
    session.generateSession();
    const off = session.subscribeSessionExpiryCheck(() => { session.suspendSession(); });
    try {
      expect(() => session.captureActiveSessionVersionGuard()).toThrow(/locked after inactivity/);
      expect(session.isSessionSuspended()).toBe(true);
    } finally {
      off();
    }
  });

  it('keeps one holder snapshot when a deadline check replaces the wallet before an async result', async () => {
    const original = session.importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
    let observations = 0;
    const off = session.subscribeSessionExpiryCheck(() => {
      if (++observations === 2) {
        session.suspendSession();
        session.importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
      }
    });
    let usedSpendingPublicKey: string | undefined;
    try {
      await expect(session.withSessionSecretsAsync((secrets) => {
        usedSpendingPublicKey = Array.from(secrets.keys.spendingPublicKey, (byte) => byte.toString(16).padStart(2, '0')).join('');
        return Promise.resolve();
      })).rejects.toThrow(/changed during this action/);
      expect(usedSpendingPublicKey).toBe(original.spendingPublicKey);
    } finally {
      off();
    }
  });

  it('does not let a throwing observer prevent later cancellation observers from receiving suspension', () => {
    session.generateSession();
    const guard = session.captureSessionGuard();
    const later = vi.fn();
    const offFailing = session.subscribeSession(() => { throw new Error('test observer failure'); });
    const offLater = session.subscribeSession(later);
    try {
      expect(() => session.suspendSession()).not.toThrow();
      expect(later).toHaveBeenCalledOnce();
      expect(guard).toThrow(/changed during this action/);
      expect(() => session.revealViewingKey()).toThrow(/locked after inactivity/);
    } finally {
      offFailing();
      offLater();
    }
  });

  it('finishes a recoverable lock and notifies remaining observers when another observer throws during the final clear', () => {
    session.importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
    expect(session.sessionHasExternalCopy()).toBe(true);
    const later = vi.fn();
    const offFailing = session.subscribeSession(() => { throw new Error('test observer failure'); });
    const offLater = session.subscribeSession(later);
    try {
      session.suspendSession();
      expect(() => session.clearSession()).not.toThrow();
      expect(later).toHaveBeenCalledTimes(2);
      expect(session.hasSession()).toBe(false);
      expect(session.isSessionSuspended()).toBe(false);
    } finally {
      offFailing();
      offLater();
    }
  });

  it('rejects a pending operation at its next guard check after sleep even without a browser event', () => {
    session.generateSession();
    mount();
    const oldGuard = session.captureSessionGuard();
    wall += 60_000;
    act(() => { expect(oldGuard).toThrow(/changed during this action/); });
    expect(session.hasSession()).toBe(true);
    expect(() => session.revealViewingKey()).toThrow(/locked after inactivity/);
  });

  it('retains a sole copy but invalidates old guards and refuses new private-key operations immediately', async () => {
    const publicKeys = session.generateSession();
    const backup = session.getSessionBackup();
    const oldGuard = session.captureSessionGuard();
    const oldVersion = session.captureSessionVersionGuard();
    mount();
    await expire();

    expect(oldGuard).toThrow(/changed during this action/);
    expect(oldVersion).toThrow(/changed during this action/);
    expect(() => session.withSessionSecrets(() => undefined)).toThrow(/locked after inactivity/);
    await expect(session.withSessionSecretsAsync(() => Promise.resolve(undefined))).rejects.toThrow(/locked after inactivity/);
    expect(() => session.revealViewingKey()).toThrow(/locked after inactivity/);
    expect(() => session.captureSessionGuard()).toThrow(/locked after inactivity/);
    expect(session.hasSession()).toBe(true);
    expect(session.getSessionPublic()).toBe(publicKeys);
    expect(session.getSessionBackup()).toBe(backup);
    expect(session.isSessionSuspended()).toBe(true);
  });

  it('revokes operations while a vault recoverability read is still pending', async () => {
    const stored = deferred<string | undefined>();
    const record = 'opaque encrypted vault test record';
    const store: KeyVaultStore = {
      get: () => stored.promise,
      putIfEmpty: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    };
    setKeyVaultStoreForTests(store);
    session.generateSession();
    session.armSessionVault(record, session.captureSessionGuard(), { stored: true });
    const oldGuard = session.captureSessionGuard();
    mount();
    try {
      await expire();
      expect(oldGuard).toThrow(/changed during this action/);
      expect(() => session.withSessionSecrets(() => undefined)).toThrow(/locked after inactivity/);
      expect(session.hasSession()).toBe(true);
    } finally {
      await act(async () => { stored.resolve(record); await stored.promise; });
    }
    expect(session.hasSession()).toBe(false);
  });

  it('retains and protects a vault-only copy when storage fails, without calling it an unverified download', async () => {
    const store: KeyVaultStore = {
      get: () => Promise.reject(new Error('test storage unavailable')),
      putIfEmpty: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    };
    setKeyVaultStoreForTests(store);
    session.generateSession();
    session.armSessionVault('opaque encrypted vault test record', session.captureSessionGuard(), { stored: true });
    mount();
    await expire();
    expect(session.hasSession()).toBe(true);
    expect(session.isSessionSuspended()).toBe(true);
    expect(session.getSessionBackup()?.verified).toBe(true);
    expect(document.querySelector('[role="status"][aria-live]')?.textContent).toMatch(/recoverable copy could not be confirmed/i);
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
  });

  it('wipes active asynchronous borrows on idle and rejects their late result', async () => {
    session.generateSession();
    mount();
    const finish = deferred<void>();
    let borrowed: session.SessionSecrets | undefined;
    const pending = session.withSessionSecretsAsync(async (secrets) => {
      borrowed = secrets;
      await finish.promise;
      return 'stale result';
    });
    const outcome = pending.then((value) => ({ value }), (error: unknown) => ({ error }));
    try {
      await expire();
      expect(borrowed?.keys.spendingSecret.every((byte) => byte === 0)).toBe(true);
      expect(borrowed?.keys.viewingSecret.every((byte) => byte === 0)).toBe(true);
      expect(borrowed?.signingKey.every((byte) => byte === 0)).toBe(true);
    } finally {
      finish.resolve();
    }
    expect(await outcome).toHaveProperty('error.message', expect.stringMatching(/changed during this action/));
    expect(session.hasSession()).toBe(true);
  });

  it('also wipes asynchronous borrows immediately when keys are explicitly cleared', async () => {
    session.generateSession();
    const finish = deferred<void>();
    let borrowed: session.SessionSecrets | undefined;
    const pending = session.withSessionSecretsAsync(async (secrets) => {
      borrowed = secrets;
      await finish.promise;
      return 'stale result';
    });
    const outcome = pending.then((value) => ({ value }), (error: unknown) => ({ error }));
    try {
      session.clearSession();
      expect(borrowed?.keys.spendingSecret.every((byte) => byte === 0)).toBe(true);
      expect(borrowed?.keys.viewingSecret.every((byte) => byte === 0)).toBe(true);
      expect(borrowed?.signingKey.every((byte) => byte === 0)).toBe(true);
    } finally {
      finish.resolve();
    }
    expect(await outcome).toHaveProperty('error.message', expect.stringMatching(/changed during this action/));
  });

  it('does not let a decryption started in an empty session install keys after idle', async () => {
    session.generateSession();
    const text = await session.exportKeystore(PASS, COST);
    session.clearSession();
    mount();
    const pending = session.importKeystore(text, PASS);
    const outcome = pending.then((value) => ({ value }), (error: unknown) => ({ error }));
    await expire();
    expect(await outcome).toHaveProperty('error.message', expect.stringMatching(/changed while the keystore was unlocking/));
    expect(session.hasSession()).toBe(false);
  });

  it('rejects an encrypted backup started before idle instead of returning its stale result', async () => {
    session.generateSession();
    mount();
    const pending = session.exportKeystore(PASS, COST);
    const outcome = pending.then((value) => ({ value }), (error: unknown) => ({ error }));
    await expire();
    expect(await outcome).toHaveProperty('error.message', expect.stringMatching(/changed during this action/));
    expect(session.hasSession()).toBe(true);
  });

  it('keeps encrypted backup and verification available without resuming ordinary access', async () => {
    const publicKeys = session.generateSession();
    mount();
    await expire();
    expect(() => session.withSessionSecrets(() => undefined)).toThrow(/locked after inactivity/);
    await expect(authorizeKeyExport('')).resolves.toBeUndefined();
    const guard = session.captureSessionBackupGuard();
    const text = await session.exportKeystore(PASS, COST);
    session.markKeystoreDownloaded(guard);
    await session.verifyDownloadedBackup(text, PASS);
    expect(session.getSessionBackup()).toMatchObject({ verified: true });
    expect(session.isSessionSuspended()).toBe(true);
    expect(() => session.revealViewingKey()).toThrow(/locked after inactivity/);
    expect(text).not.toContain(PASS);
    const restored = await session.importKeystore(text, PASS);
    expect(restored).toEqual(publicKeys);
    expect(session.isSessionSuspended()).toBe(false);
    expect(() => session.withSessionSecrets(() => undefined)).not.toThrow();
    expect(guard).toThrow(/changed during this action/);
  });

  it('permits a retained copy to be saved in the encrypted vault and resumed only by normal unlock', async () => {
    const store = new MemoryKeyVaultStore();
    setKeyVaultStoreForTests(store);
    const publicKeys = session.generateSession();
    mount();
    await expire();
    expect(() => session.captureSessionGuard()).toThrow(/locked after inactivity/);
    await saveEncryptedVault(PASS, COST, store);
    expect(session.getSessionBackup()).toMatchObject({ verified: true, vaultStepUp: true });
    expect(session.isSessionSuspended()).toBe(true);
    await expect(authorizeEncryptedVault(PASS, store)).rejects.toThrow(/locked after inactivity/);
    await expect(unlockEncryptedVault(PASS, store)).resolves.toEqual(publicKeys);
    expect(session.isSessionSuspended()).toBe(false);
    expect(() => session.captureSessionGuard()).not.toThrow();
  });

  it('does not grant spending or raw-key access to a retained copy even with a valid vault credential', async () => {
    session.generateSession();
    const text = await session.exportKeystore(PASS, COST);
    const store = new MemoryKeyVaultStore();
    await store.putIfEmpty(text, session.captureSessionGuard());
    const verifiedBeforeExpiry = await session.verifyVaultForCurrentSession(text, PASS);
    mount();
    await expire();
    expect(session.isSessionSuspended()).toBe(true);
    expect(verifiedBeforeExpiry).toThrow(/changed during this action/);
    await expect(authorizeEncryptedVault(PASS, store)).rejects.toThrow(/locked after inactivity/);
    await expect(session.verifyVaultForCurrentSession(text, PASS)).rejects.toThrow(/locked after inactivity/);
    const rawAccess = vi.fn<(secrets: session.SessionSecrets) => void>();
    expect(() => session.withSessionSecrets(rawAccess)).toThrow(/locked after inactivity/);
    expect(rawAccess).not.toHaveBeenCalled();
    expect(() => session.revealViewingKey()).toThrow(/locked after inactivity/);
    expect(session.isSessionSuspended()).toBe(true);
  });

  it('does not grant raw or payment-key export authority to a retained copy even with a valid credential', async () => {
    session.generateSession();
    const text = await session.exportKeystore(PASS, COST);
    mount();
    await expire();
    await expect(requireSecretExportAuthorization({ kind: 'keystore', text, passphrase: PASS })).rejects.toThrow(/locked after inactivity/);
    await expect(session.verifyCredentialForCurrentSession(text, PASS, 'keystore')).rejects.toThrow(/locked after inactivity/);
  });

  it('does not grant spending or raw-key access to a retained copy even with a valid vault credential', async () => {
    session.generateSession();
    const text = await session.exportKeystore(PASS, COST);
    const store = new MemoryKeyVaultStore();
    await store.putIfEmpty(text, session.captureSessionGuard());
    const verifiedBeforeExpiry = await session.verifyVaultForCurrentSession(text, PASS);
    mount();
    await expire();
    expect(session.isSessionSuspended()).toBe(true);
    expect(verifiedBeforeExpiry).toThrow(/changed during this action/);
    await expect(authorizeEncryptedVault(PASS, store)).rejects.toThrow(/locked after inactivity/);
    await expect(session.verifyVaultForCurrentSession(text, PASS)).rejects.toThrow(/locked after inactivity/);
    const rawAccess = vi.fn((): undefined => undefined);
    expect(() => session.withSessionSecrets(rawAccess)).toThrow(/locked after inactivity/);
    expect(rawAccess).not.toHaveBeenCalled();
    expect(() => session.revealViewingKey()).toThrow(/locked after inactivity/);
    expect(session.isSessionSuspended()).toBe(true);
  });

  it('invalidates a pending encrypted-vault save before it can persist after idle', async () => {
    session.generateSession();
    mount();
    const read = deferred<string | undefined>();
    const put = vi.fn(() => Promise.resolve());
    const store: KeyVaultStore = { get: () => read.promise, putIfEmpty: put, delete: () => Promise.resolve() };
    const pending = saveEncryptedVault(PASS, COST, store);
    const outcome = pending.then(() => ({ saved: true }), (error: unknown) => ({ error }));
    await expire();
    read.resolve(undefined);
    expect(await outcome).toHaveProperty('error.message', expect.stringMatching(/changed during this action/));
    expect(put).not.toHaveBeenCalled();
    expect(session.getSessionBackup()?.backedUp).toBe(false);
  });

  it('invalidates a pending vault unlock even when no seller keys were loaded at expiry', async () => {
    session.generateSession();
    const text = await session.exportKeystore(PASS, COST);
    session.clearSession();
    mount();
    const read = deferred<string | undefined>();
    const store: KeyVaultStore = { get: () => read.promise, putIfEmpty: () => Promise.resolve(), delete: () => Promise.resolve() };
    const pending = unlockEncryptedVault(PASS, store);
    const outcome = pending.then((value) => ({ value }), (error: unknown) => ({ error }));
    await expire();
    read.resolve(text);
    expect(await outcome).toHaveProperty('error.message', expect.stringMatching(/changed during this action/));
    expect(session.hasSession()).toBe(false);
  });
});
