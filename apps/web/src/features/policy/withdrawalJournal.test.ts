// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTEMPT_JOURNAL_KEY, readAttempts, type AttemptStorage } from '../../lib/duplicateAttemptJournal';
import { connectWallet, walletAttemptKey, type WalletSession } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { clearPolicyAction, policyActionAttempts, policyActionKey, policyAttemptStorage, sendPolicyAction, type PolicyLockManager } from './withdrawalJournal';
import { SEPOLIA } from './fixtures.testutil';

const tx = { to: '0x1111111111111111111111111111111111111111' as const, data: '0x1234' as const, value: 0n };
const scope = 'seller:deployment:account:token:request';
const noOp = () => undefined;

function serializedLocks(): PolicyLockManager {
  let tail = Promise.resolve();
  return { request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
    const run = tail.then(callback);
    tail = run.then(noOp, noOp);
    return run;
  } };
}

async function wallet(account?: string) {
  const provider = new MockWallet({ chainId: SEPOLIA, ...(account === undefined ? {} : { account }) });
  const session = await connectWallet({ id: 'mock', name: 'Mock', kind: 'injected', provider }, SEPOLIA);
  return { provider, session };
}

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('durable policy attempt journal', () => {
  it('persists the returned hash across a recreated session/store and ignores new nonce calldata or relayer wallet', async () => {
    const { session, provider } = await wallet();
    const storage = policyAttemptStorage();
    const key = policyActionKey(session, tx, scope);
    await expect(sendPolicyAction({ wallet: session, prepare: () => Promise.resolve(tx), scope, assertCurrent: noOp, storage, lockManager: serializedLocks() })).resolves.toBe(`0x${'9'.repeat(64)}`);
    expect(window.sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    expect(policyActionAttempts(key, window.localStorage)[0]).toMatchObject({ status: 'submitted', hash: `0x${'9'.repeat(64)}` });
    const changed = await wallet('0x6666666666666666666666666666666666666666');
    const prepare = vi.fn(() => Promise.resolve({ ...tx, data: '0x5678' as const }));
    await expect(sendPolicyAction({ wallet: changed.session, prepare, scope, assertCurrent: noOp, storage: window.localStorage, lockManager: serializedLocks() })).rejects.toThrow(/earlier policy action/);
    expect(prepare).not.toHaveBeenCalled();
    expect(changed.provider.sent).toBeUndefined();
    expect(provider.sent).toBeDefined();
  });

  it('retains unknown outcomes and rejects competing submissions across tab contexts', async () => {
    const { session, provider } = await wallet();
    const original = provider.request.bind(provider);
    const requestSpy = vi.spyOn(provider, 'request').mockImplementation((args) => args.method === 'eth_sendTransaction' ? Promise.reject(new Error('connection lost')) : original(args));
    const manager = serializedLocks();
    const action = () => sendPolicyAction({ wallet: session, prepare: () => Promise.resolve(tx), scope, assertCurrent: noOp, storage: window.localStorage, lockManager: manager });
    const results = await Promise.allSettled([action(), action()]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({ method: 'eth_sendTransaction' }));
    expect(requestSpy.mock.calls.filter(([args]) => args.method === 'eth_sendTransaction')).toHaveLength(1);
    expect(readAttempts(window.localStorage)).toMatchObject([{ status: 'unknown' }]);
  });

  it('requires explicit outcome review to clear and serializes clearing against submissions', async () => {
    const { session } = await wallet();
    const manager = serializedLocks();
    const send = () => sendPolicyAction({ wallet: session, prepare: () => Promise.resolve(tx), scope, assertCurrent: noOp, storage: window.localStorage, lockManager: manager });
    await send();
    const key = policyActionKey(session, tx, scope);
    await expect(clearPolicyAction(key, false, window.localStorage, manager)).rejects.toThrow(/Explicit confirmation/);
    expect(readAttempts(window.localStorage)).toHaveLength(1);
    await clearPolicyAction(key, true, window.localStorage, manager);
    expect(readAttempts(window.localStorage)).toEqual([]);
    await expect(send()).resolves.toBe(`0x${'9'.repeat(64)}`);
  });

  it('refuses a lock-queued action or clear when the seller session changes', async () => {
    const { session, provider } = await wallet();
    const assertCurrent = vi.fn(() => { throw new Error('session replaced'); });
    const prepare = vi.fn(() => Promise.resolve(tx));
    await expect(sendPolicyAction({ wallet: session, prepare, scope, assertCurrent, storage: window.localStorage, lockManager: serializedLocks() })).rejects.toThrow('session replaced');
    expect(prepare).not.toHaveBeenCalled();
    expect(provider.sent).toBeUndefined();
    await expect(clearPolicyAction(policyActionKey(session, tx, scope), true, window.localStorage, serializedLocks(), assertCurrent)).rejects.toThrow('session replaced');
  });

  it('persists the hash after a seller session changes during broadcast', async () => {
    const { session, provider } = await wallet();
    let stale = false;
    const original = provider.request.bind(provider);
    vi.spyOn(provider, 'request').mockImplementation(async (args) => {
      const answer = await original(args);
      if (args.method === 'eth_sendTransaction') stale = true;
      return answer;
    });
    await sendPolicyAction({ wallet: session, prepare: () => Promise.resolve(tx), scope, assertCurrent: () => { if (stale) throw new Error('session changed'); }, storage: window.localStorage, lockManager: serializedLocks() });
    expect(readAttempts(window.localStorage)[0]!.hash).toBe(`0x${'9'.repeat(64)}`);
  });

  it('preserves the returned hash in WalletBroadcastError if durable writeback fails', async () => {
    const { session, provider } = await wallet();
    let sent = false;
    const original = provider.request.bind(provider);
    vi.spyOn(provider, 'request').mockImplementation(async (args) => { const answer = await original(args); if (args.method === 'eth_sendTransaction') sent = true; return answer; });
    const storage: AttemptStorage = { getItem: (key) => window.localStorage.getItem(key), setItem: (key, value) => { if (sent) throw new Error('full'); window.localStorage.setItem(key, value); } };
    await expect(sendPolicyAction({ wallet: session, prepare: () => Promise.resolve(tx), scope, assertCurrent: noOp, storage, lockManager: serializedLocks() })).rejects.toMatchObject({ name: 'WalletBroadcastError', hash: `0x${'9'.repeat(64)}` });
    expect(readAttempts(window.localStorage)[0]!.status).toBe('unknown');
  });

  it('fails closed on corrupt/full/unavailable storage and missing browser locks', async () => {
    const { session, provider } = await wallet();
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, 'malformed');
    await expect(sendPolicyAction({ wallet: session, prepare: () => Promise.resolve(tx), scope, assertCurrent: noOp, storage: window.localStorage, lockManager: serializedLocks() })).rejects.toThrow(/journal is unavailable or invalid/);
    window.localStorage.clear();
    const storage: AttemptStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    await expect(sendPolicyAction({ wallet: session, prepare: () => Promise.resolve(tx), scope, assertCurrent: noOp, storage, lockManager: serializedLocks() })).rejects.toThrow(/journal is unavailable or invalid/);
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    await expect(sendPolicyAction({ wallet: session, prepare: () => Promise.resolve(tx), scope, assertCurrent: noOp })).rejects.toThrow(/browser locking is unavailable/);
    expect(provider.sent).toBeUndefined();
  });
});

describe('stable logical transaction key', () => {
  it('requires an explicit bounded scope and keeps ordinary transaction/payment identities unchanged', async () => {
    const { session } = await wallet();
    const other = { ...session, account: '0x6666666666666666666666666666666666666666' } as WalletSession;
    const options = { kind: 'transaction' as const, logicalAction: true, scope };
    expect(walletAttemptKey(session, tx, options)).toBe(walletAttemptKey(other, { ...tx, data: '0xabcd', value: 9n }, options));
    expect(walletAttemptKey(session, tx, options)).not.toBe(walletAttemptKey(session, tx, { ...options, scope: `${scope}:other` }));
    expect(walletAttemptKey(session, tx)).not.toBe(walletAttemptKey(other, tx));
    expect(walletAttemptKey(session, tx, { kind: 'transaction', scope })).not.toBe(walletAttemptKey(session, { ...tx, data: '0xabcd' }, { kind: 'transaction', scope }));
    const payment = { kind: 'payment' as const, scope };
    expect(walletAttemptKey(session, tx, payment)).toBe(walletAttemptKey(other, { ...tx, data: '0xabcd' }, payment));
    for (const bad of ['', ' ', 'x\n', 'x'.repeat(1025)]) expect(() => walletAttemptKey(session, tx, { ...options, scope: bad })).toThrow(/action identity/);
    expect(() => walletAttemptKey(session, tx, { kind: 'transaction', logicalAction: true })).toThrow(/action identity/);
    expect(() => walletAttemptKey(session, tx, { kind: 'payment', logicalAction: true, scope })).toThrow(/action identity/);
  });
});
