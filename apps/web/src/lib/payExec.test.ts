import { PERMIT_STATES, chainlinkAggregatorAbi, erc2612PermitAbi, erc20MetadataAbi, eip712DomainSeparator, type FeedConfig } from '@ghostpay/chain-adapters';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionResult } from 'viem/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATTEMPT_JOURNAL_KEY } from './duplicateAttemptJournal';
import { FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { NOW, USDC_84532, makeParsed } from '../test/invoiceFixtures';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import { mockRpc, type MockRpc } from '../test/mockRpc';
import { createPayContext, permitStateMessage, reviewInvoice, type BufferQuote, type PayContext } from './pay';
import { PermitRejectedError, PostBroadcastError, buildReceipt, classifyPayerPermit, grantApproval, planApproval, preparePayment, revokeApproval, sendPayment, submitTx, type Runtime } from './payExec';
import { clearSession } from './session';
import { userMessage } from './errors';
import { SubmissionMismatchError, connectWallet, type WalletInfo, type WalletSession } from './wallet';

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

/** In-memory attempt journal so a test can prove that no wallet attempt was reserved. */
function stubAttemptJournal(): Map<string, string> {
  const mem = new Map<string, string>();
  vi.stubGlobal('window', {
    sessionStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } },
    dispatchEvent: () => true,
  });
  return mem;
}

/** A session whose provider runs `hook` after each wallet answer (models time passing during a wallet await). */
function delayedSession(session: WalletSession, wallet: MockWallet, hook: (method: string) => void): WalletSession {
  return { ...session, wallet: { ...session.wallet, provider: {
    request: async (args: Parameters<MockWallet['request']>[0]) => {
      const answer = await wallet.request(args);
      hook(args.method);
      return answer;
    },
  } } };
}

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

describe('gas buffer re-check before the wallet is asked (spec 13)', () => {
  const quote = (gasLimit: bigint, gweiPrice: bigint): BufferQuote => ({
    bufferWei: gasLimit * gweiPrice * 2_000_000_000n * 12n / 10n, maxFeePerGas: gweiPrice * 2_000_000_000n, gasLimit, safetyBps: 2000n,
    quotedAt: NOW, expiresAt: NOW + 60, gasSource: 'simulated',
  });
  it('blocks the send without contacting the wallet when gas rose above the prepared buffer', async () => {
    const { ctx, session, wallet } = await setup();
    const rpc = chainSeeing(wallet, (m) => (m === 'eth_gasPrice' ? `0x${(3n * 10n ** 9n).toString(16)}` : undefined));
    const rt: Runtime = { rpc, nowSeconds: () => NOW, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false, buffer: quote(100_000n, 1n) }, rt, noStatus);
    await expect(sendPayment(session, ctx, built, rt, noStatus)).rejects.toThrow(/Gas prices rose/);
    expect(wallet.sent).toBeUndefined();
    expect(rpc.calls.some((c) => c.method === 'eth_call')).toBe(false);
  });
  it('refuses a buffered payment with no RPC to re-check gas', async () => {
    const { ctx, session, wallet } = await setup();
    const rt: Runtime = { rpc: undefined, nowSeconds: () => NOW };
    const built = await preparePayment(session, ctx, { usePermit: false, buffer: quote(100_000n, 1n) }, rt, noStatus);
    await expect(sendPayment(session, ctx, built, rt, noStatus)).rejects.toThrow(/needs an RPC/);
    expect(wallet.sent).toBeUndefined();
  });
});

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

  it.each([
    ['grant', 'transport'], ['grant', 'wrong-allowance'],
    ['revoke', 'transport'], ['revoke', 'wrong-allowance'],
  ] as const)('%s retains its submitted hash after %s readback failure', async (action, failure) => {
    const { ctx, session, wallet } = await setup();
    const rpc = chainSeeing(wallet, (method) => {
      if (method !== 'eth_call') return undefined;
      if (failure === 'transport') throw new Error('secret RPC URL https://credential.invalid');
      const after = action === 'grant' ? 0n : ctx.request.grossAmount;
      return `0x${after.toString(16).padStart(64, '0')}`;
    });
    const plan: Parameters<typeof grantApproval>[2] = { token: USDC_84532, spender: FAKE_ROUTER, need: ctx.request.grossAmount, have: 0n, required: true };
    const hashes: string[] = [];
    const operation = action === 'grant' ? grantApproval : revokeApproval;
    const error: unknown = await operation(session, ctx, plan, { rpc, nowSeconds: () => NOW, sleep }, noStatus, undefined, (hash) => { hashes.push(hash); }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PostBroadcastError);
    expect(error).toMatchObject({ hash: `0x${'9'.repeat(64)}` });
    expect(hashes).toEqual([`0x${'9'.repeat(64)}`]);
    expect(userMessage(error)).toMatch(/already sent/);
    expect(userMessage(error)).not.toMatch(/Nothing was sent|secret|credential/);
    expect(wallet.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(1);
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
      if (data.startsWith('0xdd62ed3e')) return `0x${'0'.repeat(64)}`; // allowance(owner, router) = 0
      if (data.startsWith('0xd505accf')) return '0x'; // static permit(...) succeeds
      return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' });
    });
    const built = await preparePayment(session, ctx, { usePermit: true }, { rpc, nowSeconds: () => NOW }, noStatus);
    expect(built.preview.method).toBe('payERC20WithPermit');
    expect(built.preview.permit).toBeDefined();
    void OWNER;
  });

  describe('classifyPayerPermit (spec 04 pre-flight)', () => {
    const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
    const permitRpc = (o: { allowance?: bigint; separator?: () => string } = {}) => mockRpc(84532, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0xdd62ed3e')) return `0x${(o.allowance ?? 0n).toString(16).padStart(64, '0')}`;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 0n });
      return o.separator?.() ?? eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC });
    });
    it('classifies ok / already allowed / unsupported without any wallet prompt', async () => {
      const { ctx, session, wallet } = await setup();
      const rt = (rpc: MockRpc): Runtime => ({ rpc, nowSeconds: () => NOW });
      expect(await classifyPayerPermit(ctx, session, rt(permitRpc()))).toBe('ok_to_permit');
      expect(await classifyPayerPermit(ctx, session, rt(permitRpc({ allowance: ctx.request.grossAmount })))).toBe('already_allowed');
      expect(await classifyPayerPermit(ctx, session, rt(permitRpc({ allowance: ctx.request.grossAmount - 1n })))).toBe('ok_to_permit');
      // DAI-style / non-standard domain: neither version 2 nor 1 matches the on-chain separator.
      expect(await classifyPayerPermit(ctx, session, rt(permitRpc({ separator: () => `0x${'ab'.repeat(32)}` })))).toBe('unsupported_token');
      expect(await classifyPayerPermit(ctx, session, rt(permitRpc({ separator: () => { throw new Error('execution reverted'); } })))).toBe('unsupported_token');
      expect(wallet.calls.some((c) => c.method === 'eth_signTypedData_v4' || c.method === 'eth_sendTransaction')).toBe(false);
    });
    it('needs an RPC, and propagates a malformed allowance read instead of guessing', async () => {
      const { ctx, session } = await setup();
      await expect(classifyPayerPermit(ctx, session, { rpc: undefined, nowSeconds: () => NOW })).rejects.toThrow(/needs an RPC/);
      const bad = mockRpc(84532, () => '0x01');
      await expect(classifyPayerPermit(ctx, session, { rpc: bad, nowSeconds: () => NOW })).rejects.toThrow(/unexpected allowance/);
    });
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
      if (data.startsWith('0xdd62ed3e')) return `0x${'0'.repeat(64)}`; // allowance(owner, router) = 0
      if (data.startsWith('0xd505accf')) return '0x'; // static permit(...) succeeds
      return eip712DomainSeparator({ name: 'USDC', version: '1', chainId: 84532, verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' });
    });
    await expect(preparePayment(session, ctx, { usePermit: true }, { rpc, nowSeconds: () => NOW }, noStatus)).rejects.toThrow(/does not match your account/);
  });

  it('permit needs an RPC and cannot be combined with a buffer; native ignores permit', async () => {
    const { ctx, session } = await setup();
    await expect(preparePayment(session, ctx, { usePermit: true }, { rpc: undefined, nowSeconds: () => NOW }, noStatus)).rejects.toThrow(/needs an RPC/);
    const q: BufferQuote = { bufferWei: 1n, maxFeePerGas: 1n, gasLimit: 1n, safetyBps: 1n, quotedAt: NOW, expiresAt: NOW + 100, gasSource: 'default' };
    await expect(preparePayment(session, ctx, { usePermit: true, buffer: q }, { rpc: undefined, nowSeconds: () => NOW }, noStatus)).rejects.toThrow(/cannot be combined/);
    const b = await preparePayment(session, ctx, { usePermit: false, buffer: q }, { rpc: undefined, nowSeconds: () => NOW }, noStatus);
    expect(b.preview.method).toBe('payERC20WithBuffer');
    const n = await setup({ token: 'native', tokenAmount: '0.5' });
    const nb = await preparePayment(n.session, n.ctx, { usePermit: true }, { rpc: undefined, nowSeconds: () => NOW }, noStatus);
    expect(nb.preview.method).toBe('payNative');
  });
});

describe('permit post-sign pre-flight and fallback ladder (spec 04)', () => {
  const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
  const account = privateKeyToAccount(`0x${'cd'.repeat(32)}`);
  const word = (v: bigint): string => `0x${v.toString(16).padStart(64, '0')}`;

  interface TokenState { allowance: bigint; nonce: bigint; permitReverts?: boolean; onSign?: () => void }

  async function permitSetup(state: TokenState): Promise<{ ctx: PayContext; session: WalletSession; rpc: MockRpc; signs: () => number; wallet: MockWallet }> {
    const wallet = new MockWallet({ account: account.address });
    let signs = 0;
    const signing = winfo({
      request: async (a) => {
        if (a.method === 'eth_signTypedData_v4') {
          signs += 1;
          const td = JSON.parse((a.params as [string, string])[1]) as { domain: never; types: { Permit: never }; message: Record<string, string> };
          const sig = await account.signTypedData({
            domain: td.domain,
            types: { Permit: td.types.Permit },
            primaryType: 'Permit',
            message: { owner: td.message['owner'], spender: td.message['spender'], value: BigInt(td.message['value'] as string), nonce: BigInt(td.message['nonce'] as string), deadline: BigInt(td.message['deadline'] as string) },
          });
          state.onSign?.();
          return sig;
        }
        return wallet.request(a);
      },
    });
    const { parsed } = await makeParsed();
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) }), undefined, { nowSeconds: NOW });
    const session = await connectWallet(signing, 84532);
    const rpc = mockRpc(84532, (method, params) => {
      if (method !== 'eth_call') throw new Error(`unexpected ${method}`);
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: state.nonce });
      if (data.startsWith('0xdd62ed3e')) return word(state.allowance);
      if (data.startsWith('0x3644e515')) return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC });
      if (data.startsWith('0xd505accf')) {
        if (state.permitReverts === true) throw new Error('execution reverted');
        return '0x';
      }
      throw new Error('unexpected call');
    });
    return { ctx, session, rpc, signs: () => signs, wallet };
  }

  it('gives every PermitState its own user-facing message', () => {
    const texts = PERMIT_STATES.map((s) => permitStateMessage(s));
    expect(texts.every((t) => t.length > 20)).toBe(true);
    expect(new Set(texts).size).toBe(PERMIT_STATES.length);
  });

  it('front-run permit after signing (nonce spent, allowance set) falls back to the allowance path', async () => {
    const state: TokenState = { allowance: 0n, nonce: 0n };
    state.onSign = () => { state.nonce = 1n; state.allowance = 10n ** 12n; };
    const t = await permitSetup(state);
    const msgs: string[] = [];
    const built = await preparePayment(t.session, t.ctx, { usePermit: true }, { rpc: t.rpc, nowSeconds: () => NOW }, (m) => msgs.push(m));
    expect(built.preview.method).toBe('payERC20');
    expect(built.preview.permit).toBeUndefined();
    expect(t.signs()).toBe(1);
    expect(msgs.join(' ')).toMatch(/allowance already covers/);
  });

  it('a valid permit is simulated with a static permit call before it is used', async () => {
    const t = await permitSetup({ allowance: 0n, nonce: 0n });
    const built = await preparePayment(t.session, t.ctx, { usePermit: true }, { rpc: t.rpc, nowSeconds: () => NOW }, noStatus);
    expect(built.preview.method).toBe('payERC20WithPermit');
    expect(t.rpc.calls.some((c) => ((c.params[0] as { data?: string }).data ?? '').startsWith('0xd505accf'))).toBe(true);
  });

  it.each([
    ['sig_invalid', { permitReverts: true, bump: false }],
    ['nonce_consumed', { permitReverts: false, bump: true }],
  ] as const)('%s after signing: PermitRejectedError, nothing sent, no re-prompt', async (stateName, s) => {
    const state: TokenState = { allowance: 0n, nonce: 0n, permitReverts: s.permitReverts };
    if (s.bump) state.onSign = () => { state.nonce = 1n; };
    const t = await permitSetup(state);
    const err: unknown = await preparePayment(t.session, t.ctx, { usePermit: true }, { rpc: t.rpc, nowSeconds: () => NOW }, noStatus).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermitRejectedError);
    expect((err as PermitRejectedError).state).toBe(stateName);
    expect(userMessage(err)).toBe(permitStateMessage(stateName));
    expect(t.signs()).toBe(1);
    expect(t.wallet.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
  });

  it('expired: a permit whose deadline passed while the wallet was open is refused', async () => {
    const t = await permitSetup({ allowance: 0n, nonce: 0n });
    let now = NOW;
    const err: unknown = await preparePayment(t.session, t.ctx, { usePermit: true }, { rpc: t.rpc, nowSeconds: () => { const n = now; now += 20 * 60; return n; } }, noStatus).catch((e: unknown) => e);
    expect((err as PermitRejectedError).state).toBe('expired');
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

describe('final payment guard rechecks invoice and fiat quote validity (P1)', () => {
  const FEED: FeedConfig = { chainId: 84532, address: '0x7777777777777777777777777777777777777777', base: 'USDC', quote: 'USD', sourceRef: 'test fixture' };
  const feedRpc = (): MockRpc => mockRpc(84532, (_m, params) => {
    const data = (params[0] as { data: string }).data;
    if (data.startsWith('0x313ce567')) return encodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName: 'decimals', result: 8 });
    return encodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName: 'latestRoundData', result: [1n, 100_000_000n, BigInt(NOW), BigInt(NOW), 1n] });
  });
  async function fiatSetup(): Promise<{ ctx: PayContext; session: WalletSession; wallet: MockWallet }> {
    const { parsed } = await makeParsed({ amountMode: 'fiat_quote' });
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) }), feedRpc(), { nowSeconds: NOW, findFeedFn: () => FEED });
    const wallet = new MockWallet();
    const session = await connectWallet(winfo(wallet), 84532);
    return { ctx, session, wallet };
  }
  const sends = (w: MockWallet): number => w.calls.filter((c) => c.method === 'eth_sendTransaction').length;

  it('rejects an invoice that expired after prepare, before eth_sendTransaction and without reserving an attempt', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    const expiresAt = ctx.review.invoice.expiresAt;
    let now = expiresAt - 60;
    const rt: Runtime = { rpc: undefined, nowSeconds: () => now };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    now = expiresAt;
    const journal = stubAttemptJournal();
    await expect(sendPayment(session, ctx, built, rt, noStatus)).rejects.toThrow(/invoice has expired/);
    expect(sends(wallet)).toBe(0);
    expect(wallet.sent).toBeUndefined();
    expect(journal.get(ATTEMPT_JOURNAL_KEY)).toBeUndefined();
  });

  it('rejects when the invoice expires during the final wallet net_version await', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    const expiresAt = ctx.review.invoice.expiresAt;
    let now = expiresAt - 60;
    const rt: Runtime = { rpc: undefined, nowSeconds: () => now };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    const journal = stubAttemptJournal();
    const s = delayedSession(session, wallet, (m) => { if (m === 'net_version') now = expiresAt; });
    await expect(sendPayment(s, ctx, built, rt, noStatus)).rejects.toThrow(/invoice has expired/);
    expect(wallet.sent).toBeUndefined();
    expect(journal.get(ATTEMPT_JOURNAL_KEY)).toBeUndefined();
  });

  it('fiat mode: rejects once the seller quote expired, also when it expires during net_version', async () => {
    const { ctx, session, wallet } = await fiatSetup();
    const quoteExpiry = ctx.review.invoice.quote.expiresAt;
    let now = NOW;
    const rt: Runtime = { rpc: undefined, nowSeconds: () => now };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    now = quoteExpiry;
    await expect(sendPayment(session, ctx, built, rt, noStatus)).rejects.toThrow(/quote has expired/);
    // quoteExpiry - 1 is the deadline second itself (rejected one second early by the app), so probe one second before.
    now = quoteExpiry - 2;
    const s = delayedSession(session, wallet, (m) => { if (m === 'net_version') now = quoteExpiry; });
    await expect(sendPayment(s, ctx, built, rt, noStatus)).rejects.toThrow(/quote has expired/);
    expect(sends(wallet)).toBe(0);
    // The router and ERC-2612 accept a tx mined AT the deadline second, while the app treats expiresAt as expired.
    expect(built.preview.deadline).toBeLessThan(BigInt(quoteExpiry));
  });

  it('fixed-token invoice with an old quote stays payable', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    let now = NOW;
    const rt: Runtime = { rpc: undefined, nowSeconds: () => now };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    now = ctx.review.invoice.quote.expiresAt + 1;
    expect(BigInt(now)).toBeLessThan(built.preview.deadline);
    await expect(sendPayment(session, ctx, built, rt, noStatus)).resolves.toMatchObject({ hash: `0x${'9'.repeat(64)}` });
    expect(sends(wallet)).toBe(1);
  });

  it('expiry after the irreversible wallet request keeps the returned hash', async () => {
    const { ctx, session, wallet } = await setup({ token: 'native', tokenAmount: '0.5' });
    const expiresAt = ctx.review.invoice.expiresAt;
    let now = expiresAt - 60;
    const rt: Runtime = { rpc: undefined, nowSeconds: () => now };
    const built = await preparePayment(session, ctx, { usePermit: false }, rt, noStatus);
    const s = delayedSession(session, wallet, (m) => { if (m === 'eth_sendTransaction') now = expiresAt + 3600; });
    await expect(sendPayment(s, ctx, built, rt, noStatus)).resolves.toMatchObject({ hash: `0x${'9'.repeat(64)}` });
  });

  it('permit: one deadline bounded by invoice validity in typed data and calldata; a late signature is refused', async () => {
    const account = privateKeyToAccount(`0x${'cd'.repeat(32)}`);
    const wallet = new MockWallet({ account: account.address });
    const signed: bigint[] = [];
    let onSign = (): void => undefined;
    const signing = winfo({
      request: async (a) => {
        if (a.method !== 'eth_signTypedData_v4') return wallet.request(a);
        const td = JSON.parse((a.params as [string, string])[1]) as { domain: never; types: { Permit: never }; message: Record<string, string> };
        const message = { owner: td.message['owner'], spender: td.message['spender'], value: BigInt(td.message['value'] as string), nonce: BigInt(td.message['nonce'] as string), deadline: BigInt(td.message['deadline'] as string) };
        signed.push(message.deadline);
        const sig = await account.signTypedData({ domain: td.domain, types: { Permit: td.types.Permit }, primaryType: 'Permit', message });
        onSign();
        return sig;
      },
    });
    const { parsed } = await makeParsed();
    const ctx = await createPayContext(reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) }), undefined, { nowSeconds: NOW });
    const session = await connectWallet(signing, 84532);
    const rpc = mockRpc(84532, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 0n });
      if (data.startsWith('0xdd62ed3e')) return `0x${'0'.repeat(64)}`;
      if (data.startsWith('0xd505accf')) return '0x';
      return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' });
    });
    const expiresAt = parsed.invoice.expiresAt;
    let now = expiresAt - 60;
    const rt: Runtime = { rpc, nowSeconds: () => now };
    const built = await preparePayment(session, ctx, { usePermit: true }, rt, noStatus);
    expect(built.preview.method).toBe('payERC20WithPermit');
    expect(signed[0]).toBe(built.preview.deadline);
    expect(built.preview.deadline).toBeLessThanOrEqual(BigInt(expiresAt));
    onSign = () => { now = expiresAt; };
    now = expiresAt - 60;
    await expect(preparePayment(session, ctx, { usePermit: true }, rt, noStatus)).rejects.toThrow(/invoice has expired/);
    expect(wallet.calls.some((c) => c.method === 'eth_sendTransaction')).toBe(false);
  });
});

describe('prepared gas buffer quote freshness at send (P2)', () => {
  const quote: BufferQuote = {
    bufferWei: 100_000n * 2_000_000_000n * 12n / 10n, maxFeePerGas: 2_000_000_000n, gasLimit: 100_000n, safetyBps: 2000n,
    quotedAt: NOW, expiresAt: NOW + 60, gasSource: 'simulated',
  };
  let allowance = 0n;
  const rpcFor = (wallet: MockWallet, onGas: () => void = () => undefined): MockRpc => chainSeeing(wallet, (m) => {
    if (m === 'eth_gasPrice') { onGas(); return '0x3b9aca00'; }
    if (m === 'eth_call') return `0x${allowance.toString(16).padStart(64, '0')}`;
    return undefined;
  });
  const sends = (w: MockWallet): number => w.calls.filter((c) => c.method === 'eth_sendTransaction').length;

  it.each([[NOW + 60, true], [NOW + 61, true], [NOW + 59, false]] as const)('send at %i with unchanged price: rejected=%s', async (at, rejected) => {
    const { ctx, session, wallet } = await setup();
    let now = NOW;
    const rt: Runtime = { rpc: rpcFor(wallet), nowSeconds: () => now, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false, buffer: quote }, rt, noStatus);
    now = at;
    expect(BigInt(now)).toBeLessThan(built.preview.deadline);
    const p = sendPayment(session, ctx, built, rt, noStatus);
    if (rejected) {
      await expect(p).rejects.toThrow(/gas buffer quote expired/);
      expect(sends(wallet)).toBe(0);
    } else {
      await expect(p).resolves.toMatchObject({ hash: `0x${'9'.repeat(64)}` });
      expect(sends(wallet)).toBe(1);
    }
  });

  it('rejects when the TTL passes during the gas RPC or the final wallet net_version await', async () => {
    const { ctx, session, wallet } = await setup();
    let now = NOW;
    const rt: Runtime = { rpc: rpcFor(wallet, () => { now = NOW + 60; }), nowSeconds: () => now, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false, buffer: quote }, rt, noStatus);
    await expect(sendPayment(session, ctx, built, rt, noStatus)).rejects.toThrow(/gas buffer quote expired/);
    now = NOW + 30;
    const rt2: Runtime = { rpc: rpcFor(wallet), nowSeconds: () => now, sleep };
    const s = delayedSession(session, wallet, (m) => { if (m === 'net_version') now = NOW + 60; });
    await expect(sendPayment(s, ctx, built, rt2, noStatus)).rejects.toThrow(/gas buffer quote expired/);
    expect(sends(wallet)).toBe(0);
  });

  it('an approval that completed after the TTL keeps its hash but never continues into the payment', async () => {
    const { ctx, session, wallet } = await setup();
    allowance = 0n;
    let now = NOW;
    const rt: Runtime = { rpc: rpcFor(wallet), nowSeconds: () => now, sleep };
    const built = await preparePayment(session, ctx, { usePermit: false, buffer: quote }, rt, noStatus);
    const plan = await planApproval(ctx, session, USDC_84532, rt);
    const hashes: string[] = [];
    const s = delayedSession(session, wallet, (m) => { if (m === 'eth_sendTransaction') { now = NOW + 61; allowance = plan.need; } });
    await expect(grantApproval(s, ctx, plan, rt, noStatus, undefined, (h) => hashes.push(h))).resolves.toBe(plan.need);
    expect(hashes).toEqual([`0x${'9'.repeat(64)}`]);
    await expect(sendPayment(s, ctx, built, rt, noStatus)).rejects.toThrow(/gas buffer quote expired/);
    expect(sends(wallet)).toBe(1);
    allowance = 0n;
  });
});
