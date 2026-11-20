// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as keyVault from '../lib/keyVault';
import * as session from '../lib/session';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
import { makeServices, renderApp } from '../test/render';
import { notifyAppLock } from '../lib/appLock';

const PASS = 'a long passphrase';

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  session.clearSession();
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
  setKeyVaultStoreForTests(undefined);
  session.clearSession();
});

async function open(): Promise<ReturnType<typeof userEvent.setup>> {
  session.generateSession();
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  return user;
}

function prepareExport(): void {
  fireEvent.change(screen.getByLabelText('Passphrase (at least 14 characters)'), { target: { value: PASS } });
  fireEvent.change(screen.getByLabelText('Repeat passphrase'), { target: { value: PASS } });
}

async function prepareVerification(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  // The held seam intentionally checks controller ownership, not keystore cryptography.
  await user.upload(
    screen.getByLabelText('Downloaded keystore file'),
    new File(['synthetic encrypted fixture'], 'keystore.json', { type: 'application/json' }),
  );
  fireEvent.change(screen.getByLabelText('Keystore passphrase'), { target: { value: PASS } });
}

describe('SellerKeys operation supersession', () => {
  it('releases a superseded unlock without letting its late rejection clear verification', async () => {
    const unlockGate = deferred();
    const verifyGate = deferred();
    vi.spyOn(keyVault, 'readEncryptedVault').mockResolvedValue('synthetic saved vault');
    vi.spyOn(keyVault, 'loadedKeysRecoverable').mockResolvedValue(true);
    const unlock = vi.spyOn(keyVault, 'unlockEncryptedVault').mockImplementation(async () => {
      await unlockGate.promise;
      return session.getSessionPublic()!;
    });
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => verifyGate.promise);
    const user = await open();
    try {
      fireEvent.change(await screen.findByLabelText('Vault passphrase'), { target: { value: PASS } });
      await user.click(screen.getByRole('button', { name: 'Unlock saved vault' }));
      await waitFor(() => { expect(unlock).toHaveBeenCalledOnce(); });
      expect(screen.getByRole('button', { name: 'Cancel vault unlock' })).toBeTruthy();

      await prepareVerification(user);
      await user.click(screen.getByRole('button', { name: 'Verify backup' }));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      expect(unlock.mock.calls[0]?.[2]?.aborted).toBe(true);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Unlock saved vault' }).disabled).toBe(false);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Delete encrypted vault' }).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: 'Cancel vault unlock' })).toBeNull();

      await act(async () => { unlockGate.reject(new Error('superseded unlock')); await Promise.resolve(); });
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Verify backup' }).disabled).toBe(true);
      expect(screen.getByRole('button', { name: 'Cancel verification' })).toBeTruthy();
      await act(async () => { verifyGate.resolve(); await Promise.resolve(); });
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
      expect(session.getSessionPublic()).toBeDefined();
    } finally {
      unlockGate.resolve(); verifyGate.resolve();
      await act(async () => { await Promise.resolve(); });
    }
  });

  it('keeps an independent vault save busy across a seller-session change', async () => {
    const saveGate = deferred();
    const save = vi.spyOn(keyVault, 'saveEncryptedVault').mockImplementation(() => saveGate.promise);
    const user = await open();
    try {
      fireEvent.change(await screen.findByLabelText('New vault passphrase (14+ characters)'), { target: { value: PASS } });
      fireEvent.change(screen.getByLabelText('Repeat vault passphrase'), { target: { value: PASS } });
      await user.click(screen.getByRole('button', { name: 'Save encrypted vault in this browser' }));
      await waitFor(() => { expect(save).toHaveBeenCalledOnce(); });

      act(() => { session.generateSession(); });
      const saveButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Save encrypted vault in this browser' });
      expect(saveButton.disabled).toBe(true);
      await user.click(saveButton);
      expect(save).toHaveBeenCalledOnce();

      await act(async () => { saveGate.reject(new Error('controlled save refusal')); await Promise.resolve(); });
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save encrypted vault in this browser' }).disabled).toBe(false);
    } finally {
      saveGate.resolve();
      await act(async () => { await Promise.resolve(); });
    }
  });

  it('keeps a pending vault deletion busy through unlock edits, session changes and app lock', async () => {
    const deleteGate = deferred();
    vi.spyOn(keyVault, 'readEncryptedVault').mockResolvedValue('synthetic saved vault');
    const remove = vi.spyOn(keyVault, 'deleteEncryptedVault').mockImplementation(() => deleteGate.promise);
    const user = await open();
    try {
      await user.click(await screen.findByRole('button', { name: 'Delete encrypted vault' }));
      await user.click(await screen.findByRole('button', { name: 'Confirm delete encrypted vault' }));
      await waitFor(() => { expect(remove).toHaveBeenCalledOnce(); });

      fireEvent.change(screen.getByLabelText('Vault passphrase'), { target: { value: PASS } });
      const confirmDelete = screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm delete encrypted vault' });
      expect(confirmDelete.disabled).toBe(true);
      await user.click(confirmDelete);
      expect(remove).toHaveBeenCalledOnce();
      expect(screen.queryByRole('button', { name: 'Cancel vault unlock' })).toBeNull();

      act(() => { session.generateSession(); });
      act(() => { notifyAppLock('idle'); });
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Delete encrypted vault' }).disabled).toBe(true);
      expect(remove).toHaveBeenCalledOnce();

      await act(async () => { deleteGate.reject(new Error('controlled deletion refusal')); await Promise.resolve(); });
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Delete encrypted vault' }).disabled).toBe(false);
    } finally {
      deleteGate.resolve();
      await act(async () => { await Promise.resolve(); });
    }
  });

  it('reenables export when pending encryption is superseded by backup verification', async () => {
    const exportGate = deferred();
    const verifyGate = deferred();
    const authorize = vi.spyOn(keyVault, 'authorizeKeyExport').mockImplementation(async () => { await exportGate.promise; return undefined; });
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => verifyGate.promise);
    const user = await open();
    try {
      prepareExport();
      await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
      await waitFor(() => { expect(authorize).toHaveBeenCalledOnce(); });
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download encrypted keystore' }).disabled).toBe(true);

      await prepareVerification(user);
      await user.click(screen.getByRole('button', { name: 'Verify backup' }));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });

      // The obsolete export cannot own the busy flag after verification takes the controller.
      await waitFor(() => {
        expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download encrypted keystore' }).disabled).toBe(false);
      });
      await act(async () => { exportGate.reject(new Error('superseded export')); verifyGate.resolve(); await Promise.resolve(); });
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download encrypted keystore' }).disabled).toBe(false);
      expect(session.getSessionPublic()).toBeDefined();
    } finally {
      exportGate.resolve();
      verifyGate.resolve();
      await act(async () => { await Promise.resolve(); });
    }
  });

  it('clears obsolete verification busy state when an export is attempted and rejects', async () => {
    const verifyGate = deferred();
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => verifyGate.promise);
    const authorize = vi.spyOn(keyVault, 'authorizeKeyExport')
      .mockRejectedValue(new Error('controlled export refusal'));
    const user = await open();
    try {
      await prepareVerification(user);
      await user.click(screen.getByRole('button', { name: 'Verify backup' }));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      expect(screen.getByRole('button', { name: 'Cancel verification' })).toBeTruthy();

      prepareExport();
      await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
      await waitFor(() => { expect(authorize).toHaveBeenCalledOnce(); });
      await waitFor(() => {
        expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download encrypted keystore' }).disabled).toBe(false);
      });

      // The old verify continuation must not leave a cancellation control or suppress a retry.
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Verify backup' }).disabled).toBe(false);
      await act(async () => { verifyGate.reject(new Error('superseded verification')); await Promise.resolve(); });
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Verify backup' }).disabled).toBe(false);
      expect(session.getSessionPublic()).toBeDefined();
    } finally {
      verifyGate.resolve();
      await act(async () => { await Promise.resolve(); });
    }
  });
});
