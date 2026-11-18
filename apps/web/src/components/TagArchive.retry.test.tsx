// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { clearSession, generateSession, getSessionPublic, revealViewingKey } from '../lib/session';
import * as tagArchive from '../lib/tagArchive';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => { clearSession(); window.localStorage.clear(); window.history.replaceState(null, '', '/'); });
afterEach(() => { vi.restoreAllMocks(); });

async function openArchive() {
  generateSession();
  const services = makeServices({ chains: [] });
  await services.vault.unlock(revealViewingKey());
  const user = userEvent.setup();
  const rendered = renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  const tags = await services.vault.previewImport([], 'merge');
  const preview: tagArchive.ArchiveImportPreview = {
    tags, keyVersion: 1, createdAt: 1, historyChains: [],
    contents: { createdAt: 1, keyVersion: 1, records: [], history: {} },
  };
  return { user, services, preview, ...rendered };
}

describe('tag archive import lifetime and repeated files', () => {
  it('allows the same file after a completed import without clearing the export form', async () => {
    const { user, preview } = await openArchive();
    const read = vi.spyOn(tagArchive, 'previewArchiveImport').mockResolvedValue(preview);
    const file = new File(['fixture'], 'archive.gpa');
    const exportPass = screen.getByLabelText<HTMLInputElement>('Archive passphrase (at least 14 characters)');
    const originalSuggestion = exportPass.value;
    await user.upload(screen.getByLabelText('Archive file'), file);
    expect(exportPass.value).toBe(originalSuggestion);
    await user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await user.click(await screen.findByRole('button', { name: 'Apply import' }));
    await screen.findAllByText(/Imported: 0 added/);
    await user.upload(screen.getByLabelText('Archive file'), file);
    await user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await waitFor(() => { expect(read).toHaveBeenCalledTimes(2); });
    expect(await screen.findByRole('button', { name: 'Apply import' })).toBeTruthy();
  });

  it('invalidates a staged import at idle lock while unsaved seller keys remain loaded', async () => {
    const { user, preview } = await openArchive();
    vi.spyOn(tagArchive, 'previewArchiveImport').mockResolvedValue(preview);
    await user.upload(screen.getByLabelText('Archive file'), new File(['fixture'], 'archive.gpa'));
    await user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await screen.findByRole('button', { name: 'Apply import' });
    act(() => { notifyAppLock('idle'); });
    expect(getSessionPublic()).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull();
  });

  it('drops a late decryption result after an idle lock', async () => {
    const { user, preview } = await openArchive();
    let resolve!: (value: tagArchive.ArchiveImportPreview) => void;
    const read = vi.spyOn(tagArchive, 'previewArchiveImport').mockImplementation(() => new Promise((done) => { resolve = done; }));
    await user.upload(screen.getByLabelText('Archive file'), new File(['fixture'], 'archive.gpa'));
    await user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await waitFor(() => { expect(read).toHaveBeenCalledOnce(); });
    act(() => { notifyAppLock('idle'); });
    await act(async () => { resolve(preview); await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull();
  });

  it('keeps a selected import when the file picker is cancelled and permits a different-file retry', async () => {
    const { user, preview } = await openArchive();
    const read = vi.spyOn(tagArchive, 'previewArchiveImport').mockResolvedValue(preview);
    await user.upload(screen.getByLabelText('Archive file'), new File(['first'], 'first.gpa'));
    expect(screen.getByText('first.gpa')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Archive file'), { target: { files: [] } });
    expect(screen.getByText('first.gpa')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await waitFor(() => { expect(read).toHaveBeenCalledOnce(); });
    await user.upload(screen.getByLabelText('Archive file'), new File(['next'], 'next.gpa'));
    expect(screen.queryByText('first.gpa')).toBeNull();
    expect(screen.getByText('next.gpa')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Decrypt and preview' }));
    await waitFor(() => { expect(read).toHaveBeenCalledTimes(2); });
  });
});
