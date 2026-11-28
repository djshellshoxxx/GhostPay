// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import * as exports from '../lib/paymentKeyExport';
import { VECTORS, VECTOR_PASS } from '../lib/paymentKeyExport.testutil';
import { clearSession, generateSession, getSessionBackup, getSessionPublic } from '../lib/session';
import { inspectPaymentKeys } from '../lib/stealthExport';
import { StealthExportVerification } from './StealthExportVerification';

const generated: exports.StealthExportFile = { filename: 'ghostpay-stealth-keypair.json', type: 'application/json', text: VECTORS.files.single.text };
const result: exports.VerifiedStealthExport = { kind: 'keypair', header: inspectPaymentKeys(generated.text) };
const startedDownload = { downloadStarted: true, onRetryDownload: (): void => undefined };
const asFile = (text = generated.text): File => new File([text], generated.filename, { type: generated.type });
const checkbox = (): HTMLInputElement => screen.getByRole('checkbox', { name: 'I saved this backup file and kept its passphrase separately.' });
const submit = (): HTMLButtonElement => screen.getByRole('button', { name: 'Verify the saved backup' });
const state = (): string | null => screen.getByTestId('stealth-export-backup-state').textContent;

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Observe the component's real verification without replacing crypto or racing the DOM polling deadline. */
function observeVerification(): Promise<{ readonly operation: Promise<exports.VerifiedStealthExport> }> {
  const started = deferred<{ readonly operation: Promise<exports.VerifiedStealthExport> }>();
  const actual = exports.verifyStealthExport;
  vi.spyOn(exports, 'verifyStealthExport').mockImplementation((...args) => {
    const operation = actual(...args);
    // Carry the promise in an object so observation resolves when verification starts, including rejection paths.
    started.resolve({ operation });
    return operation;
  });
  return started.promise;
}

beforeEach(() => { clearSession(); generateSession(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); });

async function fill(user: ReturnType<typeof userEvent.setup>, text = generated.text, pass = VECTOR_PASS): Promise<void> {
  await user.click(checkbox());
  await user.upload(screen.getByLabelText('Saved backup file'), asFile(text));
  await user.type(screen.getByLabelText('Passphrase of the saved backup'), pass);
}

describe('saved Spec 18 export verification', () => {
  it('distinguishes a generated file from an initiated download and retries without claiming retention', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const announce = vi.fn();
    const view = render(<StealthExportVerification file={generated} announce={announce} downloadStarted={false} onRetryDownload={retry} />);
    expect(state()).toContain('Encrypted file generated; download has not started.');
    expect(state()).not.toContain('download initiated');
    expect(submit().disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Retry this download' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(state()).toContain('Encrypted file generated; download has not started.');
    expect(announce).not.toHaveBeenCalled();

    view.rerender(<StealthExportVerification file={generated} announce={announce} downloadStarted onRetryDownload={retry} />);
    expect(state()).toContain('File generated; download initiated.');
    expect(state()).toContain('Retention and recoverability are not yet confirmed.');
    // Main (cb2563cf): an accepted download can still be interrupted, so retry stays offered until verification.
    expect(screen.getByRole('button', { name: 'Retry this download' })).toBeTruthy();
    expect(checkbox().checked).toBe(false);
    expect(submit().disabled).toBe(true);
  });

  it('requires retention confirmation and a saved file, authenticates its keys, and never changes seller custody', async () => {
    const user = userEvent.setup();
    const started = observeVerification();
    const announce = vi.fn();
    const wallet = getSessionPublic(); const backup = getSessionBackup();
    render(<StealthExportVerification file={generated} announce={announce} {...startedDownload} />);
    expect(state()).toContain('File generated; download initiated. Retention and recoverability are not yet confirmed.');
    expect(submit().disabled).toBe(true);
    await user.upload(screen.getByLabelText('Saved backup file'), asFile());
    await user.type(screen.getByLabelText('Passphrase of the saved backup'), VECTOR_PASS);
    expect(submit().disabled).toBe(true);
    await user.click(checkbox());
    expect(state()).toContain('You confirmed keeping this backup. Recoverability is not yet verified.');
    await user.type(screen.getByLabelText('Passphrase of the saved backup'), VECTOR_PASS);
    await user.click(submit());
    await act(async () => {
      const { operation } = await started;
      await operation;
    });
    await waitFor(() => { expect(state()).toContain('Saved backup verified.'); });
    expect(announce).toHaveBeenCalledOnce();
    expect(getSessionPublic()).toBe(wallet);
    expect(getSessionBackup()).toBe(backup);
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase of the saved backup').value).toBe('');
    expect(document.body.textContent).not.toContain(VECTORS.announcements[0]!.expected.privateKey.slice(2));
  });

  it('refuses a different valid archive with the same filename before decryption', async () => {
    const user = userEvent.setup();
    const verify = vi.spyOn(exports, 'verifyStealthExport');
    const announce = vi.fn();
    render(<StealthExportVerification file={generated} announce={announce} {...startedDownload} />);
    await fill(user, VECTORS.files.archive.text);
    await user.click(submit());
    expect((await screen.findByRole('alert')).textContent).toContain('not the exact file generated by this export');
    expect(verify).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    expect(state()).not.toContain('Saved backup verified.');
  });

  it('refuses BOM-prefixed saved bytes even when File.text normalizes them to the generated ciphertext', async () => {
    const user = userEvent.setup();
    const verify = vi.spyOn(exports, 'verifyStealthExport');
    const announce = vi.fn();
    const wallet = getSessionPublic(); const backup = getSessionBackup();
    const file = new File([new Uint8Array([0xef, 0xbb, 0xbf]), generated.text], generated.filename, { type: generated.type });
    expect(file.size).toBe(generated.text.length + 3);
    expect(await file.text()).toBe(generated.text);
    render(<StealthExportVerification file={generated} announce={announce} {...startedDownload} />);
    await user.click(checkbox());
    await user.upload(screen.getByLabelText('Saved backup file'), file);
    await user.type(screen.getByLabelText('Passphrase of the saved backup'), VECTOR_PASS);
    await user.click(submit());
    expect((await screen.findByRole('alert')).textContent).toContain('not the exact file generated by this export');
    expect(verify).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    expect(state()).not.toContain('Saved backup verified.');
    expect(getSessionPublic()).toBe(wallet);
    expect(getSessionBackup()).toBe(backup);
  });

  it('a wrong password cannot mark the saved file verified', async () => {
    const user = userEvent.setup();
    const started = observeVerification();
    const announce = vi.fn();
    render(<StealthExportVerification file={generated} announce={announce} {...startedDownload} />);
    await fill(user, generated.text, 'not the backup password');
    await user.click(submit());
    await act(async () => {
      const { operation } = await started;
      await expect(operation).rejects.toThrow(/Wrong passphrase/);
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Wrong passphrase');
    expect(state()).not.toContain('Saved backup verified.');
    expect(announce).not.toHaveBeenCalled();
  });

  it('oversized saved files fail before reading or running the KDF', async () => {
    const user = userEvent.setup();
    const verify = vi.spyOn(exports, 'verifyStealthExport');
    render(<StealthExportVerification file={generated} announce={vi.fn()} {...startedDownload} />);
    await fill(user, ' '.repeat(1_048_577));
    await user.click(submit());
    expect((await screen.findByRole('alert')).textContent).toContain('larger than the stealth key export limit');
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'selection', 'lock', 'session', 'generated', 'retention', 'unmount'] as const)('discards late verification after %s changes', async (change) => {
    const user = userEvent.setup();
    const pending = deferred<exports.VerifiedStealthExport>();
    const verify = vi.spyOn(exports, 'verifyStealthExport').mockReturnValue(pending.promise);
    const announce = vi.fn();
    const view = render(<StealthExportVerification file={generated} announce={announce} {...startedDownload} />);
    await fill(user);
    await user.click(submit());
    await waitFor(() => { expect(verify).toHaveBeenCalledOnce(); });
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase of the saved backup').disabled).toBe(true);
    if (change === 'cancel') await user.click(screen.getByRole('button', { name: 'Cancel' }));
    if (change === 'selection') await user.upload(screen.getByLabelText('Saved backup file'), asFile(VECTORS.files.archive.text));
    if (change === 'lock') act(() => { notifyAppLock('idle'); });
    if (change === 'session') act(() => { clearSession(); });
    if (change === 'generated') view.rerender(<StealthExportVerification file={{ ...generated, text: VECTORS.files.archive.text }} announce={announce} {...startedDownload} />);
    if (change === 'retention') await user.click(checkbox());
    if (change === 'unmount') view.unmount();
    await act(async () => { pending.resolve(result); await pending.promise; });
    expect(announce).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Saved backup verified\./)).toBeNull();
    if (change !== 'unmount') expect(screen.getByLabelText<HTMLInputElement>('Passphrase of the saved backup').value).toBe('');
  });

  it('reselecting a file clears a previous successful verification', async () => {
    const user = userEvent.setup();
    vi.spyOn(exports, 'verifyStealthExport').mockResolvedValue(result);
    render(<StealthExportVerification file={generated} announce={vi.fn()} {...startedDownload} />);
    await fill(user); await user.click(submit());
    await waitFor(() => { expect(state()).toContain('Saved backup verified.'); });
    await user.upload(screen.getByLabelText('Saved backup file'), asFile(VECTORS.files.archive.text));
    expect(state()).not.toContain('Saved backup verified.');
  });

  it('editing the passphrase clears a previous successful verification before checking the new input', async () => {
    const user = userEvent.setup();
    vi.spyOn(exports, 'verifyStealthExport').mockResolvedValue(result);
    render(<StealthExportVerification file={generated} announce={vi.fn()} {...startedDownload} />);
    await fill(user); await user.click(submit());
    await waitFor(() => { expect(state()).toContain('Saved backup verified.'); });
    await user.type(screen.getByLabelText('Passphrase of the saved backup'), 'different password');
    expect(state()).not.toContain('Saved backup verified.');
    expect(state()).toContain('Recoverability is not yet verified.');
  });
});
