// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as reconciliation from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { clearSession, generateSession, getSessionPublic } from '../lib/session';
import * as tagArchive from '../lib/tagArchive';
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

async function open(): Promise<User> {
  generateSession();
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
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
    expect(document.activeElement?.textContent).toBe('Back up (encrypted)');
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
  const cases: readonly { name: string; history: boolean; arrange: () => Promise<void> | void; status: RegExp; blobs: number }[] = [
    { name: 'Done, naming the choice, when history was left out on purpose', history: false, arrange: () => undefined, status: /^Done: Tag archive downloaded WITHOUT scan history, as you chose\. Tags in the archive: 0\./, blobs: 1 },
    { name: 'Done with gaps when history is stored for a chain this build does not support', history: true, arrange: () => storeHistory([84532, 777777]), status: /^Done with gaps: .*NOT in it/, blobs: 1 },
    { name: 'Done with gaps when the history of a chain could not be read', history: true, arrange: () => { vi.spyOn(reconciliation, 'createCurrentReconciliationVault').mockRejectedValue(new Error('unavailable')); }, status: /^Done with gaps: .*NOT in it/, blobs: 1 },
    { name: 'plain Done only when history was included and nothing was left out', history: true, arrange: () => undefined, status: /^Done: Tag archive downloaded\. Tags in the archive: 0\./, blobs: 1 },
    { name: 'Failed, never Done, when the export throws', history: false, arrange: () => { vi.spyOn(tagArchive, 'exportArchive').mockRejectedValue(new Error('disk full')); }, status: /^Failed: The tag archive was not produced/, blobs: 0 },
  ];
  it.each(cases)('tag archive item says $name', async (c) => {
    if (c.blobs > 0) fastKdf();
    vi.stubGlobal('indexedDB', memoryIndexedDb());
    const user = await open();
    await c.arrange();
    await exportTags(user, c.history);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(c.status); }, { timeout: 60_000 });
    expect(blobs).toHaveLength(c.blobs);
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
});
