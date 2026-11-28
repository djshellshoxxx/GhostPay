// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import * as exportModule from '../lib/paymentKeyExport';
import { VECTORS, VECTOR_CHAIN, captureDownloads, codeRpc, vectorMatch } from '../lib/paymentKeyExport.testutil';
import { StealthExportArchive } from './StealthExportArchive';
import { StealthExportMaster } from './StealthExportMaster';
import { StealthExportPayment } from './StealthExportPayment';

const FILE_PASS = 'orbit-lantern-cobalt-meadow-violet';
let downloads: ReturnType<typeof captureDownloads>;

beforeEach(() => { downloads = captureDownloads(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); downloads.restore(); });

describe('retaining generated encrypted exports after a blocked download', () => {
  it.each(['payment', 'archive', 'master'] as const)('%s retries the same generated file without re-exporting or claiming verification', async (kind) => {
    const file: exportModule.StealthExportFile = {
      filename: kind === 'payment' ? 'ghostpay-stealth-keypair.json' : kind === 'archive' ? 'ghostpay-stealth-keypairs.json' : 'ghostpay-stealth-master.json',
      text: kind === 'payment' ? VECTORS.files.single.text : kind === 'archive' ? VECTORS.files.archive.text : VECTORS.files.master.text,
      type: 'application/json',
    };
    const generate = kind === 'payment'
      ? vi.spyOn(exportModule, 'exportEncryptedPayment').mockResolvedValue(file)
      : kind === 'archive'
        ? vi.spyOn(exportModule, 'exportPaymentArchive').mockResolvedValue(file)
        : vi.spyOn(exportModule, 'exportMasterBackup').mockResolvedValue(file);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    click.mockImplementationOnce(() => { throw new Error('download blocked'); });
    const announce = vi.fn<(message: string) => void>();
    const user = userEvent.setup();
    if (kind === 'payment') render(<StealthExportPayment match={vectorMatch('a1')} chainId={VECTOR_CHAIN} rpc={codeRpc()} announce={announce} />);
    else if (kind === 'archive') render(<StealthExportArchive matches={[vectorMatch('a1')]} chainId={VECTOR_CHAIN} rpc={codeRpc()} announce={announce} />);
    else render(<StealthExportMaster announce={announce} />);
    if (kind !== 'master') await user.click(screen.getByRole('button', { name: kind === 'payment' ? 'Payment details' : 'Export all payment keys (encrypted)' }));
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), 'test-only credential');
    await user.type(screen.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(screen.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(screen.getByRole('button', { name: kind === 'payment' ? 'Download encrypted keypair' : kind === 'archive' ? 'Download encrypted archive' : 'Download master backup' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('did not start the download'); });
    expect(downloads.files).toHaveLength(0);
    expect(announce).not.toHaveBeenCalled();
    expect(screen.getByTestId('stealth-export-backup-state').textContent).toContain('download has not started');
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'I saved this backup file and kept its passphrase separately.' }).checked).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Retry this download' }));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(downloads.files).toHaveLength(1);
    expect(downloads.files[0]?.filename).toBe(file.filename);
    expect(await downloads.files[0]!.blob.text()).toBe(file.text);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('stealth-export-backup-state').textContent).toContain('download initiated');
    expect(screen.getByTestId('stealth-export-backup-state').textContent).not.toContain('Saved backup verified');
    // Main (cb2563cf): an accepted download can still be interrupted, so retry stays offered until verification.
    expect(screen.getByRole('button', { name: 'Retry this download' })).toBeTruthy();

    act(() => { notifyAppLock('idle'); });
    expect(screen.queryByTestId('stealth-export-verification')).toBeNull();
  });
});
