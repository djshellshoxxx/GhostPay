import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { NOW, USDC_84532, makeParsed } from '../test/invoiceFixtures';
import { MockWallet } from '../test/mockWallet';
import { mockRpc, type MockRpc } from '../test/mockRpc';
import { createPayContext, decodeForDisplay, reviewInvoice, type PayContext } from './pay';
import { PostBroadcastError, preparePayment, sendPayment, type Runtime } from './payExec';
import { clearSession } from './session';
import { SubmissionMismatchError, connectWallet, type WalletInfo, type WalletSession } from './wallet';

beforeEach(() => {
  // The duplicate-attempt journal lives in tab storage; start every test from an empty journal.
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* storage unavailable: nothing to isolate */
  }
});

afterEach(() => {
  clearSession();
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* storage unavailable: nothing to isolate */
  }
});

const noStatus = (): void => undefined;
const sleep = (): Promise<void> => Promise.resolve();
const winfo = (w: MockWallet): WalletInfo => ({ id: 'm', name: 'Mock', kind: 'injected', provider: w });

// Independent expectations for the 100 USDC fixture (6 decimals), seller_pays, 0.25 % router fee.
const EXPECTED_GROSS = 100_000_000n;
const EXPECTED_FEE = 250_000n;
const EXPECTED_NET = 99_750_000n;
const ALLOWANCE_WORD = `0x${(10n ** 12n).toString(16).padStart(64, '0')}`;

async function erc20Setup(
  wallet: MockWallet = new MockWallet(),
): Promise<{ ctx: PayContext; session: WalletSession; wallet: MockWallet }> {
  const { parsed } = await makeParsed();
  const ctx = await createPayContext(
    reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) }),
    undefined,
    { nowSeconds: NOW },
  );
  const session = await connectWallet(winfo(wallet), 84532);
  return { ctx, session, wallet };
}

function allowanceRpc(wallet: MockWallet): MockRpc {
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_call') return ALLOWANCE_WORD;
    if (method === 'eth_getTransactionByHash') {
      const s = wallet.sent;
      if (s === undefined) return null;
      return { hash: params[0], from: s['from'], to: s['to'], input: s['data'], value: s['value'], chainId: '0x14a34' };
    }
    if (method === 'eth_getTransactionReceipt') {
      return { status: '0x1', blockNumber: '0x64', to: wallet.sent?.['to'] };
    }
    throw new Error(`unexpected ${method}`);
  });
}

describe('ERC-20 payment is bound to exact token, destination and amounts at the wallet boundary', () => {
  it('hands the wallet one zero-value router call for the invoice token with the independently expected split', async () => {
    const { ctx, session, wallet } = await erc20Setup();
    const rpc = allowanceRpc(wallet);
    const rt: Runtime = { rpc, nowSeconds: () => NOW, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    const res = await sendPayment(session, ctx, built, rt, noStatus);

    expect(res.verification).toBe('verified');
    expect(res.receipt?.status).toBe('success');
    expect(rpc.calls.some((c) => c.method === 'eth_getTransactionByHash')).toBe(true);

    // Exactly one wallet transaction: no hidden approval, transfer or second call.
    expect(wallet.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(1);

    const sent = wallet.sent;
    expect(sent).toBeDefined();
    expect(String(sent?.['to']).toLowerCase()).toBe(FAKE_ROUTER.toLowerCase());
    expect(BigInt(String(sent?.['value']))).toBe(0n);
    expect(String(sent?.['from']).toLowerCase()).toBe(session.account.toLowerCase());

    // Decode what the wallet REALLY received, not the preview object.
    const decoded = decodeForDisplay(
      { ...built, tx: { to: FAKE_ROUTER, data: String(sent?.['data']) as `0x${string}`, value: 0n } },
      84532,
    );
    expect(decoded.method).toBe('payERC20');
    expect(decoded.token).not.toBe('native');
    expect(String(decoded.token).toLowerCase()).toBe(USDC_84532.toLowerCase());
    expect(decoded.router.toLowerCase()).toBe(FAKE_ROUTER.toLowerCase());
    expect(decoded.gross).toBe(EXPECTED_GROSS);
    expect(decoded.fee).toBe(EXPECTED_FEE);
    expect(decoded.net).toBe(EXPECTED_NET);
    expect(decoded.gross).toBe(decoded.fee + decoded.net);
    expect(decoded.value).toBe(0n);
    // Funds go to a one-time stealth address, never to the payer, the router or the token contract.
    expect(decoded.stealth.toLowerCase()).not.toBe(session.account.toLowerCase());
    expect(decoded.stealth.toLowerCase()).not.toBe(FAKE_ROUTER.toLowerCase());
    expect(decoded.stealth.toLowerCase()).not.toBe(USDC_84532.toLowerCase());

    // The preview the user saw agrees with the independent derivation.
    expect(built.preview.token).toBe(decoded.token);
    expect(built.preview.gross).toBe(EXPECTED_GROSS);
    expect(built.preview.fee).toBe(EXPECTED_FEE);
    expect(built.preview.net).toBe(EXPECTED_NET);
  });

  it('reports a wallet that broadcasts a different ERC-20 token than the prepared invoice token, keeping the hash and not retrying', async () => {
    const otherToken = '1234567890123456789012345678901234567890';
    const tokenWord = USDC_84532.slice(2).toLowerCase();
    const mutateToken = (tx: Record<string, unknown>): Record<string, unknown> => {
      const data = String(tx['data']).toLowerCase();
      expect(data.split(tokenWord).length - 1).toBeGreaterThanOrEqual(1);
      const swapped = data.replace(tokenWord, otherToken);
      expect(swapped).not.toBe(data);
      return { ...tx, data: swapped };
    };
    const { ctx, session, wallet } = await erc20Setup(new MockWallet({ mutateTx: mutateToken }));
    const rpc = allowanceRpc(wallet);
    const rt: Runtime = { rpc, nowSeconds: () => NOW, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);

    // The exact prepared object is the reviewed invoice token with the independently expected split.
    const intended = decodeForDisplay(built, 84532);
    expect(String(intended.token).toLowerCase()).toBe(USDC_84532.toLowerCase());
    expect(intended.gross).toBe(EXPECTED_GROSS);
    expect(intended.fee).toBe(EXPECTED_FEE);
    expect(intended.net).toBe(EXPECTED_NET);

    // Pre-send guards pass; only the wallet boundary alters the token.
    const p = sendPayment(session, ctx, built, rt, noStatus);
    await expect(p).rejects.toThrow(PostBroadcastError);
    await expect(p).rejects.toMatchObject({
      hash: `0x${'9'.repeat(64)}`,
      cause: expect.any(SubmissionMismatchError),
    });
    await expect(p).rejects.toThrow(/differs from the preview \(call data\)/);

    // Exactly one send: no automatic retry.
    expect(wallet.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(1);

    // What the wallet REALLY broadcast names the different token, while amounts and router are unchanged.
    const sent = wallet.sent;
    expect(sent).toBeDefined();
    expect(String(sent?.['data']).toLowerCase()).not.toBe(built.tx.data.toLowerCase());
    // Inspect the ABI token word directly: the strict decoder rejects token/metadata disagreement.
    const broadcastData = String(sent?.['data']).toLowerCase();
    expect(broadcastData.slice(10, 74)).toBe(otherToken.padStart(64, '0'));
    expect(built.tx.data.toLowerCase().slice(10, 74)).toBe(tokenWord.padStart(64, '0'));
    expect(broadcastData.slice(0, 10)).toBe(built.tx.data.slice(0, 10));
    expect(broadcastData.slice(74)).toBe(built.tx.data.toLowerCase().slice(74));

    // The independent RPC was consulted for the broadcast transaction and never produced a verified result.
    expect(rpc.calls.some((c) => c.method === 'eth_getTransactionByHash')).toBe(true);
    expect(rpc.calls.some((c) => c.method === 'eth_getTransactionReceipt')).toBe(false);
  });
});
