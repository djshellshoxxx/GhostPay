// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { emptyClipboardOnRequest } from '../lib/clipboardPrivacy';
import { renderApp, setHash } from '../test/render';

/** The views that offer a backup, as the app's navigation names them. */
const VIEWS = [
  { nav: 'Bitcoin (test)', show: 'Show backup seed', copy: 'Copy seed', backup: /^[0-9a-f]{64}$/ },
  { nav: 'Solana (test)', show: 'Show backup seed', copy: 'Copy seed', backup: /^[0-9a-f]{64}$/ },
  { nav: 'TRON (test)', show: 'Show backup keys', copy: 'Copy keys', backup: /^[0-9a-f]{128}$/ },
] as const;

const NOTICE = 'A copied backup may still be on the clipboard';

/** A clipboard stub: a refused write leaves its text unchanged. */
function stubClipboard(refuseClear: () => boolean = () => false) {
  const state = { text: '' };
  const readText = vi.fn(() => Promise.resolve(state.text));
  const writeText = vi.fn((text: string) => {
    if (text === '' && refuseClear()) return Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'));
    state.text = text;
    return Promise.resolve();
  });
  return { state, readText, writeText };
}

/** Opens `view` in the app, creates a wallet there and copies its backup (confirmed); returns the navigation. */
async function copyIn(view: (typeof VIEWS)[number], clipboard: ReturnType<typeof stubClipboard>) {
  const user = userEvent.setup();
  // After setup(), which installs a clipboard stub of its own.
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: clipboard.readText, writeText: clipboard.writeText } });
  renderApp();
  const nav = within(screen.getByRole('navigation', { name: 'Main' }));
  await user.click(nav.getByRole('button', { name: view.nav }));
  await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
  await user.click(screen.getByRole('button', { name: view.show }));
  const backup = screen.getByText(view.backup).textContent;
  await user.click(screen.getByRole('button', { name: view.copy }));
  await user.click(screen.getByRole('button', { name: 'Copy anyway' }));
  expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(backup);
  return { user, nav, backup };
}

describe('a copied backup when its view is left (the app shows one view at a time)', () => {
  beforeEach(() => {
    setHash('');
  });
  afterEach(async () => {
    await emptyClipboardOnRequest();
  });

  for (const view of VIEWS) {
    it(`${view.nav}: leaving the view empties the clipboard while it still holds the backup, like Lock`, async () => {
      const clipboard = stubClipboard();
      const { user, nav } = await copyIn(view, clipboard);
      await user.click(nav.getByRole('button', { name: 'Home' }));
      expect(screen.queryByRole('button', { name: view.copy })).toBeNull();
      await vi.waitFor(() => { expect(clipboard.state.text).toBe(''); });
      expect(clipboard.writeText).toHaveBeenCalledTimes(2);
      // Emptied once: coming back and leaving again leaves the clipboard alone.
      await user.click(nav.getByRole('button', { name: view.nav }));
      await user.click(nav.getByRole('button', { name: 'Home' }));
      expect(clipboard.writeText).toHaveBeenCalledTimes(2);
    });
  }

  it('leaving the view keeps text copied after the backup', async () => {
    const clipboard = stubClipboard();
    const { user, nav } = await copyIn(VIEWS[0], clipboard);
    clipboard.state.text = 'copied later in another application';
    await user.click(nav.getByRole('button', { name: 'Home' }));
    await vi.waitFor(() => { expect(clipboard.readText).toHaveBeenCalled(); });
    expect(clipboard.state.text).toBe('copied later in another application');
    expect(clipboard.writeText).toHaveBeenCalledOnce();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('a clear the browser refuses when the view is left is reported, tried again by the app lock, and done at the next click', async () => {
    let refuse = false;
    const clipboard = stubClipboard(() => refuse);
    const { user, nav, backup } = await copyIn(VIEWS[0], clipboard);
    refuse = true;
    await user.click(nav.getByRole('button', { name: 'Home' }));
    await vi.waitFor(() => { expect(clipboard.writeText).toHaveBeenCalledTimes(2); });
    expect(await screen.findByText(NOTICE)).toBeTruthy();
    // No view that holds keys is mounted, so no view's lock runs: the app lock still tries (and is refused again).
    await act(async () => {
      notifyAppLock('idle');
      await Promise.resolve();
    });
    await vi.waitFor(() => { expect(clipboard.writeText.mock.calls.map(([text]) => text)).toEqual([backup, '', '']); });
    expect(clipboard.state.text).toBe(backup);
    refuse = false;
    await user.click(nav.getByRole('button', { name: 'Settings' }));
    await vi.waitFor(() => { expect(clipboard.state.text).toBe(''); });
    expect(clipboard.writeText).toHaveBeenCalledTimes(4);
    expect(screen.queryByText(NOTICE)).toBeNull();
    await user.click(nav.getByRole('button', { name: 'Home' }));
    expect(clipboard.writeText).toHaveBeenCalledTimes(4);
  });
});
