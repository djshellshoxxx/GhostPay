// @vitest-environment jsdom
import { cleanup, fireEvent, isInaccessible, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell, CORE_ORDER } from './AppShell';
import { clearSession, generateSession, getSessionPublic } from './lib/session';
import { UI_PRIVACY_KEY } from './lib/settings';
import { renderWith } from './test/render';

beforeEach(() => {
  clearSession();
  localStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

it('quick-hides an active sensitive draft without changing privacy preferences or sole-copy keys', async () => {
  const user = userEvent.setup();
  const session = generateSession();
  const preferences = '{ "privacyMode": true, "clipboardClearAfterMs": 0 }';
  localStorage.setItem(UI_PRIVACY_KEY, preferences);
  renderWith(<AppShell order={CORE_ORDER} profile="lean" />);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Pay' }));
  await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
  const draft = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Paste an invoice link' });
  fireEvent.change(draft, { target: { value: '#private-unsaved-invoice' } });
  draft.focus();

  fireEvent.keyDown(draft, { key: 'H', altKey: true, shiftKey: true });

  expect(isInaccessible(draft)).toBe(true);
  expect(screen.queryByRole('textbox', { name: 'Paste an invoice link' })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Privacy mode' }));
  expect(getSessionPublic()).toBe(session);
  expect(localStorage.getItem(UI_PRIVACY_KEY)).toBe(preferences);
  expect(screen.getByRole('button', { name: 'Hide sensitive details (Alt+Shift+H)' }).getAttribute('aria-keyshortcuts')).toBe('Alt+Shift+H');

  fireEvent.keyDown(document, { key: 'h', altKey: true, shiftKey: true });
  expect(isInaccessible(draft)).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
  expect(screen.getByRole('textbox', { name: 'Paste an invoice link' })).toBe(draft);
  expect(draft.value).toBe('#private-unsaved-invoice');
  expect(getSessionPublic()).toBe(session);
});
