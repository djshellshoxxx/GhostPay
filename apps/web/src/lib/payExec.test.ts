import { erc2612PermitAbi, erc20MetadataAbi, eip712DomainSeparator } from '@ghostpay/chain-adapters';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionResult } from 'viem/utils';
import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { NOW, USDC_84532, makeParsed } from '../test/invoiceFixtures';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import { mockRpc, type MockRpc } from '../test/mockRpc';
import { createPayContext, reviewInvoice, type BufferQuote, type PayContext } from './pay';
import { PostBroadcastError, buildReceipt, grantApproval, planApproval, preparePayment, revokeApproval, sendPayment, submitTx, type Runtime } from './payExec';
import { clearSession } from './session';
import { SubmissionMismatchError, connectWallet, type WalletInfo, type WalletSession } from './wallet';

afterEach(() => {
  clearSession();
});

const sleep = (): Promise<void> => Promise.resolve();
const noStatus = (): void => undefined;
const winfo = (w: { request: WalletInfo['provider']['request'] }): WalletInfo => ({ id: 'm', name: 'Mock', kind: 'injected', provider: w });

async function setup(patch: Parameters<typeof makeParsed>[0] = {}, wallet = new MockWallet()): Promise<{ ctx: PayContext; session: WalletSession; wallet: MockWallet }> {
  const { parsed } = await makeParsed(patch);
  const ctx = await createPayContext(reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) }), undefined, { nowSeconds: NOW });
  const session = await connectWallet(winfo(wallet), 84532);
  return { ctx, session, wallet };
}

/** An RPC that reports exactly what the wallet "broadcast" (so a mutating wallet is visible to the verifier). */
function chainSeeing(wallet: MockWallet, extra: (m: string, p: readonly unknown[]) => unknown = () => undefined): MockRpc {
  return mockRpc(84532, (method, params) => {
    const x = extra(method, params);
    if (x !== undefined) return x;
    if (method === 'eth_getTransactionByHash') {
      const s = wallet.sent;
      return s === undefined ? null : { hash: params[0], from: s['from'], to: s['to'], input: s['data'], value: s['value'], chainId: '0x14a34' };
    }
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x64', to: wallet.sent?.['to'] };
    throw new Error(`unexpected ${method}`);
  });
}

describe('native payment end to end (mock wallet, mock RPC)', () => {
  it('prepares, passes the gate, sends and verifies on the user RPC', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    const rpc = chainSeeing(wallet);
    const rt: Runtime = { rpc, nowSeconds: () => NOW, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    const res = await sendPayment(session, ctx, built, rt, noStatus);
    expect(res.verification).toBe('verified');
    expect(res.receipt).toEqual({ status: 'success', blockNumber: 100n });
    expect(wallet.sent?.['data']).toBe(built.tx.data);
    expect(wallet.sent?.['to']).toBe(FAKE_ROUTER);
    const receipt = buildReceipt(ctx, built, res, new Date('2026-01-01T00:00:00Z'));
    expect(receipt).toMatchObject({ kind: 'ghostpay-local-receipt', status: 'included', chainId: 84532, gross: '500000000000000000', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(JSON.stringify(receipt)).not.toMatch(/secret|private/i);
  });

  it('refuses when the invoice authority changes during the final wallet recheck', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    let current = true;
    const guardedSession = { ...session, wallet: { ...session.wallet, provider: {
      request: async (args: Parameters<MockWallet['request']>[0]) => {
        const value = await wallet.request(args);
        if (args.method === 'net_version') current = false;
        return value;
      },
    } } };
    const rt: Runtime = { rpc: undefined, nowSeconds: () => NOW };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    await expect(sendPayment(guardedSession, ctx, built, rt, noStatus, () => {
      if (!current) throw new Error('invoice changed during wallet check');
    })).rejects.toThrow('invoice changed during wallet check');
    expect(wallet.sent).toBeUndefined();
  });
  it('rechecks the payment deadline after final wallet network awaits', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    let now = NOW;
    const rt: Runtime = { rpc: undefined, nowSeconds: () => now };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    const guardedSession = { ...session, wallet: { ...session.wallet, provider: {
      request: async (args: Parameters<MockWallet['request']>[0]) => {
        const answer = await wallet.request(args);
        if (args.method === 'net_version') now = Number(built.preview.deadline);
        return answer;
      },
    } } };
    await expect(sendPayment(guardedSession, ctx, built, rt, noStatus)).rejects.toThrow(/expired/);
    expect(wallet.sent).toBeUndefined();
  });
  it('works without an RPC but says it could not verify', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    const rt: Runtime = { rpc: undefined, nowSeconds: () => NOW };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    const msgs: string[] = [];
    const res = await sendPayment(session, ctx, built, rt, (m) => msgs.push(m));
    expect(res.verification).toBe('no-rpc');
    expect(res.receipt).toBeUndefined();
    expect(msgs.join(' ')).toMatch(/could not independently verify/);
    expect(wallet.sent).toBeDefined();
    expect(buildReceipt(ctx, built, res, new Date()).status).toBe('unconfirmed');
  });

  it('REFUSES (reports) a wallet that mutates the transaction before broadcasting', async () => {
    const mutate = (tx: Record<string, unknown>): Record<string, unknown> => ({ ...tx, data: `${String(tx['data']).slice(0, -2)}ff` });
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' }, new MockWallet({ mutateTx: mutate }));
    const rt: Runtime = { rpc: chainSeeing(wallet), nowSeconds: () => NOW, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    const p = sendPayment(session, ctx, built, rt, noStatus);
    await expect(p).rejects.toThrow(PostBroadcastError);
    await expect(p).rejects.toMatchObject({ cause: expect.any(SubmissionMismatchError) as unknown, hash: `0x${'9'.repeat(64)}` });
    await expect(p).rejects.toThrow(/differs from the preview \(call data\)/);
  });

  it('catches a wallet that redirects value or the destination', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' }, new MockWallet({ mutateTx: (tx) => ({ ...tx, value: '0x1' }) }));
    const rt: Runtime = { rpc: chainSeeing(wallet), nowSeconds: () => NOW, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    await expect(sendPayment(session, ctx, built, rt, noStatus)).rejects.toMatchObject({ cause: { field: 'value' } });
    const w2 = new MockWallet({ mutateTx: (tx) => ({ ...tx, to: '0x9999999999999999999999999999999999999999' }) });
    const s2 = await setup({ token: 'native', tokenAmount: '0.5' }, w2);
    const rt2: Runtime = { rpc: chainSeeing(w2), nowSeconds: () => NOW, sleep };
    const b2 = await preparePayment(s2.session, s2.ctx, { usePermit: false }, rt2, noStatus);
    await expect(sendPayment(s2.session, s2.ctx, b2, rt2, noStatus)).rejects.toMatchObject({ cause: { field: 'destination contract' } });
  });

  it('catches a wallet that lies about the chain (the independent RPC sees another chain id)', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    const rpc = mockRpc(84532, (method, params) => {
      if (method === 'eth_getTransactionByHash') return { hash: params[0], from: wallet.sent?.['from'], to: wallet.sent?.['to'], input: wallet.sent?.['data'], value: wallet.sent?.['value'], chainId: '0x1' };
      throw new Error('x');
    });
    const rt: Runtime = { rpc, nowSeconds: () => NOW, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    await expect(sendPayment(session, ctx, built, rt, noStatus)).rejects.toMatchObject({ cause: { field: 'chain' } });
  });

  it('never reaches the wallet when the final gate fails', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    const rt: Runtime = { rpc: undefined, nowSeconds: () => NOW };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    const last = built.tx.data.slice(-1);
    const tampered = { ...built, tx: { ...built.tx, data: `${built.tx.data.slice(0, -1)}${last === '0' ? '1' : '0'}` as `0x${string}` } };
    await expect(sendPayment(session, ctx, tampered, rt, noStatus)).rejects.toThrow();
    expect(wallet.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
  });

  it('refuses to send an expired prepared payment', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    const built = await preparePayment(session, ctx, { usePermit: false }, { rpc: undefined, nowSeconds: () => NOW }, noStatus);
    await expect(sendPayment(session, ctx, built, { rpc: undefined, nowSeconds: () => NOW + 3600 }, noStatus)).rejects.toThrow(/expired/);
    expect(wallet.sent).toBeUndefined();
  });

  it('surfaces a user rejection and sends nothing', async () => {
    const { ctx, session } = await setup({ token: 'native', tokenAmount: '0.5' }, new MockWallet({ rejectSend: true }));
    const rt: Runtime = { rpc: undefined, nowSeconds: () => NOW };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    await expect(sendPayment(session, ctx, built, rt, noStatus)).rejects.toThrow(/rejected the request/);
  });

  it('records a reverted receipt', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    const rpc = chainSeeing(wallet, (m) => (m === 'eth_getTransactionReceipt' ? { status: '0x0', blockNumber: '0x1', to: FAKE_ROUTER } : undefined));
    const rt: Runtime = { rpc, nowSeconds: () => NOW, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    const res = await sendPayment(session, ctx, built, rt, noStatus);
    expect(res.receipt?.status).toBe('reverted');
    expect(buildReceipt(ctx, built, res, new Date()).status).toBe('reverted');
  });
});

describe('ERC-20 flows', () => {
  const OWNER = MOCK_ACCOUNT as `0x${string}`;
  it('plans the exact approval without sending, then grants exactly that amount and verifies it', async () => {
    const { ctx, session, wallet } = await setup();
    let allowance = 0n;
    const rpc = chainSeeing(wallet, (m) => {
      if (m === 'eth_call') {
        return `0x${allowance.toString(16).padStart(64, '0')}`;
      }
      if (m === 'eth_getTransactionByHash') allowance = ctx.request.grossAmount; // the approval "mined"
      return undefined;
    });
    const msgs: string[] = [];
    const rt = { rpc, nowSeconds: () => NOW, sleep };
    const plan = await planApproval(ctx, session, USDC_84532, rt);
    expect(plan).toMatchObject({ need: ctx.request.grossAmount, have: 0n, required: true, spender: FAKE_ROUTER });
    expect(wallet.sent).toBeUndefined();
    const hashes: string[] = [];
    const out = await grantApproval(session, ctx, plan, rt, (m) => msgs.push(m), undefined, (hash) => { hashes.push(hash); });
    expect(out).toBe(ctx.request.grossAmount);
    expect(wallet.sent?.['to']).toBe(USDC_84532);
    expect(msgs.join(' ')).toMatch(/Approve exactly 100 USDC/);
    expect(hashes).toEqual([`0x${'9'.repeat(64)}`]);
  });
  it('skips approval when the allowance already covers the payment', async () => {
    const { ctx, session, wallet } = await setup();
    const rpc = chainSeeing(wallet, () => `0x${(10n ** 12n).toString(16).padStart(64, '0')}`);
    const plan = await planApproval(ctx, session, USDC_84532, { rpc, nowSeconds: () => NOW, sleep });
    expect(plan.required).toBe(false);
    expect(plan.have).toBeGreaterThanOrEqual(plan.need);
    expect(wallet.sent).toBeUndefined();
  });
  it('fails if the approval does not take effect and requires an RPC before planning', async () => {
    const { ctx, session, wallet } = await setup();
    const rpc = chainSeeing(wallet, (m) => (m === 'eth_call' ? `0x${'0'.repeat(64)}` : undefined));
    const rt = { rpc, nowSeconds: () => NOW, sleep };
    const plan = await planApproval(ctx, session, USDC_84532, rt);
    await expect(grantApproval(session, ctx, plan, rt, noStatus)).rejects.toThrow(/did not take effect/);
    await expect(planApproval(ctx, session, USDC_84532, { rpc: undefined, nowSeconds: () => NOW })).rejects.toThrow(/needs an RPC/);
    const w3 = await setup();
    const rpc3 = chainSeeing(w3.wallet, (m) => (m === 'eth_call' ? `0x${'0'.repeat(64)}` : m === 'eth_getTransactionReceipt' ? null : undefined));
    const plan3 = await planApproval(w3.ctx, w3.session, USDC_84532, { rpc: rpc3, nowSeconds: () => NOW, sleep });
    await expect(grantApproval(w3.session, w3.ctx, plan3, { rpc: rpc3, nowSeconds: () => NOW, sleep }, noStatus)).rejects.toThrow(/not confirmed/);
  });
  it('revokes an allowance with approve(0) and verifies the allowance is cleared', async () => {
    const { ctx, session, wallet } = await setup();
    let allowance = ctx.request.grossAmount;
    const rpc = chainSeeing(wallet, (m) => {
      if (m === 'eth_call') return `0x${allowance.toString(16).padStart(64, '0')}`;
      if (m === 'eth_getTransactionByHash') allowance = 0n;
      return undefined;
    });
    const plan = await planApproval(ctx, session, USDC_84532, { rpc, nowSeconds: () => NOW, sleep });
    await revokeApproval(session, ctx, plan, { rpc, nowSeconds: () => NOW, sleep }, noStatus);
    expect(allowance).toBe(0n);
    expect(wallet.sent?.['data']).toContain('0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('permit path: asks the wallet to sign, verifies the signer, builds a permit payment', async () => {
    const account = privateKeyToAccount(`0x${'cd'.repeat(32)}`);
    const wallet = new MockWallet({ account: account.address });
    const signing = winfo({
      request: async (a) => {
        if (a.method === 'eth_signTypedData_v4') {
          const td = JSON.parse((a.params as [string, string])[1]) as { domain: never; types: { Permit: never }; message: Record<string, string> };
          return account.signTypedData({
            domain: td.domain,
            types: { Permit: td.types.Permit },
            primaryType: 'Permit',
            message: { owner: td.message['owner'], spender: td.message['spender'], value: BigInt(td.message['value'] as string), nonce: BigInt(td.message['nonce'] as string), deadline: BigInt(td.message['deadline'] as string) },
          });
        }
        return wallet.request(a);
      },
    });
    const { parsed } = await makeParsed();
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) }), undefined, { nowSeconds: NOW });
    const session = await connectWallet(signing, 84532);
    const rpc = mockRpc(84532, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 0n });
      return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' });
    });
    const built = await preparePayment(session, ctx, { usePermit: true }, { rpc, nowSeconds: () => NOW }, noStatus);
    expect(built.preview.method).toBe('payERC20WithPermit');
    expect(built.preview.permit).toBeDefined();
    void OWNER;
  });

  it('permit path refuses a wallet signature from a different account', async () => {
    const other = privateKeyToAccount(`0x${'ee'.repeat(32)}`);
    const wallet = new MockWallet({ account: '0x5555555555555555555555555555555555555555' });
    const lying = winfo({
      request: async (a) => {
        if (a.method === 'eth_signTypedData_v4') {
          const td = JSON.parse((a.params as [string, string])[1]) as { domain: never; types: { Permit: never }; message: Record<string, string> };
          return other.signTypedData({
            domain: td.domain,
            types: { Permit: td.types.Permit },
            primaryType: 'Permit',
            message: { owner: td.message['owner'], spender: td.message['spender'], value: BigInt(td.message['value'] as string), nonce: BigInt(td.message['nonce'] as string), deadline: BigInt(td.message['deadline'] as string) },
          });
        }
        return wallet.request(a);
      },
    });
    const { parsed } = await makeParsed();
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) }), undefined, { nowSeconds: NOW });
    const session = await connectWallet(lying, 84532);
    const rpc = mockRpc(84532, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 0n });
      return eip712DomainSeparator({ name: 'USDC', version: '1', chainId: 84532, verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' });
    });
    await expect(preparePayment(session, ctx, { usePermit: true }, { rpc, nowSeconds: () => NOW }, noStatus)).rejects.toThrow(/does not match your account/);
  });

  it('permit needs an RPC and cannot be combined with a buffer; native ignores permit', async () => {
    const { ctx, session } = await setup();
    await expect(preparePayment(session, ctx, { usePermit: true }, { rpc: undefined, nowSeconds: () => NOW }, noStatus)).rejects.toThrow(/needs an RPC/);
    const q: BufferQuote = { bufferWei: 1n, maxFeePerGas: 1n, gasLimit: 1n, safetyBps: 1n, quotedAt: NOW, expiresAt: NOW + 100 };
    await expect(preparePayment(session, ctx, { usePermit: true, buffer: q }, { rpc: undefined, nowSeconds: () => NOW }, noStatus)).rejects.toThrow(/cannot be combined/);
    const b = await preparePayment(session, ctx, { usePermit: false, buffer: q }, { rpc: undefined, nowSeconds: () => NOW }, noStatus);
    expect(b.preview.method).toBe('payERC20WithBuffer');
    const n = await setup({ token: 'native', tokenAmount: '0.5' });
    const nb = await preparePayment(n.session, n.ctx, { usePermit: true }, { rpc: undefined, nowSeconds: () => NOW }, noStatus);
    expect(nb.preview.method).toBe('payNative');
  });
});

describe('submitTx', () => {
  it('reports unverifiable transactions as not-visible-yet', async () => {
    const { session } = await setup();
    const rpc = mockRpc(84532, (m) => (m === 'eth_getTransactionByHash' ? null : m === 'eth_getTransactionReceipt' ? null : undefined));
    const res = await submitTx(session, { to: FAKE_ROUTER, data: '0x', value: 0n }, { rpc, nowSeconds: () => NOW, sleep }, noStatus);
    expect(res.verification).toBe('not-visible-yet');
    expect(res.receipt).toBeUndefined();
  });
});
