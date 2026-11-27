// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { WalletInfo } from '../lib/wallet';
import { NOW, makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';
import { useAutoApprovedWalletDisclosures } from '../test/walletDisclosure';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setHash('');
});
afterEach(() => { vi.restoreAllMocks(); });

useAutoApprovedWalletDisclosures();

describe('Pay: payer proof of a completed payment', () => {
  it('keeps the enlarged proof QR open and the proof bytes unchanged across the periodic re-render', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const wallet = new MockWallet();
    const rpc = mockRpc(84532, (method, params) => {
      const sent = wallet.sent;
      if (method === 'eth_getTransactionByHash') {
        return sent === undefined ? null : { hash: params[0], from: sent['from'], to: sent['to'], input: sent['data'], value: sent['value'], chainId: '0x14a34' };
      }
      if (method === 'eth_getTransactionReceipt') return { transactionHash: params[0], status: '0x1', blockNumber: '0x64', to: sent?.['to'] };
      if (method === 'eth_gasPrice') return '0x3b9aca00';
      if (method === 'eth_call' && (params[0] as { to?: unknown }).to === '0x420000000000000000000000000000000000000F') return `0x${'0'.repeat(64)}`;
      throw new Error(`unexpected ${method}`);
    });
    // A moving clock, as in a browser: any receipt rebuilt during a later render carries a later time.
    let now = NOW * 1000;
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const walletInfo: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet };
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    setHash(fragment);
    renderApp(makeServices({
      nowMs: () => now,
      loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
      createRpc: () => Promise.resolve(withManifestChain(rpc)),
      discoverWallets: () => Promise.resolve([walletInfo]),
    }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await screen.findByText(/Independently verified on your RPC/);

    await user.click(screen.getByRole('button', { name: 'Show proof QR' }));
    const proof = screen.getByRole('region', { name: 'Proof of payment' });
    const text = (): string => within(proof).getByLabelText<HTMLTextAreaElement>('Proof of payment text').value;
    const shown = text();
    await user.click(within(proof).getByRole('button', { name: 'Show larger' }));
    expect(screen.getByRole('dialog', { name: /QR code, large/ })).toBeTruthy();

    // The page re-evaluates expiry every five seconds; run that tick after the clock moved.
    now += 5_000;
    const ticks = intervals.mock.calls.filter(([, delay]) => delay === 5_000).map(([callback]) => callback as () => void);
    expect(ticks.length).toBeGreaterThan(0);
    act(() => { for (const tick of ticks) tick(); });

    expect(screen.queryByRole('dialog', { name: /QR code, large/ })).not.toBeNull();
    expect(text()).toBe(shown);
  });
});
