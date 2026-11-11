import { ChainAdapterError, FEE_SCHEDULE, createClient, erc20Abi, findChain, type Address, type ChainConfig } from '@ghostpay/chain-adapters';
import { encodeFunctionData } from 'viem/utils';
import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_ROUTER, FAKE_SWEEP_RELAYER, fakeManifest } from '../test/fakeManifest';
import { NOW, makeParsed } from '../test/invoiceFixtures';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { createPayContext, reviewInvoice, buildFinal } from './pay';
import { sendPayment, type Runtime } from './payExec';
import { clearSession } from './session';
import { DIRECT_MAX_FEE_SHARE_BPS, guardApprove, guardRouterPayment, guardTx, guardTypedData, reviewPolicy, simulateCall } from './txGuard';
import { connectWallet, type WalletInfo } from './wallet';

afterEach(() => {
  clearSession();
});

const manifest = fakeManifest(84532);
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const EVIL = '0x00000000000000000000000000000000deadbeef' as Address;
const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address;
const approve = (token: Address, spender: Address, amount: bigint) => ({
  to: token,
  data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }),
  value: 0n,
});

describe('reviewPolicy', () => {
  it('is built from the manifest and the compiled allowlist only', () => {
    const p = reviewPolicy(manifest, 84532);
    expect(p.contracts).toEqual({ router: manifest.router, sweepRelayer: manifest.sweepRelayer, announcer: manifest.announcer });
    expect(p.feeRecipient).toBe(manifest.feeRecipient);
    expect(p.feeCaps.maxFeeShareBps).toBe(Number(FEE_SCHEDULE.SPONSOR_CAP_BPS));
    expect([...(p.tokens.get(84532) ?? [])].map((t) => t.toLowerCase())).toContain(USDC.toLowerCase());
    expect(reviewPolicy(manifest, 84532, { maxFeeShareBps: DIRECT_MAX_FEE_SHARE_BPS, feeRecipient: ACCOUNT }).feeRecipient).toBe(ACCOUNT);
  });
});

describe('approval review (S3-19)', () => {
  const ok = { token: USDC, spender: manifest.router, amount: 1_000n };
  it('accepts exactly the payment gross to the manifest router', () => {
    expect(() => guardApprove(approve(USDC, manifest.router, 1_000n), 84532, ok, manifest, NOW)).not.toThrow();
  });
  it('refuses an approval above the gross, to another spender, or on a token off the allowlist', () => {
    expect(() => guardApprove(approve(USDC, manifest.router, 2_000n), 84532, { ...ok, amount: 2_000n }, manifest, NOW)).not.toThrow(); // reviewed amount is the gross itself
    expect(() => guardApprove(approve(USDC, manifest.router, 2_000n), 84532, ok, manifest, NOW)).toThrow(/MISMATCH_AMOUNT/);
    expect(() => guardApprove(approve(USDC, manifest.router, (1n << 256n) - 1n), 84532, ok, manifest, NOW)).toThrow(/MISMATCH_AMOUNT/);
    expect(() => guardApprove(approve(USDC, EVIL, 1_000n), 84532, ok, manifest, NOW)).toThrow(/SPENDER_NOT_ROUTER/);
    expect(() => guardApprove(approve(EVIL, manifest.router, 1_000n), 84532, { ...ok, token: EVIL }, manifest, NOW)).toThrow(/TOKEN_NOT_ALLOWLISTED/);
  });
  it('refuses calldata that is not an approval at all', () => {
    expect(() => guardTx({ chainId: 84532, to: USDC, data: '0xdeadbeef', value: 0n }, { kind: 'erc20_approve', chainId: 84532, token: USDC, spender: manifest.router, amount: 1n }, reviewPolicy(manifest, 84532), NOW)).toThrow(/UNKNOWN_SELECTOR/);
    expect(() => guardTypedData({ domain: {}, types: {}, primaryType: 'Mail', message: {} }, { kind: 'erc20_approve', chainId: 84532, token: USDC, spender: manifest.router, amount: 1n }, reviewPolicy(manifest, 84532), NOW)).toThrow(/UNKNOWN_TYPED_DATA/);
  });
  it('reports a malformed policy as a safe refusal, not a crash', () => {
    const bad = { ...reviewPolicy(manifest, 84532), maxDeadlineSeconds: 0 };
    expect(() => guardTx({ chainId: 84532, to: USDC, data: '0x', value: 1n }, { kind: 'erc20_approve', chainId: 84532, token: USDC, spender: manifest.router, amount: 1n }, bad, NOW)).toThrow(/could not run/);
  });
});

describe('simulateCall', () => {
  const call = { from: ACCOUNT, to: USDC, data: '0x' as const, value: 5n };
  it('passes, reports unavailable, and refuses reverts', async () => {
    expect(await simulateCall(mockRpc(84532, () => '0x'), call)).toBe('ok');
    expect(await simulateCall(mockRpc(84532, () => { throw new Error('method eth_call not supported'); }), call)).toBe('unavailable');
    expect(await simulateCall(mockRpc(84532, () => 42), call)).toBe('unavailable');
    expect(await simulateCall(mockRpc(84532, () => '0x'), call, true)).toBe('ok'); // non-standard token returning nothing
    await expect(simulateCall(mockRpc(84532, () => { throw new Error('execution reverted: ERC20: transfer amount exceeds balance'); }), call)).rejects.toThrow(/would revert/);
    await expect(simulateCall(mockRpc(84532, () => `0x${'0'.repeat(64)}`), call, true)).rejects.toThrow(/returned false/);
  });

  describe('L2-F1: through the verified RPC client, which drops the node text and keeps only a revert flag', () => {
    /** A node-like JSON-RPC endpoint behind the production client; `error` answers every call but eth_chainId. */
    const nodeClient = (error: unknown, seen: unknown[] = []) =>
      createClient(findChain(84532) as ChainConfig, 'https://rpc.test', {
        retries: 0,
        transport: {
          send: (_u, body) => {
            const req = JSON.parse(body) as { id: number; method: string; params: unknown[] };
            if (req.method === 'eth_chainId') return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: '0x14a34' }));
            seen.push(req.params);
            return Promise.resolve(JSON.stringify(error === undefined ? { jsonrpc: '2.0', id: req.id, result: '0x' } : { jsonrpc: '2.0', id: req.id, error }));
          },
        },
      });
    it.each([
      ['code 3 with revert data', { code: 3, message: 'execution reverted: ERC20: transfer amount exceeds balance', data: '0x08c379a0' }],
      ['-32000 without revert data', { code: -32000, message: 'execution reverted' }],
      // B-R2: with the signed gas limit in the dry run, these are the signed transaction failing too.
      ['-32000 out of gas', { code: -32000, message: 'out of gas' }],
      ['-32000 invalid opcode', { code: -32000, message: 'invalid opcode: INVALID' }],
      // B-R8: reth and op-reth answer a halted call with -32003; Nethermind names a bad opcode "invalid instruction".
      ['-32003 out of gas (reth, op-reth)', { code: -32003, message: 'out of gas: gas required exceeds: 21000' }],
      ['-32003 EVM halt (reth, op-reth)', { code: -32003, message: 'EVM error: OpcodeNotFound' }],
      ['-32015 invalid instruction (nethermind)', { code: -32015, message: 'VM execution error.', data: 'invalid instruction' }],
    ])('refuses a node revert (%s)', async (_n, error) => {
      await expect(simulateCall(await nodeClient(error), { ...call, gas: 21_000n })).rejects.toThrow(/would revert/);
    });
    it('B-R8: a -32003 rejection before execution (reth: insufficient funds) is reported unavailable, not refused', async () => {
      const error = { code: -32003, message: 'insufficient funds for gas * price + value: have 0 want 21005' };
      expect(await simulateCall(await nodeClient(error), { ...call, gas: 21_000n })).toBe('unavailable');
    });
    it('a node that cannot run the call is reported unavailable, not refused', async () => {
      expect(await simulateCall(await nodeClient({ code: -32601, message: 'the method eth_call does not exist' }), call)).toBe('unavailable');
      expect(await simulateCall(await nodeClient({ code: -32000, message: 'header not found' }), call)).toBe('unavailable');
    });
    it('only the flag of a verified-client error counts; its fixed text is never matched', async () => {
      const rpc = mockRpc(84532, () => { throw new ChainAdapterError('RPC_FAILURE', 'json-rpc error 3', { reverted: true }); });
      await expect(simulateCall(rpc, call)).rejects.toThrow(/would revert/);
      expect(await simulateCall(mockRpc(84532, () => { throw new ChainAdapterError('RPC_FAILURE', 'json-rpc error 3'); }), call)).toBe('unavailable');
    });
    it('passes the gas limit to the dry run when one is given', async () => {
      const seen: unknown[] = [];
      expect(await simulateCall(await nodeClient(undefined, seen), { ...call, gas: 21_000n })).toBe('ok');
      expect(await simulateCall(await nodeClient(undefined, seen), call)).toBe('ok');
      expect(seen).toEqual([
        [{ from: ACCOUNT, to: USDC, data: '0x', value: '0x5', gas: '0x5208' }, 'latest'],
        [{ from: ACCOUNT, to: USDC, data: '0x', value: '0x5' }, 'latest'],
      ]);
    });
  });
});

describe('router payment review before the wallet prompt', () => {
  const winfo = (w: MockWallet): WalletInfo => ({ id: 'm', name: 'Mock', kind: 'injected', provider: w });
  async function setup() {
    const { parsed } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, { status: 'loaded', manifest }), undefined, { nowSeconds: NOW });
    const wallet = new MockWallet();
    const session = await connectWallet(winfo(wallet), 84532);
    return { ctx, session, wallet };
  }

  it('refuses a deadline beyond the policy window and never reaches the wallet', async () => {
    const { ctx, session, wallet } = await setup();
    const built = buildFinal(ctx, { nowSeconds: NOW, deadlineSeconds: NOW + 4_000 });
    const rt: Runtime = { rpc: undefined, nowSeconds: () => NOW };
    await expect(sendPayment(session, ctx, built, rt, () => undefined)).rejects.toThrow(/DEADLINE_BEYOND_POLICY/);
    expect(wallet.sent).toBeUndefined();
  });

  it('dry-runs the payment on the user RPC and stops on a revert', async () => {
    const { ctx, session, wallet } = await setup();
    const built = buildFinal(ctx, { nowSeconds: NOW });
    const rpc = mockRpc(84532, (m) => {
      if (m === 'eth_call') throw new Error('execution reverted');
      throw new Error(`unexpected ${m}`);
    });
    await expect(sendPayment(session, ctx, built, { rpc, nowSeconds: () => NOW }, () => undefined)).rejects.toThrow(/would revert/);
    expect(wallet.sent).toBeUndefined();
  });

  it('refuses calldata whose bytes differ from the preview, and a router the manifest does not name', async () => {
    const { ctx } = await setup();
    const built = buildFinal(ctx, { nowSeconds: NOW });
    const tampered = { ...built.tx, data: `${built.tx.data.slice(0, -2)}ff` as `0x${string}` };
    expect(() => guardRouterPayment(tampered, built.preview, manifest, NOW)).toThrow(/MISMATCH|MALFORMED|NON_CANONICAL|INVALID_PAYMENT/);
    const other = fakeManifest(84532);
    expect(() => guardRouterPayment(built.tx, built.preview, { ...other, router: FAKE_SWEEP_RELAYER }, NOW)).toThrow(/UNKNOWN_TO/);
    expect(guardRouterPayment(built.tx, built.preview, manifest, NOW)).toBe('reviewed');
    expect(guardRouterPayment(built.tx, { ...built.preview, method: 'payERC20WithBuffer' }, manifest, NOW)).toBe('skipped-buffer');
    void FAKE_ROUTER;
  });
});
