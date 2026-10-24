// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as reconciliation from '../lib/reconciliationVault';
import type { ReconciliationVaultStore } from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { clearSession, generateSession, getSessionPublic, revealViewingKey } from '../lib/session';
import { encodeArchive } from '../lib/tagArchive';
import * as archive from '../lib/tagArchive';
import { makeServices, renderApp } from '../test/render';

const PASS = 'violet comet maple lantern';
const ADDR = '0x1111111111111111111111111111111111111111';
const PAYLOAD = { stealthAddress: ADDR, announcementId: `0x${'ab'.repeat(32)}:1`, logIndex: 1, clientLabel: 'Recovered tag' };

/** Real ciphertext and vault operations; only the storage boundary is fault-injected. */
class Store implements ReconciliationVaultStore {
  readonly data = new Map<string, string>();
  failure: 'none' | 'before' | 'after' = 'none';
  acknowledgement: Promise<void> | undefined;
  read(key: string): Promise<string | null> { return Promise.resolve(this.data.get(key) ?? null); }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if (this.failure === 'before') return Promise.reject(new Error('storage failed before write'));
    if ((this.data.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.data.set(key, next);
    if (this.failure === 'after') return Promise.reject(new Error('acknowledgement lost after durable write'));
    return this.acknowledgement?.then(() => true) ?? Promise.resolve(true);
  }
}
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => { resolve = yes; });
  return { promise, resolve };
}
beforeEach(() => { clearSession(); window.history.replaceState(null, '', '/'); });
afterEach(() => { vi.restoreAllMocks(); });

async function setup() {
  generateSession();
  const services = makeServices();
  const session = getSessionPublic()!;
  const sellerKeyId = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
  const history: Record<string, string> = {};
  const stores: Store[] = [];
  const vaults: reconciliation.ReconciliationVault[] = [];
  for (const chain of services.chains.slice(0, 2)) {
    const store = new Store();
    const vault = new reconciliation.ReconciliationVault(store, { sellerKeyId, chainId: chain.chainId }, () => undefined);
    await vault.unlock(revealViewingKey());
    const source = new reconciliation.ReconciliationVault(new Store(), { sellerKeyId, chainId: chain.chainId }, () => undefined);
    await source.unlock(revealViewingKey());
    const transactionHash = `0x${'b'.repeat(64)}`;
    const blockHash = `0x${'c'.repeat(64)}`;
    await source.save({ version: 1, sellerKeyId, chainId: chain.chainId, transactionHash, blockHash,
      blockNumber: '123', stealthAddress: ADDR, logIndex: 1, asset: 'native', amountMinorUnits: '42',
      viewTagMatched: true, recordedAt: 1, evidenceStatus: 'verified-at-scan', evidenceSource: 'verified-router-scan',
      id: `${sellerKeyId}:${String(chain.chainId)}:${transactionHash}:${ADDR}:${blockHash}:1` });
    history[String(chain.chainId)] = await source.exportEncrypted();
    source.lock();
    stores.push(store); vaults.push(vault);
  }
  expect(vaults).toHaveLength(2);
  vi.spyOn(reconciliation, 'createCurrentReconciliationVault').mockImplementation((chainId) => {
    const i = services.chains.findIndex((chain) => chain.chainId === chainId);
    return i < vaults.length ? Promise.resolve(vaults[i]!) : Promise.reject(new Error('unused chain'));
  });
  const bytes = await encodeArchive({ createdAt: 1, keyVersion: 1, records: [{ chainId: services.chains[0]!.chainId, createdAt: 1, updatedAt: 1, payload: PAYLOAD }], history }, PASS, { N: 1 << 14 });
  const user = userEvent.setup();
  const rendered = renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  await services.vault.unlock(revealViewingKey());
  await user.upload(screen.getByLabelText('Archive file'), new File([bytes], 'ghostpay-tags-20260101.gpa'));
  await user.type(screen.getByLabelText('Archive passphrase'), PASS);
  const preview = async (): Promise<void> => {
    await user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await screen.findByRole('button', { name: 'Apply import' }, { timeout: 15_000 });
  };
  return { services, user, stores, vaults, preview, rendered };
}

describe('combined archive restore commit boundaries', () => {
  it('restores histories with imported provenance, without promoting them to live scan evidence', async () => {
    const f = await setup(); await f.preview();
    expect(await f.services.vault.list()).toHaveLength(0);
    expect(f.stores.every((store) => store.data.size === 0)).toBe(true);
    await f.user.click(screen.getByRole('button', { name: 'Apply import' }));
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull(); });
    expect(await f.services.vault.list()).toHaveLength(1);
    for (const vault of f.vaults) {
      await vault.unlock(revealViewingKey());
      expect((await vault.read())[0]?.provenance).toBe('imported-history');
      vault.lock();
    }
  });

  it('rejects a stale tag preview without starting any history commit', async () => {
    const f = await setup(); await f.preview();
    await f.services.vault.save(f.services.chains[0]!.chainId, { ...PAYLOAD, clientLabel: 'Newer local edit' });
    await f.user.click(screen.getByRole('button', { name: 'Apply import' }));
    await screen.findByRole('alert');
    expect((await f.services.vault.list())[0]?.clientLabel).toBe('Newer local edit');
    expect(f.stores.every((store) => store.data.size === 0)).toBe(true);
  });

  it('rejects an unavailable archived history before tags are written and closes the opened vaults', async () => {
    const f = await setup();
    const lock = vi.spyOn(f.vaults[0]!, 'lock');
    const preview = vi.spyOn(archive, 'previewArchiveImport');
    vi.mocked(reconciliation.createCurrentReconciliationVault).mockImplementation((chainId) =>
      chainId === f.services.chains[0]!.chainId ? Promise.resolve(f.vaults[0]!) : Promise.reject(new Error('unavailable')));
    await f.user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await waitFor(() => { expect(preview).toHaveBeenCalledOnce(); });
    // Await the real scrypt/decrypt operation, whose duration increases under coverage.
    await act(async () => { await preview.mock.results[0]?.value; });
    expect((await screen.findByRole('alert')).textContent).toContain(String(f.services.chains[1]!.chainId));
    expect(await f.services.vault.list()).toHaveLength(0);
    expect(lock).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull();
  });

  it('releases staged history keys on unmount', async () => {
    const f = await setup(); await f.preview();
    const locks = f.vaults.map((vault) => vi.spyOn(vault, 'lock'));
    f.rendered.unmount();
    for (const lock of locks) expect(lock).toHaveBeenCalled();
  });

  it('invalidates a staged preview when its passphrase input changes', async () => {
    const f = await setup(); await f.preview();
    const locks = f.vaults.map((vault) => vi.spyOn(vault, 'lock'));
    await f.user.type(screen.getByLabelText('Archive passphrase'), 'changed');
    expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull();
    for (const lock of locks) expect(lock).toHaveBeenCalled();
    expect(await f.services.vault.list()).toHaveLength(0);
  });

  it('stops later histories and reports uncertainty when cancelled during a history commit', async () => {
    const f = await setup(); await f.preview();
    const gate = deferred(); f.stores[0]!.acknowledgement = gate.promise;
    const second = vi.spyOn(f.vaults[1]!, 'activateImport');
    await f.user.click(screen.getByRole('button', { name: 'Apply import' }));
    await waitFor(() => { expect(f.stores[0]!.data.size).toBe(1); });
    await f.user.click(screen.getByRole('button', { name: 'Discard' }));
    await act(async () => { gate.resolve(); await gate.promise; });
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/outcome unknown/i); });
    expect(second).not.toHaveBeenCalled();
    expect(await f.services.vault.list()).toHaveLength(1);
    expect(f.stores[1]!.data.size).toBe(0);
  });

  it('reports committed tags and earlier histories when a later chain fails, without rollback', async () => {
    const f = await setup(); await f.preview();
    f.stores[1]!.failure = 'before';
    await f.user.click(screen.getByRole('button', { name: 'Apply import' }));
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull(); });
    expect((await f.services.vault.list())[0]?.clientLabel).toBe('Recovered tag');
    expect(f.stores[0]!.data.size).toBe(1); expect(f.stores[1]!.data.size).toBe(0);
    expect(screen.getByRole('alert').textContent).toMatch(/tag.*(committed|saved|imported)/i);
    expect(screen.getByRole('alert').textContent).toMatch(/(partial|incomplete)/i);
    expect(screen.getByRole('alert').textContent).toContain(String(f.services.chains[1]!.chainId));
  });

  it('does not claim a failed history write was absent when its acknowledgement was lost', async () => {
    const f = await setup(); await f.preview();
    f.stores[0]!.failure = 'after';
    await f.user.click(screen.getByRole('button', { name: 'Apply import' }));
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull(); });
    expect(f.stores[0]!.data.size).toBe(1); expect(f.stores[1]!.data.size).toBe(0);
    expect(screen.getByRole('alert').textContent).toMatch(/(unknown|uncertain|could not confirm|may have)/i);
    expect(screen.getByRole('alert').textContent).not.toMatch(/nothing (was|has been) (changed|saved|written)/i);
  });

  it('does not claim a failed tag write was absent when its acknowledgement was lost', async () => {
    const f = await setup(); await f.preview();
    const apply = f.services.vault.applyImport.bind(f.services.vault);
    vi.spyOn(f.services.vault, 'applyImport').mockImplementation(async (preview) => {
      await apply(preview); throw new Error('acknowledgement lost');
    });
    await f.user.click(screen.getByRole('button', { name: 'Apply import' }));
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull(); });
    expect(await f.services.vault.list()).toHaveLength(1);
    expect(f.stores.every((store) => store.data.size === 0)).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/(unknown|uncertain|could not confirm|may have)/i);
  });

  it('stops before history activation when Discard is clicked during the tag commit', async () => {
    const f = await setup(); await f.preview();
    const gate = deferred(); const committed = deferred(); const apply = f.services.vault.applyImport.bind(f.services.vault);
    const pending = vi.spyOn(f.services.vault, 'applyImport').mockImplementation(async (preview) => { await apply(preview); committed.resolve(); await gate.promise; });
    const historyApply = vi.spyOn(f.vaults[0]!, 'activateImport');
    await f.user.click(screen.getByRole('button', { name: 'Apply import' }));
    await waitFor(() => { expect(pending).toHaveBeenCalledOnce(); });
    await committed.promise;
    await f.user.click(screen.getByRole('button', { name: 'Discard' }));
    await act(async () => { gate.resolve(); await pending.mock.results[0]?.value; });
    expect(historyApply).not.toHaveBeenCalled();
    expect(screen.queryAllByText(/^Imported:/)).toHaveLength(0);
    expect((await f.services.vault.list())).toHaveLength(1);
  });

  it('stops before history activation if the seller session changes during tag commit', async () => {
    const f = await setup(); await f.preview();
    const gate = deferred(); const committed = deferred(); const apply = f.services.vault.applyImport.bind(f.services.vault);
    const pending = vi.spyOn(f.services.vault, 'applyImport').mockImplementation(async (preview) => { await apply(preview); committed.resolve(); await gate.promise; });
    const historyApply = vi.spyOn(f.vaults[0]!, 'activateImport');
    await f.user.click(screen.getByRole('button', { name: 'Apply import' }));
    await committed.promise;
    act(() => { clearSession(); });
    await act(async () => { gate.resolve(); await pending.mock.results[0]?.value; });
    expect(historyApply).not.toHaveBeenCalled();
    expect(screen.queryAllByText(/^Imported:/)).toHaveLength(0);
  });

  it('locks every opened history vault when one history preview rejects', async () => {
    const f = await setup();
    const locks = f.vaults.map((vault) => vi.spyOn(vault, 'lock'));
    vi.spyOn(f.vaults[1]!, 'previewImport').mockRejectedValue(new Error('damaged history'));
    await f.user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await screen.findByRole('alert', undefined, { timeout: 15_000 });
    expect(await f.services.vault.list()).toHaveLength(0);
    for (const lock of locks) expect(lock).toHaveBeenCalled();
  });

  it('locks staged history vaults when the preview is discarded', async () => {
    const f = await setup(); await f.preview();
    const locks = f.vaults.map((vault) => vi.spyOn(vault, 'lock'));
    await f.user.click(screen.getByRole('button', { name: 'Discard' }));
    for (const lock of locks) expect(lock).toHaveBeenCalled();
    expect(await f.services.vault.list()).toHaveLength(0);
  });

  it('invalidates a pending merge preview when the user switches to replace mode', async () => {
    const f = await setup(); const gate = deferred();
    const preview = f.vaults[0]!.previewImport.bind(f.vaults[0]!);
    const pending = vi.spyOn(f.vaults[0]!, 'previewImport').mockImplementation(async (text) => { await gate.promise; return preview(text); });
    await f.user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await waitFor(() => { expect(pending).toHaveBeenCalledOnce(); }, { timeout: 15_000 });
    await f.user.click(screen.getByRole('radio', { name: 'Replace all local tags' }));
    await act(async () => { gate.resolve(); await gate.promise; });
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Decrypt and preview' }).hasAttribute('disabled')).toBe(false); });
    expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull();
    expect(await f.services.vault.list()).toHaveLength(0);
  });
});
