// @vitest-environment jsdom
import { parseFragment } from '@ghostpay/invoice-schema';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as creation from '../lib/invoiceCreate';
import { clearSession, importSession } from '../lib/session';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { ServicesContext } from '../lib/services';
import { AppContext, type AppState } from '../state';
import { BASE_FORM, NOW } from '../test/invoiceFixtures';
import { makeServices } from '../test/render';
import { CreateInvoice } from './CreateInvoice';

const keys = (n: number) => ({
  spendingKeyHex: n.toString(16).padStart(64, '0'),
  viewingKeyHex: (n + 1).toString(16).padStart(64, '0'),
  signingKeyHex: (n + 2).toString(16).padStart(64, '0'),
});
const ENCRYPT_LABEL = 'Encrypt line items and memo with a key included in the link';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount() {
  const session = importSession(keys(1));
  const announce = vi.fn();
  let app: AppState = {
    view: 'create', setView: () => undefined, settings: DEFAULT_SETTINGS, updateSettings: () => true,
    session, fragment: undefined, setFragment: () => undefined,
    matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
    getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce,
  };
  const services = makeServices();
  const view = () => <ServicesContext.Provider value={services}><AppContext.Provider value={app}>
    <CreateInvoice />
  </AppContext.Provider></ServicesContext.Provider>;
  let mounted = render(view());
  return {
    announce,
    user: userEvent.setup(),
    rerender: () => { mounted.rerender(view()); },
    replaceSession: (n: number) => { app = { ...app, session: importSession(keys(n)) }; mounted.rerender(view()); },
    remount: () => { mounted.unmount(); mounted = render(view()); },
  };
}

function fill(marker: string): void {
  fireEvent.change(screen.getByLabelText('Token amount'), { target: { value: '1.25' } });
  fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: marker } });
  fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '25.50' } });
  fireEvent.change(screen.getByLabelText('Memo (optional, shown to the payer)'), { target: { value: marker } });
}

describe('TM10 invoice privacy defaults and session consent', () => {
  it('restores encrypted defaults after remount without persisting the opt-out or invoice contents', async () => {
    const { user, remount, rerender } = mount();
    expect(screen.getByLabelText<HTMLInputElement>(ENCRYPT_LABEL).checked).toBe(true);
    await user.click(screen.getByLabelText(ENCRYPT_LABEL));
    fill('private-invoice-remount-marker');
    rerender();
    expect(screen.getByLabelText<HTMLInputElement>(ENCRYPT_LABEL).checked).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const link = (await screen.findByLabelText<HTMLTextAreaElement>('Link')).value;
    expect((await parseFragment(link.slice('https://app.test/'.length))).encrypted).toBe(false);
    for (const storage of [window.localStorage, window.sessionStorage]) {
      expect(JSON.stringify(storage)).not.toContain('private-invoice-remount-marker');
      expect(JSON.stringify(storage)).not.toContain(link);
      expect(JSON.stringify(storage)).not.toContain('encrypt');
    }
    remount();
    expect(screen.getByLabelText<HTMLInputElement>(ENCRYPT_LABEL).checked).toBe(true);
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').value).toBe('');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Memo (optional, shown to the payer)').value).toBe('');
  });

  it.each([1, 4])('does not inherit plaintext consent or invoice contents in replacement session %s', async (replacement) => {
    const { user, replaceSession } = mount();
    await user.click(screen.getByLabelText(ENCRYPT_LABEL));
    fill('previous-seller-private-invoice-marker');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const oldLink = (await screen.findByLabelText<HTMLTextAreaElement>('Link')).value;
    expect((await parseFragment(oldLink.slice('https://app.test/'.length))).encrypted).toBe(false);
    // Even a reinstall of the same public keys is a new consent lifetime.
    replaceSession(replacement);
    expect(screen.getByLabelText<HTMLInputElement>(ENCRYPT_LABEL).checked).toBe(true);
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').value).toBe('');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Memo (optional, shown to the payer)').value).toBe('');
    fill('new-seller-invoice-marker');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const nextLink = (await screen.findByLabelText<HTMLTextAreaElement>('Link')).value;
    const parsed = await parseFragment(nextLink.slice('https://app.test/'.length));
    expect(parsed.encrypted).toBe(true);
    expect(parsed.verification.signatureValid).toBe(true);
    expect(parsed.invoice.memo).toBe('new-seller-invoice-marker');
  });

  it('discards an invoice result that completes after replacing the seller session', async () => {
    const { user, replaceSession, announce } = mount();
    const ready = await creation.buildInvoiceLink({ ...BASE_FORM, encrypt: false }, 'https://app.test/', NOW);
    let finish: (created: creation.CreatedInvoice) => void = () => { throw new Error('request not started'); };
    const pending = new Promise<creation.CreatedInvoice>((resolve) => { finish = resolve; });
    vi.spyOn(creation, 'buildInvoiceLink').mockReturnValueOnce(pending);
    fill('pending-old-seller-marker');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    replaceSession(4);
    await act(async () => { finish(ready); await pending; });
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });
});
