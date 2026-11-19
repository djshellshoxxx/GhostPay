// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import * as exportModule from '../lib/paymentKeyExport';
import { TEST_N, VECTORS, VECTOR_CHAIN, captureDownloads, codeRpc, loadVectorSeller, vectorAnnouncement, vectorMatch } from '../lib/paymentKeyExport.testutil';
import { clearSession } from '../lib/session';
import { decryptPaymentKeys } from '../lib/stealthExport';
import { StealthExportArchive } from './StealthExportArchive';
import { StealthExportPayment } from './StealthExportPayment';

const VAULT_PASS = 'violet comet maple lantern';
const FILE_PASS = 'orbit-lantern-cobalt-meadow-violet';
const A1 = vectorAnnouncement('a1');
const PRIVATE_HEX = A1.expected.privateKey.slice(2);

let downloads: ReturnType<typeof captureDownloads>;
let announce: ReturnType<typeof vi.fn<(message: string) => void>>;

/** The page's exports at scrypt N=2^14 instead of the production 2^17; checks and encryption are otherwise the real ones. */
function cheapExports(): void {
  const encrypted = exportModule.exportEncryptedPayment;
  vi.spyOn(exportModule, 'exportEncryptedPayment').mockImplementation((m, c, p, o) => encrypted(m, c, p, { ...o, N: TEST_N }));
  const archive = exportModule.exportPaymentArchive;
  vi.spyOn(exportModule, 'exportPaymentArchive').mockImplementation((m, s, c, p, o) => archive(m, s, c, p, { ...o, N: TEST_N }));
}

beforeEach(async () => {
  clearSession();
  const store = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(store);
  loadVectorSeller();
  await saveEncryptedVault(VAULT_PASS, { N: TEST_N }, store);
  downloads = captureDownloads();
  announce = vi.fn<(message: string) => void>();
  cheapExports();
});

afterEach(() => {
  cleanup();
  downloads.restore();
  setKeyVaultStoreForTests(undefined);
  vi.restoreAllMocks();
  clearSession();
});

function renderPanel(rpc = codeRpc()): { user: ReturnType<typeof userEvent.setup>; rerender: (chainId: number) => void } {
  const user = userEvent.setup();
  const view = render(<StealthExportPayment match={vectorMatch('a1')} chainId={VECTOR_CHAIN} rpc={rpc} announce={announce} />);
  return { user, rerender: (chainId) => { view.rerender(<StealthExportPayment match={vectorMatch('a1')} chainId={chainId} rpc={rpc} announce={announce} />); } };
}

async function openPanel(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Payment details' }));
}

const passwordValues = (): string[] => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'), (i) => i.value);

describe('Payment details (spec 18 flow 1)', () => {
  it('derives, downloads and reveals nothing until asked, and labels ownership apart from payment status', async () => {
    const rpc = codeRpc();
    const { user } = renderPanel(rpc);
    expect(downloads.files).toEqual([]);
    expect(screen.getByRole('button', { name: 'Payment details' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Your keys control this address/)).toBeNull();
    await openPanel(user);
    expect(screen.getByRole('button', { name: 'Payment details' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Your keys control this address. This is not payment confirmation or finality.')).toBeTruthy();
    expect(screen.getByText('Ethereum Sepolia (chain ID 11155111)')).toBeTruthy();
    expect(screen.getByText(A1.announcement.stealthAddress)).toBeTruthy();
    expect(screen.getByText(/including any future deposits to it/)).toBeTruthy();
    expect(screen.getByText(/Secret exports check this payment address for contract code through the RPC used by this scan/).textContent).toContain('That provider can associate the address, the request time and your connecting IP.');
    expect(rpc.calls).toEqual([]);
    expect(downloads.files).toEqual([]);
    expect(document.body.textContent).not.toContain(PRIVATE_HEX);
  });

  it('downloads the public record without re-authentication or any request', async () => {
    const rpc = codeRpc();
    const { user } = renderPanel(rpc);
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Download public record' }));
    expect(downloads.files.map((f) => f.filename)).toEqual(['ghostpay-stealth-public.json']);
    const text = await downloads.files[0]!.blob.text();
    expect(JSON.parse(text)).toMatchObject({ format: 'ghostpay-stealth-public-v1', stealthAddress: A1.announcement.stealthAddress });
    expect(text).not.toContain(PRIVATE_HEX);
    expect(rpc.calls).toEqual([]);
    expect(announce).toHaveBeenCalledWith('Public record downloaded.');
  });

  it('exports the encrypted keypair after the vault step-up and the address check, then clears every passphrase', async () => {
    const rpc = codeRpc();
    const { user } = renderPanel(rpc);
    await openPanel(user);
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Download encrypted keypair' });
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    expect(screen.getByText(/Passphrase strength: /)).toBeTruthy();
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(submit);
    await waitFor(() => { expect(downloads.files).toHaveLength(1); }, { timeout: 30_000 });
    expect(downloads.files[0]?.filename).toBe('ghostpay-stealth-keypair.json');
    expect(rpc.calls).toEqual([{ method: 'eth_getCode', params: [A1.announcement.stealthAddress, 'latest'] }]);
    const opened = await decryptPaymentKeys(await downloads.files[0]!.blob.text(), FILE_PASS);
    expect(Buffer.from(opened.payments[0]!.secret).toString('hex')).toBe(PRIVATE_HEX);
    expect(screen.getByText('Encrypted keypair downloaded.')).toBeTruthy();
    expect(passwordValues().every((v) => v === '')).toBe(true);
  });

  it('refuses a mismatched new passphrase and a weak one before any work', async () => {
    const rpc = codeRpc();
    const { user } = renderPanel(rpc);
    await openPanel(user);
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), 'short');
    await user.click(screen.getByRole('button', { name: 'Download encrypted keypair' }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least 14/);
    await user.click(screen.getByRole('button', { name: 'Suggest a passphrase' }));
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), 'something else entirely');
    await user.click(screen.getByRole('button', { name: 'Download encrypted keypair' }));
    expect(screen.getByRole('alert').textContent).toMatch(/The two passphrases differ/);
    expect(rpc.calls).toEqual([]);
    expect(downloads.files).toEqual([]);
  });

  it('a wrong vault passphrase or a contract address refuses, clears the passphrases and downloads nothing', async () => {
    const rpc = codeRpc(VECTOR_CHAIN, () => '0xef0100aabbccddeeff00112233445566778899aabbcc');
    const { user } = renderPanel(rpc);
    await openPanel(user);
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), 'not the vault passphrase');
    await user.click(screen.getByRole('button', { name: 'Prepare the private key download' }));
    await user.click(screen.getByRole('button', { name: 'Download the private key' }));
    expect((await screen.findByRole('alert', {}, { timeout: 30_000 })).textContent).toMatch(/Wrong passphrase/);
    expect(passwordValues().every((v) => v === '')).toBe(true);
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.click(screen.getByRole('button', { name: 'Prepare the private key download' }));
    await user.click(screen.getByRole('button', { name: 'Download the private key' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/contract code/); }, { timeout: 30_000 });
    expect(downloads.files).toEqual([]);
  });

  it('the raw key needs the second confirmation, is downloaded only and never shown', async () => {
    const rpc = codeRpc();
    const { user } = renderPanel(rpc);
    await openPanel(user);
    expect(screen.queryByRole('button', { name: 'Download the private key' })).toBeNull();
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.click(screen.getByRole('button', { name: 'Prepare the private key download' }));
    const group = screen.getByRole('group', { name: 'Download a plain-text private key?' });
    expect(document.activeElement).toBe(group);
    expect(within(group).getByText(/not a seed or recovery phrase/)).toBeTruthy();
    expect(downloads.files).toEqual([]);
    expect(rpc.calls).toEqual([]);
    await user.click(within(group).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Download a plain-text private key?' })).toBeNull();
    expect(passwordValues().every((v) => v === '')).toBe(true);
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.click(screen.getByRole('button', { name: 'Prepare the private key download' }));
    await user.click(screen.getByRole('button', { name: 'Download the private key' }));
    await waitFor(() => { expect(downloads.files).toHaveLength(1); }, { timeout: 30_000 });
    expect(downloads.files[0]?.filename).toBe('ghostpay-stealth-private-key.txt');
    expect(await downloads.files[0]!.blob.text()).toBe(VECTORS.files.rawPrivateKey.text);
    expect(document.body.textContent).not.toContain(PRIVATE_HEX);
    expect(screen.getByText(/Private key file downloaded/)).toBeTruthy();
  });

  it('a blocked download reports it, re-enables the form and clears the passphrases', async () => {
    const { user } = renderPanel();
    await openPanel(user);
    downloads.restore();
    URL.createObjectURL = (): string => 'blob:blocked';
    URL.revokeObjectURL = (): void => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('download blocked'); });
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(screen.getByRole('button', { name: 'Download encrypted keypair' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/did not start the download/); }, { timeout: 30_000 });
    expect(passwordValues().every((v) => v === '')).toBe(true);
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download encrypted keypair' }).disabled).toBe(false);
    expect(announce).not.toHaveBeenCalled();
  });

  it('the idle lock, a chain switch and closing the panel cancel a running export: nothing is downloaded', async () => {
    let release: (code: string) => void = () => undefined;
    const rpc = { ...codeRpc(), request: (): Promise<unknown> => new Promise((resolve) => { release = resolve; }) };
    const { user, rerender } = renderPanel(rpc);
    const start = async (): Promise<void> => {
      await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
      await user.click(screen.getByRole('button', { name: 'Prepare the private key download' }));
      await user.click(screen.getByRole('button', { name: 'Download the private key' }));
      await waitFor(() => { expect(screen.getByText(/Checking and encrypting/)).toBeTruthy(); });
      // Wait until the export reached the address check (after the step-up KDF).
      await waitFor(() => { expect(release).not.toBe(undefined); }, { timeout: 30_000 });
    };
    await openPanel(user);

    release = undefined as unknown as typeof release;
    await start();
    await waitFor(() => { expect(typeof release).toBe('function'); }, { timeout: 30_000 });
    act(() => { notifyAppLock('idle'); });
    release('0x');
    await new Promise((r) => setTimeout(r, 50));
    expect(downloads.files).toEqual([]);
    expect(passwordValues().every((v) => v === '')).toBe(true);
    expect(screen.queryByRole('group', { name: 'Download a plain-text private key?' })).toBeNull();

    release = undefined as unknown as typeof release;
    await start();
    await waitFor(() => { expect(typeof release).toBe('function'); }, { timeout: 30_000 });
    rerender(84532);
    release('0x');
    await new Promise((r) => setTimeout(r, 50));
    expect(downloads.files).toEqual([]);

    rerender(VECTOR_CHAIN);
    release = undefined as unknown as typeof release;
    await start();
    await waitFor(() => { expect(typeof release).toBe('function'); }, { timeout: 30_000 });
    await user.click(screen.getByRole('button', { name: 'Payment details' }));
    release('0x');
    await new Promise((r) => setTimeout(r, 50));
    expect(downloads.files).toEqual([]);
    expect(screen.queryByText(/Your keys control this address/)).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('a key change during an export cancels it and clears the fields', async () => {
    let release: (code: string) => void = () => undefined;
    let reached = false;
    const rpc = { ...codeRpc(), request: (): Promise<unknown> => { reached = true; return new Promise((resolve) => { release = resolve; }); } };
    const { user } = renderPanel(rpc);
    await openPanel(user);
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(screen.getByRole('button', { name: 'Download encrypted keypair' }));
    await waitFor(() => { expect(reached).toBe(true); }, { timeout: 30_000 });
    act(() => { clearSession(); });
    release('0x');
    await new Promise((r) => setTimeout(r, 50));
    expect(downloads.files).toEqual([]);
    expect(passwordValues().every((v) => v === '')).toBe(true);
  });
});

describe('Export all payment keys (spec 18 flow 2)', () => {
  it('shows the distinct count and chain before confirming and exports one encrypted archive', async () => {
    const user = userEvent.setup();
    const rpc = codeRpc();
    const matches = [vectorMatch('a1'), vectorMatch('a1', { id: 'replay', logIndex: 9 }), vectorMatch('a2')];
    render(<StealthExportArchive matches={matches} chainId={VECTOR_CHAIN} rpc={rpc} announce={announce} />);
    expect(screen.queryByTestId('payment-keys-archive-summary')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Export all payment keys (encrypted)' }));
    expect(screen.getByTestId('payment-keys-archive-summary').textContent).toBe('2 payment keys found on Ethereum Sepolia (chain ID 11155111), scope: all discovered payments.');
    const disclosure = screen.getByText(/Master keys are not included/);
    expect(disclosure.textContent).toContain('The authenticated public header stays readable without the passphrase');
    expect(disclosure.textContent).toContain('linking all archive entries');
    expect(downloads.files).toEqual([]);
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(screen.getByRole('button', { name: 'Download encrypted archive' }));
    await waitFor(() => { expect(downloads.files).toHaveLength(1); }, { timeout: 30_000 });
    expect(downloads.files[0]?.filename).toBe('ghostpay-stealth-keypairs.json');
    const opened = await decryptPaymentKeys(await downloads.files[0]!.blob.text(), FILE_PASS);
    expect(opened.header).toMatchObject({ scope: 'all-discovered', count: 2, chainId: VECTOR_CHAIN });
    expect(rpc.calls).toHaveLength(2);
    expect(passwordValues().every((v) => v === '')).toBe(true);
    expect(announce).toHaveBeenCalledWith('Encrypted payment key archive downloaded.');
  });

  it('shows a conflict instead of a form, closes on a chain switch and accepts a keystore file as the credential', async () => {
    const user = userEvent.setup();
    const conflict = [vectorMatch('a1'), vectorMatch('a1', { ephemeralPublicKey: vectorAnnouncement('a2').announcement.ephemeralPublicKey, id: 'x' })];
    const view = render(<StealthExportArchive matches={conflict} chainId={VECTOR_CHAIN} rpc={codeRpc()} announce={announce} />);
    await user.click(screen.getByRole('button', { name: 'Export all payment keys (encrypted)' }));
    expect(screen.getByRole('alert').textContent).toMatch(/different announcement keys/);
    expect(screen.queryByRole('button', { name: 'Download encrypted archive' })).toBeNull();
    view.rerender(<StealthExportArchive matches={[vectorMatch('a1')]} chainId={84532} rpc={codeRpc()} announce={announce} />);
    expect(screen.getByRole('button', { name: 'Export all payment keys (encrypted)' }).getAttribute('aria-expanded')).toBe('false');
    view.rerender(<StealthExportArchive matches={[vectorMatch('a1')]} chainId={VECTOR_CHAIN} rpc={codeRpc()} announce={announce} />);
    await user.click(screen.getByRole('button', { name: 'Export all payment keys (encrypted)' }));
    await user.click(screen.getByLabelText('Use my keystore backup file'));
    const keystore = await (await import('../lib/session')).exportKeystore(VAULT_PASS, { N: TEST_N });
    await user.upload(screen.getByLabelText('Keystore backup file of the loaded keys'), new File([keystore], 'my-backup.json', { type: 'application/json' }));
    expect(screen.getByText('my-backup.json')).toBeTruthy();
    await user.type(screen.getByLabelText('Passphrase of the keystore backup file'), VAULT_PASS);
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(screen.getByRole('button', { name: 'Download encrypted archive' }));
    await waitFor(() => { expect(downloads.files).toHaveLength(1); }, { timeout: 30_000 });
  });

  it('refuses a keystore credential without a file, and says when there is nothing to export', async () => {
    const user = userEvent.setup();
    const view = render(<StealthExportArchive matches={[vectorMatch('a1')]} chainId={VECTOR_CHAIN} rpc={codeRpc()} announce={announce} />);
    await user.click(screen.getByRole('button', { name: 'Export all payment keys (encrypted)' }));
    await user.click(screen.getByLabelText('Use my keystore backup file'));
    await user.type(screen.getByLabelText('Passphrase of the keystore backup file'), VAULT_PASS);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download encrypted archive' }).disabled).toBe(true);
    await user.click(screen.getByLabelText('Use the encrypted vault in this browser'));
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase of your encrypted vault').value).toBe('');
    view.rerender(<StealthExportArchive matches={[]} chainId={VECTOR_CHAIN} rpc={codeRpc()} announce={announce} />);
    expect(screen.getByRole('alert').textContent).toMatch(/no payments to export/);
  });
});
