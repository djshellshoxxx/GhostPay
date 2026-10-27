// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, exportKeystore, generateSession, getSessionPublic } from '../lib/session';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests, type KeyVaultStore } from '../lib/keyVault';
import { makeServices, renderApp } from '../test/render';

const PASSPHRASE = 'violet comet maple lantern';
const SAVED = 'Encrypted seller vault saved in this browser. The passphrase was cleared.';
const SAVE_BUTTON = 'Save encrypted vault in this browser';

let durable = new MemoryKeyVaultStore();

beforeEach(() => {
  clearSession();
  durable = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(durable);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  setKeyVaultStoreForTests(undefined);
  clearSession();
});

async function openSellerKeys(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  return user;
}

async function generateAndFillSave(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
  await user.type(await screen.findByLabelText('New vault passphrase (14+ characters)'), PASSPHRASE);
  await user.type(screen.getByLabelText('Repeat vault passphrase'), PASSPHRASE);
}

/** Store whose putIfEmpty refuses BEFORE any durable commit with the supplied error. */
function refusingStore(backing: MemoryKeyVaultStore, makeError: () => unknown, observed: { puts: number }): KeyVaultStore {
  return {
    get: () => backing.get(),
    putIfEmpty: () => { observed.puts += 1; return Promise.reject(makeError()); },
    delete: (expected: string) => backing.delete(expected),
  };
}

function alertText(): string {
  return screen.queryByRole('alert')?.textContent ?? '';
}

describe('seller vault save storage honesty (pre-commit storage refusal)', () => {
  const cases: { name: string; make: () => unknown }[] = [
    { name: 'QuotaExceededError', make: () => new DOMException('storage quota exceeded', 'QuotaExceededError') },
    { name: 'AbortError', make: () => new DOMException('transaction aborted', 'AbortError') },
  ];

  for (const c of cases) {
    it(`contract: a ${c.name} refusal is shown as a failure, never as a successful save, and writes no ciphertext`, async () => {
      const observed = { puts: 0 };
      setKeyVaultStoreForTests(refusingStore(durable, c.make, observed));
      const user = await openSellerKeys();
      await generateAndFillSave(user);
      const before = getSessionPublic()!;
      await user.click(screen.getByRole('button', { name: SAVE_BUTTON }));

      await waitFor(
        () => { expect(alertText().length > 0).toBe(true); },
        { timeout: 30_000, onTimeout: (error) => error },
      );
      expect(observed.puts).toBe(1);
      // Visible user-facing failure, no success claim.
      expect(screen.queryAllByText(SAVED).length).toBe(0);
      // Nothing durable was written.
      expect(await durable.get()).toBeUndefined();
      // Loaded public identity retained.
      expect(getSessionPublic()?.metaAddress).toBe(before.metaAddress);
      expect(getSessionPublic()?.signerPublicKey).toBe(before.signerPublicKey);
      expect(screen.queryByText(before.metaAddress) !== null).toBe(true);
      // The failed save is not presented as an existing saved vault.
      expect(screen.queryByRole('button', { name: 'Unlock saved vault' })).toBeNull();
    });


  }
});

describe('seller vault save when another tab filled the single vault slot', () => {
  it('contract: explicit Save refuses to overwrite a different seller ciphertext, keeps loaded keys, and exposes unlock/delete controls', async () => {
    // Valid ciphertext for a DIFFERENT seller, created before this tab's keys exist.
    generateSession();
    const otherPublic = getSessionPublic()!;
    const other = await exportKeystore(PASSPHRASE, { N: 1 << 14 });
    clearSession();

    const user = await openSellerKeys();
    await generateAndFillSave(user);
    const mine = getSessionPublic()!;
    expect(mine.metaAddress).not.toBe(otherPublic.metaAddress);
    // The UI believes the vault is empty (the save form is shown); another tab now saves.
    expect(await durable.get()).toBeUndefined();
    await act(async () => { await durable.putIfEmpty(other); });

    await user.click(screen.getByRole('button', { name: SAVE_BUTTON }));
    await waitFor(
      () => { expect(alertText().length > 0).toBe(true); },
      { timeout: 30_000, onTimeout: (error) => error },
    );

    // Refusal text explains the conflict; no success claim.
    expect(/already exists|delete it before saving/i.test(alertText())).toBe(true);
    expect(screen.queryAllByText(SAVED).length).toBe(0);
    // The other tab's ciphertext is preserved byte-for-byte.
    expect(await durable.get()).toBe(other);
    // Loaded keys retained honestly.
    expect(getSessionPublic()?.metaAddress).toBe(mine.metaAddress);
    expect(screen.queryByText(mine.metaAddress) !== null).toBe(true);
    // The user can resolve the conflict through the existing saved-vault controls.
    await waitFor(
      () => {
        expect(screen.queryByRole('button', { name: 'Unlock saved vault' }) !== null).toBe(true);
        expect(screen.queryByRole('button', { name: 'Delete encrypted vault' }) !== null).toBe(true);
      },
      { timeout: 5_000, onTimeout: (error) => error },
    );
  });
});