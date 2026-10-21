// @vitest-environment jsdom
import { parseFragment } from '@ghostpay/invoice-schema';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeManifestJson } from '../test/fakeManifest';
import { clearSession, generateSession } from '../lib/session';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function open(services = makeServices()): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
  return user;
}

describe('Create invoice', () => {
  it('asks for keys first', async () => {
    const user = await open();
    expect(screen.getByText('You need seller keys first.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Go to Seller keys' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Seller keys' })).toBeTruthy();
  });

  it('creates a signed link, QR code and bearer-link warning, entirely locally', async () => {
    generateSession();
    const fetchFn = vi.fn(() => Promise.reject(new Error('no network')));
    const user = await open(makeServices({ fetchFn }));
    await user.type(screen.getByLabelText('Token amount'), '25.5');
    await user.type(screen.getByLabelText('Item 1 description'), 'Design work');
    await user.clear(screen.getByLabelText('Item 1 unit price'));
    await user.type(screen.getByLabelText('Item 1 unit price'), '25.50');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const link = await screen.findByLabelText<HTMLTextAreaElement>('Link');
    expect(link.value.startsWith('https://app.test/#gpi=v1.')).toBe(true);
    const parsed = await parseFragment(link.value.slice('https://app.test/'.length));
    expect(parsed.invoice.lineItems[0]?.description).toBe('Design work');
    expect(parsed.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '25500000000000000000' });
    expect(parsed.verification.signatureValid).toBe(true);
    expect(screen.getByText('Bearer link')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'QR code containing the invoice link' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('supports multiple items, encryption, fiat pricing and token selection', async () => {
    generateSession();
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Token'), screen.getByRole('option', { name: 'USDC' }));
    await user.selectOptions(screen.getByLabelText('Pricing'), 'fiat_quote');
    expect(screen.getByText(/No feed is configured in this release/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.type(screen.getByLabelText('Item 1 description'), 'A');
    await user.type(screen.getByLabelText('Item 1 unit price'), '1.00');
    await user.type(screen.getByLabelText('Item 2 description'), 'B');
    await user.type(screen.getByLabelText('Item 2 unit price'), '2.00');
    await user.clear(screen.getByLabelText('Tax rate (%)'));
    await user.type(screen.getByLabelText('Tax rate (%)'), '10');
    await user.type(screen.getByLabelText(/Memo/), 'hello');
    await user.click(screen.getByLabelText('Encrypt line items and memo inside the link'));
    await user.click(screen.getByRole('button', { name: 'Remove item 2' }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.type(screen.getByLabelText('Item 2 description'), 'C');
    await user.type(screen.getByLabelText('Item 2 unit price'), '2.00');
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const link = await screen.findByLabelText<HTMLTextAreaElement>('Link');
    const parsed = await parseFragment(link.value.slice('https://app.test/'.length));
    expect(parsed.encrypted).toBe(true);
    expect(parsed.invoice.fiat.minorUnits).toBe('330');
    expect(parsed.invoice.lineItems.map((l) => l.description)).toEqual(['A', 'C']);
    expect(parsed.invoice.memo).toBe('hello');
    expect(screen.getByText(/encryption key is inside it/)).toBeTruthy();
  });

  it('shows validation errors in an alert and no link', async () => {
    generateSession();
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/price must be a decimal/);
    expect(screen.queryByLabelText('Link')).toBeNull();
  });

  it('warns when the chosen chain has no deployment manifest, and not when it has one', async () => {
    generateSession();
    await open();
    expect(await screen.findByText(/Payments disabled on this chain/)).toBeTruthy();
    window.history.replaceState(null, '', '/');
  });

  it('does not warn when a manifest is loaded', async () => {
    generateSession();
    await open(makeServices({ loadManifest: (id) => Promise.resolve({ status: 'loaded', manifest: JSON.parse(fakeManifestJson(id)) as never }) }));
    await waitFor(() => { expect(screen.queryByText(/Payments disabled on this chain/)).toBeNull(); });
  });

  it('switching chain resets the token and offers that chain\'s tokens', async () => {
    generateSession();
    const user = await open();
    const chain = screen.getByLabelText('Chain');
    await user.selectOptions(chain, screen.getByRole('option', { name: 'Ethereum Sepolia' }));
    expect(within(screen.getByLabelText('Token')).getAllByRole('option').map((o) => o.textContent)).toEqual(['ETH', 'USDC']);
  });
});
