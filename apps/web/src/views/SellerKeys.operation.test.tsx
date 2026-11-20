// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as keyVault from '../lib/keyVault';
import * as session from '../lib/session';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
import { makeServices, renderApp } from '../test/render';

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
  it('reenables export when pending encryption is superseded by backup verification', async () => {
    const exportGate = deferred();
    const verifyGate = deferred();
    const authorize = vi.spyOn(keyVault, 'authorizeKeyExport').mockImplementation(() => exportGate.promise);
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
