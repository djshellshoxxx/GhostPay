// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession, revealViewingKey } from '../lib/session';
import { makeServices, renderApp } from '../test/render';

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
