// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import * as exportModule from '../lib/paymentKeyExport';
import type { OpenedStealthExport } from '../lib/paymentKeyExport';
import { TEST_N, VECTORS, VECTOR_PASS, captureDownloads, loadVectorSeller, vectorAnnouncement } from '../lib/paymentKeyExport.testutil';
import { clearSession, exportKeystore, generateSession, getSessionBackup, getSessionPublic, importSession } from '../lib/session';
import { decryptMasterBackup } from '../lib/stealthExport';
import { StealthExportMaster } from './StealthExportMaster';
import { StealthExportRecovery } from './StealthExportRecovery';

const FILE_PASS = 'orbit-lantern-cobalt-meadow-violet';
const A1 = vectorAnnouncement('a1');

let downloads: ReturnType<typeof captureDownloads>;
let announce: ReturnType<typeof vi.fn<(message: string) => void>>;

beforeEach(() => {
  clearSession();
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
  downloads = captureDownloads();
  announce = vi.fn<(message: string) => void>();
});

afterEach(() => {
  cleanup();
  downloads.restore();
  setKeyVaultStoreForTests(undefined);
  vi.restoreAllMocks();
  clearSession();
});

const asFile = (text: string, name = 'export.json'): File => new File([text], name, { type: 'application/json' });
const passwordValues = (): string[] => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'), (i) => i.value);

async function openFile(user: ReturnType<typeof userEvent.setup>, text: string, passphrase: string): Promise<void> {
  await user.upload(screen.getByLabelText('Stealth key export file'), asFile(text));
  if (passphrase !== '') await user.type(screen.getByLabelText('Export file passphrase'), passphrase);
  await user.click(screen.getByRole('button', { name: 'Open export' }));
}

describe('Open a stealth key export (spec 18 flow 4)', () => {
  it('lists verified payment keys in a fresh session with no keys, and downloads one raw key only after a second confirmation', async () => {
    const user = userEvent.setup();
    render(<StealthExportRecovery announce={announce} />);
    expect(getSessionPublic()).toBeUndefined();
    await openFile(user, VECTORS.files.archive.text, VECTOR_PASS);
    const list = await screen.findByTestId('stealth-export-open-keypair', {}, { timeout: 30_000 });
    expect(within(list).getByText('3 payment keys on Ethereum Sepolia (chain ID 11155111), scope: selected payments. Every key was checked against its address.')).toBeTruthy();
    for (const id of VECTORS.files.archive.announcements) expect(within(list).getByText(vectorAnnouncement(id as 'a1').announcement.stealthAddress)).toBeTruthy();
    expect(within(list).queryByText(vectorAnnouncement('a3').announcement.stealthAddress)).toBeNull();
    expect(passwordValues().every((v) => v === '')).toBe(true);
    expect(downloads.files).toEqual([]);
    await user.click(within(list).getByRole('button', { name: `Download private key for ${A1.announcement.stealthAddress}` }));
    const group = within(list).getByRole('group', { name: 'Download a plain-text private key?' });
    expect(document.activeElement).toBe(group);
    expect(downloads.files).toEqual([]);
    await user.click(within(group).getByRole('button', { name: 'Cancel' }));
    expect(downloads.files).toEqual([]);
    await user.click(within(list).getByRole('button', { name: `Download private key for ${A1.announcement.stealthAddress}` }));
    await user.click(within(list).getByRole('button', { name: 'Download the private key' }));
    expect(downloads.files.map((f) => f.filename)).toEqual(['ghostpay-stealth-private-key.txt']);
    expect(await downloads.files[0]!.blob.text()).toBe(VECTORS.files.rawPrivateKey.text);
    expect(document.body.textContent).not.toContain(A1.expected.privateKey.slice(2));
    expect(announce).toHaveBeenCalledWith('Private key file generated; download initiated. Confirm that you saved it. Keep it offline and delete it when you no longer need it.');
    await user.click(screen.getByRole('button', { name: 'Close the export and wipe its keys' }));
    expect(screen.queryByTestId('stealth-export-open-keypair')).toBeNull();
  });

  it('refuses a wrong passphrase and a foreign file atomically and clears the passphrase', async () => {
    const user = userEvent.setup();
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.single.text, 'not the export passphrase');
    expect((await screen.findByRole('alert', {}, { timeout: 30_000 })).textContent).toMatch(/Wrong passphrase, or the export file was modified/);
    expect(passwordValues().every((v) => v === '')).toBe(true);
    expect(screen.queryByTestId('stealth-export-open-keypair')).toBeNull();
    await openFile(user, '{"not":"an export"}', 'whatever passphrase');
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/not a valid GhostPay stealth key export/); });
    await user.upload(screen.getByLabelText('Stealth key export file'), asFile(' '.repeat(1_048_577), 'big.json'));
    await user.click(screen.getByRole('button', { name: 'Open export' }));
    expect(screen.getByRole('alert').textContent).toMatch(/larger than the stealth key export limit/);
  });

  it.each(['Open export', 'Check export without importing'] as const)('rejects actual UTF-8 BOM bytes before %s can certify a normalized file', async (action) => {
    const user = userEvent.setup();
    generateSession();
    const before = getSessionPublic();
    const custody = getSessionBackup();
    const original = VECTORS.files.master.text;
    const file = new File([new Uint8Array([0xef, 0xbb, 0xbf]), original], 'bom-backup.json', { type: 'application/json' });
    // The real File decoder removes the BOM. The raw file still violates the portable format's ASCII byte contract.
    expect(file.size).toBe(original.length + 3);
    expect(await file.text()).toBe(original);
    render(<StealthExportRecovery announce={announce} />);
    await user.upload(screen.getByLabelText('Stealth key export file'), file);
    await user.type(screen.getByLabelText('Export file passphrase'), VECTOR_PASS);
    await user.click(screen.getByRole('button', { name: action }));
    await waitFor(() => {
      const finished = screen.queryByRole('alert') !== null || screen.queryByTestId('stealth-export-open-master') !== null || screen.queryByTestId('stealth-export-verified') !== null;
      expect(finished).toBe(true);
    }, { timeout: 30_000 });
    expect(screen.queryByRole('alert')?.textContent ?? '').toMatch(/not a valid GhostPay stealth key export/);
    expect(screen.queryByTestId('stealth-export-open-master')).toBeNull();
    expect(screen.queryByTestId('stealth-export-verified')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load these spending and viewing keys' })).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    expect(getSessionPublic()).toBe(before);
    expect(getSessionBackup()).toEqual(custody);
    expect(passwordValues().every((value) => value === '')).toBe(true);
    expect(downloads.files).toEqual([]);
  });

  it('shows a public record as unauthenticated and holding no key', async () => {
    const user = userEvent.setup();
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.public.text, '');
    expect(await screen.findByText(/holds no key and proves no ownership/)).toBeTruthy();
    expect(screen.getByText(A1.announcement.stealthAddress)).toBeTruthy();
  });

  it('loads master keys through the hex-import path with a generated signing key', async () => {
    const user = userEvent.setup();
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    const master = await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    expect(within(master).getByText(VECTORS.seller.metaAddress)).toBeTruthy();
    await user.click(within(master).getByRole('button', { name: 'Load these spending and viewing keys' }));
    expect(getSessionPublic()?.metaAddress).toBe(VECTORS.seller.metaAddress);
    expect(getSessionBackup()).toMatchObject({ signerOnly: true });
    expect(screen.getByText(/loaded from the master backup, with a new invoice-signing key/)).toBeTruthy();
    expect(screen.queryByTestId('stealth-export-open-master')).toBeNull();
  });

  it('asks before master keys replace loaded keys that have no backup, and says when they are loaded already', async () => {
    const user = userEvent.setup();
    generateSession();
    const before = getSessionPublic();
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    const master = await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    await user.click(within(master).getByRole('button', { name: 'Load these spending and viewing keys' }));
    expect(await within(master).findByText('The keys loaded now have no verified backup')).toBeTruthy();
    expect(getSessionPublic()).toBe(before);
    await user.click(within(master).getByRole('button', { name: 'Cancel' }));
    expect(getSessionPublic()).toBe(before);
    await user.click(within(master).getByRole('button', { name: 'Load these spending and viewing keys' }));
    await user.click(await within(master).findByRole('button', { name: 'Replace the loaded keys' }));
    expect(getSessionPublic()?.metaAddress).toBe(VECTORS.seller.metaAddress);

    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    const again = await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    expect(within(again).getByText('These spending and viewing keys are already loaded.')).toBeTruthy();
    expect(within(again).queryByRole('button', { name: 'Load these spending and viewing keys' })).toBeNull();
  });

  it('requires fresh confirmation even when the loaded keys have a proven copy, and a key change closes the export', async () => {
    const user = userEvent.setup();
    // An existing recoverable copy changes the warning, never the requirement for replacement consent.
    importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    const before = getSessionPublic();
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    const master = await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    await user.click(within(master).getByRole('button', { name: 'Load these spending and viewing keys' }));
    expect(await within(master).findByText('Replace the currently loaded keys?')).toBeTruthy();
    expect(document.activeElement).toBe(within(master).getByRole('group', { name: 'Replace the currently loaded keys?' }));
    expect(getSessionPublic()).toBe(before);
    await user.click(within(master).getByRole('button', { name: 'Cancel' }));
    expect(getSessionPublic()).toBe(before);
    await user.click(within(master).getByRole('button', { name: 'Load these spending and viewing keys' }));
    await user.click(await within(master).findByRole('button', { name: 'Replace the loaded keys' }));
    expect(getSessionPublic()?.metaAddress).toBe(VECTORS.seller.metaAddress);
    expect(screen.queryByText('The keys loaded now have no verified backup')).toBeNull();

    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    act(() => { clearSession(); });
    expect(screen.queryByTestId('stealth-export-open-master')).toBeNull();
  });

  it('does not apply a cancelled master-load request to an export opened later', async () => {
    const user = userEvent.setup();
    const store = new MemoryKeyVaultStore();
    setKeyVaultStoreForTests(store);
    generateSession();
    await saveEncryptedVault(FILE_PASS, { N: TEST_N }, store);
    const saved = await store.get();
    const before = getSessionPublic();
    let resolveRead: (record: string | undefined) => void = () => undefined;
    const read = vi.spyOn(store, 'get').mockImplementationOnce(() =>
      new Promise<string | undefined>((resolve) => { resolveRead = resolve; }));
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    const first = await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    await user.click(within(first).getByRole('button', { name: 'Load these spending and viewing keys' }));
    expect(read).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Close the export and wipe its keys' }));
    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    await act(async () => { resolveRead(saved); await Promise.resolve(); });

    expect(getSessionPublic()).toBe(before);
    const reopened = screen.getByTestId('stealth-export-open-master');
    expect(screen.queryByText(/loaded from the master backup, with a new invoice-signing key/)).toBeNull();
    await user.click(within(reopened).getByRole('button', { name: 'Load these spending and viewing keys' }));
    expect(await within(reopened).findByText('Replace the currently loaded keys?')).toBeTruthy();
    expect(getSessionPublic()).toBe(before);
    await user.click(within(reopened).getByRole('button', { name: 'Replace the loaded keys' }));
    await waitFor(() => { expect(getSessionPublic()?.metaAddress).toBe(VECTORS.seller.metaAddress); });
  });

  it('requires the sole-copy warning again when another tab deletes the vault after replacement review', async () => {
    const user = userEvent.setup();
    const store = new MemoryKeyVaultStore();
    setKeyVaultStoreForTests(store);
    generateSession();
    await saveEncryptedVault(FILE_PASS, { N: TEST_N }, store);
    const saved = await store.get();
    if (saved === undefined) throw new Error('fixture vault missing');
    const before = getSessionPublic();
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    const master = await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    await user.click(within(master).getByRole('button', { name: 'Load these spending and viewing keys' }));
    expect(await within(master).findByText('Replace the currently loaded keys?')).toBeTruthy();
    await store.delete(saved);
    await user.click(within(master).getByRole('button', { name: 'Replace the loaded keys' }));
    expect(await within(master).findByText('The keys loaded now have no verified backup')).toBeTruthy();
    expect(getSessionPublic()).toBe(before);
    await user.click(within(master).getByRole('button', { name: 'Replace the loaded keys' }));
    expect(getSessionPublic()?.metaAddress).toBe(VECTORS.seller.metaAddress);
  });

  it('does not show a stale replacement confirmation on a later export', async () => {
    const user = userEvent.setup();
    const store = new MemoryKeyVaultStore();
    setKeyVaultStoreForTests(store);
    generateSession();
    await saveEncryptedVault(FILE_PASS, { N: TEST_N }, store);
    const before = getSessionPublic();
    let resolveRead: (record: string | undefined) => void = () => undefined;
    const read = vi.spyOn(store, 'get').mockImplementationOnce(() =>
      new Promise<string | undefined>((resolve) => { resolveRead = resolve; }));
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    const first = await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    await user.click(within(first).getByRole('button', { name: 'Load these spending and viewing keys' }));
    expect(read).toHaveBeenCalledTimes(1);
    act(() => { notifyAppLock('idle'); });

    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    await act(async () => { resolveRead(undefined); await Promise.resolve(); });

    expect(getSessionPublic()).toBe(before);
    expect(screen.queryByText('The keys loaded now have no verified backup')).toBeNull();
    expect(screen.getByRole('button', { name: 'Load these spending and viewing keys' }).hasAttribute('disabled')).toBe(false);
  });

  it('the idle lock wipes opened keys and a cancelled open shows nothing', async () => {
    const user = userEvent.setup();
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.archive.text, VECTOR_PASS);
    await screen.findByTestId('stealth-export-open-keypair', {}, { timeout: 30_000 });
    act(() => { notifyAppLock('idle'); });
    expect(screen.queryByTestId('stealth-export-open-keypair')).toBeNull();

    // The component itself must discard and wipe a result that arrives after its operation was cancelled.
    let release: () => void = () => undefined;
    let reached = false;
    let late: OpenedStealthExport | undefined;
    const actual = exportModule.openStealthExport;
    vi.spyOn(exportModule, 'openStealthExport').mockImplementation(async (text, pass) => {
      const opened = await actual(text, pass);
      late = opened;
      await new Promise<void>((resolve) => { release = resolve; reached = true; });
      return opened;
    });
    await openFile(user, VECTORS.files.archive.text, VECTOR_PASS);
    await waitFor(() => { expect(reached).toBe(true); }, { timeout: 30_000 });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    release();
    await waitFor(() => { expect(late?.kind === 'keypair' && late.keys.disposed).toBe(true); }, { timeout: 30_000 });
    expect(screen.queryByTestId('stealth-export-open-keypair')).toBeNull();
  });
});

describe('verify an existing backup without importing', () => {
  it('verifies an archive without holding raw keys or changing the loaded wallet', async () => {
    const user = userEvent.setup();
    generateSession();
    const before = getSessionPublic();
    const custody = getSessionBackup();
    const disposed = vi.spyOn(exportModule.RecoveredPaymentKeys.prototype, 'dispose');
    render(<StealthExportRecovery announce={announce} />);
    await user.upload(screen.getByLabelText('Stealth key export file'), asFile(VECTORS.files.archive.text));
    await user.type(screen.getByLabelText('Export file passphrase'), VECTOR_PASS);
    await user.click(screen.getByRole('button', { name: 'Check export without importing' }));
    const verified = await screen.findByTestId('stealth-export-verified', {}, { timeout: 30_000 });
    expect(within(verified).getByText(A1.announcement.stealthAddress)).toBeTruthy();
    expect(screen.getByText(/Backup verified\. It decrypted successfully/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Download private key for/ })).toBeNull();
    expect(screen.queryByTestId('stealth-export-open-keypair')).toBeNull();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(disposed.mock.instances[0]).toHaveProperty('disposed', true);
    expect(getSessionPublic()).toBe(before);
    expect(getSessionBackup()).toEqual(custody);
    expect(passwordValues().every((value) => value === '')).toBe(true);
    expect(downloads.files).toEqual([]);
    act(() => { notifyAppLock('idle'); });
    expect(screen.queryByTestId('stealth-export-verified')).toBeNull();
    expect(screen.queryByText(/Backup verified\. It decrypted successfully/)).toBeNull();
  });

  it('verifies master spending authority in an empty session without loading it or claiming a signing-key backup', async () => {
    const user = userEvent.setup();
    render(<StealthExportRecovery announce={announce} />);
    await user.upload(screen.getByLabelText('Stealth key export file'), asFile(VECTORS.files.master.text));
    await user.type(screen.getByLabelText('Export file passphrase'), VECTOR_PASS);
    await user.click(screen.getByRole('button', { name: 'Check export without importing' }));
    const verified = await screen.findByTestId('stealth-export-verified', {}, { timeout: 30_000 });
    expect(within(verified).getByText(VECTORS.seller.metaAddress)).toBeTruthy();
    expect(within(verified).getByText(/does not include the invoice-signing key/)).toBeTruthy();
    expect(getSessionPublic()).toBeUndefined();
    expect(getSessionBackup()).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Load these spending and viewing keys' })).toBeNull();
  });

  it('refuses public records and wrong passwords without marking the selected file verified', async () => {
    const user = userEvent.setup();
    render(<StealthExportRecovery announce={announce} />);
    await user.upload(screen.getByLabelText('Stealth key export file'), asFile(VECTORS.files.public.text));
    await user.click(screen.getByRole('button', { name: 'Check export without importing' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/contains no private keys/);
    expect(screen.queryByTestId('stealth-export-verified')).toBeNull();
    await user.upload(screen.getByLabelText('Stealth key export file'), asFile(VECTORS.files.single.text));
    await user.type(screen.getByLabelText('Export file passphrase'), 'wrong passphrase');
    await user.click(screen.getByRole('button', { name: 'Check export without importing' }));
    expect((await screen.findByRole('alert', {}, { timeout: 30_000 })).textContent).toMatch(/Wrong passphrase/);
    expect(screen.queryByTestId('stealth-export-verified')).toBeNull();
    expect(passwordValues().every((value) => value === '')).toBe(true);
  });

  it('cannot apply a delayed verification to another selected file', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    let reached: () => void = () => undefined;
    const verifying = new Promise<void>((resolve) => { reached = resolve; });
    const actual = exportModule.verifyStealthExport;
    vi.spyOn(exportModule, 'verifyStealthExport').mockImplementation(async (...args) => {
      const result = await actual(...args);
      reached();
      await new Promise<void>((resolve) => { release = resolve; });
      return result;
    });
    render(<StealthExportRecovery announce={announce} />);
    await user.upload(screen.getByLabelText('Stealth key export file'), asFile(VECTORS.files.single.text));
    await user.type(screen.getByLabelText('Export file passphrase'), VECTOR_PASS);
    await user.click(screen.getByRole('button', { name: 'Check export without importing' }));
    await verifying;
    expect(screen.getByLabelText('Export file passphrase').hasAttribute('disabled')).toBe(true);
    await user.upload(screen.getByLabelText('Stealth key export file'), asFile(VECTORS.files.master.text, 'another.json'));
    await act(async () => { release(); await Promise.resolve(); });
    expect(screen.queryByTestId('stealth-export-verified')).toBeNull();
    expect(screen.queryByText(/Backup verified\. It decrypted successfully/)).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    expect(getSessionPublic()).toBeUndefined();
  });
});

describe('Master stealth key backup (spec 18 flow 3)', () => {
  it('exports the spending and viewing keys after re-authentication with a keystore file, never the signing key', async () => {
    const user = userEvent.setup();
    loadVectorSeller();
    const keystore = await exportKeystore(FILE_PASS, { N: TEST_N });
    const actual = exportModule.exportMasterBackup;
    vi.spyOn(exportModule, 'exportMasterBackup').mockImplementation((c, p, o) => actual(c, p, { ...o, N: TEST_N }));
    render(<StealthExportMaster announce={announce} />);
    expect(screen.getByText(/A generic wallet cannot use them directly/)).toBeTruthy();
    await user.click(screen.getByLabelText('Use my keystore backup file'));
    await user.upload(screen.getByLabelText('Keystore backup file of the loaded keys'), asFile(keystore, 'backup.json'));
    await user.type(screen.getByLabelText('Passphrase of the keystore backup file'), FILE_PASS);
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(screen.getByRole('button', { name: 'Download master backup' }));
    await waitFor(() => { expect(downloads.files).toHaveLength(1); }, { timeout: 30_000 });
    expect(downloads.files[0]?.filename).toBe('ghostpay-stealth-master.json');
    const text = await downloads.files[0]!.blob.text();
    expect(text).not.toContain('33'.repeat(32));
    const opened = await decryptMasterBackup(text, FILE_PASS);
    expect(opened.header.metaAddress).toBe(VECTORS.seller.metaAddress);
    expect(passwordValues().every((v) => v === '')).toBe(true);
    expect(announce).toHaveBeenCalledWith('Master backup generated; download initiated. Keep and verify the saved file.');
  });

  it('refuses without a vault, clears the passphrases, and cancels on the idle lock', async () => {
    const user = userEvent.setup();
    loadVectorSeller();
    render(<StealthExportMaster announce={announce} />);
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), FILE_PASS);
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), 'different passphrase here');
    await user.click(screen.getByRole('button', { name: 'Download master backup' }));
    expect(screen.getByRole('alert').textContent).toMatch(/The two passphrases differ/);
    await user.clear(screen.getByLabelText('Repeat the export file passphrase'));
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(screen.getByRole('button', { name: 'Download master backup' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/No encrypted vault for the loaded keys/); });
    expect(passwordValues().every((v) => v === '')).toBe(true);
    expect(downloads.files).toEqual([]);

    let release: () => void = () => undefined;
    vi.spyOn(exportModule, 'exportMasterBackup').mockImplementation(() => new Promise((resolve) => { release = () => { resolve({ filename: 'ghostpay-stealth-master.json', text: '{}', type: 'application/json' }); }; }));
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), FILE_PASS);
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(screen.getByRole('button', { name: 'Download master backup' }));
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy(); });
    act(() => { notifyAppLock('idle'); });
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(downloads.files).toEqual([]);
    expect(passwordValues().every((v) => v === '')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
