// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
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
    expect(announce).toHaveBeenCalledWith('Private key file downloaded. Keep it offline and delete it when you no longer need it.');
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

  it('loads master keys over keys that have a proven copy without asking, and a key change closes the export', async () => {
    const user = userEvent.setup();
    // Imported with their signing key: a copy exists outside this tab (L1-01), so no confirmation is needed.
    importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    render(<StealthExportRecovery announce={announce} />);
    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    const master = await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    await user.click(within(master).getByRole('button', { name: 'Load these spending and viewing keys' }));
    expect(getSessionPublic()?.metaAddress).toBe(VECTORS.seller.metaAddress);
    expect(screen.queryByText('The keys loaded now have no verified backup')).toBeNull();

    await openFile(user, VECTORS.files.master.text, VECTOR_PASS);
    await screen.findByTestId('stealth-export-open-master', {}, { timeout: 30_000 });
    act(() => { clearSession(); });
    expect(screen.queryByTestId('stealth-export-open-master')).toBeNull();
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
    expect(announce).toHaveBeenCalledWith('Master backup downloaded.');
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
