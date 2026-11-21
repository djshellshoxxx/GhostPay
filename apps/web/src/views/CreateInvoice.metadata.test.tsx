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

const OPTION = 'Minimize shared invoice metadata';
const MEMO_LABEL = 'Memo (optional, shown to the payer)';
const DESCRIPTION = 'Private customer project';
const MEMO = 'Private merchant reference';
const keys = (n: number) => ({
  spendingKeyHex: n.toString(16).padStart(64, '0'),
  viewingKeyHex: (n + 1).toString(16).padStart(64, '0'),
  signingKeyHex: (n + 2).toString(16).padStart(64, '0'),
});

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

function mount() {
  const announce = vi.fn();
  const fetchFn = vi.fn(() => Promise.reject(new Error('No network expected.')));
  const services = makeServices({ fetchFn });
  let app: AppState = {
    view: 'create', setView: () => undefined, settings: DEFAULT_SETTINGS, updateSettings: () => true,
    session: importSession(keys(1)), fragment: undefined, setFragment: () => undefined,
    matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
    getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce,
  };
  const view = () => <ServicesContext.Provider value={services}><AppContext.Provider value={app}><CreateInvoice /></AppContext.Provider></ServicesContext.Provider>;
  const mounted = render(view());
  return {
    announce, fetchFn, user: userEvent.setup(),
    replaceSession: () => { app = { ...app, session: importSession(keys(4)) }; mounted.rerender(view()); },
  };
}

function fill(): void {
  fireEvent.change(screen.getByLabelText('Token amount'), { target: { value: '1.25' } });
  fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: DESCRIPTION } });
  fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '25.50' } });
  fireEvent.change(screen.getByLabelText(MEMO_LABEL), { target: { value: MEMO } });
}

async function currentInvoice() {
  const link = (await screen.findByLabelText<HTMLTextAreaElement>('Link')).value;
  return parseFragment(link.slice('https://app.test/'.length));
}

describe('CreateInvoice minimal metadata choice', () => {
  it('is an accessible deliberate choice that creates a locally signed minimized link without deleting form values', async () => {
    const { user, fetchFn } = mount();
    fill();
    const option = screen.getByRole<HTMLInputElement>('checkbox', { name: OPTION });
    expect(option.checked).toBe(false);
    option.focus();
    await user.keyboard('[Space]');
    expect(option.checked).toBe(true);
    expect(option.getAttribute('aria-describedby')).toBe('invoice-metadata-help');
    expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').value).toBe(DESCRIPTION);
    expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLTextAreaElement>(MEMO_LABEL).value).toBe(MEMO);
    expect(screen.getByLabelText<HTMLTextAreaElement>(MEMO_LABEL).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const parsed = await currentInvoice();
    expect(parsed.verification.signatureValid).toBe(true);
    expect(parsed.encrypted).toBe(true);
    expect(parsed.invoice.lineItems).toEqual([{ description: 'Item', quantity: '1', unitMinorUnits: '2550' }]);
    expect(Object.hasOwn(parsed.invoice, 'memo')).toBe(false);
    expect(screen.getByText('This link was signed with minimized metadata. Required payment fields remain included.')).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
    for (const storage of [window.localStorage, window.sessionStorage]) {
      expect(JSON.stringify(storage)).not.toContain(DESCRIPTION);
      expect(JSON.stringify(storage)).not.toContain(MEMO);
      expect(JSON.stringify(storage)).not.toContain('metadataMode');
    }
  });

  it('clears the previous preview when the choice changes and preserves original fields for a newly signed standard link', async () => {
    const { user } = mount();
    fill();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect((await currentInvoice()).invoice.memo).toBe(MEMO);
    await user.click(screen.getByRole('checkbox', { name: OPTION }));
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'QR code containing the invoice link' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect(Object.hasOwn((await currentInvoice()).invoice, 'memo')).toBe(false);
    await user.click(screen.getByRole('checkbox', { name: OPTION }));
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const standard = await currentInvoice();
    expect(standard.invoice.memo).toBe(MEMO);
    expect(standard.invoice.lineItems[0]?.description).toBe(DESCRIPTION);
    expect(standard.verification.signatureValid).toBe(true);
  });

  it('does not restore a prior-mode link when its pending signing/encryption operation completes', async () => {
    const { user, announce } = mount();
    const ready = await creation.buildInvoiceLink(BASE_FORM, 'https://app.test/', NOW);
    let finish: (value: creation.CreatedInvoice) => void = () => { throw new Error('Request has not started.'); };
    const pending = new Promise<creation.CreatedInvoice>((resolve) => { finish = resolve; });
    vi.spyOn(creation, 'buildInvoiceLink').mockReturnValueOnce(pending);
    fill();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    await user.click(screen.getByRole('checkbox', { name: OPTION }));
    await act(async () => { finish(ready); await pending; });
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('scopes the mode and retained form values to the current seller session', async () => {
    const { user, replaceSession } = mount();
    fill();
    await user.click(screen.getByRole('checkbox', { name: OPTION }));
    replaceSession();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: OPTION }).checked).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>('Item 1 description').value).toBe('');
    expect(screen.getByLabelText<HTMLTextAreaElement>(MEMO_LABEL).value).toBe('');
    expect(screen.queryByLabelText('Link')).toBeNull();
  });
});
