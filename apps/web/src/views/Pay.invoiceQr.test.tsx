// @vitest-environment jsdom
import * as invoices from '@ghostpay/invoice-schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInvoiceLink } from '../lib/invoiceCreate';
import { clearSession, generateSession, getSessionPublic } from '../lib/session';
import { BASE_FORM, NOW, makeParsed } from '../test/invoiceFixtures';
import { makeServices, renderApp, setHash } from '../test/render';
import { ServicesContext } from '../lib/services';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { AppContext, type AppState } from '../state';
import { Pay } from './Pay';

beforeEach(() => { clearSession(); window.localStorage.clear(); window.sessionStorage.clear(); setHash(''); });
afterEach(() => { vi.restoreAllMocks(); });
async function openInput(baseUrl = 'https://app.test/') {
  const discoverWallets = vi.fn(() => Promise.resolve([]));
  const loadManifest = vi.fn(makeServices().loadManifest);
  const createRpc = vi.fn(makeServices().createRpc);
  const rendered = renderApp(makeServices({ discoverWallets, loadManifest, createRpc, baseUrl: () => baseUrl }));
  const user = userEvent.setup();
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /^Pay$/ }));
  await user.click(screen.getByText('Scan an invoice QR'));
  // Home loads the deployment list before navigation; measure side effects from QR intake only.
  loadManifest.mockClear(); createRpc.mockClear(); discoverWallets.mockClear();
  return { ...rendered, user, discoverWallets, loadManifest, createRpc };
}
async function scanText(text: string, user: ReturnType<typeof userEvent.setup>) {
  const region = screen.getByRole('region', { name: 'Invoice QR import' });
  fireEvent.change(within(region).getByLabelText('Or paste QR text'), { target: { value: text } });
  await user.click(within(region).getByRole('button', { name: 'Use pasted text' }));
}
describe('Pay invoice QR intake', () => {
  it.each(['fragment', 'link'] as const)('previews a valid signed %s locally and opens the ordinary review only after confirmation', async (form) => {
    const invoice = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const { user, discoverWallets, loadManifest, createRpc } = await openInput();
    const location = window.location.href;
    await scanText(form === 'fragment' ? invoice.fragment : invoice.link, user);
    expect(await screen.findByRole('heading', { name: 'Review scanned invoice' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(window.location.href).toBe(location);
    expect(discoverWallets).not.toHaveBeenCalled();
    expect(loadManifest).not.toHaveBeenCalled();
    expect(createRpc).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('ghostpay.wallet-attempts.v1')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open scanned invoice' }));
    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy();
    expect(screen.getByText('Fixed: 0.5 ETH')).toBeTruthy();
    expect(discoverWallets).not.toHaveBeenCalled();
  });
  it.each(['/GhostPay/index.html', '/GhostPay.v1/checkout.page.html', `/deploy/${'nested'.repeat(20)}/index.html`])('imports its own app-generated invoice QR from deployment path %s', async (path) => {
    generateSession();
    const base = `https://app.test${path}`;
    const created = await buildInvoiceLink({ ...BASE_FORM, token: 'native', tokenAmount: '0.5' }, base, NOW);
    const { user, discoverWallets, createRpc } = await openInput(base);
    const location = window.location.href;
    await scanText(created.link, user);
    expect(await screen.findByRole('heading', { name: 'Review scanned invoice' })).toBeTruthy();
    expect(window.location.href).toBe(location);
    expect(discoverWallets).not.toHaveBeenCalled();
    expect(createRpc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Open scanned invoice' }));
    expect(await screen.findByText('Fixed: 0.5 ETH')).toBeTruthy();
  });

  it.each(['/./', '/../', '/%2e/', '/%2E%2e/', '/.%2e/', '/%2e./', '/%252e%252e/', '/safe/%2f../', '/safe/%5c../', '/another/index.html'])('rejects traversal or a different deployment path %s', async (path) => {
    const { fragment } = await makeParsed();
    const { user } = await openInput('https://app.test/GhostPay/index.html');
    const location = window.location.href;
    await scanText(`https://app.test${path}${fragment}`, user);
    expect(await screen.findByText('Invoice QR not accepted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    expect(window.location.href).toBe(location);
  });

  it.each(['/%252e%252e/index.html', '/safe%2f../index.html', '/%5c../index.html', '/bad%zz/index.html', '/%00/index.html', `/${'a'.repeat(512)}`])('rejects unsafe or oversized path even when the current base uses it: %s', async (path) => {
    const { fragment } = await makeParsed();
    const base = `https://app.test${path}`;
    const { user } = await openInput(base);
    await scanText(`${base}${fragment}`, user);
    expect(await screen.findByText('Invoice QR not accepted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
  });

  it.each(['javascript:alert(1)', 'data:text/html,secret', 'https://app.test.evil/', 'https://app.test@evil.test/', 'https://app.test:443/', 'https://app.test/?secret=1', 'http://app.test/', 'https://app.test/../', 'prefix'])('rejects hostile URL prefix %s without navigation or wallet access', async (prefix) => {
    const { fragment } = await makeParsed();
    const { user, discoverWallets, loadManifest } = await openInput();
    const location = window.location.href;
    await scanText(`${prefix}${fragment}`, user);
    expect(await screen.findByText('Invoice QR not accepted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    expect(window.location.href).toBe(location);
    expect(discoverWallets).not.toHaveBeenCalled();
    expect(loadManifest).not.toHaveBeenCalled();
  });
  it.each(['#gpi=v1.%%%%', `#gpi=v1.${'a'.repeat(22_000)}`, '#gpi=v1.e30', '#gpi=v2.abc', '{"kind":"ghostpay-receipt","private":"secret"}'])('rejects malformed or unrelated input without a preview', async (text) => {
    const { user } = await openInput();
    await scanText(text, user);
    expect(await screen.findByText('Invoice QR not accepted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
  });
  it('discards the previous preview before new oversized input is rejected', async () => {
    const { fragment } = await makeParsed();
    const { user } = await openInput();
    await scanText(fragment, user);
    await screen.findByRole('button', { name: 'Open scanned invoice' });
    await scanText('x'.repeat(65_537), user);
    expect(await screen.findByText('QR text exceeds the 64 KiB safety limit.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
  });
  it('uses the existing passphrase prompt without showing private fields', async () => {
    generateSession();
    const created = await buildInvoiceLink({ ...BASE_FORM, memo: 'private QR memo', passphrase: 'cedar orbit velvet lantern meadow' }, 'https://app.test/', NOW);
    const { user } = await openInput();
    await scanText(created.link, user);
    expect(await screen.findByText('This invoice needs a passphrase. Its header is unverified until it opens.')).toBeTruthy();
    expect(screen.queryByText('private QR memo')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open scanned invoice' }));
    expect(await screen.findByLabelText('Invoice passphrase')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    const ready = await invoices.openFragment(created.fragment, { passphrase: 'cedar orbit velvet lantern meadow' });
    let complete!: (result: Awaited<ReturnType<typeof invoices.openFragment>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof invoices.openFragment>>>((resolve) => { complete = resolve; });
    vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending);
    await user.type(screen.getByLabelText('Invoice passphrase'), 'cedar orbit velvet lantern meadow');
    await user.click(screen.getByRole('button', { name: /^Open invoice$/ }));
    act(() => { clearSession(); });
    await act(async () => { complete(ready); await pending; });
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(screen.queryByText('private QR memo')).toBeNull();
  });
  it('does not install a late ordinary parser result after confirming QR then changing seller session', async () => {
    const { fragment } = await makeParsed();
    const ready = await invoices.openFragment(fragment);
    const { user } = await openInput();
    await scanText(fragment, user);
    await screen.findByRole('button', { name: 'Open scanned invoice' });
    let complete!: (result: Awaited<ReturnType<typeof invoices.openFragment>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof invoices.openFragment>>>((resolve) => { complete = resolve; });
    vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending);
    await user.click(screen.getByRole('button', { name: 'Open scanned invoice' }));
    act(() => { clearSession(); });
    await act(async () => { complete(ready); await pending; });
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(await screen.findByText(/Seller keys changed while opening this invoice/)).toBeTruthy();
  });

  it('keeps newer invoice B when an old confirmed QR parse A returns after session change', async () => {
    const first = await makeParsed();
    const second = await makeParsed({ token: 'native', tokenAmount: '0.75' });
    const ready = await invoices.openFragment(first.fragment);
    const { user } = await openInput();
    await scanText(first.fragment, user);
    await screen.findByRole('button', { name: 'Open scanned invoice' });
    let complete!: (result: Awaited<ReturnType<typeof invoices.openFragment>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof invoices.openFragment>>>((resolve) => { complete = resolve; });
    vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending);
    await user.click(screen.getByRole('button', { name: 'Open scanned invoice' }));
    act(() => { clearSession(); setHash(second.fragment); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await screen.findByText('Fixed: 0.75 ETH');
    await act(async () => { complete(ready); await pending; });
    expect(screen.getByText('Fixed: 0.75 ETH')).toBeTruthy();
    expect(screen.queryByText(/Seller keys changed while opening this invoice/)).toBeNull();
  });

  it('does not activate an old preview during coalesced collapse and reopening', async () => {
    const { fragment } = await makeParsed();
    const { user } = await openInput();
    await scanText(fragment, user);
    const activate = await screen.findByRole('button', { name: 'Open scanned invoice' });
    const details = screen.getByText('Scan an invoice QR').closest('details')!;
    await act(async () => {
      details.open = false;
      details.open = true;
      fireEvent.click(activate);
      await Promise.resolve();
    });
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
  });

  it('does not revive a pending parse when collapse and reopening coalesce before toggle', async () => {
    const { fragment } = await makeParsed();
    const ready = await invoices.openFragment(fragment);
    const { user } = await openInput();
    let complete!: (result: Awaited<ReturnType<typeof invoices.openFragment>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof invoices.openFragment>>>((resolve) => { complete = resolve; });
    vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending);
    await scanText(fragment, user);
    const details = screen.getByText('Scan an invoice QR').closest('details')!;
    await act(async () => {
      details.open = false;
      details.open = true;
      complete(ready);
      await pending;
    });
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
  });

  it.each(['collapse', 'reset', 'session', 'fragment', 'unmount', 'input'] as const)('does not install a late preview after %s changes', async (change) => {
    const first = await makeParsed();
    const second = await makeParsed({ token: 'native', tokenAmount: '0.75' });
    const ready = await invoices.openFragment(first.fragment);
    const { user, unmount } = await openInput();
    let complete!: (result: Awaited<ReturnType<typeof invoices.openFragment>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof invoices.openFragment>>>((resolve) => { complete = resolve; });
    const original = invoices.openFragment;
    vi.spyOn(invoices, 'openFragment').mockImplementation((fragment, options) => fragment === first.fragment ? pending : original(fragment, options));
    await scanText(first.fragment, user);
    if (change === 'collapse') await user.click(screen.getByText('Scan an invoice QR'));
    if (change === 'reset') await user.click(screen.getByRole('button', { name: 'Clear invoice QR' }));
    if (change === 'session') act(() => { clearSession(); });
    if (change === 'fragment') act(() => { setHash(second.fragment); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    if (change === 'input') fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: 'another candidate' } });
    if (change === 'unmount') unmount();
    await act(async () => { complete(ready); await pending; });
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    if (change === 'fragment') expect(await screen.findByText('Fixed: 0.75 ETH')).toBeTruthy();
    else if (change !== 'unmount') expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
  });
  it.each(['collapse', 'reset', 'session', 'fragment', 'unmount'] as const)('stops late camera permission tracks after %s changes', async (change) => {
    const { fragment } = await makeParsed();
    const { user, unmount } = await openInput();
    const media = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const stop = vi.fn();
    let permit!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((resolve) => { permit = resolve; });
    const getUserMedia = vi.fn(() => permission);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    try {
      expect(getUserMedia).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
      await waitFor(() => { expect(getUserMedia).toHaveBeenCalledOnce(); });
      if (change === 'collapse') await user.click(screen.getByText('Scan an invoice QR'));
      if (change === 'reset') await user.click(screen.getByRole('button', { name: 'Clear invoice QR' }));
      if (change === 'session') act(() => { clearSession(); });
      if (change === 'fragment') act(() => { setHash(fragment); window.dispatchEvent(new HashChangeEvent('hashchange')); });
      if (change === 'unmount') unmount();
      await act(async () => { permit({ getTracks: () => [{ stop }] } as unknown as MediaStream); await permission; });
      await waitFor(() => { expect(stop).toHaveBeenCalledOnce(); });
      expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    } finally {
      if (media === undefined) Reflect.deleteProperty(navigator, 'mediaDevices');
      else Object.defineProperty(navigator, 'mediaDevices', media);
    }
  });

  it('invalidates a pending QR preview when pinned signer settings change without unmounting Pay', async () => {
    const { parsed, fragment } = await makeParsed();
    const ready = await invoices.openFragment(fragment);
    const services = makeServices();
    const app: AppState = {
      view: 'pay', setView: () => undefined, settings: DEFAULT_SETTINGS, updateSettings: () => true,
      session: getSessionPublic(), fragment: undefined, setFragment: () => undefined,
      matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
      getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce: () => undefined,
    };
    const view = (pinnedSigners: readonly string[]) => <ServicesContext.Provider value={services}><AppContext.Provider value={{ ...app, settings: { ...DEFAULT_SETTINGS, pinnedSigners } }}><Pay /></AppContext.Provider></ServicesContext.Provider>;
    const { rerender } = render(view([]));
    const user = userEvent.setup();
    await user.click(screen.getByText('Scan an invoice QR'));
    let complete!: (result: Awaited<ReturnType<typeof invoices.openFragment>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof invoices.openFragment>>>((resolve) => { complete = resolve; });
    vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending);
    await scanText(fragment, user);
    rerender(view([parsed.invoice.signer]));
    await act(async () => { complete(ready); await pending; });
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    await scanText(fragment, user);
    expect(await screen.findByRole('heading', { name: 'Review scanned invoice' })).toBeTruthy();
  });

  it('clears an already displayed preview when disclosure closes or session changes', async () => {
    const { fragment } = await makeParsed();
    const { user } = await openInput();
    await scanText(fragment, user);
    await screen.findByRole('button', { name: 'Open scanned invoice' });
    await user.click(screen.getByText('Scan an invoice QR'));
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Open scanned invoice', hidden: true })).toBeNull(); });
    await user.click(screen.getByText('Scan an invoice QR'));
    await scanText(fragment, user);
    await screen.findByRole('button', { name: 'Open scanned invoice' });
    act(() => { clearSession(); });
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Open scanned invoice', hidden: true })).toBeNull(); });
  });
});
