// @vitest-environment jsdom
import { isQuoteAvailable } from '@ghostpay/chain-adapters';
import { parseFragment } from '@ghostpay/invoice-schema';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as creation from '../lib/invoiceCreate';
import { clearSession } from '../lib/session';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { ServicesContext } from '../lib/services';
import { AppContext, type AppState } from '../state';
import { BASE_FORM, NOW } from '../test/invoiceFixtures';
import { generateWaivedSession } from '../test/keys';
import { makeServices } from '../test/render';
import { CreateInvoice } from './CreateInvoice';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { vi.restoreAllMocks(); });

function mount(supportedOnly?: boolean) {
  const session = generateWaivedSession();
  const announce = vi.fn();
  const app: AppState = {
    view: 'create', setView: () => undefined, settings: DEFAULT_SETTINGS, updateSettings: () => true,
    session, fragment: undefined, setFragment: () => undefined,
    matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
    getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce,
  };
  const services = makeServices();
  const view = (mode?: boolean) => <ServicesContext.Provider value={services}><AppContext.Provider value={app}>
    <CreateInvoice {...(mode === undefined ? {} : { supportedOnly: mode })} />
  </AppContext.Provider></ServicesContext.Provider>;
  const mounted = render(view(supportedOnly));
  return { announce, user: userEvent.setup(), changeProfile: (mode: boolean) => { mounted.rerender(view(mode)); } };
}

function fill() {
  fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: 'Signed work' } });
  fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '25.50' } });
}

async function parsedLink() {
  const field = await screen.findByLabelText<HTMLTextAreaElement>('Link');
  return parseFragment(field.value.slice('https://app.test/'.length));
}

describe('supported invoice creation', () => {
  it('creates a signed v1 fixed-token invoice even on the actual feed-enabled chain', async () => {
    expect(isQuoteAvailable(11155111, 'ETH', 'USD')).toBe(true);
    expect(isQuoteAvailable(84532, 'ETH', 'USD')).toBe(true);
    const { user } = mount(true);
    expect(screen.getByLabelText<HTMLSelectElement>('Chain').value).toBe('11155111');
    expect(screen.queryByRole('option', { name: /Fiat price/ })).toBeNull();
    fill();
    await user.type(screen.getByLabelText('Token amount'), '1.25');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const parsed = await parsedLink();
    expect(parsed.invoice.v).toBe(1);
    expect(parsed.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000000000000000' });
    expect(parsed.verification.signatureValid).toBe(true);
  });

  it('preserves default full-profile signed fiat creation with the configured feed', async () => {
    const { user } = mount();
    const fiat = screen.getByRole<HTMLOptionElement>('option', { name: /Fiat price/ });
    expect(fiat.disabled).toBe(false);
    await user.selectOptions(screen.getByLabelText('Pricing'), fiat);
    fill();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const parsed = await parsedLink();
    expect(parsed.invoice.amountPolicy.mode).toBe('fiat_quote');
    expect(parsed.verification.signatureValid).toBe(true);
  });

  it('hides an existing full-profile fiat link and submits fixed mode after switching to supported', async () => {
    const { user, changeProfile } = mount();
    await user.type(screen.getByLabelText('Token amount'), '1.25');
    await user.selectOptions(screen.getByLabelText('Pricing'), screen.getByRole('option', { name: /Fiat price/ }));
    fill();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect((await parsedLink()).invoice.amountPolicy.mode).toBe('fiat_quote');
    changeProfile(true);
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(screen.queryByRole('option', { name: /Fiat price/ })).toBeNull();
    expect(screen.getByLabelText<HTMLSelectElement>('Pricing').value).toBe('fixed_token');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const parsed = await parsedLink();
    expect(parsed.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000000000000000' });
    expect(parsed.verification.signatureValid).toBe(true);
  });

  it.each([true, false])('invalidates pending fiat creation across profile changes (final supported=%s)', async (finalSupported) => {
    const { user, announce, changeProfile } = mount();
    const ready = await creation.buildInvoiceLink({ ...BASE_FORM, chainId: 11155111, token: 'native', amountMode: 'fiat_quote' }, 'https://app.test/', NOW);
    expect((await parseFragment(ready.fragment)).verification.signatureValid).toBe(true);
    let complete: (result: creation.CreatedInvoice) => void = () => { throw new Error('deferred creation not initialized'); };
    const pending = new Promise<creation.CreatedInvoice>((resolve) => { complete = resolve; });
    const build = vi.spyOn(creation, 'buildInvoiceLink').mockReturnValueOnce(pending);
    await user.selectOptions(screen.getByLabelText('Pricing'), screen.getByRole('option', { name: /Fiat price/ }));
    fill();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ amountMode: 'fiat_quote' }), 'https://app.test/', NOW);
    changeProfile(true);
    if (!finalSupported) changeProfile(false);
    await act(async () => { complete(ready); await pending; });
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('does not let a stale full-profile failure erase a newer supported invoice', async () => {
    const { user, changeProfile } = mount();
    let reject: (error: Error) => void = () => { throw new Error('deferred creation not initialized'); };
    const pending = new Promise<creation.CreatedInvoice>((_resolve, fail) => { reject = fail; });
    vi.spyOn(creation, 'buildInvoiceLink').mockReturnValueOnce(pending);
    await user.selectOptions(screen.getByLabelText('Pricing'), screen.getByRole('option', { name: /Fiat price/ }));
    fill();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    changeProfile(true);
    await user.type(screen.getByLabelText('Token amount'), '1.25');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const fresh = await screen.findByLabelText<HTMLTextAreaElement>('Link');
    const expected = fresh.value;
    expect((await parsedLink()).verification.signatureValid).toBe(true);
    await act(async () => { reject(new Error('stale full-profile failure')); await pending.catch(() => undefined); });
    expect(screen.getByLabelText<HTMLTextAreaElement>('Link').value).toBe(expected);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  const unsupportedResults: readonly [string, Partial<creation.InvoiceForm>][] = [
    ['fiat', { amountMode: 'fiat_quote' }],
    ['v2 buffer policy', { bufferPolicy: { accepted: false, maxWei: '0', minWei: '0', refund: 'none' } }],
  ];
  it.each(unsupportedResults)('refuses an unsupported signed %s result before publishing', async (_name, patch) => {
    const { user, announce } = mount(true);
    const ready = await creation.buildInvoiceLink({ ...BASE_FORM, chainId: 11155111, token: 'native', ...patch }, 'https://app.test/', NOW);
    expect((await parseFragment(ready.fragment)).verification.signatureValid).toBe(true);
    vi.spyOn(creation, 'buildInvoiceLink').mockResolvedValueOnce(ready);
    fill();
    await user.type(screen.getByLabelText('Token amount'), '1.25');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This build supports fixed-amount invoices without a seller buffer policy.');
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('refuses missing fixed-token amount instead of falling back to fiat', async () => {
    const { user, announce } = mount(true);
    fill();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByLabelText('Link')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });
});
