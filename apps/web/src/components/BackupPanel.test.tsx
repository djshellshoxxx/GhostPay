// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import * as tagArchive from '../lib/tagArchive';
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
afterEach(() => { vi.restoreAllMocks(); });

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
  await user.type(tags.getByLabelText('Repeat archive passphrase'), PASS);
  if (!withHistory) await user.click(tags.getByLabelText('Include scan history'));
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

  it('marks the tag archive done after the export completed', async () => {
    const user = await open();
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done: Tag archive downloaded\. Tags in the archive: 0\./); }, { timeout: 60_000 });
    expect(blobs).toHaveLength(1);
    expect(status('backup-item-keys')).toMatch(/^Not started/);
  }, 120_000);

  it('does not call the tag archive plain done when scan history could not be included', async () => {
    // jsdom has no IndexedDB: the scan history cannot be read, and the archive says so.
    const user = await open();
    await exportTags(user, true);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Done with gaps: .*NOT in it/); }, { timeout: 60_000 });
    expect(blobs).toHaveLength(1);
  }, 120_000);

  it('marks the tag archive failed, never done, when the export throws', async () => {
    vi.spyOn(tagArchive, 'exportArchive').mockRejectedValue(new Error('disk full'));
    const user = await open();
    await exportTags(user, false);
    await waitFor(() => { expect(status('backup-item-tags')).toMatch(/^Failed: The tag archive was not produced/); });
    expect(blobs).toHaveLength(0);
  });
});
