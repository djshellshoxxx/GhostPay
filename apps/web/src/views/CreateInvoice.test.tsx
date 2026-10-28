// @vitest-environment jsdom
import { openFragment, parseFragment } from '@ghostpay/invoice-schema';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeManifestJson } from '../test/fakeManifest';
import { clearSession, generateSession, importSession } from '../lib/session';
import { generateWaivedSession } from '../test/keys';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function open(services = makeServices()): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }),
  );
  return user;
}

describe('Create invoice fiat gating (per chain and token)', () => {
  const fiat = (): HTMLOptionElement => screen.getByRole<HTMLOptionElement>('option', { name: /Fiat price/ });
  it('is disabled on a chain without a verified feed, even for the native token', async () => {
    generateWaivedSession();
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
    expect(fiat().disabled).toBe(true);
    expect(fiat().textContent).toMatch(/unavailable/);
  });
  it('is enabled only for the pair that has a verified feed (Sepolia ETH/USD), not for USDC or other currencies', async () => {
    generateWaivedSession();
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Ethereum Sepolia' }));
    expect(fiat().disabled).toBe(false);
    await user.selectOptions(screen.getByLabelText('Token'), screen.getByRole('option', { name: 'USDC' }));
    expect(fiat().disabled).toBe(true);
    await user.selectOptions(screen.getByLabelText('Token'), screen.getByRole('option', { name: 'ETH' }));
    expect(fiat().disabled).toBe(false);
    await user.clear(screen.getByLabelText('Currency (ISO code)'));
    await user.type(screen.getByLabelText('Currency (ISO code)'), 'EUR');
    expect(fiat().disabled).toBe(true);
  });
  it('falls back to a fixed token amount when the selection loses its feed', async () => {
    generateWaivedSession();
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Ethereum Sepolia' }));
    await user.selectOptions(screen.getByLabelText('Pricing'), screen.getByRole('option', { name: /Fiat price/ }));
    expect(screen.queryByLabelText('Token amount')).toBeNull();
    await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
    expect(screen.getByLabelText('Token amount')).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>('Pricing').value).toBe('fixed_token');
  });
});

describe('Create invoice', () => {
  it('asks for keys first', async () => {
    const user = await open();
    expect(screen.getByText('You need seller keys first.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Go to Seller keys' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Seller keys' })).toBeTruthy();
  });

  it('L1-01: keeps the invoice form behind a backup or the typed waiver', async () => {
    generateSession();
    const user = await open();
    expect(screen.getByText('Back up these seller keys first')).toBeTruthy();
    expect(screen.getByText('These seller keys have no backup')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create invoice link' })).toBeNull();
    await user.type(screen.getByLabelText('To continue without a backup, type: continue without backup'), 'continue without');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue without a backup' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Seller keys' })).toBeTruthy();
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
    await user.type(screen.getByLabelText(/To continue without a backup/), ' Continue without backup ');
    await user.click(screen.getByRole('button', { name: 'Continue without a backup' }));
    expect(screen.getByRole('button', { name: 'Create invoice link' })).toBeTruthy();
    // The waiver only unlocks invoicing: the keys still have no backup and the banner stays.
    expect(screen.getByText('These seller keys have no backup')).toBeTruthy();
  });

  it('L1-01: opens the form directly for keys that have a copy elsewhere', async () => {
    importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
    await open();
    expect(screen.getByRole('button', { name: 'Create invoice link' })).toBeTruthy();
    expect(screen.queryByText('These seller keys have no backup')).toBeNull();
    expect(screen.queryByText('Back up these seller keys first')).toBeNull();
  });

  it('creates a signed link, QR code and bearer-link warning, entirely locally', async () => {
    generateWaivedSession();
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
    expect(screen.getByText('SHARE').closest('section')?.getAttribute('data-qr-kind')).toBe('shareable');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('supports multiple items, encryption and token selection; fiat pricing is disabled without a feed', async () => {
    generateWaivedSession();
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Token'), screen.getByRole('option', { name: 'USDC' }));
    expect(screen.getByRole<HTMLOptionElement>('option', { name: /Fiat price/ }).disabled).toBe(true);
    await user.type(screen.getByLabelText('Token amount'), '3.3');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.type(screen.getByLabelText('Item 1 description'), 'A');
    await user.type(screen.getByLabelText('Item 1 unit price'), '1.00');
    await user.type(screen.getByLabelText('Item 2 description'), 'B');
    await user.type(screen.getByLabelText('Item 2 unit price'), '2.00');
    await user.clear(screen.getByLabelText('Tax rate (%)'));
    await user.type(screen.getByLabelText('Tax rate (%)'), '10');
    await user.type(screen.getByLabelText(/Memo/), 'hello');
    await user.click(screen.getByLabelText('Encrypt line items and memo with a key included in the link'));
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
    expect(screen.getByText(/encryption key is inside the link/)).toBeTruthy();
    expect(screen.getByText('PRIVATE LINK').closest('section')?.getAttribute('data-qr-kind')).toBe('bearer');
  });

  it('protects the whole invoice with an out-of-band passphrase', async () => {
    generateWaivedSession();
    const user = await open();
    const passphrase = 'cedar orbit velvet lantern meadow';
    await user.type(screen.getByLabelText('Token amount'), '25.5');
    await user.type(screen.getByLabelText('Item 1 description'), 'Private design work');
    await user.type(screen.getByLabelText('Item 1 unit price'), '25.50');
    await user.click(screen.getByLabelText('Protect the entire invoice with a passphrase'));
    // L1-06: the field starts with a generated passphrase, shown in clear until it is replaced.
    const field = screen.getByLabelText<HTMLInputElement>('Invoice passphrase (at least 14 characters)');
    expect(field.value).toMatch(/^[a-z]{4,8}(?:-[a-z]{4,8}){5}$/);
    expect(field.type).toBe('text');
    expect(screen.getByText(/Suggested: 6 random words picked on this device/)).toBeTruthy();
    await user.clear(field);
    await user.type(screen.getByLabelText('Invoice passphrase (at least 14 characters)'), passphrase);
    expect(field.type).toBe('password');
    await user.type(screen.getByLabelText('Repeat invoice passphrase'), passphrase);
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    const link = await screen.findByLabelText<HTMLTextAreaElement>('Link', {}, { timeout: 120_000 });
    const fragment = link.value.slice('https://app.test/'.length);
    expect(await openFragment(fragment)).toMatchObject({ status: 'needsPassphrase' });
    expect((await openFragment(fragment, { passphrase })).status).toBe('ok');
    expect(screen.getByText(/contents are protected by a passphrase/)).toBeTruthy();
    expect(screen.getByText('SHARE').closest('section')?.getAttribute('data-qr-kind')).toBe('shareable');
    expect(screen.getByLabelText<HTMLInputElement>('Invoice passphrase (at least 14 characters)').value).toBe('');
  // Exercise real encryption and decryption; V8 coverage adds substantial scrypt overhead.
  }, 300_000);

  it('shows validation errors in an alert and no link', async () => {
    generateWaivedSession();
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/price must be a decimal/);
    expect(screen.queryByLabelText('Link')).toBeNull();
  });

  it('warns when the chosen chain has no deployment manifest, and not when it has one', async () => {
    generateWaivedSession();
    await open();
    expect(await screen.findByText(/Payments disabled on this chain/)).toBeTruthy();
    window.history.replaceState(null, '', '/');
  });

  it('does not warn when a manifest is loaded', async () => {
    generateWaivedSession();
    await open(
      makeServices({
        loadManifest: (id) =>
          Promise.resolve({ status: 'loaded', manifest: JSON.parse(fakeManifestJson(id)) as never }),
      }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/Payments disabled on this chain/)).toBeNull();
    });
  });

  it('WEB-APP-01: shows the unsigned-dev banner when the manifest is unsigned', async () => {
    generateWaivedSession();
    await open(
      makeServices({
        loadManifest: (id) =>
          Promise.resolve({ status: 'loaded', manifest: JSON.parse(fakeManifestJson(id)) as never, trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST (test)' }),
      }),
    );
    expect(await screen.findByText('UNSIGNED DEV MANIFEST (test)')).toBeTruthy();
  });

  it("switching chain resets the token and offers that chain's tokens", async () => {
    generateWaivedSession();
    const user = await open();
    const chain = screen.getByLabelText('Chain');
    await user.selectOptions(chain, screen.getByRole('option', { name: 'Ethereum Sepolia' }));
    expect(
      within(screen.getByLabelText('Token'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['ETH', 'USDC', 'EURC']);
  });
});
