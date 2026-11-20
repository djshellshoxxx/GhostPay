// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as common from '../components/Common';
import { notifyAppLock } from '../lib/appLock';
import * as keyVault from '../lib/keyVault';
import * as session from '../lib/session';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
import { makeServices, renderApp } from '../test/render';

const PASS = 'a long passphrase';
const SYNTHETIC = 'synthetic encrypted fixture';
const EXPORT = 'Download encrypted keystore';
const VERIFY = 'Verify backup';
const UNLOCK = 'Unlock saved vault';
const SAVE = 'Save encrypted vault in this browser';
const DELETE = 'Delete encrypted vault';
const CONFIRM_DELETE = 'Confirm delete encrypted vault';
type Settlement = 'resolve' | 'reject';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle<T>(gate: Deferred<T>, outcome: Settlement, value: T): Promise<void> {
  await act(async () => {
    if (outcome === 'resolve') gate.resolve(value);
    else gate.reject(new Error('obsolete operation failed'));
    await gate.promise.catch(() => undefined);
  });
}

let vaultStore: MemoryKeyVaultStore;

beforeEach(() => {
  session.clearSession();
  vaultStore = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(vaultStore);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.spyOn(keyVault, 'authorizeKeyExport').mockResolvedValue(undefined);
  vi.spyOn(common, 'downloadText').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  setKeyVaultStoreForTests(undefined);
  session.clearSession();
});

async function open(): Promise<{ user: ReturnType<typeof userEvent.setup>; view: ReturnType<typeof renderApp> }> {
  session.generateSession();
  const user = userEvent.setup();
  const view = renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  return { user, view };
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name });
}

function notices(): (string | null)[] {
  const keys = screen.getByRole('heading', { name: 'Seller keys', level: 2 }).closest('section')!;
  return within(keys).queryAllByRole('note').map((note) => note.textContent);
}

function prepareExport(): void {
  fireEvent.change(screen.getByLabelText('Passphrase (at least 14 characters)'), { target: { value: PASS } });
  fireEvent.change(screen.getByLabelText('Repeat passphrase'), { target: { value: PASS } });
}

async function prepareVerification(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  // Deferred helper seams test the real component's ownership, not keystore cryptography.
  await user.upload(screen.getByLabelText('Downloaded keystore file'), new File([SYNTHETIC], 'keystore.json', { type: 'application/json' }));
  fireEvent.change(screen.getByLabelText('Keystore passphrase'), { target: { value: PASS } });
}

async function savedVault(): Promise<void> {
  await vaultStore.putIfEmpty(SYNTHETIC);
  vi.spyOn(keyVault, 'loadedKeysRecoverable').mockResolvedValue(true);
}

async function prepareUnlock(): Promise<void> {
  fireEvent.change(await screen.findByLabelText('Vault passphrase'), { target: { value: PASS } });
}

describe('SellerKeys operation supersession', () => {
  it('does not start encryption after a superseded export authorization resolves', async () => {
    const authorizationGate = deferred();
    const verifyGate = deferred();
    vi.mocked(keyVault.authorizeKeyExport).mockImplementation(async () => { await authorizationGate.promise; return undefined; });
    const encrypt = vi.spyOn(session, 'exportKeystore').mockResolvedValue(SYNTHETIC);
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => verifyGate.promise);
    const { user } = await open();
    try {
      prepareExport();
      await user.click(button(EXPORT));
      await waitFor(() => { expect(keyVault.authorizeKeyExport).toHaveBeenCalledOnce(); });
      await prepareVerification(user);
      await user.click(button(VERIFY));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });

      await settle(authorizationGate, 'resolve', undefined);
      expect(encrypt).not.toHaveBeenCalled();
      expect(common.downloadText).not.toHaveBeenCalled();
      expect(button(EXPORT).disabled).toBe(false);
      expect(button(VERIFY).disabled).toBe(true);
      expect(button('Cancel verification')).toBeTruthy();
      await user.click(button('Cancel verification'));
    } finally {
      await act(async () => { authorizationGate.resolve(); verifyGate.resolve(); await Promise.resolve(); });
    }
  });

  it.each<Settlement>(['resolve', 'reject'])('export -> verification: a late export %s cannot release verification or download a file', async (outcome) => {
    const exportGate = deferred<string>();
    const verifyGate = deferred();
    const encrypt = vi.spyOn(session, 'exportKeystore').mockImplementation(() => exportGate.promise);
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => verifyGate.promise);
    const { user } = await open();
    const identity = session.getSessionPublic();
    try {
      prepareExport();
      await user.click(button(EXPORT));
      await waitFor(() => { expect(encrypt).toHaveBeenCalledOnce(); });
      expect(button(EXPORT).disabled).toBe(true);

      await prepareVerification(user);
      await user.click(button(VERIFY));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      expect(button(EXPORT).disabled).toBe(false);
      const currentNotices = notices();

      await settle(exportGate, outcome, SYNTHETIC);
      expect(button(VERIFY).disabled).toBe(true);
      expect(button('Cancel verification')).toBeTruthy();
      expect(button(EXPORT).disabled).toBe(false);
      expect(screen.getByLabelText<HTMLInputElement>('Keystore passphrase').value).toBe(PASS);
      expect(common.downloadText).not.toHaveBeenCalled();
      expect(notices()).toEqual(currentNotices);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(session.getSessionPublic()).toBe(identity);

      await settle(verifyGate, 'resolve', undefined);
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
      expect(button(EXPORT).disabled).toBe(false);
    } finally {
      await act(async () => { exportGate.resolve(SYNTHETIC); verifyGate.resolve(); await Promise.resolve(); });
    }
  });

  it.each<Settlement>(['resolve', 'reject'])('verification -> export: a late verification %s cannot release the pending export', async (outcome) => {
    const verifyGate = deferred();
    const exportGate = deferred<string>();
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => verifyGate.promise);
    const encrypt = vi.spyOn(session, 'exportKeystore').mockImplementation(() => exportGate.promise);
    const { user } = await open();
    try {
      await prepareVerification(user);
      await user.click(button(VERIFY));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      prepareExport();
      await user.click(button(EXPORT));
      await waitFor(() => { expect(encrypt).toHaveBeenCalledOnce(); });
      expect(verify.mock.calls[0]?.[2]?.aborted).toBe(true);
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
      expect(button(VERIFY).disabled).toBe(false);
      const currentNotices = notices();

      await settle(verifyGate, outcome, undefined);
      expect(button(EXPORT).disabled).toBe(true);
      expect(button(VERIFY).disabled).toBe(false);
      expect(screen.getByLabelText<HTMLInputElement>('Repeat passphrase').value).toBe(PASS);
      expect(notices()).toEqual(currentNotices);
      expect(screen.queryByRole('alert')).toBeNull();

      await settle(exportGate, 'reject', SYNTHETIC);
      expect(button(EXPORT).disabled).toBe(false);
      expect(button(VERIFY).disabled).toBe(false);
      expect(common.downloadText).not.toHaveBeenCalled();
    } finally {
      await act(async () => { verifyGate.resolve(); exportGate.resolve(SYNTHETIC); await Promise.resolve(); });
    }
  });

  it.each([
    ['verify', 'resolve'], ['verify', 'reject'], ['export', 'resolve'], ['export', 'reject'],
  ] as const)('unlock -> %s: a late unlock %s cannot retain vault controls or change the new owner', async (next, outcome) => {
    await savedVault();
    const unlockGate = deferred<session.SessionPublic>();
    const nextGate = deferred();
    const unlock = vi.spyOn(keyVault, 'unlockEncryptedVault').mockImplementation(() => unlockGate.promise);
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => nextGate.promise);
    const encrypt = vi.spyOn(session, 'exportKeystore').mockImplementation(async () => { await nextGate.promise; return SYNTHETIC; });
    const { user } = await open();
    const identity = session.getSessionPublic()!;
    try {
      await prepareUnlock();
      await user.click(button(UNLOCK));
      await waitFor(() => { expect(unlock).toHaveBeenCalledOnce(); });
      expect(button(UNLOCK).disabled).toBe(true);
      if (next === 'verify') {
        await prepareVerification(user);
        await user.click(button(VERIFY));
        await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      } else {
        prepareExport();
        await user.click(button(EXPORT));
        await waitFor(() => { expect(encrypt).toHaveBeenCalledOnce(); });
      }
      expect(unlock.mock.calls[0]?.[2]?.aborted).toBe(true);
      expect(button(UNLOCK).disabled).toBe(false);
      expect(button(DELETE).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: 'Cancel vault unlock' })).toBeNull();
      const currentNotices = notices();

      await settle(unlockGate, outcome, identity);
      expect(button(next === 'verify' ? VERIFY : EXPORT).disabled).toBe(true);
      expect(button(UNLOCK).disabled).toBe(false);
      expect(screen.getByLabelText<HTMLInputElement>('Vault passphrase').value).toBe(PASS);
      expect(notices()).toEqual(currentNotices);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(session.getSessionPublic()).toBe(identity);
      expect(common.downloadText).not.toHaveBeenCalled();

      await settle(nextGate, 'reject', undefined);
      expect(button(UNLOCK).disabled).toBe(false);
      expect(button(DELETE).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
    } finally {
      await act(async () => { unlockGate.resolve(identity); nextGate.resolve(); await Promise.resolve(); });
    }
  });

  it('verification -> unlock releases only verification, including its late success', async () => {
    await savedVault();
    const verifyGate = deferred();
    const unlockGate = deferred<session.SessionPublic>();
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => verifyGate.promise);
    const unlock = vi.spyOn(keyVault, 'unlockEncryptedVault').mockImplementation(() => unlockGate.promise);
    const { user } = await open();
    const identity = session.getSessionPublic()!;
    try {
      // Fill unlock first: editing its passphrase is itself an explicit cancellation boundary.
      await prepareUnlock();
      await prepareVerification(user);
      await user.click(button(VERIFY));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      await user.click(button(UNLOCK));
      await waitFor(() => { expect(unlock).toHaveBeenCalledOnce(); });
      expect(button(VERIFY).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
      const currentNotices = notices();

      await settle(verifyGate, 'resolve', undefined);
      expect(button(UNLOCK).disabled).toBe(true);
      expect(button(DELETE).disabled).toBe(true);
      expect(button('Cancel vault unlock')).toBeTruthy();
      expect(notices()).toEqual(currentNotices);
      expect(screen.getByLabelText<HTMLInputElement>('Keystore passphrase').value).toBe(PASS);

      await user.click(button('Cancel vault unlock'));
      await settle(unlockGate, 'reject', identity);
      expect(screen.queryByRole('button', { name: 'Cancel vault unlock' })).toBeNull();
      expect(button(DELETE).disabled).toBe(false);
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      await act(async () => { verifyGate.resolve(); unlockGate.resolve(identity); await Promise.resolve(); });
    }
  });

  it('a cancelled verification cannot clear a newer verification or its edited passphrase', async () => {
    const oldGate = deferred();
    const newGate = deferred();
    const verify = vi.spyOn(session, 'verifyDownloadedBackup')
      .mockImplementationOnce(() => oldGate.promise).mockImplementation(() => newGate.promise);
    const { user } = await open();
    try {
      await prepareVerification(user);
      await user.click(button(VERIFY));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      await user.click(button('Cancel verification'));
      expect(verify.mock.calls[0]?.[2]?.aborted).toBe(true);
      expect(screen.getByLabelText<HTMLInputElement>('Keystore passphrase').value).toBe('');
      await prepareVerification(user);
      fireEvent.change(screen.getByLabelText('Keystore passphrase'), { target: { value: 'a newer passphrase' } });
      await user.click(button(VERIFY));
      await waitFor(() => { expect(verify).toHaveBeenCalledTimes(2); });
      const currentNotices = notices();

      await settle(oldGate, 'resolve', undefined);
      expect(button(VERIFY).disabled).toBe(true);
      expect(button('Cancel verification')).toBeTruthy();
      expect(screen.getByLabelText<HTMLInputElement>('Keystore passphrase').value).toBe('a newer passphrase');
      expect(notices()).toEqual(currentNotices);

      await settle(newGate, 'reject', undefined);
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
      fireEvent.change(screen.getByLabelText('Keystore passphrase'), { target: { value: PASS } });
      expect(button(VERIFY).disabled).toBe(false);
    } finally {
      await act(async () => { oldGate.resolve(); newGate.resolve(); await Promise.resolve(); });
    }
  });

  it.each(['idle lock', 'session replacement', 'unmount'] as const)('%s retires verification before its late success', async (boundary) => {
    const gate = deferred();
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => gate.promise);
    const { user, view } = await open();
    try {
      await prepareVerification(user);
      await user.click(button(VERIFY));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      if (boundary === 'idle lock') act(() => { notifyAppLock('idle'); });
      else if (boundary === 'session replacement') act(() => { session.generateSession(); });
      else view.unmount();
      const identity = session.getSessionPublic();
      const currentNotices = boundary === 'unmount' ? [] : notices();
      expect(verify.mock.calls[0]?.[2]?.aborted).toBe(true);

      await settle(gate, 'resolve', undefined);
      expect(session.getSessionPublic()).toBe(identity);
      expect(common.downloadText).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Cancel verification' })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      if (boundary === 'unmount') expect(screen.queryByRole('heading', { name: 'Seller keys', level: 2 })).toBeNull();
      else {
        expect(notices()).toEqual(currentNotices);
        expect(screen.getByLabelText<HTMLInputElement>('Keystore passphrase').value).toBe('');
        expect(button(EXPORT).disabled).toBe(false);
      }
    } finally {
      await act(async () => { gate.resolve(); await Promise.resolve(); });
    }
  });
});

describe('SellerKeys durable vault write ownership', () => {
  it('a pending save stays busy through verification cancellation, session replacement and idle lock', async () => {
    const saveGate = deferred();
    const verifyGate = deferred();
    const save = vi.spyOn(keyVault, 'saveEncryptedVault').mockImplementation(() => saveGate.promise);
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => verifyGate.promise);
    const { user } = await open();
    try {
      fireEvent.change(await screen.findByLabelText('New vault passphrase (14+ characters)'), { target: { value: PASS } });
      fireEvent.change(screen.getByLabelText('Repeat vault passphrase'), { target: { value: PASS } });
      await user.click(button(SAVE));
      await waitFor(() => { expect(save).toHaveBeenCalledOnce(); });
      expect(button(SAVE).disabled).toBe(true);

      await prepareVerification(user);
      await user.click(button(VERIFY));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      await user.click(button('Cancel verification'));
      await settle(verifyGate, 'resolve', undefined);
      expect(button(SAVE).disabled).toBe(true);

      act(() => { session.generateSession(); });
      fireEvent.change(await screen.findByLabelText('New vault passphrase (14+ characters)'), { target: { value: PASS } });
      fireEvent.change(screen.getByLabelText('Repeat vault passphrase'), { target: { value: PASS } });
      expect(button(SAVE).disabled).toBe(true);
      // The disabled button is backed by a synchronous owner check, even for form submissions before rerendering.
      fireEvent.submit(button(SAVE).closest('form')!);
      expect(save).toHaveBeenCalledOnce();

      act(() => { notifyAppLock('idle'); });
      expect(button(SAVE).disabled).toBe(true);
      await settle(saveGate, 'reject', undefined);
      expect(button(SAVE).disabled).toBe(false);
    } finally {
      await act(async () => { saveGate.resolve(); verifyGate.resolve(); await Promise.resolve(); });
    }
  });

  it('editing unlock inputs and cancelling verification cannot release a pending delete', async () => {
    await savedVault();
    const deleteGate = deferred();
    const verifyGate = deferred();
    const remove = vi.spyOn(keyVault, 'deleteEncryptedVault').mockImplementation(() => deleteGate.promise);
    const unlock = vi.spyOn(keyVault, 'unlockEncryptedVault');
    const verify = vi.spyOn(session, 'verifyDownloadedBackup').mockImplementation(() => verifyGate.promise);
    const { user } = await open();
    try {
      await prepareUnlock();
      await user.click(button(DELETE));
      await user.click(await screen.findByRole('button', { name: CONFIRM_DELETE }));
      await waitFor(() => { expect(remove).toHaveBeenCalledOnce(); });
      fireEvent.change(screen.getByLabelText('Vault passphrase'), { target: { value: 'a newly edited passphrase' } });
      expect(button(UNLOCK).disabled).toBe(true);
      expect(button(CONFIRM_DELETE).disabled).toBe(true);
      expect(screen.queryByRole('button', { name: 'Cancel vault unlock' })).toBeNull();

      await prepareVerification(user);
      await user.click(button(VERIFY));
      await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
      expect(screen.queryByRole('button', { name: 'Cancel vault unlock' })).toBeNull();
      await user.click(button('Cancel verification'));
      await settle(verifyGate, 'resolve', undefined);
      expect(button(UNLOCK).disabled).toBe(true);
      expect(button(CONFIRM_DELETE).disabled).toBe(true);
      expect(unlock).not.toHaveBeenCalled();
      expect(remove).toHaveBeenCalledOnce();

      act(() => { notifyAppLock('idle'); });
      expect(button(DELETE).disabled).toBe(true);
      await settle(deleteGate, 'reject', undefined);
      expect(button(DELETE).disabled).toBe(false);
    } finally {
      await act(async () => { deleteGate.resolve(); verifyGate.resolve(); await Promise.resolve(); });
    }
  });

  it('a cancelled unlock preflight cannot start an unlock after a durable delete takes ownership', async () => {
    await savedVault();
    const preflight = deferred<boolean>();
    vi.mocked(keyVault.loadedKeysRecoverable).mockImplementation(() => preflight.promise);
    const deleteGate = deferred();
    const remove = vi.spyOn(keyVault, 'deleteEncryptedVault').mockImplementation(() => deleteGate.promise);
    const unlock = vi.spyOn(keyVault, 'unlockEncryptedVault');
    const { user } = await open();
    try {
      await prepareUnlock();
      await user.click(button(UNLOCK));
      await waitFor(() => { expect(keyVault.loadedKeysRecoverable).toHaveBeenCalledOnce(); });
      expect(button(DELETE).disabled).toBe(true);
      await user.click(button('Cancel vault unlock'));
      expect(button(DELETE).disabled).toBe(false);
      await user.click(button(DELETE));
      await user.click(await screen.findByRole('button', { name: CONFIRM_DELETE }));
      await waitFor(() => { expect(remove).toHaveBeenCalledOnce(); });

      await settle(preflight, 'resolve', true);
      expect(unlock).not.toHaveBeenCalled();
      expect(button(UNLOCK).disabled).toBe(true);
      expect(button(CONFIRM_DELETE).disabled).toBe(true);
      expect(screen.queryByRole('button', { name: 'Cancel vault unlock' })).toBeNull();
      await settle(deleteGate, 'reject', undefined);
      expect(button(CONFIRM_DELETE).disabled).toBe(false);
    } finally {
      await act(async () => { preflight.resolve(true); deleteGate.resolve(); await Promise.resolve(); });
    }
  });
});
