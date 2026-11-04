// @vitest-environment jsdom
import { parseFragment } from '@ghostpay/invoice-schema';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as creation from '../lib/invoiceCreate';
import { clearSession } from '../lib/session';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { ServicesContext } from '../lib/services';
import { AppContext, type AppState } from '../state';
import { generateWaivedSession } from '../test/keys';
import { makeServices } from '../test/render';
import { CreateInvoice } from './CreateInvoice';

const MAX_UINT256 = (2n ** 256n - 1n).toString();

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { vi.restoreAllMocks(); });

function mount(supportedOnly?: boolean) {
  const app: AppState = {
    view: 'create', setView: () => undefined, settings: DEFAULT_SETTINGS, updateSettings: () => true,
    session: generateWaivedSession(), fragment: undefined, setFragment: () => undefined,
    matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
    getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce: vi.fn(),
  };
  const view = (mode?: boolean) => <ServicesContext.Provider value={makeServices()}><AppContext.Provider value={app}>
    <CreateInvoice {...(mode === undefined ? {} : { supportedOnly: mode })} />
  </AppContext.Provider></ServicesContext.Provider>;
  const mounted = render(view(supportedOnly));
  return { user: userEvent.setup(), changeProfile: (mode: boolean) => { mounted.rerender(view(mode)); } };
}

function fill(token: 'erc20' | 'native' = 'erc20') {
  if (token === 'erc20') {
    const select = screen.getByLabelText<HTMLSelectElement>('Token');
    const erc20 = [...select.options].find((o) => o.value !== 'native');
    if (erc20 === undefined) throw new Error('fixture chain has no token');
    fireEvent.change(select, { target: { value: erc20.value } });
  }
  fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: 'Signed work' } });
  fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '25.50' } });
  fireEvent.change(screen.getByLabelText('Token amount'), { target: { value: '1.25' } });
}

function choose(mode: 'off' | 'declined' | 'range', min = '', max = '') {
  fireEvent.change(screen.getByLabelText('Gas buffer policy'), { target: { value: mode } });
  if (mode === 'range') {
    fireEvent.change(screen.getByLabelText('Minimum buffer (wei)'), { target: { value: min } });
    fireEvent.change(screen.getByLabelText('Maximum buffer (wei)'), { target: { value: max } });
  }
}

async function parsedInvoice() {
  const field = await screen.findByLabelText<HTMLTextAreaElement>('Link');
  return (await parseFragment(field.value.slice('https://app.test/'.length))).invoice;
}

describe('seller gas buffer policy control (ADR-0024)', () => {
  it('is absent in the lean/supported profile and cannot leak a policy', async () => {
    const { user } = mount(true);
    expect(screen.queryByLabelText('Gas buffer policy')).toBeNull();
    expect(screen.queryByLabelText('Minimum buffer (wei)')).toBeNull();
    const spy = vi.spyOn(creation, 'buildInvoiceLink');
    fill();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    await screen.findByLabelText('Link');
    expect(spy.mock.calls[0]?.[0].bufferPolicy).toBeUndefined();
  });

  it('is present in the full profile, discloses that lean builds reject v2, and defaults to a v1 invoice', async () => {
    const { user } = mount();
    const select = screen.getByLabelText<HTMLSelectElement>('Gas buffer policy');
    expect(select.value).toBe('off');
    expect(screen.getByText(/lean builds of this app do not accept/)).toBeTruthy();
    fill();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const invoice = await parsedInvoice();
    expect(invoice.v).toBe(1);
    expect(invoice.bufferPolicy).toBeUndefined();
  });

  it('drops a chosen policy and the control when the profile switches to lean', async () => {
    const { user, changeProfile } = mount();
    choose('declined');
    changeProfile(true);
    expect(screen.queryByLabelText('Gas buffer policy')).toBeNull();
    fill();
    const spy = vi.spyOn(creation, 'buildInvoiceLink');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    await screen.findByLabelText('Link');
    expect(spy.mock.calls[0]?.[0].bufferPolicy).toBeUndefined();
  });

  it('produces a v2 invoice with a declined policy that the schema parser accepts', async () => {
    const { user } = mount();
    fill();
    choose('declined');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const invoice = await parsedInvoice();
    expect(invoice.v).toBe(2);
    expect(invoice.bufferPolicy).toEqual({ accepted: false, maxWei: '0', minWei: '0', refund: 'none' });
  });

  it('produces a v2 invoice with an accepted min/max policy that the schema parser accepts', async () => {
    const { user } = mount();
    fill();
    choose('range', '1000', '5000000000000000');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const invoice = await parsedInvoice();
    expect(invoice.v).toBe(2);
    expect(invoice.bufferPolicy).toEqual({ accepted: true, maxWei: '5000000000000000', minWei: '1000', refund: 'none' });
  });

  it('accepts min = max = the payer safety cap (1e16 wei)', async () => {
    const { user } = mount();
    fill();
    const cap = (10n ** 16n).toString();
    choose('range', cap, cap);
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect((await parsedInvoice()).bufferPolicy).toEqual({ accepted: true, maxWei: cap, minWei: cap, refund: 'none' });
  });

  const refused: readonly [string, string, string][] = [
    ['empty minimum', '', '10'],
    ['zero minimum', '0', '10'],
    ['negative minimum', '-1', '10'],
    ['fractional minimum', '1.5', '10'],
    ['exponent minimum', '1e3', '10'],
    ['hex minimum', '0x10', '10'],
    ['padded minimum', ' 5', '10'],
    ['leading-zero minimum', '007', '10'],
    ['non-ASCII digit minimum', '٣', '10'],
    ['empty maximum', '1', ''],
    ['zero maximum', '1', '0'],
    ['maximum below minimum', '11', '10'],
    ['minimum above the payer safety cap (1e16 + 1)', (10n ** 16n + 1n).toString(), (10n ** 16n + 1n).toString()],
    ['minimum at 2^256-1', MAX_UINT256, MAX_UINT256],
    ['minimum above 2^256-1', (2n ** 256n).toString(), (2n ** 256n).toString()],
    ['maximum above 2^256-1', '1', (2n ** 256n).toString()],
  ];
  it.each(refused)('refuses %s and creates nothing', async (_name, min, max) => {
    const { user } = mount();
    fill();
    choose('range', min, max);
    const spy = vi.spyOn(creation, 'buildInvoiceLink');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits no policy for a native-coin invoice even when "declined" was chosen, so it stays v1', async () => {
    const { user } = mount();
    fill('native');
    choose('declined');
    const spy = vi.spyOn(creation, 'buildInvoiceLink');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const invoice = await parsedInvoice();
    expect(spy.mock.calls[0]?.[0].bufferPolicy).toBeUndefined();
    expect(invoice.v).toBe(1);
    expect(invoice.bufferPolicy).toBeUndefined();
  });

  it('disables the declined and range choices for the native coin and explains why', () => {
    mount();
    const select = screen.getByLabelText<HTMLSelectElement>('Gas buffer policy');
    const option = (value: string) => [...select.options].find((o) => o.value === value);
    expect(option('declined')?.disabled).toBe(true);
    expect(option('range')?.disabled).toBe(true);
    expect(option('off')?.disabled).toBe(false);
    expect(screen.getByText(/only apply to token invoices/)).toBeTruthy();
    fill('erc20');
    expect(option('declined')?.disabled).toBe(false);
    expect(option('range')?.disabled).toBe(false);
    expect(screen.queryByText(/only apply to token invoices/)).toBeNull();
  });

  it('never applies a range policy to a native-coin invoice', async () => {
    const { user } = mount();
    fill('native');
    fireEvent.change(screen.getByLabelText('Gas buffer policy'), { target: { value: 'range' } });
    expect(screen.queryByLabelText('Minimum buffer (wei)')).toBeNull();
    const spy = vi.spyOn(creation, 'buildInvoiceLink');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const invoice = await parsedInvoice();
    expect(spy.mock.calls[0]?.[0].bufferPolicy).toBeUndefined();
    expect(invoice.v).toBe(1);
  });

  it('drops a token-invoice policy when the seller switches back to the native coin', async () => {
    const { user } = mount();
    fill('erc20');
    choose('declined');
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'native' } });
    expect(screen.getByLabelText<HTMLSelectElement>('Gas buffer policy').value).toBe('off');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const invoice = await parsedInvoice();
    expect(invoice.v).toBe(1);
    expect(invoice.bufferPolicy).toBeUndefined();
  });
});
