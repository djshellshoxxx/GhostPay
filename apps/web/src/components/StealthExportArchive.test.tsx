// @vitest-environment jsdom
// Source: 055d33e0:apps/web/src/components/StealthExportPayment.test.tsx ("Export all payment keys" block). Main's
// StealthExportPayment.test.tsx keeps the single-payment cases.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import * as exportModule from '../lib/paymentKeyExport';
import { TEST_N, VECTOR_CHAIN, captureDownloads, codeRpc, loadVectorSeller, vectorAnnouncement, vectorMatch } from '../lib/paymentKeyExport.testutil';
import { clearSession } from '../lib/session';
import { decryptPaymentKeys } from '../lib/stealthExport';
import { StealthExportArchive } from './StealthExportArchive';

const VAULT_PASS = 'violet comet maple lantern';
const FILE_PASS = 'orbit-lantern-cobalt-meadow-violet';

let downloads: ReturnType<typeof captureDownloads>;
let announce: ReturnType<typeof vi.fn<(message: string) => void>>;

/** The page's exports at scrypt N=2^14 instead of the production 2^17; checks and encryption are otherwise the real ones. */
function cheapExports(): void {
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

const passwordValues = (): string[] => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'), (i) => i.value);

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
    // The RPC sees every exported address in one go: said before any credential is submitted or request made.
    expect(screen.getByText(/That provider can link all of these addresses to each other/)).toBeTruthy();
    expect(rpc.calls).toHaveLength(0);
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
    expect(announce).toHaveBeenCalledWith('Encrypted payment key archive generated; download initiated. Keep and verify the saved file.');
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
    expect(screen.queryByText(/my-backup\.json/)).toBeNull();
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
