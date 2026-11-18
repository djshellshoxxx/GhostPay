// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { renderApp, setHash } from '../test/render';

/** The views that offer a backup, as the app's navigation names them. */
const VIEWS = [
  { nav: 'Bitcoin (test)', show: 'Show backup seed', hide: 'Hide seed', backup: /^[0-9a-f]{64}$/ },
  { nav: 'Solana (test)', show: 'Show backup seed', hide: 'Hide seed', backup: /^[0-9a-f]{64}$/ },
  { nav: 'TRON (test)', show: 'Show backup keys', hide: 'Hide keys', backup: /^[0-9a-f]{128}$/ },
] as const;

describe('no clipboard path for wallet backups (SEC-13 / OD-02), in the app one view at a time', () => {
  beforeEach(() => {
    setHash('');
  });

  for (const view of VIEWS) {
    it(`${view.nav}: reveal, hide, lock and leaving the view never write to the clipboard, and no copy control exists`, async () => {
      const user = userEvent.setup();
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
      // After setup(), which installs a clipboard stub of its own.
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
      renderApp();
      const nav = within(screen.getByRole('navigation', { name: 'Main' }));
      await user.click(nav.getByRole('button', { name: view.nav }));
      await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
      await user.click(screen.getByRole('button', { name: view.show }));
      expect(screen.getByText(view.backup)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Copy (seed|keys)$/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: view.hide }));
      await user.click(screen.getByRole('button', { name: view.show }));
      await act(async () => {
        notifyAppLock('idle');
        await Promise.resolve();
      });
      await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
      await user.click(screen.getByRole('button', { name: view.show }));
      await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
      await user.click(nav.getByRole('button', { name: 'Home' }));
      expect(writeText).not.toHaveBeenCalled();
    });
  }
});
