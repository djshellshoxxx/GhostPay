// @vitest-environment jsdom
// #695 x #691 composition: a privacy-minimal invoice result and its mode choice belong to one presentation generation.
// After a manual lock, idle lock or seller-session replacement, the old link and its downloads cannot reappear and the
// new form starts in the default itemized mode.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { clearSession } from '../lib/session';
import { generateWaivedSession } from '../test/keys';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => { clearSession(); localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

describe('privacy-minimal invoice presentation revocation', () => {
  it.each(['manual', 'idle', 'session replacement'] as const)('drops a minimal link and resets the mode on %s', async (change) => {
    generateWaivedSession();
    const fetchFn = vi.fn(() => Promise.reject(new Error('No network expected')));
    const user = userEvent.setup();
    renderApp(makeServices({ fetchFn }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));

    await user.click(screen.getByLabelText('Privacy-minimal invoice'));
    expect(screen.getByLabelText<HTMLInputElement>('Privacy-minimal invoice').checked).toBe(true);
    expect(screen.queryByLabelText('Memo (optional, shown to the payer)')).toBeNull();
    fireEvent.change(screen.getByLabelText('Token amount'), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '1' } });
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const download = await screen.findByRole('button', { name: 'Download invoice link (.txt)' });
    const link = screen.getByLabelText<HTMLTextAreaElement>('Link').value;
    expect(link).toContain('#');

    act(() => { if (change === 'session replacement') generateWaivedSession(); else notifyAppLock(change); });
    expect(download.isConnected).toBe(false);
    expect(screen.queryByRole('button', { name: 'Download invoice link (.txt)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download payment request' })).toBeNull();
    expect(screen.queryByDisplayValue(link)).toBeNull();
    expect(document.body.textContent).not.toContain(link);
    expect(screen.getByLabelText<HTMLInputElement>('Privacy-minimal invoice').checked).toBe(false);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Memo (optional, shown to the payer)').value).toBe('');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
