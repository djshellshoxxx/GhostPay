// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import * as exportModule from '../lib/paymentKeyExport';
import { TEST_N, VECTORS, VECTOR_PASS, captureDownloads } from '../lib/paymentKeyExport.testutil';
import { captureSessionGuard, clearSession, exportKeystore, generateSession, getSessionBackup, getSessionPublic, markKeystoreDownloaded } from '../lib/session';
import { decryptMasterBackup } from '../lib/stealthExport';
import { makeServices, renderApp } from '../test/render';

const VAULT_PASS = 'violet comet maple lantern';
const FILE_PASS = 'orbit-lantern-cobalt-meadow-violet';
let vaultStore = new MemoryKeyVaultStore();
let downloads: ReturnType<typeof captureDownloads>;

beforeEach(() => {
  clearSession();
  vaultStore = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(vaultStore);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  downloads = captureDownloads();
});

afterEach(() => {
  downloads.restore();
  setKeyVaultStoreForTests(undefined);
  vi.restoreAllMocks();
  clearSession();
});

async function open(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  return user;
}

describe('Seller keys: spec 18 master backup and recovery', () => {
  it('identifies a renamed seller keystore and restores all three keys only after explicit submission', async () => {
    const before = generateSession();
    const text = await exportKeystore(FILE_PASS, { N: TEST_N });
    clearSession();
    const user = await open();
    const panel = within(screen.getByTestId('stealth-export-open'));
    expect(panel.queryByLabelText('Passphrase')).toBeNull();
    await user.upload(panel.getByLabelText('Recovery file'), new File([text], 'unrelated.json', { type: 'application/json' }));
    expect(await panel.findByText('Seller keystore (spending, viewing and invoice-signing keys)')).toBeTruthy();
    expect(getSessionPublic()).toBeUndefined();
    expect(panel.queryByRole('button', { name: 'Check export without importing' })).toBeNull();
    await user.type(panel.getByLabelText('Passphrase'), FILE_PASS);
    expect(getSessionPublic()).toBeUndefined();
    await user.click(panel.getByRole('button', { name: 'Decrypt and load' }));
    await waitFor(() => { expect(getSessionPublic()?.signerPublicKey).toBe(before.signerPublicKey); }, { timeout: 30_000 });
    expect(getSessionPublic()?.metaAddress).toBe(before.metaAddress);
    await user.upload(panel.getByLabelText('Recovery file'), new File([text], 'again.json', { type: 'application/json' }));
    expect(await panel.findByText(/Seller keys are already loaded/)).toBeTruthy();
    expect(panel.queryByLabelText('Passphrase')).toBeNull();
    expect(panel.queryByRole('button', { name: 'Decrypt and load' })).toBeNull();
  });

  it('ignores a stale file read when a public record supersedes it', async () => {
    const user = await open();
    const panel = within(screen.getByTestId('stealth-export-open'));
    const first = new File([VECTORS.files.master.text], 'first.json', { type: 'application/json' });
    let finish!: (text: string) => void;
    Object.defineProperty(first, 'text', { value: () => new Promise<string>((resolve) => { finish = resolve; }) });
    await user.upload(panel.getByLabelText('Recovery file'), first);
    expect(panel.queryByLabelText('Export file passphrase')).toBeNull();
    await user.upload(panel.getByLabelText('Recovery file'), new File([VECTORS.files.public.text], 'second.json', { type: 'application/json' }));
    expect(await panel.findByText('Public payment record')).toBeTruthy();
    await act(async () => { finish(VECTORS.files.master.text); await Promise.resolve(); });
    expect(panel.queryByLabelText('Export file passphrase')).toBeNull();
    expect(panel.getByText('Public payment record')).toBeTruthy();
    expect(getSessionPublic()).toBeUndefined();
  });

  it('offers recovery in a fresh session with no keys, and the master backup only once keys are loaded', async () => {
    const user = await open();
    expect(screen.getByRole('heading', { name: 'Recover from a file' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Master stealth key backup (encrypted)' })).toBeNull();
    const panel = screen.getByTestId('stealth-export-open');
    await user.upload(within(panel).getByLabelText('Recovery file'), new File([VECTORS.files.single.text], 'k.json', { type: 'application/json' }));
    await user.type(await within(panel).findByLabelText('Export file passphrase'), VECTOR_PASS);
    await user.click(within(panel).getByRole('button', { name: 'Open export' }));
    expect(await within(panel).findByText(/1 payment key on Ethereum Sepolia/, {}, { timeout: 30_000 })).toBeTruthy();
    expect(getSessionPublic()).toBeUndefined();
    expect(downloads.files).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    expect(await screen.findByRole('heading', { name: 'Master stealth key backup (encrypted)' })).toBeTruthy();
    // A key change wipes what the recovery panel had opened.
    expect(within(panel).queryByText(/1 payment key on Ethereum Sepolia/)).toBeNull();
  });

  it('keeps the keystore "Verify backup" control uniquely named beside the export check', async () => {
    // Voice control and role queries match accessible names by substring: the export check must not reuse the keystore
    // control's established "Verify backup" name, or both answer to the same command.
    generateSession();
    markKeystoreDownloaded(captureSessionGuard());
    await open();
    const panel = screen.getByTestId('stealth-export-open');
    // A string name in a role query already matches the whole accessible name.
    expect(within(panel).getByRole('button', { name: 'Check export without importing' })).toBeTruthy();
    const verify = screen.getAllByRole('button', { name: /verify backup/i });
    expect(verify).toHaveLength(1);
    expect(verify[0]!.textContent).toBe('Verify backup');
    expect(panel.contains(verify[0]!)).toBe(false);
  });

  it('downloads the master backup after the vault step-up', async () => {
    const actual = exportModule.exportMasterBackup;
    vi.spyOn(exportModule, 'exportMasterBackup').mockImplementation((c, p, o) => actual(c, p, { ...o, N: TEST_N }));
    const pub = generateSession();
    await saveEncryptedVault(VAULT_PASS, { N: TEST_N });
    const user = await open();
    const panel = await screen.findByTestId('stealth-master-backup');
    await user.type(within(panel).getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.type(within(panel).getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(within(panel).getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(within(panel).getByRole('button', { name: 'Download master backup' }));
    await waitFor(() => { expect(downloads.files.map((f) => f.filename)).toEqual(['ghostpay-stealth-master.json']); }, { timeout: 30_000 });
    expect((await decryptMasterBackup(await downloads.files[0]!.blob.text(), FILE_PASS)).header.metaAddress).toBe(pub.metaAddress);
    // An export is not a keystore backup: the vault already made these keys backed up, and nothing else changed.
    expect(getSessionBackup()).toMatchObject({ backedUp: true, verified: true });
  });

  it('loading master keys over unsaved keys asks first, like unlocking a vault', async () => {
    const before = generateSession();
    const user = await open();
    const panel = screen.getByTestId('stealth-export-open');
    await user.upload(within(panel).getByLabelText('Recovery file'), new File([VECTORS.files.master.text], 'm.json', { type: 'application/json' }));
    await user.type(await within(panel).findByLabelText('Export file passphrase'), VECTOR_PASS);
    await user.click(within(panel).getByRole('button', { name: 'Open export' }));
    await user.click(await within(panel).findByRole('button', { name: 'Load these spending and viewing keys' }, { timeout: 30_000 }));
    expect(await within(panel).findByText('The keys loaded now have no verified backup')).toBeTruthy();
    expect(getSessionPublic()).toBe(before);
    await user.click(within(panel).getByRole('button', { name: 'Replace the loaded keys' }));
    expect(getSessionPublic()?.metaAddress).toBe(VECTORS.seller.metaAddress);
    expect(await screen.findByText(VECTORS.seller.metaAddress)).toBeTruthy();
  });

  it('requires fresh consent before master keys replace keys whose saved vault still holds them', async () => {
    const before = generateSession();
    await saveEncryptedVault(VAULT_PASS, { N: TEST_N });
    const user = await open();
    const panel = screen.getByTestId('stealth-export-open');
    await user.upload(within(panel).getByLabelText('Recovery file'), new File([VECTORS.files.master.text], 'm.json', { type: 'application/json' }));
    await user.type(await within(panel).findByLabelText('Export file passphrase'), VECTOR_PASS);
    await user.click(within(panel).getByRole('button', { name: 'Open export' }));
    await user.click(await within(panel).findByRole('button', { name: 'Load these spending and viewing keys' }, { timeout: 30_000 }));
    const confirmation = await within(panel).findByRole('group', { name: 'Replace the currently loaded keys?' });
    expect(getSessionPublic()).toBe(before);
    expect(screen.queryByText('The keys loaded now have no verified backup')).toBeNull();
    await user.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(getSessionPublic()).toBe(before);
    expect(within(panel).queryByRole('group', { name: 'Replace the currently loaded keys?' })).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'Load these spending and viewing keys' }));
    const freshConfirmation = await within(panel).findByRole('group', { name: 'Replace the currently loaded keys?' });
    expect(getSessionPublic()).toBe(before);
    await user.click(within(freshConfirmation).getByRole('button', { name: 'Replace the loaded keys' }));
    await waitFor(() => { expect(getSessionPublic()?.metaAddress).toBe(VECTORS.seller.metaAddress); });
    expect(screen.queryByText('The keys loaded now have no verified backup')).toBeNull();
  });
});
