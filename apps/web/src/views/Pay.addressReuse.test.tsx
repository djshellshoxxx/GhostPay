// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { approveWalletDisclosure } from '../test/walletDisclosure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuiltPayment } from '@ghostpay/chain-adapters';
import { buildInvoiceLink } from '../lib/invoiceCreate';
import * as payExec from '../lib/payExec';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { WalletInfo } from '../lib/wallet';
import { BASE_FORM, makeParsed, NOW, USDC_84532 } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';

class EventWallet extends MockWallet {
  private readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void {
    const group = this.listeners.get(event) ?? new Set(); group.add(listener); this.listeners.set(event, group);
  }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of [...this.listeners.get(event) ?? []]) listener(); }
}

beforeEach(() => { clearSession(); localStorage.clear(); sessionStorage.clear(); setHash(''); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function setup(token = 'native'): Promise<{ user: ReturnType<typeof userEvent.setup>; wallet: EventWallet; next: string }> {
  const first = await makeParsed({ token, tokenAmount: '0.5' });
  const next = await buildInvoiceLink({ ...BASE_FORM, token, tokenAmount: '0.5', memo: 'Second invoice' }, 'https://app.test/', NOW);
  const wallet = new EventWallet();
  const info: WalletInfo = { id: 'event-wallet', name: 'Event Wallet', kind: 'injected', provider: wallet };
  const originalPrepare = payExec.preparePayment;
  let firstBuilt: BuiltPayment | undefined;
  // Simulate the same destination being returned for two distinct invoices. No transaction is broadcast.
  vi.spyOn(payExec, 'preparePayment').mockImplementation(async (...args) => {
    firstBuilt ??= await originalPrepare(...args);
    return firstBuilt;
  });
  vi.spyOn(payExec, 'sendPayment').mockImplementation((_wallet, _ctx, _built, _runtime, _status, _guard, onRequest) => {
    onRequest?.();
    return Promise.resolve({ hash: `0x${'9'.repeat(64)}`, verification: 'no-rpc', receipt: undefined });
  });
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
  setHash(first.fragment);
  renderApp(makeServices({
    discoverWallets: () => Promise.resolve([info]),
    loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
    createRpc: () => Promise.resolve(withManifestChain(mockRpc(84532, () => '0x'))),
  }));
  return { user: userEvent.setup(), wallet, next: next.fragment };
}

async function prepare(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: /Connect Event Wallet/ }));
  await approveWalletDisclosure(user, 'eth_requestAccounts');
  await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
  await screen.findByRole('heading', { name: 'Final check before your wallet' });
}

function openNext(fragment: string): void {
  act(() => {
    window.history.replaceState(null, '', `/${fragment}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('Pay destination reuse warning', () => {
  it('warns before a different invoice reuses a submitted destination in the same account session', async () => {
    const { user, next } = await setup();
    await prepare(user);
    expect(screen.getByText('Local destination reuse check')).toBeTruthy();
    expect(screen.queryByText(/A payment request for another invoice/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await screen.findByRole('heading', { name: 'Submitted' });
    openNext(next);
    await prepare(user);
    expect(screen.getByText(/A payment request for another invoice named this destination/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send payment in my wallet' })).toBeTruthy();
    expect(payExec.sendPayment).toHaveBeenCalledTimes(1);
  });

  it('does not record a destination just because the payer prepared or rendered it', async () => {
    const { user, next } = await setup();
    await prepare(user);
    openNext(next);
    await prepare(user);
    expect(screen.queryByText(/A payment request for another invoice/)).toBeNull();
    expect(payExec.sendPayment).not.toHaveBeenCalled();
  });

  it('forgets local observations after an account event before another invoice is opened', async () => {
    const { user, next, wallet } = await setup();
    await prepare(user);
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await screen.findByRole('heading', { name: 'Submitted' });
    act(() => { wallet.emit('accountsChanged'); });
    openNext(next);
    await prepare(user);
    expect(screen.queryByText(/A payment request for another invoice/)).toBeNull();
  });

  it('records a known payment hash even when post-broadcast verification fails', async () => {
    const { user, next } = await setup();
    vi.mocked(payExec.sendPayment).mockRejectedValueOnce(new payExec.PostBroadcastError(`0x${'9'.repeat(64)}`, { key: 'transaction.detail.rpcFailed' }));
    await prepare(user);
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await screen.findByRole('heading', { name: 'Payment sent, verifying' });
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    openNext(next);
    await prepare(user);
    expect(screen.getByText(/A payment request for another invoice named this destination/)).toBeTruthy();
    expect(payExec.sendPayment).toHaveBeenCalledTimes(1);
  });

  it('does not mistake an approval hash for use of the payment destination', async () => {
    const { user, next } = await setup(USDC_84532);
    vi.spyOn(payExec, 'classifyPayerPermit').mockResolvedValue('unsupported_token');
    vi.spyOn(payExec, 'planApproval').mockImplementation((ctx, _wallet, token) => Promise.resolve({
      token, spender: ctx.manifest.router, have: 0n, need: ctx.request.grossAmount, required: true,
    }));
    vi.spyOn(payExec, 'grantApproval').mockRejectedValueOnce(new payExec.PostBroadcastError(`0x${'8'.repeat(64)}`, { key: 'transaction.detail.allowanceFailed' }));
    await prepare(user);
    await user.click(screen.getByRole('button', { name: 'Approve exactly, then send payment in my wallet' }));
    await screen.findByRole('heading', { name: 'Approval sent, verifying' });
    expect(payExec.sendPayment).not.toHaveBeenCalled();
    openNext(next);
    await prepare(user);
    expect(screen.queryByText(/A payment request for another invoice/)).toBeNull();
    expect(payExec.grantApproval).toHaveBeenCalledTimes(1);
    expect(payExec.sendPayment).not.toHaveBeenCalled();
  });

  it.each(['success', 'verification-error'] as const)('does not restore a disconnected session when its late payment has a %s outcome', async (outcome) => {
    const { user, next, wallet } = await setup();
    let finish: (() => void) | undefined;
    const pending = new Promise<payExec.SubmitResult>((resolve, reject) => {
      finish = outcome === 'success'
        ? () => { resolve({ hash: `0x${'9'.repeat(64)}`, verification: 'no-rpc', receipt: undefined }); }
        : () => { reject(new payExec.PostBroadcastError(`0x${'9'.repeat(64)}`, { key: 'transaction.detail.rpcFailed' })); };
    });
    vi.mocked(payExec.sendPayment).mockImplementationOnce((_wallet, _ctx, _built, _runtime, _status, _guard, onRequest) => {
      onRequest?.();
      return pending;
    });
    await prepare(user);
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await waitFor(() => { expect(payExec.sendPayment).toHaveBeenCalledTimes(1); });
    act(() => { wallet.emit('disconnect'); });
    openNext(next);
    await prepare(user);
    act(() => { finish?.(); });
    await screen.findByText('Previous invoice transaction may have been submitted');
    expect(screen.queryByText(/A payment request for another invoice/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Send payment in my wallet' })).toBeTruthy();
    expect(payExec.sendPayment).toHaveBeenCalledTimes(1);
  });
});
