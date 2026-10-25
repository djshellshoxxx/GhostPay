// @vitest-environment jsdom
import { decodeBase64Url, encodeBase64Url, invoiceDigest, openFragment, parseFragment } from '@ghostpay/invoice-schema';
import { bytesToHex } from '@noble/hashes/utils.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInvoiceLink } from '../lib/invoiceCreate';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { WalletInfo } from '../lib/wallet';
import { FAKE_FEE_RECIPIENT, FAKE_ROUTER } from '../test/fakeManifest';
import { BASE_FORM, NOW, makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';
import type { Services } from '../lib/services';
import { receiptJson, signReceipt } from '../lib/receipts';
import * as payExec from '../lib/payExec';
import { withSessionSecrets } from '../lib/session';
import { PERMIT_TYPES, eip712DomainSeparator, erc20MetadataAbi } from '@ghostpay/chain-adapters';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionResult } from 'viem/utils';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setHash('');
});

const loaded = (id: number): Services['loadManifest'] => () => Promise.resolve({ status: 'loaded', manifest: backedManifest(id) });
const walletInfo = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w });

/** Chain that only answers the manifest read-back (enough to build a payment; nothing else is seen on it). */
const readBackRpc = (): Services['createRpc'] => () => Promise.resolve(withManifestChain(mockRpc(84532, (m) => (m === 'eth_getTransactionByHash' || m === 'eth_getTransactionReceipt' ? null : '0x'))));
const withRpcSetting = (): void => {
  const cur = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' }, ...cur }));
};

function openWith(fragment: string, services: Services, opts: { noRpcSetting?: boolean } = {}): ReturnType<typeof userEvent.setup> {
  if (opts.noRpcSetting !== true) withRpcSetting();
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
  it('accepts a signed receipt only when its invoice digest and expected payment fields match', async () => {
    const { parsed, fragment } = await makeParsed();
    const receiptFields = {
      invoiceDigest: `0x${bytesToHex(invoiceDigest(parsed.invoice))}`,
      chainId: parsed.invoice.chainId,
      txHash: `0x${'a'.repeat(64)}`,
      stealthAddress: `0x${'b'.repeat(40)}`,
      asset: parsed.invoice.token,
      amountMinorUnits: '99750000',
      issuedAt: NOW,
    };
    const correct = withSessionSecrets((secrets) => signReceipt(receiptFields, secrets.signingKey));
    const wrongInvoice = withSessionSecrets((secrets) => signReceipt({ ...receiptFields, invoiceDigest: `0x${'e'.repeat(64)}` }, secrets.signingKey));
    const separatelyTrustedKey = new Uint8Array(32).fill(77);
    const separatelySigned = signReceipt(receiptFields, separatelyTrustedKey);
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    await screen.findByText('Seller receives (net)', {}, { timeout: 30_000 });
    await user.click(screen.getByLabelText('I consent to opening private receipt details on this screen.'));
    const upload = screen.getByLabelText('Signed seller receipt JSON');
    await user.upload(upload, new File(['x'.repeat(65_537)], 'oversized.json', { type: 'application/json' }));
    await user.click(screen.getByRole('button', { name: 'Check receipt against this invoice' }));
    expect(await screen.findByText('Receipt not accepted')).toBeTruthy();
    expect(screen.queryByText(/The signature matches/)).toBeNull();
    await user.upload(upload, new File([receiptJson(wrongInvoice)], 'receipt.json', { type: 'application/json' }));
    await user.click(screen.getByRole('button', { name: 'Check receipt against this invoice' }));
    expect(await screen.findByText('Receipt not accepted')).toBeTruthy();
    await user.upload(upload, new File([receiptJson(correct)], 'receipt.json', { type: 'application/json' }));
    await user.click(screen.getByRole('button', { name: 'Check receipt against this invoice' }));
    expect(await screen.findByText(/The signature matches the valid invoice-signing key/)).toBeTruthy();
    await user.clear(screen.getByLabelText('Explicitly trusted signer key (optional)'));
    await user.type(screen.getByLabelText('Explicitly trusted signer key (optional)'), bytesToHex(secp256k1.getPublicKey(separatelyTrustedKey)));
    await user.upload(upload, new File([receiptJson(separatelySigned)], 'trusted.json', { type: 'application/json' }));
    await user.click(screen.getByRole('button', { name: 'Check receipt against this invoice' }));
    expect(await screen.findByText(/The signature matches the explicitly trusted key/)).toBeTruthy();
    expect(screen.getByText(/does not independently prove an on-chain payment/)).toBeTruthy();
    const next = await makeParsed({ tokenAmount: '101' });
    window.history.replaceState(null, '', `/${next.fragment}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await screen.findByRole('heading', { name: 'Review payment' });
    await waitFor(() => { expect(screen.queryByText('Receipt matches this invoice')).toBeNull(); });
  });

  it('does not read private receipt details without explicit consent', async () => {
    const { fragment } = await makeParsed();
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    await screen.findByText('Seller receives (net)');
    const text = vi.spyOn(File.prototype, 'text').mockResolvedValue('private details');
    try {
      await user.upload(screen.getByLabelText('Signed seller receipt JSON'), new File(['private details'], 'receipt.json', { type: 'application/json' }));
      await user.click(screen.getByRole('button', { name: 'Check receipt against this invoice' }));
      expect(await screen.findByText(/Consent is required before opening/)).toBeTruthy();
      expect(text).not.toHaveBeenCalled();
      expect(screen.queryByText('Receipt matches this invoice')).toBeNull();
    } finally { text.mockRestore(); }
  });

  it('does not accept a receipt under a trusted key that changed during file reading', async () => {
    const { parsed, fragment } = await makeParsed();
    const receipt = withSessionSecrets((secrets) => signReceipt({
      invoiceDigest: `0x${bytesToHex(invoiceDigest(parsed.invoice))}`,
      chainId: parsed.invoice.chainId,
      txHash: `0x${'a'.repeat(64)}`,
      stealthAddress: `0x${'b'.repeat(40)}`,
      asset: parsed.invoice.token,
      amountMinorUnits: '99750000',
      issuedAt: NOW,
    }, secrets.signingKey));
    let resolveText!: (value: string) => void;
    const deferredText = new Promise<string>((resolve) => { resolveText = resolve; });
    const textSpy = vi.spyOn(File.prototype, 'text').mockReturnValue(deferredText);
    try {
      const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
      await screen.findByText('Seller receives (net)');
      await user.click(screen.getByLabelText('I consent to opening private receipt details on this screen.'));
      await user.upload(screen.getByLabelText('Signed seller receipt JSON'), new File(['deferred'], 'receipt.json', { type: 'application/json' }));
      await user.click(screen.getByRole('button', { name: 'Check receipt against this invoice' }));
      await user.type(screen.getByLabelText('Explicitly trusted signer key (optional)'), `02${'1'.repeat(64)}`);
      resolveText(receiptJson(receipt));
      await waitFor(() => { expect(screen.getByRole('button', { name: 'Check receipt against this invoice' }).getAttribute('disabled')).toBeNull(); });
      expect(screen.queryByText(/The signature matches/)).toBeNull();
    } finally {
      textSpy.mockRestore();
    }
  });

  it('accepts bounded QR text only through the same strict receipt verification flow', async () => {
    const { parsed, fragment } = await makeParsed();
    const receipt = withSessionSecrets((secrets) => signReceipt({
      invoiceDigest: `0x${bytesToHex(invoiceDigest(parsed.invoice))}`,
      chainId: parsed.invoice.chainId,
      txHash: `0x${'a'.repeat(64)}`,
      stealthAddress: `0x${'b'.repeat(40)}`,
      asset: parsed.invoice.token,
      amountMinorUnits: '99750000',
      issuedAt: NOW,
    }, secrets.signingKey));
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    await screen.findByText('Seller receives (net)', {}, { timeout: 30_000 });

    await user.click(screen.getByLabelText('I consent to opening private receipt details on this screen.'));
    const paste = screen.getByLabelText('Or paste QR text');
    fireEvent.change(paste, { target: { value: JSON.stringify({ ...receipt, extra: 'unrecognized' }) } });
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(await screen.findByText('Receipt not accepted')).toBeTruthy();
    expect(screen.queryByText('Receipt matches this invoice')).toBeNull();

    fireEvent.change(paste, { target: { value: receiptJson(receipt) } });
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(await screen.findByText('Receipt matches this invoice')).toBeTruthy();

    fireEvent.change(paste, { target: { value: 'x'.repeat(65_537) } });
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(await screen.findByText('QR text exceeds the 64 KiB safety limit.')).toBeTruthy();
    expect(screen.queryByText('Receipt matches this invoice')).toBeNull();
  });

  it('keeps a late context refresh from replacing the currently opened invoice', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoClearFragment: false, rpcUrls: { '84532': 'https://rpc.test' } }));
    const first = await makeParsed({ tokenAmount: '100' });
    const second = await makeParsed({ tokenAmount: '200' });
    let resolveFirst!: (value: Awaited<ReturnType<Services['createRpc']>>) => void;
    const firstRpc = new Promise<Awaited<ReturnType<Services['createRpc']>>>((resolve) => { resolveFirst = resolve; });
    const readyRpc = withManifestChain(mockRpc(84532, (method) => (method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt' ? null : '0x')));
    let calls = 0;
    const services = makeServices({
      loadManifest: loaded(84532),
      createRpc: () => (++calls === 1 ? firstRpc : Promise.resolve(readyRpc)),
    });
    openWith(first.fragment, services);
    await screen.findByRole('heading', { name: 'Review payment' });
    window.history.replaceState(null, '', `/${second.fragment}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await screen.findByRole('heading', { name: 'Review payment' });
    act(() => { resolveFirst(readyRpc); });
    expect(await screen.findByText('199.5 USDC')).toBeTruthy();
    await waitFor(() => { expect(screen.getByText('199.5 USDC')).toBeTruthy(); });
    expect(screen.queryByText('99.75 USDC')).toBeNull();
  });

  it('opens a link, shows the review, uses the required signature wording and clears the fragment', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5', memo: 'Thanks' });
    openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Review payment' }, { timeout: 15_000 })).toBeTruthy();
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
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    await screen.findByRole('heading', { name: 'Review payment' });
    expect(window.location.hash).toBe(fragment);
    await user.click(screen.getByRole('button', { name: 'Remove link from address bar' }));
    expect(window.location.hash).toBe('');
  });

  it('prompts for a passphrase, rejects a wrong one, and opens the invoice only after decryption', async () => {
    const passphrase = 'cedar orbit velvet lantern meadow';
    generateSession();
    const created = await buildInvoiceLink({ ...BASE_FORM, memo: 'private note', passphrase }, 'https://app.test/', NOW);
    expect((await openFragment(created.fragment)).status).toBe('needsPassphrase');
    const user = openWith(created.fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    expect(await screen.findByText('Passphrase-protected invoice')).toBeTruthy();
    await user.type(screen.getByLabelText('Invoice passphrase'), 'wrong phrase here');
    await user.click(screen.getByRole('button', { name: 'Open invoice' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/did not open this invoice/); }, { timeout: 120_000 });
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    await user.clear(screen.getByLabelText('Invoice passphrase'));
    await user.type(screen.getByLabelText('Invoice passphrase'), passphrase);
    await user.click(screen.getByRole('button', { name: 'Open invoice' }));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Review payment' })).toBeTruthy(); }, { timeout: 120_000 });
    expect(screen.getByText('private note')).toBeTruthy();
    expect(window.location.hash).toBe('');
  // Three production-cost scrypt operations exceed the ordinary test bound under V8 coverage.
  }, 360_000);

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
    openWith(created.fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
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
    openWith(tampered, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
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
    const user = openWith(forged, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
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
    renderApp(makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
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
    renderApp(makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
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
    openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc(), nowMs: () => (NOW + 48 * 3600) * 1000 }));
    expect(await screen.findByText('This invoice has expired.')).toBeTruthy();
  });

  it('shows the no-feed message for fiat-priced invoices', async () => {
    const { fragment } = await makeParsed({ amountMode: 'fiat_quote' });
    const rpc = mockRpc(84532, () => '0x');
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
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

  it('discards a deferred preparation when the opened invoice changes', async () => {
    const first = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const second = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    let releasePreparation!: () => void;
    const preparationGate = new Promise<void>((resolve) => { releasePreparation = resolve; });
    const originalPrepare = payExec.preparePayment;
    const prepareSpy = vi.spyOn(payExec, 'preparePayment').mockImplementation(async (...args) => {
      const built = await originalPrepare(...args);
      await preparationGate;
      return built;
    });
    const wallet = new MockWallet();
    try {
      const user = openWith(first.fragment, makeServices({
        loadManifest: loaded(84532),
        createRpc: readBackRpc(),
        discoverWallets: () => Promise.resolve([walletInfo(wallet)]),
      }));
      await user.click(await screen.findByRole('button', { name: 'Continue' }));
      await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
      await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
      await waitFor(() => { expect(prepareSpy).toHaveBeenCalled(); });
      window.history.replaceState(null, '', `/${second.fragment}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await screen.findByText('Seller receives (net)');
      act(() => { releasePreparation(); });
      await waitFor(() => { expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull(); });
      expect(wallet.calls.some((call) => call.method === 'eth_sendTransaction')).toBe(false);
    } finally {
      prepareSpy.mockRestore();
      releasePreparation();
    }
  });

  it('shows decoded calldata, sends only after the explicit click, and reports an unverified result honestly (the RPC cannot see the transaction yet)', async () => {
    const wallet = new MockWallet();
    const user = await toPrepared(wallet, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    expect(wallet.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
    expect(screen.getByText('payNative')).toBeTruthy();
    expect(screen.getByText('One-time destination')).toBeTruthy();
    expect(screen.getByText(new RegExp(`to ${FAKE_FEE_RECIPIENT}`))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    expect(await screen.findByRole('heading', { name: 'Submitted' })).toBeTruthy();
    expect(wallet.sent?.['to']).toBe(FAKE_ROUTER);
    expect(screen.getByText(/Your RPC does not show the transaction yet/)).toBeTruthy();
    expect(screen.getByText(/not yet confirmed/)).toBeTruthy();
  });

  it('verifies on the user RPC when one is configured and offers a local receipt', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const wallet = new MockWallet();
    const rpc = chainSeeing(wallet);
    const user = await toPrepared(wallet, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
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
    expect(screen.getByTestId('proof-disclaimer').textContent).toMatch(/not independent proof of payment/i);
    await user.click(screen.getByRole('button', { name: 'Show proof QR' }));
    expect(document.querySelector('[data-qr-kind="proof"], [data-qr-kind="caution"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Copy proof JSON' })).toBeTruthy();
    // The printable bill is part of the review page and carries the bearer-link warning for a non-passphrase link.
    const printSpy = vi.fn();
    window.print = printSpy;
    await user.click(screen.getByRole('button', { name: 'Print bill' }));
    expect(printSpy).toHaveBeenCalledOnce();
    expect(screen.getByTestId('bearer-warning').textContent).toMatch(/anyone who sees this paper/i);
  });

  it('REFUSES (shows an error, not success) when the wallet mutates the transaction', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const wallet = new MockWallet({ mutateTx: (tx) => ({ ...tx, value: '0x1' }) });
    const rpc = chainSeeing(wallet);
    const user = await toPrepared(wallet, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
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
      withRpcSetting();
      setHash(fragment);
      const view = renderApp(makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc(), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
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
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/No browser wallet found/)).toBeTruthy();
  });

  it('surfaces a user rejection and blocks a blind retry until explicit clearing', async () => {
    const wallet = new MockWallet({ rejectSend: true });
    const user = await toPrepared(wallet, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/rejected the request/);
    expect(screen.getByRole('button', { name: 'Send payment in my wallet' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/previous wallet attempt/);
    expect(wallet.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(1);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await user.click(screen.getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
      await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/rejected the request/);
      expect(wallet.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(2);
    } finally { confirm.mockRestore(); }
  });
});

describe('Pay: optional delay (Feature 6) and gas buffer (Feature 1)', () => {
  it('delay: nothing is signed while waiting, can be cancelled, or skipped with "send now"', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ delayMinSec: 60, delayMaxSec: 60 }));
    const wallet = new MockWallet();
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc(), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
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
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc(), nowMs: () => clock, discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
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
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc(), discoverWallets: () => Promise.resolve([walletInfo(new MockWallet())]) }));
    await user.click(await screen.findByLabelText(/Wait a random time first/));
    await user.click(screen.getByRole('button', { name: 'Start the delay' }));
    expect(await screen.findByRole('button', { name: /Connect Mock Wallet/ }, { timeout: 4000 })).toBeTruthy();
  });

  it('gas buffer: default off; enabling shows the native amount and the public-linkage notice; needs an RPC', async () => {
    const { fragment } = await makeParsed();
    const wallet = new MockWallet();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainSeeing(wallet);
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
    const box = await screen.findByLabelText<HTMLInputElement>(/Add a gas buffer/);
    expect(box.checked).toBe(false);
    await user.click(box);
    expect(await screen.findByText(/This publicly links your payment, the one-time address and the buffer/)).toBeTruthy();
    expect(screen.getByText(/Extra 0\.00024 ETH \(native, not USDC\)/)).toBeTruthy();
    expect(screen.getByText('Public linkage')).toBeTruthy();
  });

  it('gas buffer without an RPC explains what is missing', async () => {
    const { fragment } = await makeParsed();
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }), { noRpcSetting: true });
    await user.click(await screen.findByLabelText(/Add a gas buffer/));
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent).join(' ')).toMatch(/needs an RPC/);
  });

  it('v2 invoice whose seller declines buffers offers none (ADR-0023)', async () => {
    const { fragment } = await makeParsed({ bufferPolicy: { accepted: false, maxWei: '0', minWei: '0', refund: 'none' } });
    openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    expect(await screen.findByText('The seller does not accept a gas buffer for this invoice.')).toBeTruthy();
    expect(screen.queryByLabelText(/Add a gas buffer/)).toBeNull();
  });

  it('v2 invoice with a seller minimum raises a smaller estimate to it and says so (ADR-0023)', async () => {
    const { fragment } = await makeParsed({ bufferPolicy: { accepted: true, maxWei: '1000000000000000', minWei: '500000000000000', refund: 'none' } });
    const wallet = new MockWallet();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainSeeing(wallet);
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
    await user.click(await screen.findByLabelText(/Add a gas buffer/));
    const notice = await screen.findByText(/Extra 0\.0005 ETH/);
    expect(notice.textContent).toMatch(/Raised to the seller's minimum/);
    expect(notice.textContent).toMatch(/never refunded/);
  });

  it('native invoices offer no gas buffer', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: readBackRpc() }));
    await screen.findByRole('heading', { name: 'Review payment' });
    expect(screen.queryByLabelText(/Add a gas buffer/)).toBeNull();
  });

  it('ERC-20 flow with a buffer: previews the exact approval, then approves and sends', async () => {
    const { fragment } = await makeParsed();
    const wallet = new MockWallet();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    let allowance = 0n;
    const base = chainSeeing(wallet);
    const rpc = mockRpc(84532, (method, params) => {
      if (method === 'eth_call') return `0x${allowance.toString(16).padStart(64, '0')}`;
      if (method === 'eth_estimateGas') return '0xfde8';
      if (method === 'eth_getTransactionByHash' && (wallet.sent?.['to'] as string | undefined)?.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e') allowance = 10n ** 12n;
      return base.request(method, params);
    });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(await screen.findByLabelText(/Add a gas buffer/));
    await screen.findByText(/Extra 0\.00024 ETH/);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' }, { timeout: 5000 });
    expect(screen.getByText('payERC20WithBuffer')).toBeTruthy();
    expect(screen.getByText(/gas buffer, public/)).toBeTruthy();
    expect(screen.getByText('Exact amount requested').parentElement?.textContent).toContain('100 USDC');
    await user.click(screen.getByRole('button', { name: 'Approve exactly, then send payment in my wallet' }));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Submitted' })).toBeTruthy(); }, { timeout: 5000 });
    expect(wallet.sent?.['to']).toBe(FAKE_ROUTER);
    expect(rpc.calls.some((c) => c.method === 'eth_estimateGas')).toBe(true);
  });

  it('permit token whose permit domain cannot be verified falls back to the exact approval path without a signature prompt (spec 04)', async () => {
    const { fragment } = await makeParsed();
    const wallet = new MockWallet();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const base = chainSeeing(wallet);
    // Every eth_call answers with an allowance word: name() cannot decode, so the permit domain is unverifiable.
    const rpc = mockRpc(84532, (method, params) => (method === 'eth_call' ? `0x${'0'.repeat(64)}` : base.request(method, params)));
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' }, { timeout: 5000 });
    expect(screen.getByText('payERC20')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve exactly, then send payment in my wallet' })).toBeTruthy();
    expect(wallet.calls.some((c) => c.method === 'eth_signTypedData_v4')).toBe(false);
  });

  it('a signed permit the token rejects is explained, nothing is sent, and the next Prepare uses an exact approval (spec 04)', async () => {
    const { fragment } = await makeParsed();
    const payer = privateKeyToAccount(`0x${'cd'.repeat(32)}`);
    const usdc = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
    const domain = { name: 'USDC', version: '2', chainId: 84532, verifyingContract: usdc } as const;
    const sig = await payer.signTypedData({ domain, types: PERMIT_TYPES, primaryType: 'Permit', message: { owner: payer.address, spender: FAKE_ROUTER, value: 100_000_000n, nonce: 0n, deadline: BigInt(NOW + 20 * 60) } });
    const wallet = new MockWallet({ account: payer.address, typedDataSignature: sig });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const base = chainSeeing(wallet);
    const rpc = mockRpc(84532, (method, params) => {
      if (method !== 'eth_call') return base.request(method, params);
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x3644e515')) return eip712DomainSeparator(domain);
      if (data.startsWith('0xd505accf')) throw new Error('execution reverted'); // token refuses the permit
      return `0x${'0'.repeat(64)}`; // allowance 0, nonces 0
    });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    expect((await screen.findAllByRole('alert', {}, { timeout: 5000 })).map((a) => a.textContent).join(' ')).toMatch(/token rejected this permit signature/);
    expect(wallet.calls.filter((c) => c.method === 'eth_signTypedData_v4')).toHaveLength(1);
    expect(wallet.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' }, { timeout: 5000 });
    expect(screen.getByText('payERC20')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve exactly, then send payment in my wallet' })).toBeTruthy();
    expect(wallet.calls.filter((c) => c.method === 'eth_signTypedData_v4')).toHaveLength(1);
  });

  it('permit token with enough allowance already skips the permit signature (spec 04 already_allowed)', async () => {
    const { fragment } = await makeParsed();
    const wallet = new MockWallet();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const base = chainSeeing(wallet);
    const rpc = mockRpc(84532, (method, params) => (method === 'eth_call' ? `0x${(10n ** 12n).toString(16).padStart(64, '0')}` : base.request(method, params)));
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' }, { timeout: 5000 });
    expect(screen.getByText('payERC20')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve exactly, then send payment in my wallet' })).toBeNull();
    expect(wallet.calls.some((c) => c.method === 'eth_signTypedData_v4')).toBe(false);
  });

  it('ERC-20 flow with a buffer fails closed when the token transfer cannot be simulated (spec 13)', async () => {
    const { fragment } = await makeParsed();
    const wallet = new MockWallet();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const base = chainSeeing(wallet);
    const rpc = mockRpc(84532, (method, params) => {
      if (method === 'eth_call') return `0x${'0'.repeat(64)}`;
      if (method === 'eth_estimateGas') throw new Error('execution reverted');
      return base.request(method, params);
    });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(await screen.findByLabelText(/Add a gas buffer/));
    await screen.findByText(/default table value/);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByText(/could not be simulated/);
    expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull();
    expect(wallet.sent).toBeUndefined();
  });
});

describe('Pay: manifest read-back and post-broadcast safety (WEB-APP-01, WEB-APP-02)', () => {
  async function toPreparedWith(wallet: MockWallet, rpc: ReturnType<typeof mockRpc>): Promise<ReturnType<typeof userEvent.setup>> {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const user = openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(withManifestChain(rpc)), discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    return user;
  }

  it('WEB-APP-02: after the wallet broadcast, a verification failure never re-enables Send and never says nothing was sent', async () => {
    const wallet = new MockWallet();
    const rpc = mockRpc(84532, (method) => {
      if (method === 'eth_gasPrice') return '0x3b9aca00';
      throw new Error('HTTP 500');
    });
    const user = await toPreparedWith(wallet, rpc);
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await screen.findByText(/already sent this transaction/);
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(document.body.textContent).not.toContain('Nothing was sent');
    expect(document.body.textContent).toContain('9'.repeat(64));
    expect(wallet.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(1);
  });

  it('WEB-APP-01: refuses to build a payment when the contracts on chain do not match the manifest', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const bad = withManifestChain(mockRpc(84532, () => '0x'), { feeRecipient: '0x00000000000000000000000000000000deadbeef' });
    openWith(fragment, makeServices({ loadManifest: loaded(84532), createRpc: () => Promise.resolve(bad) }));
    expect(await screen.findByText(/do not match the deployment manifest/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(true);
  });

  it('WEB-APP-01: without an RPC the manifest cannot be verified, so no payment is built', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    openWith(fragment, makeServices({ loadManifest: loaded(84532) }), { noRpcSetting: true });
    expect(await screen.findByText(/RPC for this chain is needed to verify/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(true);
  });

  it('WEB-APP-01: shows the unsigned-dev banner', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    openWith(fragment, makeServices({ loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST (test)' }) }));
    expect(await screen.findByText('UNSIGNED DEV MANIFEST (test)')).toBeTruthy();
  });
});
