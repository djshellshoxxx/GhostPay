// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import * as exportModule from '../lib/paymentKeyExport';
import { TEST_N, VECTORS, VECTOR_PASS, captureDownloads } from '../lib/paymentKeyExport.testutil';
import { clearSession, generateSession, getSessionBackup, getSessionPublic } from '../lib/session';
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
  it('offers recovery in a fresh session with no keys, and the master backup only once keys are loaded', async () => {
    const user = await open();
    expect(screen.getByRole('heading', { name: 'Open a stealth key export' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Master stealth key backup (encrypted)' })).toBeNull();
    const panel = screen.getByTestId('stealth-export-open');
    await user.upload(within(panel).getByLabelText('Stealth key export file'), new File([VECTORS.files.single.text], 'k.json', { type: 'application/json' }));
    await user.type(within(panel).getByLabelText('Export file passphrase'), VECTOR_PASS);
    await user.click(within(panel).getByRole('button', { name: 'Open export' }));
    expect(await within(panel).findByText(/1 payment key on Ethereum Sepolia/, {}, { timeout: 30_000 })).toBeTruthy();
    expect(getSessionPublic()).toBeUndefined();
    expect(downloads.files).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    expect(await screen.findByRole('heading', { name: 'Master stealth key backup (encrypted)' })).toBeTruthy();
    // A key change wipes what the recovery panel had opened.
    expect(within(panel).queryByText(/1 payment key on Ethereum Sepolia/)).toBeNull();
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
    await user.upload(within(panel).getByLabelText('Stealth key export file'), new File([VECTORS.files.master.text], 'm.json', { type: 'application/json' }));
    await user.type(within(panel).getByLabelText('Export file passphrase'), VECTOR_PASS);
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
    await user.upload(within(panel).getByLabelText('Stealth key export file'), new File([VECTORS.files.master.text], 'm.json', { type: 'application/json' }));
    await user.type(within(panel).getByLabelText('Export file passphrase'), VECTOR_PASS);
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
