// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as exportModule from '../lib/paymentKeyExport';
import type { StealthExportFile } from '../lib/paymentKeyExport';
import { VECTORS, VECTOR_CHAIN, captureDownloads, codeRpc, loadVectorSeller, vectorMatch } from '../lib/paymentKeyExport.testutil';
import { clearSession } from '../lib/session';
import { StealthExportArchive } from './StealthExportArchive';
import { StealthExportPayment } from './StealthExportPayment';

const FILE_PASS = 'orbit-lantern-cobalt-meadow-violet';
const file: StealthExportFile = { filename: 'ghostpay-stealth-keypair.json', text: VECTORS.files.single.text, type: 'application/json' };
let downloads: ReturnType<typeof captureDownloads>;
beforeEach(() => { clearSession(); loadVectorSeller(); downloads = captureDownloads(); });
afterEach(() => { cleanup(); downloads.restore(); vi.restoreAllMocks(); clearSession(); });

function deferred(): { readonly promise: Promise<StealthExportFile>; readonly resolve: (file: StealthExportFile) => void } {
  let resolve!: (file: StealthExportFile) => void;
  const promise = new Promise<StealthExportFile>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fill(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), 'a vault credential');
  await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
  await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
}

describe('export consent and results follow the selected inputs', () => {
  it.each(['payment', 'rpc'] as const)('a changed %s closes raw-key confirmation on the same chain', async (change) => {
    const user = userEvent.setup();
    const rpc = codeRpc(); const match = vectorMatch('a1'); const announce = vi.fn();
    const view = render(<StealthExportPayment match={match} chainId={VECTOR_CHAIN} rpc={rpc} announce={announce} />);
    await user.click(screen.getByRole('button', { name: 'Payment details' }));
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), 'a vault credential');
    await user.click(screen.getByRole('button', { name: 'Prepare the private key download' }));
    expect(screen.getByRole('group', { name: 'Download a plain-text private key?' })).toBeTruthy();
    view.rerender(<StealthExportPayment match={change === 'payment' ? vectorMatch('a2') : match} chainId={VECTOR_CHAIN} rpc={change === 'rpc' ? codeRpc() : rpc} announce={announce} />);
    expect(screen.queryByRole('group', { name: 'Download a plain-text private key?' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase of your encrypted vault').value).toBe('');
    expect(downloads.files).toEqual([]);
  });

  it.each(['payment', 'rpc', 'announcement'] as const)('discards an in-flight encrypted payment after the %s changes', async (change) => {
    const user = userEvent.setup(); const pending = deferred();
    const exportSpy = vi.spyOn(exportModule, 'exportEncryptedPayment').mockReturnValue(pending.promise);
    const rpc = codeRpc(); const match = vectorMatch('a1'); const announce = vi.fn();
    const view = render(<StealthExportPayment match={match} chainId={VECTOR_CHAIN} rpc={rpc} announce={announce} />);
    await user.click(screen.getByRole('button', { name: 'Payment details' }));
    await fill(user); await user.click(screen.getByRole('button', { name: 'Download encrypted keypair' }));
    await waitFor(() => { expect(exportSpy).toHaveBeenCalledOnce(); });
    expect(screen.getByLabelText<HTMLInputElement>('New passphrase for the export file (at least 14 characters)').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Repeat the export file passphrase').disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Suggest a passphrase' }).disabled).toBe(true);
    const replacement = change === 'payment' ? vectorMatch('a2') : change === 'announcement' ? vectorMatch('a1', { metadata: '0x00' }) : match;
    view.rerender(<StealthExportPayment match={replacement} chainId={VECTOR_CHAIN} rpc={change === 'rpc' ? codeRpc() : rpc} announce={announce} />);
    await act(async () => { pending.resolve(file); await pending.promise; });
    expect(downloads.files).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
    expect(screen.queryByTestId('stealth-export-verification')).toBeNull();
  });

  it('new same-chain scan results cancel the old archive before download', async () => {
    const user = userEvent.setup(); const pending = deferred();
    const exportSpy = vi.spyOn(exportModule, 'exportPaymentArchive').mockReturnValue(pending.promise);
    const rpc = codeRpc(); const announce = vi.fn();
    const view = render(<StealthExportArchive matches={[vectorMatch('a1')]} chainId={VECTOR_CHAIN} rpc={rpc} announce={announce} />);
    await user.click(screen.getByRole('button', { name: 'Export all payment keys (encrypted)' }));
    await fill(user); await user.click(screen.getByRole('button', { name: 'Download encrypted archive' }));
    await waitFor(() => { expect(exportSpy).toHaveBeenCalledOnce(); });
    view.rerender(<StealthExportArchive matches={[vectorMatch('a1'), vectorMatch('a2')]} chainId={VECTOR_CHAIN} rpc={rpc} announce={announce} />);
    await act(async () => { pending.resolve(file); await pending.promise; });
    expect(downloads.files).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('an equivalent rerender preserves the export and reveals retention controls only after a download starts', async () => {
    const user = userEvent.setup(); const pending = deferred();
    const exportSpy = vi.spyOn(exportModule, 'exportEncryptedPayment').mockReturnValue(pending.promise);
    const rpc = codeRpc(); const announce = vi.fn();
    const view = render(<StealthExportPayment match={vectorMatch('a1')} chainId={VECTOR_CHAIN} rpc={rpc} announce={announce} />);
    await user.click(screen.getByRole('button', { name: 'Payment details' }));
    await fill(user); await user.click(screen.getByRole('button', { name: 'Download encrypted keypair' }));
    await waitFor(() => { expect(exportSpy).toHaveBeenCalledOnce(); });
    expect(screen.queryByTestId('stealth-export-verification')).toBeNull();
    view.rerender(<StealthExportPayment match={vectorMatch('a1')} chainId={VECTOR_CHAIN} rpc={rpc} announce={announce} />);
    await act(async () => { pending.resolve(file); await pending.promise; });
    expect(downloads.files).toHaveLength(1);
    expect(screen.getByTestId('stealth-export-backup-state').textContent).toContain('Retention and recoverability are not yet confirmed.');
  });
});
