// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import * as invoiceCreate from '../lib/invoiceCreate';
import { clearSession } from '../lib/session';
import { BASE_FORM, NOW } from '../test/invoiceFixtures';
import { generateWaivedSession } from '../test/keys';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => { clearSession(); localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

async function open() {
  const fetchFn = vi.fn(() => Promise.reject(new Error('No network expected')));
  const user = userEvent.setup();
  renderApp(makeServices({ fetchFn }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
  return { user, fetchFn };
}

describe('invoice draft presentation revocation', () => {
  it.each(['manual', 'idle', 'session replacement'] as const)('clears private form drafts on %s and does not reuse the old passphrase', async (change) => {
    generateWaivedSession();
    const { user, fetchFn } = await open();
    const memo = screen.getByLabelText<HTMLTextAreaElement>('Memo (optional, shown to the payer)');
    const amount = screen.getByLabelText<HTMLInputElement>('Token amount');
    const description = screen.getByLabelText<HTMLInputElement>('Item 1 description');
    fireEvent.change(memo, { target: { value: 'Private invoice draft for one session' } });
    fireEvent.change(amount, { target: { value: '0.321' } });
    fireEvent.change(description, { target: { value: 'Private appointment' } });
    await user.click(screen.getByLabelText('Protect the entire invoice with a passphrase'));
    const passphrase = screen.getByLabelText<HTMLInputElement>('Invoice passphrase (at least 14 characters)');
    fireEvent.change(passphrase, { target: { value: 'private custom invoice passphrase' } });
    fireEvent.change(screen.getByLabelText('Repeat invoice passphrase'), { target: { value: 'private custom invoice passphrase' } });
    const settings = localStorage.getItem('ghostpay.settings.v1');

    act(() => { if (change === 'session replacement') generateWaivedSession(); else notifyAppLock(change); });
    expect(memo.isConnected).toBe(false);
    expect(passphrase.isConnected).toBe(false);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Memo (optional, shown to the payer)').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Token amount').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Protect the entire invoice with a passphrase').checked).toBe(false);
    expect(document.body.textContent).not.toContain('Private appointment');
    expect(screen.queryByDisplayValue('private custom invoice passphrase')).toBeNull();
    await user.click(screen.getByLabelText('Protect the entire invoice with a passphrase'));
    expect(screen.getByLabelText<HTMLInputElement>('Invoice passphrase (at least 14 characters)').value).not.toBe('private custom invoice passphrase');
    expect(screen.getByLabelText<HTMLInputElement>('Repeat invoice passphrase').value).toBe('');
    expect(localStorage.getItem('ghostpay.settings.v1')).toBe(settings);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('ignores an invoice construction that %s after the draft is revoked', async (settlement) => {
    generateWaivedSession();
    const completed = await invoiceCreate.buildInvoiceLink({ ...BASE_FORM, memo: 'Old private construction' }, 'https://app.test/', NOW);
    let finish!: () => void;
    const pending = new Promise<invoiceCreate.CreatedInvoice>((resolve, reject) => {
      finish = () => { if (settlement === 'resolve') resolve(completed); else reject(new Error('Obsolete invoice failure')); };
    });
    const build = vi.spyOn(invoiceCreate, 'buildInvoiceLink').mockReturnValueOnce(pending);
    const { user, fetchFn } = await open();
    fireEvent.change(screen.getByLabelText('Token amount'), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: 'Local draft' } });
    fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '1' } });
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect(build).toHaveBeenCalledOnce();
    act(() => { notifyAppLock('manual'); });
    await act(async () => { finish(); await pending.catch(() => undefined); });
    expect(screen.queryByDisplayValue(completed.link)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download payment request' })).toBeNull();
    expect(screen.queryByText('Obsolete invoice failure')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Token amount').value).toBe('');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
