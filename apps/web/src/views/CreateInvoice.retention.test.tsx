// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RETENTION_KEY } from '../lib/metadataRetention';
import { clearSession, getSessionPublic } from '../lib/session';
import { generateWaivedSession } from '../test/keys';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => { clearSession(); localStorage.clear(); window.history.replaceState(null, '', '/'); });
afterEach(() => { vi.restoreAllMocks(); });

async function createdInvoice(fetchFn = vi.fn(() => Promise.reject(new Error('no network')))): Promise<ReturnType<typeof userEvent.setup>> {
  generateWaivedSession();
  const user = userEvent.setup();
  renderApp(makeServices({ fetchFn }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
  await user.type(screen.getByLabelText('Token amount'), '1');
  await user.type(screen.getByLabelText('Item 1 description'), 'Retained editable draft');
  await user.clear(screen.getByLabelText('Item 1 unit price'));
  await user.type(screen.getByLabelText('Item 1 unit price'), '1.00');
  await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
  await screen.findByLabelText('Link');
  return user;
}

const EXPIRED = /The invoice preview closed under your retention setting/;

it('clears a real generated invoice preview while preserving form, seller keys and stored records', async () => {
  const fetchFn = vi.fn(() => Promise.reject(new Error('no network')));
  const user = await createdInvoice(fetchFn);
  const keysBefore = getSessionPublic();
  const storedBefore = { ...localStorage };
  await user.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
  expect(screen.getByLabelText('Link')).toBeTruthy();
  expect(screen.getByText(/a link you have not copied cannot be shown again/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Clear previewed screen data' }));
  expect(screen.queryByLabelText('Link')).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').value).toBe('Retained editable draft');
  expect(screen.getByLabelText<HTMLInputElement>('Token amount').value).toBe('1');
  expect(getSessionPublic()).toEqual(keysBefore);
  expect({ ...localStorage }).toEqual(storedBefore);
  expect(fetchFn).not.toHaveBeenCalled();
  // Outcome is announced; focus returns to the control instead of the removed confirm button; no expiry notice.
  expect(screen.getByText('Previewed screen data cleared.').closest('[aria-live="polite"]')).not.toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
  expect(screen.queryByText(EXPIRED)).toBeNull();
});

it('returns focus to the preview control when a cleanup review is cancelled', async () => {
  const user = await createdInvoice();
  await user.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
  await user.click(screen.getByRole('button', { name: 'Cancel cleanup' }));
  expect(screen.getByLabelText('Link')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
});

it('closes the preview on opted-in expiry, announces why, and keeps the form and stored records', async () => {
  localStorage.setItem(RETENTION_KEY, '{"delay":300000}');
  await createdInvoice();
  const storedBefore = { ...localStorage };
  const now = Date.now();
  // Still inside the window: nothing closes.
  vi.spyOn(Date, 'now').mockReturnValue(now + 290_000);
  act(() => { window.dispatchEvent(new Event('focus')); });
  expect(screen.getByLabelText('Link')).toBeTruthy();
  vi.spyOn(Date, 'now').mockReturnValue(now + 301_000);
  act(() => { window.dispatchEvent(new Event('focus')); });
  expect(screen.queryByLabelText('Link')).toBeNull();
  const notice = screen.getByText(EXPIRED);
  expect(notice.closest('[aria-live="polite"]')).not.toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').value).toBe('Retained editable draft');
  expect({ ...localStorage }).toEqual(storedBefore);
});

it('does not expire anything while the preference is off', async () => {
  await createdInvoice();
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 3_600_000);
  act(() => { window.dispatchEvent(new Event('focus')); });
  expect(screen.getByLabelText('Link')).toBeTruthy();
  expect(screen.queryByText(EXPIRED)).toBeNull();
});
