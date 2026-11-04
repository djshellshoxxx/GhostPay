// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userMessage } from '../lib/errors';
import * as reconciliation from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { clearSession, generateSession, getSessionPublic, revealViewingKey } from '../lib/session';
import * as tagArchive from '../lib/tagArchive';
import { MemoryTagStore, TagVault } from '../lib/tags';
import { memoryIndexedDb } from '../test/memoryIndexedDb';
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
const tagStatus = (): string => status('backup-item-tags');
const ARCHIVED = /^Downloaded: Last tag archive downloaded .*Tags in it: 0, /;

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

async function wipeAll(user: User): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Delete all local tags' }));
  await user.click(screen.getByRole('button', { name: 'I understand, continue' }));
  await user.click(screen.getByRole('button', { name: 'Permanently delete all tags' }));
}

const tag = { stealthAddress: '0x1111111111111111111111111111111111111111', announcementId: `0x${'ab'.repeat(32)}:1`, logIndex: 1, clientLabel: 'Acme' };

describe('BackupPanel', () => {
  it('starts with both items not started and claims nothing', async () => {
    await open();
    expect(status('backup-item-keys')).toMatch(/^Not started: No copy of these keys exists outside this tab yet/);
    expect(tagStatus()).toMatch(/^Not started: No tag archive was downloaded/);
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
    expect(tagStatus()).toMatch(/^Not started/);
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
    { name: 'the facts, naming the choice, when history was left out on purpose', history: false, arrange: () => undefined, status: /^Downloaded: Last tag archive downloaded .*Tags in it: 0, without scan history\./, blobs: 1 },
    { name: 'gaps when history is stored for a chain this build does not support', history: true, arrange: () => storeHistory([84532, 777777]), status: /^Downloaded, with gaps: .*NOT in it/, blobs: 1 },
    { name: 'gaps when the history of a chain could not be read', history: true, arrange: () => { vi.spyOn(reconciliation, 'createCurrentReconciliationVault').mockRejectedValue(new Error('unavailable')); }, status: /^Downloaded, with gaps: .*NOT in it/, blobs: 1 },
    { name: 'the facts when history was included and nothing was left out', history: true, arrange: () => undefined, status: /^Downloaded: Last tag archive downloaded .*Tags in it: 0, with scan history\./, blobs: 1 },
    { name: 'Failed when the export throws', history: false, arrange: () => { vi.spyOn(tagArchive, 'exportArchive').mockRejectedValue(new Error('disk full')); }, status: /^Failed: The latest tag archive attempt failed and produced no file/, blobs: 0 },
    { name: 'gaps when the stored history cannot be listed', history: true, arrange: () => { vi.spyOn(reconciliation, 'createCurrentReconciliationVault').mockResolvedValue({ exportEncrypted: () => Promise.resolve('history'), lock: () => undefined } as unknown as reconciliation.ReconciliationVault); vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked'); } }); }, status: /^Downloaded, with gaps: .*NOT in it/, blobs: 1, message: /could not be listed; any such history is NOT in this archive/ },
  ];
  it.each(cases)('tag archive item says $name', async (c) => {
    if (c.blobs > 0) fastKdf();
    vi.stubGlobal('indexedDB', memoryIndexedDb());
    const user = await open();
    await c.arrange();
    await exportTags(user, c.history);
    await waitFor(() => { expect(tagStatus()).toMatch(c.status); }, { timeout: 60_000 });
    expect(tagStatus()).not.toMatch(/Done/);
    expect(blobs).toHaveLength(c.blobs);
    if (c.message !== undefined) expect(document.body.textContent).toMatch(c.message);
    expect(status('backup-item-keys')).toMatch(/^Not started/);
  }, 120_000);

  it('states that tags saved later are not in the archive, and never turns that into Done', async () => {
    fastKdf();
    const services = makeServices();
    const user = await open(services);
    await exportTags(user, false);
    await waitFor(() => { expect(tagStatus()).toMatch(ARCHIVED); }, { timeout: 60_000 });
    expect(tagStatus()).toMatch(/Tags saved, changed or deleted after that, here or in another tab, are not in it\. Download a new archive to include them\./);
    await services.vault.save(84532, tag);
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(tagStatus()).toMatch(ARCHIVED);
    expect(tagStatus()).not.toMatch(/Done/);
  }, 120_000);

  it('recovers from Failed after a later export completes', async () => {
    const real = tagArchive.exportArchive;
    vi.spyOn(tagArchive, 'exportArchive').mockRejectedValueOnce(new Error('disk full')).mockImplementation((tags, key, pass, options) => real(tags, key, pass, { ...options, N: 1 << 14 }));
    const user = await open();
    await exportTags(user, false);
    await waitFor(() => { expect(tagStatus()).toMatch(/^Failed/); });
    await exportTags(user, false);
    await waitFor(() => { expect(tagStatus()).toMatch(ARCHIVED); }, { timeout: 60_000 });
  }, 120_000);

  it('describes only the latest attempt when an export fails after an earlier success', async () => {
    const real = tagArchive.exportArchive;
    vi.spyOn(tagArchive, 'exportArchive').mockImplementationOnce((tags, key, pass, options) => real(tags, key, pass, { ...options, N: 1 << 14 })).mockRejectedValueOnce(new Error('disk full'));
    const user = await open();
    await exportTags(user, false);
    await waitFor(() => { expect(tagStatus()).toMatch(ARCHIVED); }, { timeout: 60_000 });
    await exportTags(user, false);
    await waitFor(() => { expect(tagStatus()).toMatch(/^Failed: The latest tag archive attempt failed/); });
    expect(tagStatus()).not.toMatch(/not backed up/);
  }, 120_000);

  it('after the in-panel wipe says to keep the archive, which is now the only copy', async () => {
    fastKdf();
    const services = makeServices();
    const user = await open(services);
    await services.vault.unlock(revealViewingKey());
    await services.vault.save(84532, tag);
    await exportTags(user, false);
    await waitFor(() => { expect(tagStatus()).toMatch(/Tags in it: 1,/); }, { timeout: 60_000 });
    await wipeAll(user);
    await waitFor(() => { expect(tagStatus()).toMatch(/^Local tags deleted: All local tags were deleted after the last archive, which holds 1 tags?\. Keep that archive: it is now the only copy/); });
    await user.click(nav('Home'));
    await user.click(nav('Seller keys'));
    expect(tagStatus()).toMatch(/^Local tags deleted/);
  }, 120_000);

  it('keeps the gap and failure details with the outcome after the view is left and reopened', async () => {
    fastKdf();
    vi.spyOn(reconciliation, 'createCurrentReconciliationVault').mockRejectedValue(new Error('unavailable'));
    const user = await open();
    await exportTags(user, true);
    await waitFor(() => { expect(tagStatus()).toMatch(/^Downloaded, with gaps/); }, { timeout: 60_000 });
    await user.click(nav('Home'));
    await user.click(nav('Seller keys'));
    const item = screen.getByTestId('backup-item-tags');
    expect(tagStatus()).toMatch(/^Downloaded, with gaps/);
    expect(item.textContent).toMatch(/could not be read and is NOT in this archive/);
    expect(item.textContent).not.toMatch(/message below/);

    vi.spyOn(tagArchive, 'exportArchive').mockRejectedValue(new Error('disk full'));
    await exportTags(user, false);
    await waitFor(() => { expect(tagStatus()).toMatch(/^Failed/); });
    await user.click(nav('Home'));
    await user.click(nav('Seller keys'));
    expect(screen.getByTestId('backup-item-tags').textContent).toContain(userMessage(new Error('disk full')));
  }, 120_000);

  it('never unlocks the tag vault on mount, focus, visibility or remount', async () => {
    fastKdf();
    const store = new MemoryTagStore();
    const services = makeServices({ vault: new TagVault(store) });
    const user = await open(services);
    await exportTags(user, false);
    await waitFor(() => { expect(tagStatus()).toMatch(ARCHIVED); }, { timeout: 60_000 });
    services.vault.lock();
    const unlock = vi.spyOn(services.vault, 'unlock');
    await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
    await user.click(nav('Home'));
    await user.click(nav('Seller keys'));
    expect(tagStatus()).toMatch(ARCHIVED);
    expect(unlock).not.toHaveBeenCalled();
    expect(services.vault.unlocked).toBe(false);
  }, 120_000);

  it('forgets the outcome when the seller keys are replaced', async () => {
    fastKdf();
    const user = await open();
    await exportTags(user, false);
    await waitFor(() => { expect(tagStatus()).toMatch(ARCHIVED); }, { timeout: 60_000 });
    await act(async () => { clearSession(); generateSession(); await Promise.resolve(); });
    await waitFor(() => { expect(tagStatus()).toMatch(/^Not started/); });
  }, 120_000);
});
