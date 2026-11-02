import { erc20Abi } from '@ghostpay/chain-adapters';
import { ghostPayPolicyRouterAbi, type Hex } from '@ghostpay/policy-scheme';
import { decodeFunctionData, encodeAbiParameters } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { PostBroadcastError } from '../../lib/payExec';
import { connectWallet } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { DEPLOYMENT, ROUTER, SEPOLIA, account, fakeChain, walletMirror } from './fixtures.testutil';
import { preparePolicyPayment } from './pay';
import { sendPolicyPayment } from './send';

const a1 = account('acct-001');
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const GROSS = 5_000n;
const word = (n: bigint): Hex => encodeAbiParameters([{ type: 'uint256' }], [n]);
const fn = (data: unknown, abi: typeof erc20Abi | typeof ghostPayPolicyRouterAbi): string => decodeFunctionData({ abi, data: data as Hex }).functionName;

async function setup(opts: { allowanceBefore?: bigint; allowanceAfter?: bigint | 'throw'; approvalStatus?: '0x1' | '0x0'; token?: string; noRpc?: boolean } = {}) {
  const w = new MockWallet({ chainId: SEPOLIA });
  const session = await connectWallet({ id: 'mock', name: 'Mock', kind: 'eip6963', provider: w }, SEPOLIA);
  const sentLog: Record<string, unknown>[] = [];
  const mirror = walletMirror(w, (to) => (to.toLowerCase() === TOKEN.toLowerCase() ? (opts.approvalStatus ?? '0x1') : '0x1'));
  const rpc = fakeChain(SEPOLIA, {
    extra: (method, params) => {
      if (method === 'eth_call') {
        const c = params[0] as { to: string };
        if (c.to.toLowerCase() !== TOKEN.toLowerCase()) return undefined;
        const approved = sentLog.some((t) => String(t['to']).toLowerCase() === TOKEN.toLowerCase());
        if (!approved) return word(opts.allowanceBefore ?? 0n);
        if (opts.allowanceAfter === 'throw') throw new Error('rpc down');
        return word(opts.allowanceAfter ?? GROSS);
      }
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
  const run = () => sendPolicyPayment(session, prepared, { rpc: opts.noRpc === true ? undefined : rpc, nowSeconds: () => 1, sleep: () => Promise.resolve() }, (m) => status.push(m), (h) => hashes.push(h));
  return { w, sentLog, run, hashes, status };
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
