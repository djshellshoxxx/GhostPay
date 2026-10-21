// @vitest-environment jsdom
import { decodeBase64Url, encodeBase64Url, parseFragment } from '@ghostpay/invoice-schema';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInvoiceLink } from '../lib/invoiceCreate';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { WalletInfo } from '../lib/wallet';
import { FAKE_FEE_RECIPIENT, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { BASE_FORM, NOW, makeParsed } from '../test/invoiceFixtures';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';
import type { Services } from '../lib/services';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setHash('');
});

const loaded = (id: number): Services['loadManifest'] => () => Promise.resolve({ status: 'loaded', manifest: fakeManifest(id) });
const walletInfo = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w });

function openWith(fragment: string, services: Services): ReturnType<typeof userEvent.setup> {
  setHash(fragment);
  renderApp(services);
  return userEvent.setup();
}

function chainSeeing(wallet: MockWallet) {
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_getTransactionByHash') {
      const s = wallet.sent;
      return s === undefined ? null : { hash: params[0], from: s['from'], to: s['to'], input: s['data'], value: s['value'], chainId: '0x14a34' };
    }
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x64', to: wallet.sent?.['to'] };
    if (method === 'eth_gasPrice') return '0x3b9aca00';
    throw new Error(`unexpected ${method}`);
  });
}

describe('Pay: invoice reading and review', () => {
  it('opens a link, shows the review, uses the required signature wording and clears the fragment', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5', memo: 'Thanks' });
    openWith(fragment, makeServices({ loadManifest: loaded(84532) }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Review payment' })).toBeTruthy();
    const sig = screen.getByText(/Signature matches key/);
    expect(sig.textContent).toMatch(/\(not pinned\)/);
    expect(document.body.textContent?.toLowerCase()).not.toContain('verified seller');
    expect(window.location.hash).toBe('');
    expect(screen.getByText('Base Sepolia')).toBeTruthy();
    expect(await screen.findByText('You pay (gross)')).toBeTruthy();
    expect(screen.getAllByText(/0\.5 ETH/, { selector: 'dd' }).length).toBeGreaterThan(0);
    expect(screen.getByText(FAKE_ROUTER)).toBeTruthy();
    expect(screen.getAllByText(FAKE_FEE_RECIPIENT).length).toBeGreaterThan(0);
    expect(screen.getByText(/GhostPay charges 0\.25 % on payments made through its checkout contract/)).toBeTruthy();
    expect(screen.getByText(/Paying the stealth address directly costs no GhostPay fee/)).toBeTruthy();
    expect(screen.getByText('What becomes public')).toBeTruthy();
    expect(screen.getByText('Thanks')).toBeTruthy();
  });

  it('keeps the fragment when the user turns auto-clear off, and offers to remove it', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoClearFragment: false }));
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532) }));
    await screen.findByRole('heading', { name: 'Review payment' });
    expect(window.location.hash).toBe(fragment);
    await user.click(screen.getByRole('button', { name: 'Remove link from address bar' }));
    expect(window.location.hash).toBe('');
  });

  it('says payments are disabled on a chain with no manifest and offers no way forward', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    openWith(fragment, makeServices());
    expect(await screen.findByText('This payment cannot proceed')).toBeTruthy();
    expect(screen.getAllByText(/Payments disabled on this chain/).length).toBeGreaterThan(0);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(true);
  });

  it('renders hostile text from the invoice as inert text', async () => {
    const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    generateSession();
    const created = await buildInvoiceLink({ ...BASE_FORM, token: 'native', tokenAmount: '0.1', lineItems: [{ description: evil, quantity: '1', unitPrice: '1.00' }], memo: evil }, 'https://app.test/', NOW);
    openWith(created.fragment, makeServices({ loadManifest: loaded(84532) }));
    await screen.findByRole('heading', { name: 'Review payment' });
    expect(document.querySelector('main img')).toBeNull();
    expect(document.querySelector('main script')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    expect(screen.getAllByText(evil).length).toBe(2);
  });

  it('fails closed on a tampered fragment (corrupted encoding)', async () => {
    const { fragment } = await makeParsed();
    const body = fragment.slice('#gpi=v1.'.length);
    const mid = Math.floor(body.length / 2);
    const tampered = `#gpi=v1.${body.slice(0, mid)}${body[mid] === 'A' ? 'B' : 'A'}${body.slice(mid + 1)}`;
    openWith(tampered, makeServices({ loadManifest: loaded(84532) }));
    expect((await screen.findByText('Invoice rejected')).textContent).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('treats a re-signed-less edit as an INVALID signature hard stop', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const json = new TextDecoder().decode(decodeBase64Url(fragment.slice('#gpi=v1.'.length)));
    const edited = json.replace('Consulting', 'Consultinh');
    expect(edited).not.toBe(json);
    const forged = `#gpi=v1.${encodeBase64Url(new TextEncoder().encode(edited))}`;
    const parsed = await parseFragment(forged);
    expect(parsed.trust).toBe('invalid-signature');
    const user = openWith(forged, makeServices({ loadManifest: loaded(84532) }));
    expect((await screen.findAllByText(/signature is INVALID/)).length).toBeGreaterThan(0);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(true);
    void user;
  });

  it('rejects an oversized fragment', async () => {
    openWith(`#gpi=v1.${'A'.repeat(30_000)}`, makeServices());
    expect((await screen.findByRole('alert')).textContent).toMatch(/16 KiB/);
  });

  it('rejects non-invoice hashes silently and accepts pasted links', async () => {
    const { link } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    setHash('#something-else');
    const user = userEvent.setup();
    renderApp(makeServices({ loadManifest: loaded(84532) }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Pay' }));
    expect(screen.getByRole('heading', { name: 'Pay an invoice' })).toBeTruthy();
    const box = screen.getByLabelText('Paste an invoice link');
    await user.type(box, 'https://app.test/nothing here');
    await user.click(screen.getByRole('button', { name: 'Read invoice' }));
    expect(screen.getByRole('alert').textContent).toMatch(/not a GhostPay v1/);
    await user.clear(box);
    await user.click(box);
    await user.paste(link);
    await user.click(screen.getByRole('button', { name: 'Read invoice' }));
    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Forget this invoice' }));
    expect(screen.getByRole('heading', { name: 'Pay an invoice' })).toBeTruthy();
  });

  it('reacts to a link pasted into the address bar while the app is open', async () => {
    renderApp(makeServices({ loadManifest: loaded(84532) }));
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    act(() => {
      setHash(fragment);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy();
    expect(window.location.hash).toBe('');
  });

  it('blocks expired invoices', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    openWith(fragment, makeServices({ loadManifest: loaded(84532), nowMs: () => (NOW + 48 * 3600) * 1000 }));
    expect(await screen.findByText('This invoice has expired.')).toBeTruthy();
  });

  it('shows the no-feed message for fiat-priced invoices', async () => {
    const { fragment } = await makeParsed({ amountMode: 'fiat_quote' });
    const rpc = mockRpc(84532, () => '0x');
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(rpc) }));
    expect(await screen.findByText(/No price feed is configured for USDC\/USD/)).toBeTruthy();
  });
});

describe('Pay: sending', () => {
  async function toPrepared(wallet: MockWallet, services: Services): Promise<ReturnType<typeof userEvent.setup>> {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const user = openWith(fragment, { ...services, discoverWallets: () => Promise.resolve([walletInfo(wallet)]) });
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    return user;
  }

  it('shows decoded calldata, sends only after the explicit click, and reports an unverified (no RPC) result honestly', async () => {
    const wallet = new MockWallet();
    const user = await toPrepared(wallet, makeServices({ loadManifest: loaded(84532) }));
    expect(wallet.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
    expect(screen.getByText('payNative')).toBeTruthy();
    expect(screen.getByText('One-time destination')).toBeTruthy();
    expect(screen.getByText(new RegExp(`to ${FAKE_FEE_RECIPIENT}`))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    expect(await screen.findByRole('heading', { name: 'Submitted' })).toBeTruthy();
    expect(wallet.sent?.['to']).toBe(FAKE_ROUTER);
    expect(screen.getByText(/No RPC is configured, so this app could not verify/)).toBeTruthy();
    expect(screen.getByText(/not yet confirmed/)).toBeTruthy();
  });

  it('verifies on the user RPC when one is configured and offers a local receipt', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const wallet = new MockWallet();
    const rpc = chainSeeing(wallet);
    const user = await toPrepared(wallet, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(rpc) }));
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    expect(await screen.findByText(/Independently verified on your RPC/)).toBeTruthy();
    expect(screen.getByText(/included in block 100/)).toBeTruthy();
    const download = vi.fn();
    URL.createObjectURL = (): string => 'blob:x';
    URL.revokeObjectURL = (): void => undefined;
    HTMLAnchorElement.prototype.click = download;
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Download local receipt' }));
    expect(download).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Download local receipt' }));
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('REFUSES (shows an error, not success) when the wallet mutates the transaction', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const wallet = new MockWallet({ mutateTx: (tx) => ({ ...tx, value: '0x1' }) });
    const rpc = chainSeeing(wallet);
    const user = await toPrepared(wallet, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(rpc) }));
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/differs from the preview \(value\)/);
    expect(screen.queryByRole('heading', { name: 'Submitted' })).toBeNull();
  });

  it('REFUSES a wallet that lies about its accounts or chain', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    for (const [opts, re] of [
      [{ lieAboutAccounts: true }, /inconsistent accounts/],
      [{ lieAboutChain: true }, /contradictory chain ids/],
    ] as const) {
      const wallet = new MockWallet(opts);
      setHash(fragment);
      const view = renderApp(makeServices({ loadManifest: loaded(84532), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Continue' }));
      await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
      expect((await screen.findByRole('alert')).textContent).toMatch(re);
      expect(screen.queryByRole('button', { name: 'Prepare payment' })).toBeNull();
      view.unmount();
      clearSession();
    }
  });

  it('shows a clear message when no wallet is installed', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532) }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/No browser wallet found/)).toBeTruthy();
  });

  it('surfaces a user rejection and lets them retry', async () => {
    const wallet = new MockWallet({ rejectSend: true });
    const user = await toPrepared(wallet, makeServices({ loadManifest: loaded(84532) }));
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/rejected the request/);
    expect(screen.getByRole('button', { name: 'Send payment in my wallet' })).toBeTruthy();
  });
});

describe('Pay: optional delay (Feature 6) and gas buffer (Feature 1)', () => {
  it('delay: nothing is signed while waiting, can be cancelled, or skipped with "send now"', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ delayMinSec: 60, delayMaxSec: 60 }));
    const wallet = new MockWallet();
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(await screen.findByLabelText(/Wait a random time first/));
    await user.click(screen.getByRole('button', { name: 'Start the delay' }));
    expect(await screen.findByText('Scheduled locally. Nothing has been signed or broadcast.')).toBeTruthy();
    expect(screen.getByText(/Time left: /)).toBeTruthy();
    expect(wallet.calls).toEqual([]);
    expect(screen.queryByRole('button', { name: /Connect/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Start the delay' })).toBeTruthy();
    expect(wallet.calls).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Start the delay' }));
    await user.click(await screen.findByRole('button', { name: 'Send now' }));
    expect(await screen.findByRole('button', { name: /Connect Mock Wallet/ })).toBeTruthy();
    expect(wallet.calls).toEqual([]);
  });

  it('delay: revalidates at the due time and stops if the invoice expired while waiting', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ delayMinSec: 60, delayMaxSec: 60 }));
    let clock = NOW * 1000;
    const wallet = new MockWallet();
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), nowMs: () => clock, discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(await screen.findByLabelText(/Wait a random time first/));
    await user.click(screen.getByRole('button', { name: 'Start the delay' }));
    await screen.findByText('Scheduled locally. Nothing has been signed or broadcast.');
    clock = (NOW + 48 * 3600) * 1000;
    await user.click(screen.getByRole('button', { name: 'Send now' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/expired while waiting/);
    expect(screen.queryByRole('button', { name: /Connect/ })).toBeNull();
    expect(wallet.calls).toEqual([]);
  });

  it('delay: becomes ready by itself after the (zero) interval', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ delayMinSec: 0, delayMaxSec: 0 }));
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), discoverWallets: () => Promise.resolve([walletInfo(new MockWallet())]) }));
    await user.click(await screen.findByLabelText(/Wait a random time first/));
    await user.click(screen.getByRole('button', { name: 'Start the delay' }));
    expect(await screen.findByRole('button', { name: /Connect Mock Wallet/ }, { timeout: 4000 })).toBeTruthy();
  });

  it('gas buffer: default off; enabling shows the native amount and the public-linkage notice; needs an RPC', async () => {
    const { fragment } = await makeParsed();
    const wallet = new MockWallet();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainSeeing(wallet);
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(rpc) }));
    const box = await screen.findByLabelText<HTMLInputElement>(/Add a gas buffer/);
    expect(box.checked).toBe(false);
    await user.click(box);
    expect(await screen.findByText(/This publicly links your payment, the one-time address and the buffer/)).toBeTruthy();
    expect(screen.getByText(/Extra 0\.00024 ETH \(native, not USDC\)/)).toBeTruthy();
    expect(screen.getByText('Public linkage')).toBeTruthy();
  });

  it('gas buffer without an RPC explains what is missing', async () => {
    const { fragment } = await makeParsed();
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532) }));
    await user.click(await screen.findByLabelText(/Add a gas buffer/));
    expect((await screen.findByRole('alert')).textContent).toMatch(/needs an RPC/);
  });

  it('native invoices offer no gas buffer', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    openWith(fragment, makeServices({ loadManifest: loaded(84532) }));
    await screen.findByRole('heading', { name: 'Review payment' });
    expect(screen.queryByLabelText(/Add a gas buffer/)).toBeNull();
  });

  it('ERC-20 flow with a buffer: approves exactly, prepares a buffer payment, sends', async () => {
    const { fragment } = await makeParsed();
    const wallet = new MockWallet();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    let allowance = 0n;
    const base = chainSeeing(wallet);
    const rpc = mockRpc(84532, (method, params) => {
      if (method === 'eth_call') return `0x${allowance.toString(16).padStart(64, '0')}`;
      if (method === 'eth_getTransactionByHash' && (wallet.sent?.['to'] as string | undefined)?.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e') allowance = 10n ** 12n;
      return base.request(method, params);
    });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(await screen.findByLabelText(/Add a gas buffer/));
    await screen.findByText(/Extra 0\.00024 ETH/);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' }, { timeout: 5000 });
    expect(screen.getByText('payERC20WithBuffer')).toBeTruthy();
    expect(screen.getByText(/gas buffer, public/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Submitted' })).toBeTruthy(); }, { timeout: 5000 });
    expect(wallet.sent?.['to']).toBe(FAKE_ROUTER);
  });
});
