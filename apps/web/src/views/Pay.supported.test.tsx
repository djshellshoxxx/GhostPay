// @vitest-environment jsdom
import type { RpcClient } from '@ghostpay/chain-adapters';
import * as invoices from '@ghostpay/invoice-schema';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell';
import { buildInvoiceLink, type InvoiceForm } from '../lib/invoiceCreate';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { ServicesContext, type Services } from '../lib/services';
import { BASE_FORM, makeParsed, NOW } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderWith, setHash } from '../test/render';

const UNSUPPORTED = 'This build supports fixed-amount invoices without a seller buffer policy.';
const DECLINED = { accepted: false, maxWei: '0', minWei: '0', refund: 'none' } as const;
const ORDER = ['home', 'pay'] as const;
const RESTRICTED: readonly [string, Partial<InvoiceForm>][] = [
  ['v2 buffer policy', { bufferPolicy: DECLINED }],
  ['fiat quote', { amountMode: 'fiat_quote' }],
];

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setHash('');
});
afterEach(() => { vi.restoreAllMocks(); });

function servicesWithoutEffects(): Services {
  return makeServices({
    loadManifest: vi.fn(() => Promise.resolve({ status: 'absent' } as const)),
    createRpc: vi.fn(() => Promise.reject(new Error('unexpected RPC'))),
    discoverWallets: vi.fn(() => Promise.resolve([])),
  });
}

const rejection = (): RegExp => new RegExp(UNSUPPORTED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

async function openQr(profile: 'full' | 'lean') {
  const services = servicesWithoutEffects();
  const mounted = renderWith(<AppShell order={ORDER} profile={profile} />, services);
  const user = userEvent.setup();
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /^Pay$/ }));
  await user.click(screen.getByText('Scan an invoice QR'));
  // Home loaded deployment metadata before navigation; measure QR intake only.
  vi.mocked(services.loadManifest).mockClear();
  vi.mocked(services.createRpc).mockClear();
  vi.mocked(services.discoverWallets).mockClear();
  return { services, mounted, user };
}

async function scanText(fragment: string, user: ReturnType<typeof userEvent.setup>) {
  const region = screen.getByRole('region', { name: 'Invoice QR import' });
  fireEvent.change(within(region).getByLabelText('Or paste QR text'), { target: { value: fragment } });
  await user.click(within(region).getByRole('button', { name: 'Use pasted text' }));
}

describe('Supported build incoming invoice boundary', () => {
  it('opens an actual signed v1 fixed-token invoice', async () => {
    const { fragment } = await makeParsed();
    setHash(fragment);
    renderWith(<AppShell order={ORDER} profile="lean" />, servicesWithoutEffects());
    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy();
    expect(screen.queryByText(rejection())).toBeNull();
  });

  it.each(RESTRICTED)('refuses %s before manifest, RPC or wallet effects', async (_name, patch) => {
    const { fragment } = await makeParsed(patch);
    const services = servicesWithoutEffects();
    setHash(fragment);
    renderWith(<AppShell order={ORDER} profile="lean" />, services);
    expect(await screen.findByText(rejection())).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(services.loadManifest).not.toHaveBeenCalled();
    expect(services.createRpc).not.toHaveBeenCalled();
    expect(services.discoverWallets).not.toHaveBeenCalled();
  });

  it('refuses a v2 invoice after its passphrase opens it', async () => {
    generateSession();
    const created = await buildInvoiceLink({ ...BASE_FORM, bufferPolicy: DECLINED, passphrase: 'test-only passphrase' }, 'https://app.test/', NOW);
    const services = servicesWithoutEffects();
    const user = userEvent.setup();
    setHash(created.fragment);
    renderWith(<AppShell order={ORDER} profile="lean" />, services);
    await user.type(await screen.findByLabelText('Invoice passphrase'), 'test-only passphrase');
    await user.click(screen.getByRole('button', { name: 'Open invoice' }));
    // Wait for the unchanged production KDF, rather than the default one-second DOM timeout.
    expect(await screen.findByText(rejection(), {}, { timeout: 30_000 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(services.createRpc).not.toHaveBeenCalled();
    expect(services.discoverWallets).not.toHaveBeenCalled();
  });

  it('preserves the full-build v2 review behavior', async () => {
    const { fragment } = await makeParsed({ bufferPolicy: DECLINED });
    setHash(fragment);
    renderWith(<AppShell order={ORDER} />, servicesWithoutEffects());
    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy();
    expect(screen.queryByText(rejection())).toBeNull();
  });

  it('does not publish a stale full-build context after switching profile', async () => {
    const { fragment } = await makeParsed({ bufferPolicy: DECLINED });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    let release: (value: RpcClient) => void = () => { throw new Error('deferred RPC was not initialized'); };
    const pending = new Promise<RpcClient>((resolve) => { release = resolve; });
    const services = makeServices({
      loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
      createRpc: vi.fn(() => pending),
      discoverWallets: vi.fn(() => Promise.resolve([])),
    });
    setHash(fragment);
    const mounted = renderWith(<AppShell order={ORDER} />, services);
    await waitFor(() => { expect(services.createRpc).toHaveBeenCalled(); });
    mounted.rerender(<ServicesContext.Provider value={services}><AppShell order={ORDER} profile="lean" /></ServicesContext.Provider>);
    await act(async () => {
      release(withManifestChain(mockRpc(84532, () => '0x')));
      await pending;
    });
    expect(await screen.findByText(rejection())).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(services.discoverWallets).not.toHaveBeenCalled();
  });

  it.each(RESTRICTED)('refuses a scanned %s without opening a payment or contacting services', async (_name, patch) => {
    const { fragment } = await makeParsed(patch);
    const { services, user } = await openQr('lean');
    await scanText(fragment, user);
    expect(await screen.findByText(rejection())).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(services.loadManifest).not.toHaveBeenCalled();
    expect(services.createRpc).not.toHaveBeenCalled();
    expect(services.discoverWallets).not.toHaveBeenCalled();
  });

  it('keeps a supported QR preview local until explicit opening', async () => {
    const { fragment } = await makeParsed();
    const { services, user } = await openQr('lean');
    await scanText(fragment, user);
    expect(await screen.findByRole('heading', { name: 'Review scanned invoice' })).toBeTruthy();
    expect(services.loadManifest).not.toHaveBeenCalled();
    expect(services.createRpc).not.toHaveBeenCalled();
    expect(services.discoverWallets).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Open scanned invoice' }));
    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy();
  });

  it('invalidates a pending QR preview when the supported profile changes', async () => {
    const { fragment } = await makeParsed({ bufferPolicy: DECLINED });
    const ready = await invoices.openFragment(fragment);
    const { services, mounted, user } = await openQr('full');
    let complete: (result: Awaited<ReturnType<typeof invoices.openFragment>>) => void = () => { throw new Error('deferred parser was not initialized'); };
    const pending = new Promise<Awaited<ReturnType<typeof invoices.openFragment>>>((resolve) => { complete = resolve; });
    vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending);
    await scanText(fragment, user);
    mounted.rerender(<ServicesContext.Provider value={services}><AppShell order={ORDER} profile="lean" /></ServicesContext.Provider>);
    await act(async () => { complete(ready); await pending; });
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(services.loadManifest).not.toHaveBeenCalled();
    expect(services.createRpc).not.toHaveBeenCalled();
    expect(services.discoverWallets).not.toHaveBeenCalled();
  });
});
