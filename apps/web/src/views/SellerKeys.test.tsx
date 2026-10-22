// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession, getSessionPublic } from '../lib/session';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests, type KeyVaultStore } from '../lib/keyVault';
import { makeServices, renderApp } from '../test/render';

let vaultStore = new MemoryKeyVaultStore();

beforeEach(() => {
  clearSession();
  vaultStore = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(vaultStore);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => { setKeyVaultStoreForTests(undefined); });

async function open(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  return user;
}

describe('Seller keys', () => {
  it('offers explicit encrypted-vault unlock after reload and never stores the passphrase', async () => {
    const original = generateSession();
    const passphrase = 'violet comet maple lantern';
    await saveEncryptedVault(passphrase, { N: 1 << 14 });
    const ciphertext = await vaultStore.get();
    clearSession();
    const user = await open();
    expect(await screen.findByText(/Unlocking replaces the keys currently in memory/)).toBeTruthy();
    await user.type(screen.getByLabelText('Vault passphrase'), passphrase);
    await user.click(screen.getByRole('button', { name: 'Unlock saved vault' }));
    await waitFor(() => { expect(getSessionPublic()?.metaAddress).toBe(original.metaAddress); }, { timeout: 30_000 });
    expect(await vaultStore.get()).toBe(ciphertext);
    expect(await vaultStore.get()).not.toContain(passphrase);
    expect(screen.getByLabelText<HTMLInputElement>('Vault passphrase').value).toBe('');
  });

  it('keeps a saved vault locked after a wrong passphrase and clears the password field', async () => {
    generateSession();
    await saveEncryptedVault('violet comet maple lantern', { N: 1 << 14 });
    clearSession();
    const user = await open();
    await user.type(await screen.findByLabelText('Vault passphrase'), 'incorrect vault phrase');
    await user.click(screen.getByRole('button', { name: 'Unlock saved vault' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/Wrong passphrase/); }, { timeout: 15_000 });
    expect(getSessionPublic()).toBeUndefined();
    expect(screen.getByLabelText<HTMLInputElement>('Vault passphrase').value).toBe('');
    expect(screen.getByRole('button', { name: 'Delete encrypted vault' })).toBeTruthy();
  });

  it('requires a valid matching vault passphrase before saving any ciphertext', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    const store = vaultStore;
    await user.type(await screen.findByLabelText('New vault passphrase (14+ characters)'), 'short');
    await user.type(screen.getByLabelText('Repeat vault passphrase'), 'short');
    await user.click(screen.getByRole('button', { name: 'Save encrypted vault in this browser' }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least 14/);
    expect(await store.get()).toBeUndefined();
    await user.clear(screen.getByLabelText('New vault passphrase (14+ characters)'));
    await user.clear(screen.getByLabelText('Repeat vault passphrase'));
    await user.type(screen.getByLabelText('New vault passphrase (14+ characters)'), 'violet comet maple lantern');
    await user.type(screen.getByLabelText('Repeat vault passphrase'), 'different phrase here');
    await user.click(screen.getByRole('button', { name: 'Save encrypted vault in this browser' }));
    expect(screen.getByRole('alert').textContent).toMatch(/differ/);
    expect(await store.get()).toBeUndefined();
  });

  it('supports cancelling or confirming explicit vault deletion', async () => {
    generateSession();
    await saveEncryptedVault('violet comet maple lantern', { N: 1 << 14 });
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Delete encrypted vault' }));
    expect(screen.getByText(/permanently deletes the saved ciphertext/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Unlock saved vault' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Delete encrypted vault' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete encrypted vault' }));
    expect(await screen.findAllByText('Encrypted vault deleted from this browser.')).toHaveLength(2);
    expect(await vaultStore.get()).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Unlock saved vault' })).toBeNull();
  });

  it('reports unavailable encrypted browser storage while keeping in-memory key creation available', async () => {
    const unavailable: KeyVaultStore = {
      get: () => Promise.reject(new Error('simulated browser storage failure')),
      putIfEmpty: () => Promise.reject(new Error('simulated browser storage failure')),
      delete: () => Promise.reject(new Error('simulated browser storage failure')),
    };
    setKeyVaultStoreForTests(unavailable);
    const user = await open();
    expect(await screen.findByText(/This browser cannot read the optional vault/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    expect(getSessionPublic()).toBeDefined();
  });

  it('generates keys in memory and shows only public data; nothing is written to web storage', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    const pub = getSessionPublic()!;
    expect(screen.getByText(pub.metaAddress)).toBeTruthy();
    expect(document.querySelector('[data-qr-kind="shareable"] svg')).toBeTruthy();
    expect(screen.getByText(pub.signerPublicKey)).toBeTruthy();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.body.innerHTML).not.toMatch(/spendingSecret|viewingSecret/);
  });

  it('imports raw hex keys and clears the inputs', async () => {
    const user = await open();
    await user.click(screen.getByText('Import existing keys (hex)'));
    await user.type(screen.getByLabelText('Spending private key (64 hex characters)'), '11'.repeat(32));
    await user.type(screen.getByLabelText('Viewing private key (64 hex characters)'), '22'.repeat(32));
    await user.click(screen.getByRole('button', { name: 'Load keys' }));
    expect(getSessionPublic()).toBeDefined();
    expect(screen.getByText('Your meta-address (public)')).toBeTruthy();
  });

  it('shows a clear error for a bad key and keeps no session', async () => {
    const user = await open();
    await user.click(screen.getByText('Import existing keys (hex)'));
    await user.type(screen.getByLabelText('Spending private key (64 hex characters)'), 'abc');
    await user.type(screen.getByLabelText('Viewing private key (64 hex characters)'), '22'.repeat(32));
    await user.click(screen.getByRole('button', { name: 'Load keys' }));
    expect(screen.getByRole('alert').textContent).toMatch(/64 hexadecimal/);
    expect(getSessionPublic()).toBeUndefined();
  });

  it('exports an encrypted keystore (validating the passphrase) and wipes keys on request', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    const click = vi.fn();
    const created: string[] = [];
    URL.createObjectURL = (b: Blob | MediaSource): string => {
      created.push((b as Blob).type);
      return 'blob:test';
    };
    URL.revokeObjectURL = (): void => undefined;
    HTMLAnchorElement.prototype.click = click;
    await user.type(screen.getByLabelText('Passphrase (at least 10 characters)'), 'short');
    await user.type(screen.getByLabelText('Repeat passphrase'), 'short');
    await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least 14/);
    await user.clear(screen.getByLabelText('Passphrase (at least 10 characters)'));
    await user.type(screen.getByLabelText('Passphrase (at least 10 characters)'), 'a long passphrase');
    await user.clear(screen.getByLabelText('Repeat passphrase'));
    await user.type(screen.getByLabelText('Repeat passphrase'), 'different one!!');
    await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
    expect(screen.getByRole('alert').textContent).toMatch(/differ/);
    await user.clear(screen.getByLabelText('Repeat passphrase'));
    await user.type(screen.getByLabelText('Repeat passphrase'), 'a long passphrase');
    await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
    await waitFor(() => { expect(click).toHaveBeenCalled(); }, { timeout: 30_000 });
    expect(created).toEqual(['application/json']);
    const secretQr = document.querySelector('[data-qr-kind="secret"]');
    expect(secretQr).toBeTruthy();
    expect(secretQr?.querySelector('svg.qr-svg')).toBeNull();
    await user.click(within(secretQr as HTMLElement).getByRole('button', { name: 'Reveal secret QR code' }));
    expect(secretQr?.querySelector('svg.qr-svg')).toBeTruthy();
    expect(window.localStorage.length).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Wipe keys from memory' }));
    expect(getSessionPublic()).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Generate new keys' })).toBeTruthy();
  });

  it('imports a keystore file with the right passphrase and rejects the wrong one', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    const original = getSessionPublic()!;
    const { exportKeystore } = await import('../lib/session');
    const text = await exportKeystore('a long passphrase', { N: 1 << 14 });
    await user.click(screen.getByRole('button', { name: 'Wipe keys from memory' }));
    await user.click(screen.getByText('Import an encrypted keystore'));
    const input = screen.getByLabelText('Keystore file');
    await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Choose a keystore file/);
    await user.upload(input, new File([text], 'ks.json', { type: 'application/json' }));
    await user.type(screen.getByLabelText('Passphrase'), 'wrong wrong wrong');
    await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/Wrong passphrase/); }, { timeout: 15_000 });
    await user.clear(screen.getByLabelText('Passphrase'));
    await user.type(screen.getByLabelText('Passphrase'), 'a long passphrase');
    await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
    await waitFor(() => { expect(getSessionPublic()?.metaAddress).toBe(original.metaAddress); }, { timeout: 15_000 });
  });

  it('rejects oversized keystore files without reading them', async () => {
    const user = await open();
    await user.click(screen.getByText('Import an encrypted keystore'));
    await user.upload(screen.getByLabelText('Keystore file'), new File(['x'.repeat(9000)], 'big.json', { type: 'application/json' }));
    await user.type(screen.getByLabelText('Passphrase'), 'whatever pass');
    await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
    expect(screen.getByRole('alert').textContent).toMatch(/not a GhostPay keystore/);
  });
});
