// @vitest-environment jsdom
import * as invoices from '@ghostpay/invoice-schema';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell';
import { notifyAppLock } from '../lib/appLock';
import { INVOICE_SIGNER_PINS_KEY } from '../lib/invoiceSignerPins';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import * as payExec from '../lib/payExec';
import { makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { MockWallet } from '../test/mockWallet';
import { makeServices, renderWith, setHash } from '../test/render';
import { approveWalletDisclosure } from '../test/walletDisclosure';

const ORDER = ['home', 'pay'] as const;
beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  setHash('');
});
afterEach(() => { vi.restoreAllMocks(); });

function storedPins(pins: readonly { label: string; signer: string }[], revision = 1): void {
  localStorage.setItem(INVOICE_SIGNER_PINS_KEY, JSON.stringify({ v: 1, revision, pins }));
}
function changeStoredPins(pins: readonly { label: string; signer: string }[], revision = 2): void {
  act(() => {
    storedPins(pins, revision);
    window.dispatchEvent(new StorageEvent('storage', { key: INVOICE_SIGNER_PINS_KEY, storageArea: localStorage, newValue: 'ignored' }));
  });
}
const PINNED = 'Valid signature — matches the trusted signer pin.';
const MISMATCH = 'Valid signature — does not match the selected seller’s pinned key.';

describe('invoice signer verification lifecycle', () => {
  it('discards a verification that completes after locking a payer session without seller keys', async () => {
    const { fragment } = await makeParsed();
    const result = await invoices.openFragment(fragment);
    clearSession();
    let resolve: (value: invoices.OpenFragmentResult) => void = () => { throw new Error('not initialized'); };
    const pending = new Promise<invoices.OpenFragmentResult>((done) => { resolve = done; });
    const opening = vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending);
    setHash(fragment);
    renderWith(<AppShell order={ORDER} />, makeServices());
    await waitFor(() => { expect(opening).toHaveBeenCalledTimes(1); });
    act(() => { notifyAppLock('manual'); });
    await act(async () => { resolve(result); await pending; });
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(screen.getByText('Verification unavailable or interrupted. Open the invoice again to retry.')).toBeTruthy();
  });

  it('removes a completed trust result on app lock even when no seller keys are loaded', async () => {
    const { fragment } = await makeParsed();
    clearSession();
    setHash(fragment);
    renderWith(<AppShell order={ORDER} />, makeServices());
    await screen.findByRole('heading', { name: 'Review payment' });
    act(() => { notifyAppLock('idle'); });
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(screen.queryByText(/Signature matches key/)).toBeNull();
  });

  it('invalidates a completed invoice when the seller session changes', async () => {
    const { fragment } = await makeParsed();
    setHash(fragment);
    renderWith(<AppShell order={ORDER} />, makeServices());
    await screen.findByRole('heading', { name: 'Review payment' });
    act(() => { generateSession(); });
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(screen.queryByText(/Signature matches key/)).toBeNull();
  });

  it('compares only the selected seller even when both distinct seller keys are saved', async () => {
    const a = await makeParsed();
    const b = await makeParsed();
    storedPins([{ label: 'Alice', signer: a.parsed.invoice.signer }, { label: 'Bob', signer: b.parsed.invoice.signer }]);
    const services = makeServices({ createRpc: vi.fn(() => Promise.reject(new Error('no network'))), discoverWallets: vi.fn(() => Promise.resolve([])) });
    setHash(a.fragment); renderWith(<AppShell order={ORDER} />, services);
    await screen.findByText('Valid signature — no matching signer pin is configured.');
    fireEvent.change(screen.getByLabelText('Expected seller (optional)'), { target: { value: 'Alice' } });
    await screen.findByText(PINNED);
    fireEvent.change(screen.getByLabelText('Expected seller (optional)'), { target: { value: 'Bob' } });
    await screen.findByText(MISMATCH);
    expect(screen.queryByText(PINNED)).toBeNull();
    expect((await screen.findByRole<HTMLButtonElement>('button', { name: 'Continue' })).disabled).toBe(true);
    expect(screen.getByText(MISMATCH)).toBeTruthy();
    expect(services.createRpc).not.toHaveBeenCalled();
    expect(services.discoverWallets).not.toHaveBeenCalled();
  });

  it('shows local verification while the payment manifest is still unavailable', async () => {
    const { fragment, parsed } = await makeParsed();
    storedPins([{ label: 'Alice', signer: parsed.invoice.signer }]);
    const services = makeServices({ loadManifest: () => new Promise(() => undefined), discoverWallets: vi.fn(() => Promise.resolve([])) });
    setHash(fragment); renderWith(<AppShell order={ORDER} />, services);
    await screen.findByText('Valid signature — no matching signer pin is configured.');
    fireEvent.change(screen.getByLabelText('Expected seller (optional)'), { target: { value: 'Alice' } });
    await screen.findByText(PINNED);
    expect(services.discoverWallets).not.toHaveBeenCalled();
  });

  it('drops trust immediately when another tab removes the selected pin and does not downgrade the selection', async () => {
    const { fragment, parsed } = await makeParsed();
    storedPins([{ label: 'Alice', signer: parsed.invoice.signer }]);
    setHash(fragment); renderWith(<AppShell order={ORDER} />, makeServices());
    await screen.findByRole('heading', { name: 'Review payment' });
    fireEvent.change(screen.getByLabelText('Expected seller (optional)'), { target: { value: 'Alice' } });
    await screen.findByText(PINNED);
    changeStoredPins([]);
    expect(screen.queryByText(PINNED)).toBeNull();
    await screen.findByText('Verification unavailable or interrupted. Open the invoice again to retry.');
    expect(screen.getByLabelText<HTMLSelectElement>('Expected seller (optional)').value).toBe('Alice');
    // Fail closed: removing a pin may drop the entire review, so Continue can be absent or disabled.
    // In neither state may stale signer verification authorize progress.
    const proceed = screen.queryByRole<HTMLButtonElement>('button', { name: 'Continue' });
    expect(proceed === null || proceed.disabled).toBe(true);
  });

  it('cannot publish an old matching result after a pin is removed during verification', async () => {
    const { fragment, parsed } = await makeParsed();
    storedPins([{ label: 'Alice', signer: parsed.invoice.signer }]);
    const matched = await invoices.openFragment(fragment, { pinnedSigners: [parsed.invoice.signer] });
    setHash(fragment); renderWith(<AppShell order={ORDER} />, makeServices());
    await screen.findByRole('heading', { name: 'Review payment' });
    let finish: (value: invoices.OpenFragmentResult) => void = () => { throw new Error('not initialized'); };
    const pending = new Promise<invoices.OpenFragmentResult>((resolve) => { finish = resolve; });
    vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending);
    fireEvent.change(screen.getByLabelText('Expected seller (optional)'), { target: { value: 'Alice' } });
    changeStoredPins([]);
    await act(async () => { finish(matched); await pending; });
    expect(screen.queryByText(PINNED)).toBeNull();
    expect(screen.queryByText(/\(pinned by you\)/)).toBeNull();
    await screen.findByText('Verification unavailable or interrupted. Open the invoice again to retry.');
  });

  it('cannot reuse invoice A’s verification when rapidly opening invoice B', async () => {
    const a = await makeParsed(); const b = await makeParsed({ memo: 'Current invoice B' });
    let finish: (value: invoices.OpenFragmentResult) => void = () => { throw new Error('not initialized'); };
    const pending = new Promise<invoices.OpenFragmentResult>((resolve) => { finish = resolve; });
    const opening = vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending);
    setHash(a.fragment); renderWith(<AppShell order={ORDER} />, makeServices());
    await waitFor(() => { expect(opening).toHaveBeenCalled(); });
    act(() => { setHash(b.fragment); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await screen.findByText('Current invoice B');
    await act(async () => { finish({ status: 'ok', parsed: a.parsed }); await pending; });
    expect(screen.getByText('Current invoice B')).toBeTruthy();
    expect(screen.queryByText(a.parsed.invoice.signer)).toBeNull();
  });

  it('keeps another tab’s corrupt pin state visibly unavailable without trusting an old saved key', async () => {
    const { fragment, parsed } = await makeParsed();
    storedPins([{ label: 'Alice', signer: parsed.invoice.signer }]);
    setHash(fragment); renderWith(<AppShell order={ORDER} />, makeServices());
    await screen.findByRole('heading', { name: 'Review payment' });
    fireEvent.change(screen.getByLabelText('Expected seller (optional)'), { target: { value: 'Alice' } });
    await screen.findByText(PINNED);
    act(() => {
      localStorage.setItem(INVOICE_SIGNER_PINS_KEY, '{invalid');
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    });
    expect(screen.queryByText(PINNED)).toBeNull();
    expect(screen.getByText(/Saved signer pins cannot be read safely/)).toBeTruthy();
  });

  it('discards a prepared payment when the selected pin changes during preparation', async () => {
    const invoice = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const other = await makeParsed();
    storedPins([{ label: 'Alice', signer: invoice.parsed.invoice.signer }]);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    let release: () => void = () => { throw new Error('not initialized'); };
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const original = payExec.preparePayment;
    const preparation = vi.spyOn(payExec, 'preparePayment').mockImplementation(async (...args) => {
      const built = await original(...args); await pending; return built;
    });
    const wallet = new MockWallet();
    const services = makeServices({
      loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
      createRpc: () => Promise.resolve(withManifestChain(mockRpc(84532, () => '0x'))),
      discoverWallets: () => Promise.resolve([{ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet }]),
    });
    setHash(invoice.fragment); renderWith(<AppShell order={ORDER} />, services);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Review payment' });
    fireEvent.change(screen.getByLabelText('Expected seller (optional)'), { target: { value: 'Alice' } });
    await screen.findByText(PINNED);
    const proceed = await screen.findByRole<HTMLButtonElement>('button', { name: 'Continue' });
    await waitFor(() => { expect(proceed.disabled).toBe(false); });
    await user.click(proceed);
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await waitFor(() => { expect(preparation).toHaveBeenCalled(); });
    changeStoredPins([{ label: 'Alice', signer: other.parsed.invoice.signer }]);
    await act(async () => { release(); await pending; });
    await screen.findByText(MISMATCH);
    expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull();
    expect(wallet.calls.some((call) => call.method === 'eth_sendTransaction')).toBe(false);
  });

  it('rechecks persisted signer authority before wallet dispatch even before a cross-tab event arrives', async () => {
    const invoice = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const other = await makeParsed();
    storedPins([{ label: 'Alice', signer: invoice.parsed.invoice.signer }]);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const wallet = new MockWallet();
    setHash(invoice.fragment); renderWith(<AppShell order={ORDER} />, makeServices({
      loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
      createRpc: () => Promise.resolve(withManifestChain(mockRpc(84532, () => '0x'))),
      discoverWallets: () => Promise.resolve([{ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet }]),
    }));
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Review payment' });
    fireEvent.change(screen.getByLabelText('Expected seller (optional)'), { target: { value: 'Alice' } });
    await screen.findByText(PINNED);
    const proceed = await screen.findByRole<HTMLButtonElement>('button', { name: 'Continue' });
    await waitFor(() => { expect(proceed.disabled).toBe(false); });
    await user.click(proceed);
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    let release: (value: unknown) => void = () => { throw new Error('not initialized'); };
    let waiting = false;
    const pending = new Promise<unknown>((resolve) => { release = resolve; });
    const original = wallet.request.bind(wallet);
    vi.spyOn(wallet, 'request').mockImplementation((request) => {
      if (request.method === 'eth_accounts') { waiting = true; return pending; }
      return original(request);
    });
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await waitFor(() => { expect(waiting).toBe(true); });
    // Deliberately do not send the browser's queued event yet. The final guard must reread storage itself.
    storedPins([{ label: 'Alice', signer: other.parsed.invoice.signer }], 2);
    await act(async () => { release([wallet.account]); await pending; });
    expect(wallet.calls.some((call) => call.method === 'eth_sendTransaction')).toBe(false);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: INVOICE_SIGNER_PINS_KEY, storageArea: localStorage })); });
    await screen.findByText(MISMATCH);
  });
});
