// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession, getSessionBackup, getSessionPublic, importSession } from '../lib/session';
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
    await user.clear(await screen.findByLabelText('New vault passphrase (14+ characters)'));
    await user.type(screen.getByLabelText('New vault passphrase (14+ characters)'), 'short');
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
    const loaded = generateSession();
    await saveEncryptedVault('violet comet maple lantern', { N: 1 << 14 });
    const user = await open();
    await user.click(await screen.findByRole('button', { name: 'Delete encrypted vault' }));
    expect(screen.getByText(/permanently deletes the saved ciphertext/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Unlock saved vault' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Delete encrypted vault' }));
    // L1-02: the confirmation names the vault's meta-address; the vault of the loaded keys needs its passphrase.
    expect(screen.getByText('This vault holds the seller keys of meta-address:')).toBeTruthy();
    expect(screen.getAllByText(loaded.metaAddress).length).toBeGreaterThan(0);
    expect(screen.getByText(/These are the keys loaded now/)).toBeTruthy();
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm delete encrypted vault' });
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText('Passphrase of this vault'), 'incorrect vault phrase');
    await user.click(confirm);
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/Wrong passphrase/); }, { timeout: 15_000 });
    expect(await vaultStore.get()).toBeDefined();
    await user.type(screen.getByLabelText('Passphrase of this vault'), 'violet comet maple lantern');
    await user.click(screen.getByRole('button', { name: 'Confirm delete encrypted vault' }));
    expect(await screen.findAllByText('Encrypted vault deleted from this browser.', undefined, { timeout: 15_000 })).toHaveLength(2);
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
    // L1-01: keys that exist only in this tab are not shared before a backup or the typed waiver.
    expect(screen.getByText('These seller keys have no backup')).toBeTruthy();
    expect(screen.getByText('Back up these seller keys first')).toBeTruthy();
    expect(screen.queryByText(pub.metaAddress)).toBeNull();
    expect(document.querySelector('[data-qr-kind="shareable"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy meta-address' })).toBeNull();
    await user.type(screen.getByLabelText(/To continue without a backup/), 'continue without backup');
    await user.click(screen.getByRole('button', { name: 'Continue without a backup' }));
    expect(screen.getByText(pub.metaAddress)).toBeTruthy();
    expect(document.querySelector('[data-qr-kind="shareable"] svg')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy meta-address' })).toBeTruthy();
    expect(screen.getByText(pub.signerPublicKey)).toBeTruthy();
    expect(screen.getByText('These seller keys have no backup')).toBeTruthy();
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
    await user.clear(screen.getByLabelText('Passphrase (at least 14 characters)'));
    await user.type(screen.getByLabelText('Passphrase (at least 14 characters)'), 'short');
    await user.type(screen.getByLabelText('Repeat passphrase'), 'short');
    await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least 14/);
    await user.clear(screen.getByLabelText('Passphrase (at least 14 characters)'));
    await user.type(screen.getByLabelText('Passphrase (at least 14 characters)'), 'a long passphrase');
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
    // L1-01: the downloaded keystore is a backup, so the banner and the sharing gate are gone.
    expect(getSessionBackup()?.backedUp).toBe(true);
    expect(screen.queryByText('These seller keys have no backup')).toBeNull();
    expect(screen.getByText(getSessionPublic()!.metaAddress)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Wipe keys from memory' }));
    expect(getSessionPublic()).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Generate new keys' })).toBeTruthy();
  });

  it('L1-06: pre-fills a generated keystore passphrase in clear and accepts it once typed again', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase (at least 14 characters)');
    const first = field.value;
    expect(first).toMatch(/^[a-z]{4,8}(?:-[a-z]{4,8}){5}$/);
    expect(field.type).toBe('text');
    expect(screen.getAllByText(/Suggested: 6 random words picked on this device \(60 bits\)/).length).toBeGreaterThan(0);
    const vaultField = screen.getByLabelText<HTMLInputElement>('New vault passphrase (14+ characters)');
    expect(vaultField.value).toMatch(/^[a-z]{4,8}(?:-[a-z]{4,8}){5}$/);
    expect(vaultField.value).not.toBe(first);
    await user.type(screen.getByLabelText('Repeat passphrase'), 'typed');
    await user.click(screen.getByRole('button', { name: 'Suggest another keystore passphrase' }));
    expect(field.value).not.toBe(first);
    expect(screen.getByLabelText<HTMLInputElement>('Repeat passphrase').value).toBe('');
    // Editing turns it into the user's own passphrase, which is not shown.
    await user.type(field, 'x');
    expect(field.type).toBe('password');
    await user.click(screen.getByRole('button', { name: 'Suggest another keystore passphrase' }));
    const click = vi.fn();
    URL.createObjectURL = (): string => 'blob:test';
    URL.revokeObjectURL = (): void => undefined;
    HTMLAnchorElement.prototype.click = click;
    await user.type(screen.getByLabelText('Repeat passphrase'), field.value);
    await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
    await waitFor(() => { expect(click).toHaveBeenCalled(); }, { timeout: 30_000 });
    expect(getSessionBackup()?.backedUp).toBe(true);
  });

  it('L1-01: asks before unlocking a saved vault over keys that have no backup', async () => {
    const saved = importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
    await saveEncryptedVault('violet comet maple lantern', { N: 1 << 14 });
    clearSession();
    const unsaved = generateSession();
    const user = await open();
    await user.type(await screen.findByLabelText('Vault passphrase'), 'violet comet maple lantern');
    await user.click(screen.getByRole('button', { name: 'Unlock saved vault' }));
    expect(screen.getByText('The keys loaded now have no backup')).toBeTruthy();
    expect(getSessionPublic()).toBe(unsaved);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('The keys loaded now have no backup')).toBeNull();
    expect(getSessionPublic()).toBe(unsaved);
    await user.click(screen.getByRole('button', { name: 'Unlock saved vault' }));
    await user.click(screen.getByRole('button', { name: 'Replace the unsaved keys' }));
    await waitFor(() => { expect(getSessionPublic()?.metaAddress).toBe(saved.metaAddress); }, { timeout: 30_000 });
    expect(getSessionBackup()).toMatchObject({ backedUp: true, vaultStepUp: true });
  });

  it('L1-02: exporting keys tied to a vault needs that vault\'s passphrase', async () => {
    importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
    await saveEncryptedVault('violet comet maple lantern', { N: 1 << 14 });
    const click = vi.fn();
    URL.createObjectURL = (): string => 'blob:test';
    URL.revokeObjectURL = (): void => undefined;
    HTMLAnchorElement.prototype.click = click;
    const user = await open();
    await user.type(await screen.findByLabelText('Current vault passphrase'), 'attacker chosen phrase 42!');
    await user.clear(screen.getByLabelText('Passphrase (at least 14 characters)'));
    await user.type(screen.getByLabelText('Passphrase (at least 14 characters)'), 'attacker chosen phrase 42!');
    await user.type(screen.getByLabelText('Repeat passphrase'), 'attacker chosen phrase 42!');
    await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/Wrong passphrase/); }, { timeout: 15_000 });
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>('Current vault passphrase').value).toBe('');
    await user.type(screen.getByLabelText('Current vault passphrase'), 'violet comet maple lantern');
    await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
    await waitFor(() => { expect(click).toHaveBeenCalled(); }, { timeout: 30_000 });
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


it('imports only an encrypted keystore QR and waits for explicit decryption', async () => {
  generateSession();
  const original = getSessionPublic();
  const { exportKeystore } = await import('../lib/session');
  const text = await exportKeystore('a long passphrase', { N: 1 << 14 });
  clearSession();
  const user = await open();
  await user.click(screen.getByText('Import an encrypted keystore'));
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: text } });
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  expect(getSessionPublic()).toBeUndefined();
  await user.type(screen.getByLabelText('Passphrase'), 'a long passphrase');
  const keySession = await import('../lib/session');
  const actualImport = keySession.importKeystore;
  let importPromise: ReturnType<typeof actualImport> | undefined;
  const observedImport = vi.spyOn(keySession, 'importKeystore').mockImplementation((...args) => {
    importPromise = actualImport(...args);
    return importPromise;
  });
  try {
    expect(observedImport).not.toHaveBeenCalled();
    expect(getSessionPublic()).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
    expect(observedImport).toHaveBeenCalledOnce();
    expect(importPromise).toBeDefined();
    // Await the real scrypt/AES-GCM operation instead of imposing an unrelated
    // one-second polling deadline on the explicit-consent behavior under test.
    await act(async () => { await importPromise; });
    expect(getSessionPublic()?.metaAddress).toBe(original?.metaAddress);
    expect(screen.queryByLabelText('Passphrase')).toBeNull();
  } finally { observedImport.mockRestore(); }
});

it('does not install keys if the encrypted import disclosure closes during file reading', async () => {
  generateSession();
  const { exportKeystore } = await import('../lib/session');
  const text = await exportKeystore('a long passphrase', { N: 1 << 14 });
  clearSession();
  const user = await open();
  await user.click(screen.getByText('Import an encrypted keystore'));
  let finish!: (value: string) => void;
  const file = new File([text], 'keys.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => new Promise<string>((resolve) => { finish = resolve; }) });
  await user.upload(screen.getByLabelText('Keystore file'), file);
  await user.type(screen.getByLabelText('Passphrase'), 'a long passphrase');
  await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
  await user.click(screen.getByText('Import an encrypted keystore'));
  act(() => { finish(text); });
  expect(getSessionPublic()).toBeUndefined();
  expect(screen.getByLabelText<HTMLInputElement>('Passphrase').value).toBe('');
});

describe('encrypted vault save lifetime', () => {
  const PASSPHRASE = 'violet comet maple lantern';
  const SAVED = 'Encrypted seller vault saved in this browser. The passphrase was cleared.';

  async function startSave(store: KeyVaultStore): Promise<ReturnType<typeof userEvent.setup>> {
    setKeyVaultStoreForTests(store);
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    await user.clear(await screen.findByLabelText('New vault passphrase (14+ characters)'));
    await user.type(screen.getByLabelText('New vault passphrase (14+ characters)'), PASSPHRASE);
    await user.type(screen.getByLabelText('Repeat vault passphrase'), PASSPHRASE);
    await user.click(screen.getByRole('button', { name: 'Save encrypted vault in this browser' }));
    return user;
  }

  it('does not commit or report a save whose keys were wiped while the PUT was pending', async () => {
    const durable = new MemoryKeyVaultStore();
    let reachedPut!: () => void;
    let releasePut!: () => void;
    const putStarted = new Promise<void>((resolve) => { reachedPut = resolve; });
    const putGate = new Promise<void>((resolve) => { releasePut = resolve; });
    const store: KeyVaultStore = {
      get: () => durable.get(),
      putIfEmpty: async (...args: Parameters<KeyVaultStore['putIfEmpty']>) => { reachedPut(); await putGate; return durable.putIfEmpty(...args); },
      delete: (...args: Parameters<KeyVaultStore['delete']>) => durable.delete(...args),
    };
    const user = await startSave(store);
    await act(async () => { await putStarted; });
    await user.click(screen.getByRole('button', { name: 'Wipe keys from memory' }));
    await act(async () => { releasePut(); await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/changed during this action/); }, { timeout: 15_000 });
    expect(await durable.get()).toBeUndefined();
    expect(screen.queryByText(SAVED)).toBeNull();
    expect(getSessionPublic()).toBeUndefined();
  });

  it('reports a durable commit honestly when the keys change after the write landed', async () => {
    const durable = new MemoryKeyVaultStore();
    let committed!: () => void;
    let finish!: () => void;
    const commitSeen = new Promise<void>((resolve) => { committed = resolve; });
    const finishGate = new Promise<void>((resolve) => { finish = resolve; });
    const store: KeyVaultStore = {
      get: () => durable.get(),
      putIfEmpty: async (...args: Parameters<KeyVaultStore['putIfEmpty']>) => { await durable.putIfEmpty(...args); committed(); await finishGate; },
      delete: (...args: Parameters<KeyVaultStore['delete']>) => durable.delete(...args),
    };
    const user = await startSave(store);
    await act(async () => { await commitSeen; });
    const ciphertext = await durable.get();
    expect(ciphertext).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Wipe keys from memory' }));
    await act(async () => { finish(); await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/saved for the seller keys that were loaded when you started/); }, { timeout: 15_000 });
    expect(await durable.get()).toBe(ciphertext);
    expect(screen.queryByText(SAVED)).toBeNull();
    expect(await screen.findByRole('button', { name: 'Unlock saved vault' })).toBeTruthy();
  });
});

describe('encrypted vault delete confirmation', () => {
  const PASSPHRASE = 'violet comet maple lantern';
  const CONFIRM = 'Confirm delete encrypted vault';
  const DELETED = 'Encrypted vault deleted from this browser.';

  /** Saves vault A for one key set and returns valid ciphertext B for a different key set. */
  async function savedAWithReplacementB(): Promise<{ a: string; b: string }> {
    generateSession();
    const { exportKeystore } = await import('../lib/session');
    const b = await exportKeystore(PASSPHRASE, { N: 1 << 14 });
    clearSession();
    generateSession();
    await saveEncryptedVault(PASSPHRASE, { N: 1 << 14 });
    clearSession();
    const a = (await vaultStore.get())!;
    expect(a).not.toBe(b);
    return { a, b };
  }

  /** Simulates another tab replacing the shared record. */
  async function replaceStored(from: string, to: string | undefined): Promise<void> {
    await act(async () => {
      await vaultStore.delete(from);
      if (to !== undefined) await vaultStore.putIfEmpty(to);
    });
  }

  async function openConfirmation(): Promise<ReturnType<typeof userEvent.setup>> {
    const user = await open();
    await user.click(await screen.findByRole('button', { name: 'Delete encrypted vault' }));
    expect(await screen.findByRole('button', { name: CONFIRM })).toBeTruthy();
    return user;
  }

  it('Cancel keeps vault A byte-for-byte', async () => {
    const { a } = await savedAWithReplacementB();
    const user = await openConfirmation();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await vaultStore.get()).toBe(a);
    expect(screen.getByRole('button', { name: 'Unlock saved vault' })).toBeTruthy();
  });

  it('a stale confirmation cannot delete replacement vault B (A -> B)', async () => {
    const { a, b } = await savedAWithReplacementB();
    const user = await openConfirmation();
    await replaceStored(a, b);
    await user.click(screen.getByRole('button', { name: CONFIRM }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/vault changed/i); });
    expect(await vaultStore.get()).toBe(b);
    expect(screen.queryByRole('button', { name: CONFIRM })).toBeNull();
    expect(screen.queryByText(DELETED)).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlock saved vault' })).toBeTruthy();
  });

  it('a stale confirmation rejects when the vault was removed and B saved meanwhile (A -> empty -> B)', async () => {
    const { a, b } = await savedAWithReplacementB();
    const user = await openConfirmation();
    await replaceStored(a, undefined);
    expect(await vaultStore.get()).toBeUndefined();
    await act(async () => { await vaultStore.putIfEmpty(b); });
    await user.click(screen.getByRole('button', { name: CONFIRM }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/vault changed/i); });
    expect(await vaultStore.get()).toBe(b);
    expect(screen.queryByText(DELETED)).toBeNull();
  });

  it('rejects when B lands between the Confirm click and the delete transaction', async () => {
    const { a, b } = await savedAWithReplacementB();
    const durable = vaultStore;
    let reachedDelete!: () => void;
    let releaseDelete!: () => void;
    const deleteStarted = new Promise<void>((resolve) => { reachedDelete = resolve; });
    const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve; });
    setKeyVaultStoreForTests({
      get: () => durable.get(),
      putIfEmpty: (...args: Parameters<KeyVaultStore['putIfEmpty']>) => durable.putIfEmpty(...args),
      delete: async (...args: Parameters<KeyVaultStore['delete']>) => { reachedDelete(); await deleteGate; return durable.delete(...args); },
    });
    const user = await openConfirmation();
    await user.click(screen.getByRole('button', { name: CONFIRM }));
    await act(async () => { await deleteStarted; });
    await replaceStored(a, b);
    await act(async () => { releaseDelete(); await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/vault changed/i); });
    expect(await durable.get()).toBe(b);
    expect(screen.queryByText(DELETED)).toBeNull();
  });

  it('an unchanged confirmation deletes A, and a repeated click cannot delete a later B', async () => {
    const { a, b } = await savedAWithReplacementB();
    const durable = vaultStore;
    const gates: (() => void)[] = [];
    const deletes: (string | undefined)[] = [];
    setKeyVaultStoreForTests({
      get: () => durable.get(),
      putIfEmpty: (...args: Parameters<KeyVaultStore['putIfEmpty']>) => durable.putIfEmpty(...args),
      delete: async (...args: Parameters<KeyVaultStore['delete']>) => {
        deletes.push(args[0]);
        await new Promise<void>((resolve) => { gates.push(resolve); });
        return durable.delete(...args);
      },
    });
    await openConfirmation();
    const confirm = screen.getByRole('button', { name: CONFIRM });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => { expect(gates.length).toBeGreaterThan(0); });
    await act(async () => { gates.shift()?.(); await Promise.resolve(); });
    expect(await screen.findAllByText(DELETED)).toHaveLength(2);
    expect(await durable.get()).toBeUndefined();
    await act(async () => { await durable.putIfEmpty(b); });
    await act(async () => { for (const release of gates.splice(0)) release(); await Promise.resolve(); });
    expect(await durable.get()).toBe(b);
    expect(deletes.every((expected) => expected === a)).toBe(true);
  });

  it('shows a visible error when browser storage fails during delete', async () => {
    const { a } = await savedAWithReplacementB();
    const durable = vaultStore;
    setKeyVaultStoreForTests({
      get: () => durable.get(),
      putIfEmpty: (...args: Parameters<KeyVaultStore['putIfEmpty']>) => durable.putIfEmpty(...args),
      delete: () => Promise.reject(new Error('simulated browser storage failure')),
    });
    const user = await openConfirmation();
    await user.click(screen.getByRole('button', { name: CONFIRM }));
    await waitFor(() => { expect(screen.getByRole('alert')).toBeTruthy(); });
    expect(screen.queryByText(DELETED)).toBeNull();
    expect(await durable.get()).toBe(a);
  });
});
