// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as reconciliation from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { clearSession, generateSession, revealViewingKey } from '../lib/session';
import * as tagArchive from '../lib/tagArchive';
import { makeServices, renderApp } from '../test/render';
import { storedHistoryChains } from './TagArchive';

const PASS = 'violet comet maple lantern';
const ADDR = '0x1111111111111111111111111111111111111111';
let blobs: Blob[] = [];

beforeEach(() => {
  clearSession();
  blobs = [];
  window.history.replaceState(null, '', '/');
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:x'; });
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); });

type User = ReturnType<typeof userEvent.setup>;

/** Opens Seller keys with one saved tag and returns the downloaded archive as a File. */
async function exported(): Promise<{ user: User; services: ReturnType<typeof makeServices>; file: File }> {
  generateSession();
  const services = makeServices();
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  await services.vault.unlock(revealViewingKey());
  await services.vault.save(84532, { stealthAddress: ADDR, announcementId: `0x${'ab'.repeat(32)}:1`, logIndex: 1, clientLabel: 'Acme' });
  // L1-06: the archive passphrase starts as a generated suggestion; these tests use their own.
  expect(screen.getByLabelText<HTMLInputElement>('Archive passphrase (at least 14 characters)').value).toMatch(/^[a-z]{4,8}(?:-[a-z]{4,8}){5}$/);
  await user.clear(screen.getByLabelText('Archive passphrase (at least 14 characters)'));
  await user.type(screen.getByLabelText('Archive passphrase (at least 14 characters)'), PASS);
  await user.type(screen.getByLabelText('Repeat archive passphrase'), PASS);
  await user.click(screen.getByRole('button', { name: 'Download encrypted tag archive' }));
  await waitFor(() => { expect(blobs).toHaveLength(1); }, { timeout: 60_000 });
  expect((await screen.findAllByText(/SHA-256 [0-9a-f]{64}/)).length).toBeGreaterThan(0);
  return { user, services, file: new File([blobs[0] as Blob], 'ghostpay-tags-20260101.gpa') };
}

async function preview(user: User, file: File, passphrase: string): Promise<void> {
  await user.upload(screen.getByLabelText('Archive file'), file);
  await user.type(screen.getByLabelText('Archive passphrase'), passphrase);
  await user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
}

describe('TagArchive', () => {
  it('previews without writing, then applies', async () => {
    const { user, services, file } = await exported();
    await services.vault.wipe();
    await preview(user, file, PASS);
    expect(await screen.findByText(/1 tag\(s\) in the archive: 1 new/, undefined, { timeout: 60_000 })).toBeTruthy();
    expect(await services.vault.list()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Apply import' }));
    expect((await screen.findAllByText(/Imported: 1 added/)).length).toBeGreaterThan(0);
    expect((await services.vault.list())[0]?.clientLabel).toBe('Acme');
  }, 120_000);

  it('drops a staged preview when the seller session changes', async () => {
    const { user, services, file } = await exported();
    await services.vault.wipe();
    await preview(user, file, PASS);
    expect(await screen.findByRole('button', { name: 'Apply import' }, { timeout: 60_000 })).toBeTruthy();
    act(() => { clearSession(); });
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull(); });
    expect(await services.vault.list().catch(() => [])).toHaveLength(0);
  }, 120_000);

  it('wrong passphrase shows an error and changes nothing', async () => {
    const { user, services, file } = await exported();
    await preview(user, file, 'not the right passphrase');
    expect(await screen.findByText(/Wrong passphrase, or the archive was modified/, undefined, { timeout: 60_000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull();
    expect(await services.vault.list()).toHaveLength(1);
  }, 120_000);
});

type Handler = (() => void) | null | undefined;

/**
 * Minimal IndexedDB double for the read-only listing of stored scan-history keys: a database that does not exist yet
 * (`exists: false` runs the creation path), one without the store, stored keys, or a failing open or read. A versioned open
 * or any other database fails, so no other storage adapter can use it by accident.
 */
function fakeIndexedDb(opts: { readonly exists?: boolean; readonly store?: boolean; readonly keys?: readonly unknown[]; readonly fail?: 'open' | 'read' } = {}): { readonly factory: IDBFactory; readonly opens: unknown[][]; readonly counts: { aborted: number; closed: number } } {
  const opens: unknown[][] = [];
  const counts = { aborted: 0, closed: 0 };
  const factory = {
    open: (...args: unknown[]) => {
      opens.push(args);
      const request: { result?: unknown; transaction?: { abort: () => void }; onsuccess?: Handler; onerror?: Handler; onupgradeneeded?: Handler } = {};
      setTimeout(() => {
        if (opts.fail === 'open' || args.length !== 1 || args[0] !== 'ghostpay-reconciliation-encrypted') { request.onerror?.(); return; }
        if (opts.exists === false) {
          request.transaction = { abort: () => { counts.aborted++; setTimeout(() => { request.onerror?.(); }); } };
          request.onupgradeneeded?.();
          return;
        }
        const tx: { oncomplete?: Handler; onerror?: Handler; onabort?: Handler; objectStore?: () => unknown } = {};
        request.result = {
          objectStoreNames: { contains: (name: string) => opts.store !== false && name === 'vaults' },
          transaction: () => {
            tx.objectStore = () => ({ getAllKeys: () => ({ result: opts.keys ?? [] }) });
            setTimeout(() => { (opts.fail === 'read' ? tx.onerror : tx.oncomplete)?.(); });
            return tx;
          },
          close: () => { counts.closed++; },
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
  return { factory: factory as unknown as IDBFactory, opens, counts };
}

describe('I-2: scan history kept for chains this build does not support', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('lists the chains stored for one seller, never creates the database and reports a failed listing', async () => {
    const key = 'ab'.repeat(32);
    expect(await storedHistoryChains(key)).toEqual([]);                 // no IndexedDB here, so nothing can be stored
    const missing = fakeIndexedDb({ exists: false });
    expect(await storedHistoryChains(key, missing.factory)).toEqual([]);
    expect(missing.counts.aborted).toBe(1);                             // the creation was aborted, not committed
    expect(missing.opens).toEqual([['ghostpay-reconciliation-encrypted']]);
    const bare = fakeIndexedDb({ store: false });
    expect(await storedHistoryChains(key, bare.factory)).toEqual([]);
    expect(bare.counts.closed).toBe(1);
    const stored = fakeIndexedDb({ keys: [`${key}:84532`, `${key}:1`, `${'cd'.repeat(32)}:10`, `${key}:0`, `${key}:01`, `${key}:x`, 7, `${key}:99999999999999999`] });
    expect(await storedHistoryChains(key, stored.factory)).toEqual([1, 84532]);
    expect(stored.counts.closed).toBe(1);
    await expect(storedHistoryChains(key, fakeIndexedDb({ fail: 'open' }).factory)).rejects.toThrow(/Could not list/);
    const unreadable = fakeIndexedDb({ fail: 'read' });
    await expect(storedHistoryChains(key, unreadable.factory)).rejects.toThrow(/Could not list/);
    expect(unreadable.counts.closed).toBe(1);
  });

  it('names the stored history of chains this build cannot export, and says so when it cannot be listed', async () => {
    // Only Base Sepolia's history opens here; the six other chains of this build cannot be read.
    vi.spyOn(reconciliation, 'createCurrentReconciliationVault').mockImplementation((chainId) => (chainId === 84532
      ? Promise.resolve({ exportEncrypted: () => Promise.resolve('history-84532'), lock: () => undefined } as unknown as reconciliation.ReconciliationVault)
      : Promise.reject(new Error('unavailable'))));
    // The archive is encrypted for real, at scrypt N=2^14 rather than the production 2^17: two exports run here.
    const encryptArchive = tagArchive.exportArchive;
    vi.spyOn(tagArchive, 'exportArchive').mockImplementation((tags, viewingKey, passphrase, options) => encryptArchive(tags, viewingKey, passphrase, { ...options, N: 1 << 14 }));
    const session = generateSession();
    const keyId = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
    const user = userEvent.setup();
    renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
    const exportNow = async (): Promise<void> => {
      await user.clear(screen.getByLabelText('Archive passphrase (at least 14 characters)'));
      await user.type(screen.getByLabelText('Archive passphrase (at least 14 characters)'), PASS);
      await user.type(screen.getByLabelText('Repeat archive passphrase'), PASS);
      await user.click(screen.getByRole('button', { name: 'Download encrypted tag archive' }));
    };
    vi.stubGlobal('indexedDB', fakeIndexedDb({ keys: [`${keyId}:84532`, `${keyId}:1`, `${keyId}:777777`, `${'cd'.repeat(32)}:10`] }).factory);
    await exportNow();
    await waitFor(() => { expect(blobs).toHaveLength(1); }, { timeout: 60_000 });
    const done = (await screen.findAllByText(/Archive downloaded/))[0]?.textContent ?? '';
    expect(done).toContain('Scan history for 6 chain(s) could not be read and is NOT in this archive.');
    expect(done).toContain('Scan history stored in this browser for Ethereum (chain 1) and chain 777777 is NOT in this archive: this build does not support those chains.');
    expect(done).not.toMatch(/Base Sepolia|chain 10\b/);
    vi.stubGlobal('indexedDB', fakeIndexedDb({ fail: 'read' }).factory);
    await exportNow();
    await waitFor(() => { expect(blobs).toHaveLength(2); }, { timeout: 60_000 });
    expect((await screen.findAllByText(/could not be listed; any such history is NOT in this archive\./)).length).toBeGreaterThan(0);
  }, 120_000);
});
