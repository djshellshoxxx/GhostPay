// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { renderApp, setHash } from '../test/render';

/** The views that offer a backup, as the app's navigation names them. */
const VIEWS = [
  { nav: 'Bitcoin (test)', show: 'Show backup seed', copy: 'Copy seed', backup: /^[0-9a-f]{64}$/ },
  { nav: 'Solana (test)', show: 'Show backup seed', copy: 'Copy seed', backup: /^[0-9a-f]{64}$/ },
  { nav: 'TRON (test)', show: 'Show backup keys', copy: 'Copy keys', backup: /^[0-9a-f]{128}$/ },
] as const;

/** How browsers refuse a clipboard write without user activation or in a page that is not focused. */
const refused = (): Promise<void> => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'));

/** Opens `view` in the app, creates a wallet there and copies its backup (confirmed); returns the navigation. */
async function copyIn(view: (typeof VIEWS)[number], writeText: (text: string) => Promise<void>) {
  const user = userEvent.setup();
  // After setup(), which installs a clipboard stub of its own.
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  renderApp();
  const nav = within(screen.getByRole('navigation', { name: 'Main' }));
  await user.click(nav.getByRole('button', { name: view.nav }));
  await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
  await user.click(screen.getByRole('button', { name: view.show }));
  const backup = screen.getByText(view.backup).textContent;
  await user.click(screen.getByRole('button', { name: view.copy }));
  await user.click(screen.getByRole('button', { name: 'Copy anyway' }));
  expect(writeText).toHaveBeenCalledExactlyOnceWith(backup);
  return { user, nav };
}

describe('a copied backup when its view is left (the app shows one view at a time)', () => {
  beforeEach(() => {
    setHash('');
  });

  for (const view of VIEWS) {
    it(`${view.nav}: leaving the view empties the clipboard, like Lock`, async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
      const { user, nav } = await copyIn(view, writeText);
      await user.click(nav.getByRole('button', { name: 'Home' }));
      expect(screen.queryByRole('button', { name: view.copy })).toBeNull();
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(writeText).toHaveBeenLastCalledWith('');
      // Emptied once: coming back and leaving again leaves the clipboard alone.
      await user.click(nav.getByRole('button', { name: view.nav }));
      await user.click(nav.getByRole('button', { name: 'Home' }));
      expect(writeText).toHaveBeenCalledTimes(2);
    });
  }

  it('a clear the browser refuses when the view is left is tried again by the app lock, and done at the next click', async () => {
    let refuse = false;
    const writeText = vi.fn((text: string) => (refuse && text === '' ? refused() : Promise.resolve()));
    const { user, nav } = await copyIn(VIEWS[0], writeText);
    refuse = true;
    await user.click(nav.getByRole('button', { name: 'Home' }));
    expect(writeText).toHaveBeenCalledTimes(2);
    // No view that holds keys is mounted, so no view's lock runs: the app lock still tries (and is refused again).
    await act(async () => {
      notifyAppLock('idle');
      await Promise.resolve();
    });
    expect(writeText.mock.calls.map(([text]) => text)).toEqual([expect.any(String), '', '']);
    refuse = false;
    await user.click(nav.getByRole('button', { name: 'Settings' }));
    expect(writeText).toHaveBeenCalledTimes(4);
    expect(writeText).toHaveBeenLastCalledWith('');
    await user.click(nav.getByRole('button', { name: 'Home' }));
    expect(writeText).toHaveBeenCalledTimes(4);
  });
});
