// @vitest-environment jsdom
import * as invoices from '@ghostpay/invoice-schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { ATTEMPT_JOURNAL_KEY, readAttempts } from '../lib/duplicateAttemptJournal';
import { buildInvoiceLink } from '../lib/invoiceCreate';
import { clearSession, generateSession, getSessionPublic } from '../lib/session';
import { ServicesContext } from '../lib/services';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { AppContext, type AppState } from '../state';
import { BASE_FORM, NOW, makeParsed } from '../test/invoiceFixtures';
import { makeServices, renderApp, setHash } from '../test/render';
import { Pay } from './Pay';

beforeEach(() => { clearSession(); window.localStorage.clear(); window.sessionStorage.clear(); setHash(''); });
afterEach(() => { vi.restoreAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;
function requestFile(fragment: string, read?: () => Promise<ArrayBuffer>): File {
  const data = bytes(invoices.serializePaymentRequestFile(fragment));
  const file = new File([data], 'request.gpr.json', { type: 'application/json' });
  Object.defineProperty(file, 'arrayBuffer', { value: read ?? (() => Promise.resolve(data)) });
  return file;
}
function selectFile(file: File): void {
  fireEvent.change(screen.getByLabelText('Payment request file'), { target: { files: [file] } });
}
async function openInput() {
  const discoverWallets = vi.fn(() => Promise.resolve([]));
  const loadManifest = vi.fn(makeServices().loadManifest);
  const createRpc = vi.fn(makeServices().createRpc);
  const fetchFn = vi.fn(makeServices().fetchFn);
  const rendered = renderApp(makeServices({ discoverWallets, loadManifest, createRpc, fetchFn }));
  const user = userEvent.setup();
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /^Pay$/ }));
  await user.click(screen.getByText('Scan an invoice QR or open a request file'));
  loadManifest.mockClear(); createRpc.mockClear(); discoverWallets.mockClear(); fetchFn.mockClear();
  return { ...rendered, user, discoverWallets, loadManifest, createRpc, fetchFn };
}
async function scanText(text: string, user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const region = screen.getByRole('region', { name: 'Invoice QR import' });
  fireEvent.change(within(region).getByLabelText('Or paste QR text'), { target: { value: text } });
  await user.click(within(region).getByRole('button', { name: 'Use pasted text' }));
}

describe('Pay request-file intake', () => {
  it.each([false, true])('stages the unchanged signed invoice locally (encrypted=%s) and opens only after explicit review', async (encrypt) => {
    const invoice = await makeParsed({ token: 'native', tokenAmount: '0.5', encrypt });
    const { user, discoverWallets, loadManifest, createRpc, fetchFn } = await openInput();
    const location = window.location.href;
    selectFile(requestFile(invoice.fragment));
    expect(await screen.findByRole('heading', { name: 'Review request file' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    expect(window.location.href).toBe(location);
    expect(discoverWallets).not.toHaveBeenCalled();
    expect(loadManifest).not.toHaveBeenCalled();
    expect(createRpc).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    // The attempt journal lives in localStorage since #500; selecting and previewing a file must not touch it.
    expect(ATTEMPT_JOURNAL_KEY).toBe('ghostpay.wallet-attempts.v1');
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    expect(readAttempts()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Open request file' }));
    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy();
    expect(screen.getByText('Fixed: 0.5 ETH')).toBeTruthy();
    expect(discoverWallets).not.toHaveBeenCalled();
  });

  it('uses the existing passphrase flow without previewing private fields', async () => {
    generateSession();
    const created = await buildInvoiceLink({ ...BASE_FORM, memo: 'private file memo', passphrase: 'cedar orbit velvet lantern meadow' }, 'https://app.test/', NOW);
    const { user, discoverWallets, createRpc } = await openInput();
    selectFile(requestFile(created.fragment));
    expect(await screen.findByText('This invoice needs a passphrase. Its header is unverified until it opens.')).toBeTruthy();
    expect(screen.queryByText('private file memo')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open request file' }));
    expect(await screen.findByLabelText('Invoice passphrase')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    await user.type(screen.getByLabelText('Invoice passphrase'), 'cedar orbit velvet lantern meadow');
    await user.click(screen.getByRole('button', { name: /^Open invoice$/ }));
    expect(await screen.findByRole('heading', { name: 'Review payment' }, { timeout: 15_000 })).toBeTruthy();
    expect(screen.getByText('private file memo')).toBeTruthy();
    expect(discoverWallets).not.toHaveBeenCalled();
    expect(createRpc).not.toHaveBeenCalled();
  });

  it('accepts a second file after forgetting the first without refreshing the page', async () => {
    const first = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const second = await makeParsed({ token: 'native', tokenAmount: '0.75' });
    const { user, discoverWallets } = await openInput();
    selectFile(requestFile(first.fragment));
    await user.click(await screen.findByRole('button', { name: 'Open request file' }));
    await screen.findByText('Fixed: 0.5 ETH');
    await user.click(screen.getByRole('button', { name: 'Forget this invoice' }));
    await user.click(screen.getByText('Scan an invoice QR or open a request file'));
    selectFile(requestFile(second.fragment));
    await user.click(await screen.findByRole('button', { name: 'Open request file' }));
    expect(await screen.findByText('Fixed: 0.75 ETH')).toBeTruthy();
    expect(screen.queryByText('Fixed: 0.5 ETH')).toBeNull();
    expect(discoverWallets).not.toHaveBeenCalled();
  });

  it('clears an earlier preview before rejecting an oversized replacement without reading it', async () => {
    const { fragment } = await makeParsed();
    const { discoverWallets } = await openInput();
    selectFile(requestFile(fragment));
    await screen.findByRole('button', { name: 'Open request file' });
    const read = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const tooLarge = new File(['x'.repeat(invoices.MAX_PAYMENT_REQUEST_FILE_BYTES + 1)], 'request.gpr.json');
    Object.defineProperty(tooLarge, 'arrayBuffer', { value: read });
    selectFile(tooLarge);
    expect(await screen.findByText('Request file exceeds the 24 KiB size limit.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open request file' })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(discoverWallets).not.toHaveBeenCalled();
  });

  it('cannot let an older file read replace a newer QR preview', async () => {
    const first = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const second = await makeParsed({ token: 'native', tokenAmount: '0.75' });
    const read = deferred<ArrayBuffer>();
    const { user } = await openInput();
    selectFile(requestFile(first.fragment, () => read.promise));
    await scanText(second.fragment, user);
    await screen.findByRole('button', { name: 'Open scanned invoice' });
    await act(async () => { read.resolve(bytes(invoices.serializePaymentRequestFile(first.fragment))); await read.promise; });
    expect(screen.queryByRole('button', { name: 'Open request file' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open scanned invoice' }));
    expect(await screen.findByText('Fixed: 0.75 ETH')).toBeTruthy();
  });

  it('keeps the QR importer input when the page is hidden with no file involved', async () => {
    await openInput();
    const region = screen.getByRole('region', { name: 'Invoice QR import' });
    fireEvent.change(within(region).getByLabelText('Or paste QR text'), { target: { value: 'half-typed qr text' } });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(within(region).getByLabelText<HTMLTextAreaElement>('Or paste QR text').value).toBe('half-typed qr text');
  });

  it('keeps the QR importer input when the app locks with no file involved', async () => {
    await openInput();
    const region = screen.getByRole('region', { name: 'Invoice QR import' });
    fireEvent.change(within(region).getByLabelText('Or paste QR text'), { target: { value: 'half-typed qr text' } });
    act(() => { notifyAppLock('idle'); });
    expect(within(region).getByLabelText<HTMLTextAreaElement>('Or paste QR text').value).toBe('half-typed qr text');
  });

  it('clears the file-ready status when a newer QR input replaces the preview', async () => {
    const first = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const second = await makeParsed({ token: 'native', tokenAmount: '0.75' });
    const { user } = await openInput();
    selectFile(requestFile(first.fragment));
    await screen.findByText('Request file is ready for review.');
    await scanText(second.fragment, user);
    await screen.findByRole('button', { name: 'Open scanned invoice' });
    expect(screen.queryByText('Request file is ready for review.')).toBeNull();
  });

  it('shows one alert when the file is refused', async () => {
    const { fragment } = await makeParsed();
    await openInput();
    vi.spyOn(invoices, 'openFragment').mockRejectedValueOnce(new Error('refused'));
    selectFile(requestFile(fragment));
    await screen.findAllByText('Request file was not accepted.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('choosing a file supersedes an older QR parser result', async () => {
    const first = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const second = await makeParsed({ token: 'native', tokenAmount: '0.75' });
    const ready = await invoices.openFragment(first.fragment);
    const pending = deferred<Awaited<ReturnType<typeof invoices.openFragment>>>();
    const { user } = await openInput();
    vi.spyOn(invoices, 'openFragment').mockReturnValueOnce(pending.promise);
    await scanText(first.fragment, user);
    selectFile(requestFile(second.fragment));
    await screen.findByRole('button', { name: 'Open request file' });
    await act(async () => { pending.resolve(ready); await pending.promise; });
    expect(screen.queryByRole('button', { name: 'Open scanned invoice' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open request file' }));
    expect(await screen.findByText('Fixed: 0.75 ETH')).toBeTruthy();
  });

  it.each(['clear', 'close', 'hidden', 'session'] as const)('does not stage a file that finishes after %s invalidation', async (action) => {
    const { fragment } = await makeParsed();
    const read = deferred<ArrayBuffer>();
    const { user, discoverWallets, createRpc } = await openInput();
    selectFile(requestFile(fragment, () => read.promise));
    if (action === 'clear') await user.click(screen.getByRole('button', { name: 'Clear imported invoice' }));
    if (action === 'close') await user.click(screen.getByText('Scan an invoice QR or open a request file'));
    if (action === 'session') act(() => { clearSession(); });
    if (action === 'hidden') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    }
    await act(async () => { read.resolve(bytes(invoices.serializePaymentRequestFile(fragment))); await read.promise; });
    expect(screen.queryByRole('button', { name: 'Open request file', hidden: true })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(discoverWallets).not.toHaveBeenCalled();
    expect(createRpc).not.toHaveBeenCalled();
  });

  it.each(['absent', 'retained'] as const)('invalidates a pending file read on app lock (seller session=%s)', async (sessionState) => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    if (sessionState === 'absent') clearSession();
    const session = getSessionPublic();
    const read = deferred<ArrayBuffer>();
    const { discoverWallets, createRpc, loadManifest, fetchFn } = await openInput();
    selectFile(requestFile(fragment, () => read.promise));

    // Idle locking does not clear an absent session or the sole copy of generated seller keys.
    act(() => { notifyAppLock('idle'); });
    expect(getSessionPublic()).toBe(session);
    await act(async () => { read.resolve(bytes(invoices.serializePaymentRequestFile(fragment))); await read.promise; });

    expect(screen.queryByRole('button', { name: 'Open request file', hidden: true })).toBeNull();
    expect(screen.queryByText('Request file is ready for review.')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(discoverWallets).not.toHaveBeenCalled();
    expect(createRpc).not.toHaveBeenCalled();
    expect(loadManifest).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(['absent', 'retained'] as const)('invalidates a staged file preview on app lock (seller session=%s)', async (sessionState) => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    if (sessionState === 'absent') clearSession();
    const session = getSessionPublic();
    const { discoverWallets, createRpc, loadManifest, fetchFn } = await openInput();
    selectFile(requestFile(fragment));
    const open = await screen.findByRole('button', { name: 'Open request file' });

    act(() => { notifyAppLock('idle'); });
    expect(getSessionPublic()).toBe(session);
    expect(screen.queryByRole('button', { name: 'Open request file', hidden: true })).toBeNull();
    expect(screen.queryByText('Request file is ready for review.')).toBeNull();
    fireEvent.click(open);
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(discoverWallets).not.toHaveBeenCalled();
    expect(createRpc).not.toHaveBeenCalled();
    expect(loadManifest).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('discards a pending file when pinned signer policy changes without unmounting Pay', async () => {
    const { parsed, fragment } = await makeParsed();
    const services = makeServices();
    const app: AppState = {
      view: 'pay', setView: () => undefined, settings: DEFAULT_SETTINGS, updateSettings: () => true,
      session: getSessionPublic(), fragment: undefined, setFragment: vi.fn(),
      matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
      getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce: () => undefined,
    };
    const view = (pinnedSigners: readonly string[]) => <ServicesContext.Provider value={services}><AppContext.Provider value={{ ...app, settings: { ...DEFAULT_SETTINGS, pinnedSigners } }}><Pay /></AppContext.Provider></ServicesContext.Provider>;
    const { rerender } = render(view([]));
    const user = userEvent.setup();
    await user.click(screen.getByText('Scan an invoice QR or open a request file'));
    const read = deferred<ArrayBuffer>();
    selectFile(requestFile(fragment, () => read.promise));
    rerender(view([parsed.invoice.signer]));
    await act(async () => { read.resolve(bytes(invoices.serializePaymentRequestFile(fragment))); await read.promise; });
    expect(screen.queryByRole('button', { name: 'Open request file' })).toBeNull();
    expect(app.setFragment).not.toHaveBeenCalled();
    selectFile(requestFile(fragment));
    expect(await screen.findByRole('button', { name: 'Open request file' })).toBeTruthy();
  });

  it('preserves the lean invoice gate when a request file contains a full-profile invoice', async () => {
    generateSession();
    const created = await buildInvoiceLink({ ...BASE_FORM, bufferPolicy: { accepted: false, minWei: '0', maxWei: '0', refund: 'none' } }, 'https://app.test/', NOW);
    const services = makeServices();
    const app: AppState = {
      view: 'pay', setView: () => undefined, settings: DEFAULT_SETTINGS, updateSettings: () => true,
      session: getSessionPublic(), fragment: undefined, setFragment: vi.fn(),
      matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
      getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce: () => undefined,
    };
    render(<ServicesContext.Provider value={services}><AppContext.Provider value={app}><Pay supportedOnly /></AppContext.Provider></ServicesContext.Provider>);
    const user = userEvent.setup();
    await user.click(screen.getByText('Scan an invoice QR or open a request file'));
    selectFile(requestFile(created.fragment));
    expect(await screen.findByText('This build supports fixed-amount invoices without a seller buffer policy.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open request file' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(app.setFragment).not.toHaveBeenCalled();
  });
});
