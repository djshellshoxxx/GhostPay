// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { clearSession, getSessionPublic } from '../lib/session';
import { generateWaivedSession } from '../test/keys';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => { clearSession(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

it('clears a real generated invoice preview while preserving form, seller keys and stored records', async () => {
  generateWaivedSession();
  const keysBefore = getSessionPublic();
  const fetchFn = vi.fn(() => Promise.reject(new Error('no network')));
  const user = userEvent.setup();
  renderApp(makeServices({ fetchFn }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
  await user.type(screen.getByLabelText('Token amount'), '1');
  await user.type(screen.getByLabelText('Item 1 description'), 'Retained editable draft');
  await user.clear(screen.getByLabelText('Item 1 unit price'));
  await user.type(screen.getByLabelText('Item 1 unit price'), '1.00');
  await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
  await screen.findByLabelText('Link');
  const storedBefore = { ...localStorage };
  await user.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
  expect(screen.getByLabelText('Link')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Clear previewed screen data' }));
  expect(screen.queryByLabelText('Link')).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').value).toBe('Retained editable draft');
  expect(screen.getByLabelText<HTMLInputElement>('Token amount').value).toBe('1');
  expect(getSessionPublic()).toEqual(keysBefore);
  expect({ ...localStorage }).toEqual(storedBefore);
  expect(fetchFn).not.toHaveBeenCalled();
});
