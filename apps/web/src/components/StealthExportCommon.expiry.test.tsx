// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import * as exportModule from '../lib/paymentKeyExport';
import { TEST_N, VECTOR_CHAIN, captureDownloads, codeRpc, loadVectorSeller, vectorMatch } from '../lib/paymentKeyExport.testutil';
import { clearSession } from '../lib/session';
import { useExportOperation } from './StealthExportCommon';
import { StealthExportPayment } from './StealthExportPayment';

let downloads: ReturnType<typeof captureDownloads> | undefined;

beforeEach(() => { clearSession(); });
afterEach(() => {
  cleanup();
  downloads?.restore(); downloads = undefined;
  setKeyVaultStoreForTests(undefined);
  vi.restoreAllMocks();
  clearSession();
});

/**
 * Adapted for main (no suspendSession/subscribeSessionExpiryCheck): model a revocation whose session notification has
 * not reached React yet. clearSession(false) advances the revision silently; only the handoff check can observe it.
 */
function deferredExpiry(): () => void {
  return () => { clearSession(false); };
}

describe('export UI handoff samples the session revision before accepting results', () => {
  it.each([false, true])('rejects a silently revoked operation with seller keys loaded=%s before browser events', (loaded) => {
    if (loaded) loadVectorSeller();
    const expire = deferredExpiry();
    const reset = vi.fn<() => void>();
    const { result } = renderHook(() => useExportOperation(reset));
    const controller = result.current.start();
    expect(result.current.current(controller)).toBe(true);
    expire();
    let accepted = true;
    act(() => { accepted = result.current.current(controller); });
    expect(accepted).toBe(false);
    expect(controller.signal.aborted).toBe(true);
    expect(reset).toHaveBeenCalledOnce();
  });

  it('preserves fresh empty-session recovery and rejects replaced operations', () => {
    const reset = vi.fn<() => void>();
    const { result } = renderHook(() => useExportOperation(reset));
    const first = result.current.start();
    const second = result.current.start();
    expect(result.current.current(first)).toBe(false);
    expect(result.current.current(second)).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  it('does not download a real raw-key export when revocation occurs at its final promise handoff', async () => {
    const passphrase = 'violet comet maple lantern';
    const store = new MemoryKeyVaultStore();
    setKeyVaultStoreForTests(store);
    loadVectorSeller();
    await saveEncryptedVault(passphrase, { N: TEST_N }, store);
    downloads = captureDownloads();
    const expire = deferredExpiry();
    const original = exportModule.exportRawPrivateKey;
    let generated = false;
    // Keep real reauthentication, address verification and key derivation. Only
    // move the idle deadline past the last service check before the UI resumes.
    vi.spyOn(exportModule, 'exportRawPrivateKey').mockImplementation(async (...args) => {
      const file = await original(...args);
      generated = true;
      expire();
      return file;
    });
    const announce = vi.fn<(message: string) => void>();
    const user = userEvent.setup();
    render(<StealthExportPayment match={vectorMatch('a1')} chainId={VECTOR_CHAIN} rpc={codeRpc()} announce={announce} />);
    await user.click(screen.getByRole('button', { name: 'Payment details' }));
    await user.type(screen.getByLabelText('Passphrase of your encrypted vault'), passphrase);
    await user.click(screen.getByRole('button', { name: 'Prepare the private key download' }));
    await user.click(screen.getByRole('button', { name: 'Download the private key' }));
    await waitFor(() => { expect(generated).toBe(true); }, { timeout: 30_000 });
    expect(downloads.files).toHaveLength(0);
    expect(announce).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase of your encrypted vault').value).toBe('');
  });
});
