// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as keystore from '../lib/keystore';
import { clearSession, exportKeystore, generateSession, getSessionPublic } from '../lib/session';
import { MemoryKeyVaultStore, readEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import { makeServices, renderApp } from '../test/render';

const PASS = 'a long passphrase';
const VAULT_PASS = 'violet comet maple lantern';

beforeEach(() => {
  clearSession();
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
  setKeyVaultStoreForTests(undefined);
  clearSession();
});

async function open(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  return user;
}

/** Real valid keystore envelope for a freshly generated session, then wipes the session. Returns the envelope text. */
async function makeEnvelope(): Promise<string> {
  generateSession();
  const text = await exportKeystore(PASS, { N: 1 << 14 });
  clearSession();
  return text;
}

/** Replaces decryptKeystore with a controlled deferred seam returning synthetic buffers; wipes are observable. */
function deferredDecrypt(): {
  started: Promise<void>;
  settle: () => void;
  buffers: Uint8Array[];
} {
  const buffers = [new Uint8Array(32).fill(1), new Uint8Array(32).fill(2), new Uint8Array(32).fill(3)];
  let started!: () => void;
  let release!: () => void;
  const startedP = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(keystore, 'decryptKeystore').mockImplementation(async () => {
    started();
    await gate;
    return { spendingKey: buffers[0]!, viewingKey: buffers[1]!, signingKey: buffers[2]! };
  });
  return { started: startedP, settle: release, buffers };
}

const allZero = (b: Uint8Array): boolean => b.every((x) => x === 0);

async function startImport(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  await user.click(screen.getByText('Import an encrypted keystore'));
  const file = new File([text], 'keys.json', { type: 'application/json' });
  await user.upload(screen.getByLabelText('Keystore file'), file);
  await user.type(screen.getByLabelText('Passphrase'), PASS);
  await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
}

describe('SellerKeys recovery lifetime invariants', () => {
  it('clears unsaved vault-save passphrase fields when seller keys are replaced', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    const firstMeta = getSessionPublic()!.metaAddress;
    await user.type(await screen.findByLabelText('New vault passphrase (14+ characters)'), VAULT_PASS);
    await user.type(screen.getByLabelText('Repeat vault passphrase'), VAULT_PASS);
    expect(screen.getByLabelText<HTMLInputElement>('New vault passphrase (14+ characters)').value).toBe(VAULT_PASS);
    await user.click(screen.getByRole('button', { name: 'Wipe keys from memory' }));
    await user.click(screen.getByRole('button', { name: 'Generate new keys' }));
    expect(getSessionPublic()!.metaAddress).not.toBe(firstMeta);
    const pass = await screen.findByLabelText<HTMLInputElement>('New vault passphrase (14+ characters)');
    const pass2 = screen.getByLabelText<HTMLInputElement>('Repeat vault passphrase');
    expect(pass.value === '').toBe(true);
    expect(pass2.value === '').toBe(true);
  });

  it('wipes returned buffers and installs nothing when the view unmounts after decryption starts', async () => {
    const text = await makeEnvelope();
    const seam = deferredDecrypt();
    const user = userEvent.setup();
    const view = renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
    await startImport(user, text);
    await act(async () => { await seam.started; });
    view.unmount();
    await act(async () => { seam.settle(); await Promise.resolve(); await Promise.resolve(); });
    await waitFor(() => { expect(seam.buffers.every(allZero)).toBe(true); });
    expect(getSessionPublic()).toBeUndefined();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('Cancel after decryption starts refuses acceptance, wipes buffers and shows no success', async () => {
    const text = await makeEnvelope();
    const seam = deferredDecrypt();
    const user = await open();
    await startImport(user, text);
    await act(async () => { await seam.started; });
    await user.click(screen.getByRole('button', { name: 'Cancel keystore import' }));
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase').value).toBe('');
    await act(async () => { seam.settle(); await Promise.resolve(); await Promise.resolve(); });
    await waitFor(() => { expect(seam.buffers.every(allZero)).toBe(true); });
    expect(getSessionPublic()).toBeUndefined();
    expect(screen.queryByText('Keystore decrypted; keys are in memory.')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase').value).toBe('');
  });

  it('a session replaced while decryption is in flight is not overwritten and returned buffers are wiped', async () => {
    const text = await makeEnvelope();
    const seam = deferredDecrypt();
    const user = await open();
    await startImport(user, text);
    await act(async () => { await seam.started; });
    let replacement!: string;
    act(() => { replacement = generateSession().metaAddress; });
    await act(async () => { seam.settle(); await Promise.resolve(); await Promise.resolve(); });
    await waitFor(() => { expect(seam.buffers.every(allZero)).toBe(true); });
    expect(getSessionPublic()?.metaAddress).toBe(replacement);
    expect(screen.queryByText('Keystore decrypted; keys are in memory.')).toBeNull();
  });
});

describe('SellerKeys cancellation retry', () => {
  it('after cancelling a pending file read, re-selecting the SAME file retries and imports the real keystore', async () => {
    generateSession();
    const original = getSessionPublic()!;
    const originalMeta = original.metaAddress;
    const originalSigner = original.signerPublicKey;
    const text = await exportKeystore(PASS, { N: 1 << 14 });
    clearSession();
    expect(getSessionPublic()).toBeUndefined();

    const user = await open();
    await user.click(screen.getByText('Import an encrypted keystore'));

    const file = new File([text], 'keys.json', { type: 'application/json' });
    let readCount = 0;
    let finishFirst!: (value: string) => void;
    Object.defineProperty(file, 'text', {
      value: () => {
        readCount += 1;
        if (readCount === 1) {
          return new Promise<string>((resolve) => { finishFirst = resolve; });
        }
        return Promise.resolve(text);
      },
    });

    await user.upload(screen.getByLabelText('Keystore file'), file);
    await user.type(screen.getByLabelText('Passphrase'), PASS);
    await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
    await waitFor(() => { expect(readCount).toBe(1); });

    await user.click(screen.getByRole('button', { name: 'Cancel keystore import' }));
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase').value).toBe('');

    // The stale first read completes after cancellation and must install nothing.
    await act(async () => { finishFirst(text); await Promise.resolve(); await Promise.resolve(); });
    expect(getSessionPublic()).toBeUndefined();
    expect(screen.queryByText('Keystore decrypted; keys are in memory.')).toBeNull();

    // Retry with the exact same File instance through the real UI.
    await user.upload(screen.getByLabelText('Keystore file'), file);
    await user.type(screen.getByLabelText('Passphrase'), PASS);
    await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));

    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => { expect(getSessionPublic()?.metaAddress).toBe(originalMeta); }, { timeout: 15_000, onTimeout: (error) => error });
    expect(screen.queryByText('Choose a keystore file first.')).toBeNull();
    expect(readCount).toBe(2);
    const restored = getSessionPublic();
    expect(restored?.metaAddress).toBe(originalMeta);
    expect(restored?.signerPublicKey).toBe(originalSigner);
    expect(await readEncryptedVault()).toBeUndefined();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  }, 30000);
});
