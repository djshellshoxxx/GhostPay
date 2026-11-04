// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as reconciliation from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { clearSession, generateSession, getSessionPublic, revealViewingKey } from '../lib/session';
import * as tagArchive from '../lib/tagArchive';
import { memoryIndexedDb } from '../test/memoryIndexedDb';
import { userMessage } from '../lib/errors';
import { MemoryTagStore, TagVault } from '../lib/tags';
import { makeServices, renderApp } from '../test/render';

const PASS = 'violet comet maple lantern';
let blobs: Blob[] = [];

beforeEach(() => {
  clearSession();
  blobs = [];
  window.history.replaceState(null, '', '/');
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:x'; });
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** The archive is still encrypted for real, at scrypt N=2^14 instead of the production 2^17, so the suite stays fast. */
function fastKdf(): void {
  const real = tagArchive.exportArchive;
  vi.spyOn(tagArchive, 'exportArchive').mockImplementation((tags, key, pass, options) => real(tags, key, pass, { ...options, N: 1 << 14 }));
}

type User = ReturnType<typeof userEvent.setup>;

const nav = (name: string) => within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name });

async function open(services = makeServices()): Promise<User> {
  generateSession();
  const user = userEvent.setup();
  renderApp(services);
  await user.click(nav('Seller keys'));
  return user;
}

const status = (item: string): string => within(screen.getByTestId(item)).getAllByRole('status')[0]?.textContent ?? '';

async function exportTags(user: User, withHistory: boolean): Promise<void> {
  const tags = within(screen.getByTestId('backup-item-tags'));
  const pass = tags.getByLabelText('Archive passphrase (at least 14 characters)');
  await user.clear(pass);
  await user.type(pass, PASS);
  await user.clear(tags.getByLabelText('Repeat archive passphrase'));
  await user.type(tags.getByLabelText('Repeat archive passphrase'), PASS);
  const include = tags.getByLabelText<HTMLInputElement>('Include scan history');
  if (include.checked !== withHistory) await user.click(include);
  await user.click(tags.getByRole('button', { name: 'Download encrypted tag archive' }));
}

describe('BackupPanel', () => {
  it('starts with both items not started and claims nothing', async () => {
    await open();
    expect(status('backup-item-keys')).toMatch(/^Not started: No copy of these keys exists outside this tab yet/);
    expect(status('backup-item-tags')).toMatch(/^Not started: No tag archive was downloaded/);
  });

  it('marks keys done only once the keystore form of this view produced a copy, and focuses that form', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Go to the keystore backup' }));
    expect(document.activeElement?.id).toBe('keystore-backup-h');
    await user.clear(screen.getByLabelText('Passphrase (at least 14 characters)'));
    await user.type(screen.getByLabelText('Passphrase (at least 14 characters)'), PASS);
    await user.type(screen.getByLabelText('Repeat passphrase'), PASS);
    await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
    await waitFor(() => { expect(status('backup-item-keys')).toMatch(/^Done: A copy of these keys exists outside this tab/); }, { timeout: 60_000 });
    expect(status('backup-item-tags')).toMatch(/^Not started/);
  }, 120_000);

  const storeHistory = async (chains: readonly number[]): Promise<void> => {
    const session = getSessionPublic();
    if (session === undefined) throw new Error('no session');
    const keyId = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
    for (const chainId of chains) {
      const vault = await reconciliation.createCurrentReconciliationVault(chainId, keyId);
      try { await vault.clearRecords(); } finally { vault.lock(); }
    }
  };

  // The reconciliation store keeps the first IndexedDB it opens, so the case that writes history must stay the first to use the in-memory one.
  // Each case: how the export goes, whether scan history is requested, and what the item must then say.
  const cases: readonly { name: string; history: boolean; arrange: () => Promise<void> | void; status: RegExp; blobs: number; message?: RegExp }[] = [
    { name: 'Done, naming the choice, when history was left out on purpose', history: false, arrange: () => undefined, status: /^Done: Tag archive downloaded WITHOUT scan history, as you chose\. Tags in the archive: 0\./, blobs: 1 },
    { name: 'Done with gaps when history is stored for a chain this build does not support', history: true, arrange: () => storeHistory([84532, 777777]), status: /^Done with gaps: .*NOT in it/, blobs: 1 },
    { name: 'Done with gaps when the history of a chain could not be read', history: true, arrange: () => { vi.spyOn(reconciliation, 'createCurrentReconciliationVault').mockRejectedValue(new Error('unavailable')); }, status: /^Done with gaps: .*NOT in it/, blobs: 1 },
    { name: 'plain Done only when history was included and nothing was left out', history: true, arrange: () => undefined, status: /^Done: Tag archive downloaded\. Tags in the archive: 0\./, blobs: 1 },
    { name: 'Failed, never Done, when the export throws', history: false, arrange: () => { vi.spyOn(tagArchive, 'exportArchive').mockRejectedValue(new Error('disk full')); }, status: /^Failed: The latest tag archive attempt failed and produced no file/, blobs: 0 },
    { name: 'Done with gaps when the stored history cannot be listed', history: true, arrange: () => { vi.spyOn(reconciliation, 'createCurrentReconciliationVault').mockResolvedValue({ exportEncrypted: () => Promise.resolve('history'), lock: () => undefined } as unknown as reconciliation.ReconciliationVault); vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked'); } }); }, status: /^Done with gaps: .*NOT in it/, blobs: 1, message: /could not be listed; any such history is NOT in this archive/ },
  ];
  it.each(cases)('tag archive item says $name', async (c) => {
    if (c.blobs > 0) fastKdf();
    vi.stubGlobal('indexedDB', memoryIndexedDb());
    const user = await open();
    await c.arrange();
    await exportTags(user, c.history);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(c.status); }, { timeout: 60_000 });
    expect(blobs).toHaveLength(c.blobs);
    if (c.message !== undefined) expect(document.body.textContent).toMatch(c.message);
    expect(status('backup-item-keys')).toMatch(/^Not started/);
  }, 120_000);

  it('recovers from Failed after a later export completes', async () => {
    const real = tagArchive.exportArchive;
    vi.spyOn(tagArchive, 'exportArchive').mockRejectedValueOnce(new Error('disk full')).mockImplementation((tags, key, pass, options) => real(tags, key, pass, { ...options, N: 1 << 14 }));
    const user = await open();
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Failed/); });
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: /); }, { timeout: 60_000 });
  }, 120_000);

  it('describes only the latest attempt when an export fails after an earlier success', async () => {
    const real = tagArchive.exportArchive;
    vi.spyOn(tagArchive, 'exportArchive').mockImplementationOnce((tags, key, pass, options) => real(tags, key, pass, { ...options, N: 1 << 14 })).mockRejectedValueOnce(new Error('disk full'));
    const user = await open();
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: /); }, { timeout: 60_000 });
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Failed: The latest tag archive attempt failed/); });
    expect(status('backup-item-tags')).not.toMatch(/not backed up/);
  }, 120_000);

  const tag = { stealthAddress: '0x1111111111111111111111111111111111111111', announcementId: `0x${'ab'.repeat(32)}:1`, logIndex: 1, clientLabel: 'Acme' };

  it('does not present an archive as backing up tags saved after it', async () => {
    fastKdf();
    const services = makeServices();
    const user = await open(services);
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: /); }, { timeout: 60_000 });
    await services.vault.save(84532, tag);
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Changed since last archive: .*not in the last archive/); });
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: .*Tags in the archive: 1\./); }, { timeout: 60_000 });
  }, 120_000);

  it('notices tags saved elsewhere while the checklist was not on screen', async () => {
    fastKdf();
    const services = makeServices();
    const user = await open(services);
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: /); }, { timeout: 60_000 });
    await user.click(nav('Home'));
    await services.vault.save(84532, tag);
    await user.click(nav('Seller keys'));
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Changed since last archive/); });
  }, 120_000);

  it('keeps the gap and failure details with the outcome after the view is left and reopened', async () => {
    fastKdf();
    vi.spyOn(reconciliation, 'createCurrentReconciliationVault').mockRejectedValue(new Error('unavailable'));
    const user = await open();
    await exportTags(user, true);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done with gaps/); }, { timeout: 60_000 });
    await user.click(nav('Home'));
    await user.click(nav('Seller keys'));
    const item = screen.getByTestId('backup-item-tags');
    expect(status('backup-item-tags')).toMatch(/^Done with gaps/);
    expect(item.textContent).toMatch(/could not be read and is NOT in this archive/);
    expect(item.textContent).not.toMatch(/message below/);

    vi.spyOn(tagArchive, 'exportArchive').mockRejectedValue(new Error('disk full'));
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Failed/); });
    await user.click(nav('Home'));
    await user.click(nav('Seller keys'));
    expect(screen.getByTestId('backup-item-tags').textContent).toContain(userMessage(new Error('disk full')));
  }, 120_000);

  /** Opens Seller keys with a shared tag store, exports once (history left out) and waits for Done. */
  async function exported(): Promise<{ user: User; services: ReturnType<typeof makeServices>; store: MemoryTagStore }> {
    fastKdf();
    const store = new MemoryTagStore();
    const services = makeServices({ vault: new TagVault(store) });
    const user = await open(services);
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: /); }, { timeout: 60_000 });
    return { user, services, store };
  }
  const recheck = async (): Promise<void> => {
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
  };
  const hideTab = (state: 'hidden' | 'visible'): void => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  };
  afterEach(() => { hideTab('visible'); });

  it('never unlocks the tag vault to check the status, and is not Done while tags are locked', async () => {
    const { user, services } = await exported();
    services.vault.lock();
    const unlock = vi.spyOn(services.vault, 'unlock');
    await recheck();
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Cannot check \(tags locked\)/); });
    await user.click(nav('Home'));
    await user.click(nav('Seller keys'));
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Cannot check \(tags locked\)/); });
    expect(unlock).not.toHaveBeenCalled();
    expect(services.vault.unlocked).toBe(false);
  }, 120_000);

  it('after a wipe, shows the archive as changed and leaves no tag profile behind', async () => {
    fastKdf();
    const store = new MemoryTagStore();
    const services = makeServices({ vault: new TagVault(store) });
    const user = await open(services);
    await services.vault.unlock(revealViewingKey());
    await services.vault.save(84532, tag);
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: .*Tags in the archive: 1\./); }, { timeout: 60_000 });
    await wipeAll(user);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Local tags deleted: All local tags were deleted after the last archive, which holds 1 tags?\. Keep that archive: it is now the only copy/); });
    await recheck();
    await user.click(nav('Home'));
    await user.click(nav('Seller keys'));
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Local tags deleted/); });
    expect(await store.getMeta()).toBeUndefined();
    expect((await store.getSnapshot()).records).toHaveLength(0);
  }, 120_000);

  it('is not Done while the current tags are still being read, or when they cannot be read', async () => {
    const { user, services } = await exported();
    await user.click(nav('Home'));
    const read = vi.spyOn(services.vault, 'fingerprint').mockImplementation(() => new Promise<string>(() => undefined));
    await user.click(nav('Seller keys'));
    expect(status('backup-item-tags')).toMatch(/^Checking: /);
    read.mockRejectedValue(new Error('damaged'));
    await recheck();
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Could not check: .*could not be checked/); });
  }, 120_000);

  it('treats a tag saved while the export runs as not covered by that archive', async () => {
    const real = tagArchive.exportArchive;
    const store = new MemoryTagStore();
    const services = makeServices({ vault: new TagVault(store) });
    vi.spyOn(tagArchive, 'exportArchive').mockImplementation(async (tags, key, pass, options) => {
      const out = await real(tags, key, pass, { ...options, N: 1 << 14 });
      await services.vault.save(84532, tag);
      return out;
    });
    const user = await open(services);
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Changed since last archive/); }, { timeout: 60_000 });
  }, 120_000);

  it('lets the newest read win when an older read settles last', async () => {
    const { services } = await exported();
    const archived = await services.vault.fingerprint();
    const settle: ((value: string) => void)[] = [];
    vi.spyOn(services.vault, 'fingerprint').mockImplementation(() => new Promise<string>((resolve) => { settle.push(resolve); }));
    await recheck();
    await recheck();
    expect(settle).toHaveLength(2);
    await act(async () => { settle[1]?.(archived); await Promise.resolve(); });
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: /); });
    await act(async () => { settle[0]?.('older-read-of-changed-tags'); await Promise.resolve(); });
    expect(status('backup-item-tags')).toMatch(/^Done: /);
  }, 120_000);

  it('re-reads when the tab becomes visible, not when it is hidden', async () => {
    const { services } = await exported();
    const read = vi.spyOn(services.vault, 'fingerprint');
    hideTab('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
    expect(read).not.toHaveBeenCalled();
    hideTab('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
    await waitFor(() => { expect(read).toHaveBeenCalledTimes(1); });
  }, 120_000);

  it('forgets the outcome when the seller keys are replaced', async () => {
    await exported();
    await act(async () => { clearSession(); generateSession(); await Promise.resolve(); });
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Not started/); });
  }, 120_000);

  const wipeAll = async (user: User): Promise<void> => {
    await user.click(screen.getByRole('button', { name: 'Delete all local tags' }));
    await user.click(screen.getByRole('button', { name: 'I understand, continue' }));
    await user.click(screen.getByRole('button', { name: 'Permanently delete all tags' }));
  };

  it('is not Done for an archive of no tags once tags exist again after a wipe', async () => {
    fastKdf();
    const store = new MemoryTagStore();
    const services = makeServices({ vault: new TagVault(store) });
    const user = await open(services);
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: .*Tags in the archive: 0\./); }, { timeout: 60_000 });
    await wipeAll(user);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: /); });
    await user.click(nav('Home'));
    await services.vault.unlock(revealViewingKey());
    await services.vault.save(84532, tag);
    await user.click(nav('Seller keys'));
    await recheck();
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Changed since last archive/); });
    services.vault.lock();
    await recheck();
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Cannot check \(tags locked\)/); });
  }, 120_000);

  it('notices a label-only edit', async () => {
    fastKdf();
    const services = makeServices();
    const user = await open(services);
    await services.vault.unlock(revealViewingKey());
    await services.vault.save(84532, tag);
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: .*Tags in the archive: 1\./); }, { timeout: 60_000 });
    await services.vault.save(84532, { ...tag, clientLabel: 'Renamed' });
    await recheck();
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Changed since last archive/); });
  }, 120_000);

  it('is Done again after a second export of unchanged tags', async () => {
    const { user } = await exported();
    await exportTags(user, false);
    await waitFor(() => { expect(blobs).toHaveLength(2); }, { timeout: 60_000 });
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: /); });
  }, 120_000);

  it('does not keep saying Done while a fresh read of changed tags is pending', async () => {
    const { services } = await exported();
    await services.vault.save(84532, tag);
    vi.spyOn(services.vault, 'fingerprint').mockImplementation(() => new Promise<string>(() => undefined));
    await recheck();
    expect(status('backup-item-tags')).toMatch(/^Checking: /);
  }, 120_000);
});
