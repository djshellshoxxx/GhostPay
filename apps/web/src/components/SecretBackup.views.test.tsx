// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, setHash } from '../test/render';

/** The views that offer a backup, as the app's navigation names them. */
const VIEWS = [
  { nav: 'Bitcoin (test)', show: 'Show backup seed', copy: 'Copy seed', backup: /^[0-9a-f]{64}$/ },
  { nav: 'Solana (test)', show: 'Show backup seed', copy: 'Copy seed', backup: /^[0-9a-f]{64}$/ },
  { nav: 'TRON (test)', show: 'Show backup keys', copy: 'Copy keys', backup: /^[0-9a-f]{128}$/ },
] as const;

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
    it(`${view.nav}: leaving the view preserves the clipboard by default`, async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
      const { user, nav } = await copyIn(view, writeText);
      await user.click(nav.getByRole('button', { name: 'Home' }));
      expect(screen.queryByRole('button', { name: view.copy })).toBeNull();
      expect(writeText).toHaveBeenCalledOnce();
      // Returning to the view cannot reinstate an old cleanup.
      await user.click(nav.getByRole('button', { name: view.nav }));
      await user.click(nav.getByRole('button', { name: 'Home' }));
      expect(writeText).toHaveBeenCalledOnce();
    });
  }

});
