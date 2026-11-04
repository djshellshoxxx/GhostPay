import { erc20Abi } from '@ghostpay/chain-adapters';
import { ghostPayPolicyRouterAbi, type Hex } from '@ghostpay/policy-scheme';
import { decodeFunctionData, encodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { PostBroadcastError } from '../../lib/payExec';
import { captureSessionVersionGuard, clearSession } from '../../lib/session';
import { connectWallet, type TxRequest } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { DEPLOYMENT, ROUTER, SEPOLIA, account, fakeChain, walletMirror } from './fixtures.testutil';
import { preparePolicyPayment, type PreparedPolicyPayment } from './pay';
import { sendPolicyPayment, type PolicySendGuard } from './send';

const a1 = account('acct-001');
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const GROSS = 5_000n;
const word = (n: bigint): Hex => encodeAbiParameters([{ type: 'uint256' }], [n]);
const fn = (data: unknown, abi: typeof erc20Abi | typeof ghostPayPolicyRouterAbi): string => decodeFunctionData({ abi, data: data as Hex }).functionName;

const copy = (tx: TxRequest): TxRequest => ({ to: tx.to, data: tx.data, value: tx.value });

interface SetupOpts {
  allowanceBefore?: bigint;
  allowanceAfter?: bigint | 'throw';
  approvalStatus?: '0x1' | '0x0';
  token?: string;
  noRpc?: boolean;
  /** Called on the first allowance read (an await between review and the wallet prompt). */
  onAllowanceRead?: () => void;
  /** The RPC never returns the approval transaction itself (only its receipt). */
  hideApprovalTx?: boolean;
}

async function setup(opts: SetupOpts = {}) {
  const w = new MockWallet({ chainId: SEPOLIA });
  const session = await connectWallet({ id: 'mock', name: 'Mock', kind: 'eip6963', provider: w }, SEPOLIA);
  const sentLog: Record<string, unknown>[] = [];
  const mirror = walletMirror(w, (to) => (to.toLowerCase() === TOKEN.toLowerCase() ? (opts.approvalStatus ?? '0x1') : '0x1'));
  const rpc = fakeChain(SEPOLIA, {
    extra: (method, params) => {
      if (method === 'eth_call') {
        const c = params[0] as { to: string };
        if (c.to.toLowerCase() !== TOKEN.toLowerCase()) return undefined;
        opts.onAllowanceRead?.();
        const approved = sentLog.some((t) => String(t['to']).toLowerCase() === TOKEN.toLowerCase());
        if (!approved) return word(opts.allowanceBefore ?? 0n);
        if (opts.allowanceAfter === 'throw') throw new Error('rpc down');
        return word(opts.allowanceAfter ?? GROSS);
      }
      if (method === 'eth_getTransactionByHash' && opts.hideApprovalTx === true && String(w.sent?.['to']).toLowerCase() === TOKEN.toLowerCase()) return null;
      return mirror(method);
    },
  });
  const origRequest = w.request.bind(w);
  w.request = async (args) => {
    const r = await origRequest(args);
    if (args.method === 'eth_sendTransaction' && w.sent !== undefined) sentLog.push(w.sent);
    return r;
  };
  const prepared = preparePolicyPayment({ metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token: opts.token ?? TOKEN, gross: GROSS, nowSec: 1n });
  const hashes: Hex[] = [];
  const status: string[] = [];
  // What the review screen showed, captured together with the session version (as PolicyPay does).
  const guard: PolicySendGuard = {
    assertCurrent: captureSessionVersionGuard(),
    deployment: DEPLOYMENT,
    reviewed: { chainId: SEPOLIA, payment: copy(prepared.built.tx), ...(prepared.approval === undefined ? {} : { approval: copy(prepared.approval) }) },
  };
  const walletSends = (): number => w.calls.filter((c) => c.method === 'eth_sendTransaction').length;
  const run = (g: PolicySendGuard = guard, p: PreparedPolicyPayment = prepared) => sendPolicyPayment(session, p, { rpc: opts.noRpc === true ? undefined : rpc, nowSeconds: () => 1, sleep: () => Promise.resolve() }, (m) => status.push(m), (h) => hashes.push(h), g);
  return { w, sentLog, run, hashes, status, prepared, guard, walletSends };
}

describe('policy payment sending (fund safety)', () => {
  it('does not send the payment when the approval reverts, and keeps the approval hash', async () => {
    const t = await setup({ approvalStatus: '0x0' });
    await expect(t.run()).rejects.toBeInstanceOf(PostBroadcastError);
    expect(t.sentLog.map((x) => fn(x['data'], erc20Abi))).toEqual(['approve']);
    expect(t.hashes).toHaveLength(1);
  });
  it('does not send the payment when the allowance readback is too low', async () => {
    const t = await setup({ allowanceAfter: GROSS - 1n });
    await expect(t.run()).rejects.toThrow(/did not take effect/);
    expect(t.sentLog).toHaveLength(1);
  });
  it('does not send the payment when the allowance readback fails', async () => {
    const t = await setup({ allowanceAfter: 'throw' });
    await expect(t.run()).rejects.toBeInstanceOf(PostBroadcastError);
    expect(t.sentLog).toHaveLength(1);
  });
  it('approves, waits for the receipt, reads the allowance back, then pays', async () => {
    const t = await setup();
    const r = await t.run();
    expect(t.sentLog.map((x) => String(x['to']).toLowerCase())).toEqual([TOKEN.toLowerCase(), ROUTER.toLowerCase()]);
    expect(fn(t.sentLog[1]?.['data'], ghostPayPolicyRouterAbi)).toBe('payERC20');
    expect(r.receipt?.status).toBe('success');
    expect(t.hashes).toHaveLength(2);
  });
  it('skips the approval when the allowance already covers the payment', async () => {
    const t = await setup({ allowanceBefore: GROSS });
    await t.run();
    expect(t.sentLog.map((x) => fn(x['data'], ghostPayPolicyRouterAbi))).toEqual(['payERC20']);
  });
  it('refuses an ERC-20 payment without an RPC and sends nothing', async () => {
    const t = await setup({ noRpc: true });
    await expect(t.run()).rejects.toThrow(/needs an RPC/);
    expect(t.sentLog).toHaveLength(0);
  });
  it('sends a native payment directly', async () => {
    const t = await setup({ token: 'native' });
    await t.run();
    expect(t.sentLog.map((x) => fn(x['data'], ghostPayPolicyRouterAbi))).toEqual(['payNative']);
  });
});

describe('policy payment sending (session guard and reviewed transaction)', () => {
  it('refuses without contacting the wallet when the session changed between review and send', async () => {
    const t = await setup({ token: 'native' });
    clearSession();
    await expect(t.run()).rejects.toThrow(/Seller keys changed/);
    expect(t.walletSends()).toBe(0);
    expect(t.hashes).toHaveLength(0);
  });
  it('refuses without contacting the wallet when the session changes during the allowance read', async () => {
    const t = await setup({ onAllowanceRead: () => { clearSession(); } });
    await expect(t.run()).rejects.toThrow(/Seller keys changed/);
    expect(t.walletSends()).toBe(0);
  });
  it('refuses when the payment calldata was changed after review', async () => {
    const t = await setup({ token: 'native' });
    const tx = t.prepared.built.tx;
    const tampered = { ...t.prepared, built: { ...t.prepared.built, tx: { ...tx, data: `${tx.data.slice(0, -2)}${tx.data.endsWith('00') ? '01' : '00'}` as Hex } } };
    await expect(t.run(t.guard, tampered)).rejects.toThrow(/differs from what you reviewed/);
    expect(t.walletSends()).toBe(0);
  });
  it('refuses when the payment value or target was changed after review', async () => {
    const t = await setup({ token: 'native' });
    await expect(t.run({ ...t.guard, reviewed: { ...t.guard.reviewed, payment: { ...t.guard.reviewed.payment, value: t.guard.reviewed.payment.value + 1n } } })).rejects.toThrow(/differs from what you reviewed/);
    await expect(t.run({ ...t.guard, reviewed: { ...t.guard.reviewed, payment: { ...t.guard.reviewed.payment, to: TOKEN } } })).rejects.toThrow(/differs from what you reviewed/);
    expect(t.walletSends()).toBe(0);
  });
  it('refuses when the wallet is on another chain than the reviewed one', async () => {
    const t = await setup({ token: 'native' });
    await expect(t.run({ ...t.guard, reviewed: { ...t.guard.reviewed, chainId: SEPOLIA + 1 } })).rejects.toThrow(/differs from what you reviewed/);
    expect(t.walletSends()).toBe(0);
  });
  it('refuses when the approval was changed after review (spender, amount or presence)', async () => {
    const t = await setup();
    const approval = t.guard.reviewed.approval;
    if (approval === undefined) throw new Error('fixture');
    const bigger = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [ROUTER, GROSS + 1n] });
    await expect(t.run({ ...t.guard, reviewed: { ...t.guard.reviewed, approval: { ...approval, data: bigger } } })).rejects.toThrow(/differs from what you reviewed/);
    await expect(t.run({ ...t.guard, reviewed: { chainId: t.guard.reviewed.chainId, payment: t.guard.reviewed.payment } })).rejects.toThrow(/differs from what you reviewed/);
    expect(t.walletSends()).toBe(0);
  });
  it('refuses an approval to a spender other than the policy router even if it was reviewed', async () => {
    const t = await setup();
    const evil = { to: TOKEN as Hex, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [TOKEN, GROSS] }) };
    await expect(t.run({ ...t.guard, reviewed: { ...t.guard.reviewed, approval: copy(evil) } }, { ...t.prepared, approval: evil })).rejects.toThrow(/Blocked/);
    expect(t.walletSends()).toBe(0);
  });
  it('refuses a payment whose calldata does not bind to the reviewed deployment', async () => {
    const t = await setup({ token: 'native' });
    const other = { ...DEPLOYMENT, factory: TOKEN as Hex };
    await expect(t.run({ ...t.guard, deployment: other })).rejects.toThrow(/Blocked/);
    expect(t.walletSends()).toBe(0);
  });
  it('sends exactly the reviewed approval and payment on the happy path', async () => {
    const t = await setup();
    await t.run();
    expect(t.sentLog.map((x) => [String(x['to']).toLowerCase(), x['data'], BigInt(String(x['value'])), Number(BigInt(String(x['chainId'])))])).toEqual([
      [TOKEN.toLowerCase(), t.guard.reviewed.approval?.data, 0n, SEPOLIA],
      [ROUTER.toLowerCase(), t.guard.reviewed.payment.data, t.guard.reviewed.payment.value, SEPOLIA],
    ]);
  });
  it('does not pay when the approval receipt exists but the approval itself could not be compared (as Pay)', async () => {
    const t = await setup({ hideApprovalTx: true });
    await expect(t.run()).rejects.toThrow(/could not be compared with the preview/);
    expect(t.walletSends()).toBe(1);
    expect(t.hashes).toHaveLength(1);
  });
  it('refuses the payment when the session changes while the approval is mined', async () => {
    const t = await setup();
    const orig = t.w.request.bind(t.w);
    t.w.request = async (args) => {
      const r = await orig(args);
      if (args.method === 'eth_sendTransaction') clearSession();
      return r;
    };
    await expect(t.run()).rejects.toThrow(/Seller keys changed/);
    expect(t.walletSends()).toBe(1);
    expect(t.hashes).toHaveLength(1);
  });
});
