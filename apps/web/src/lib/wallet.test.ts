import { describe, expect, it } from 'vitest';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import { buildApproveTx } from './pay';
import {
  SubmissionMismatchError,
  connectWallet,
  discoverWallets,
  pollReceipt,
  recheckWallet,
  sendViaWallet,
  signTypedDataViaWallet,
  verifySubmission,
  walletAttemptKey,
  type TxRequest,
  type WalletInfo,
  type WindowLike,
} from './wallet';

function info(w: MockWallet): WalletInfo {
  return { id: 'mock', name: 'Mock', kind: 'injected', provider: w };
}
const ROUTER = '0x1111111111111111111111111111111111111111';
const HASH = `0x${'9'.repeat(64)}`;

class FakeWindow extends EventTarget implements WindowLike {
  public ethereum?: unknown;
  public announce(detail: unknown): void {
    this.addEventListener('eip6963:requestProvider', () => {
      this.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
    });
  }
}

describe('discoverWallets (EIP-6963)', () => {
  it('collects announced providers, sanitizing untrusted metadata', async () => {
    const w = new FakeWindow();
    const p = new MockWallet();
    w.announce({ info: { uuid: 'u1', name: '  My\u0007Wallet  ', icon: 'data:image/png;base64,AAAA', rdns: 'com.example' }, provider: p });
    w.announce({ info: { uuid: 'u1', name: 'Duplicate', icon: '' }, provider: p });
    w.announce({ info: { uuid: 'u2', name: 'Bad icon', icon: 'https://evil.test/x.png' }, provider: p });
    w.announce({ info: { uuid: 'u3', name: 'x'.repeat(100), icon: `data:image/png;base64,${'A'.repeat(70_000)}` }, provider: p });
    w.announce({ info: { uuid: 'u4', name: 'No provider' }, provider: {} });
    w.announce({ info: { name: 'No uuid' }, provider: p });
    w.announce(null);
    const list = await discoverWallets(w, 1);
    expect(list.map((x) => x.name)).toEqual(['MyWallet', 'Bad icon', 'x'.repeat(40)]);
    expect(list[0]?.icon).toBe('data:image/png;base64,AAAA');
    expect(list[0]?.rdns).toBe('com.example');
    expect(list[1]?.icon).toBeUndefined();
    expect(list[2]?.icon).toBeUndefined();
    expect(list.every((x) => x.kind === 'eip6963')).toBe(true);
  });
  it('falls back to a labelled injected provider only when nothing announced', async () => {
    const w = new FakeWindow();
    w.ethereum = new MockWallet();
    const list = await discoverWallets(w, 1);
    expect(list).toHaveLength(1);
    expect(list[0]?.kind).toBe('injected');
    expect(list[0]?.name).toMatch(/EIP-1193/);
    const none = new FakeWindow();
    none.ethereum = { notAProvider: true };
    expect(await discoverWallets(none, 1)).toEqual([]);
  });
});

describe('connectWallet', () => {
  it('connects when everything is consistent', async () => {
    const w = new MockWallet();
    const s = await connectWallet(info(w), 84532);
    expect(s.account).toBe('0x5555555555555555555555555555555555555555');
    expect(s.chainId).toBe(84532);
  });
  it('switches network once when the wallet is on another chain', async () => {
    const w = new MockWallet({ chainId: 1 });
    const s = await connectWallet(info(w), 84532);
    expect(s.chainId).toBe(84532);
    expect(w.calls.some((c) => c.method === 'wallet_switchEthereumChain')).toBe(true);
  });
  it('refuses when the chain cannot be switched', async () => {
    const w = new MockWallet({ chainId: 1, failSwitch: true });
    await expect(connectWallet(info(w), 84532)).rejects.toThrow(/chain 1 but this invoice requires chain 84532/);
  });
  it('refuses a provider that lies about accounts', async () => {
    await expect(connectWallet(info(new MockWallet({ lieAboutAccounts: true })), 84532)).rejects.toThrow(/inconsistent accounts/);
  });
  it('refuses a provider that gives contradictory chain ids', async () => {
    await expect(connectWallet(info(new MockWallet({ lieAboutChain: true })), 84532)).rejects.toThrow(/contradictory chain ids/);
  });
  it('rejects invalid shapes from the provider', async () => {
    const mk = (answers: Record<string, unknown>): WalletInfo => ({
      id: 'x',
      name: 'x',
      kind: 'injected',
      provider: { request: ({ method }) => (method in answers ? Promise.resolve(answers[method]) : Promise.reject(new Error('unsupported'))) },
    });
    await expect(connectWallet(mk({ eth_requestAccounts: [] }), 1)).rejects.toThrow(/no accounts/);
    await expect(connectWallet(mk({ eth_requestAccounts: ['nope'] }), 1)).rejects.toThrow(/invalid account/);
    await expect(connectWallet(mk({ eth_requestAccounts: [MOCK_ACCOUNT], eth_accounts: [MOCK_ACCOUNT], eth_chainId: 'abc' }), 1)).rejects.toThrow(/invalid chain id/);
    await expect(connectWallet(mk({ eth_requestAccounts: [MOCK_ACCOUNT], eth_accounts: [MOCK_ACCOUNT], eth_chainId: '0x0' }), 1)).rejects.toThrow(/invalid chain id/);
    await expect(connectWallet(mk({ eth_requestAccounts: 'x' }), 1)).rejects.toThrow(/no accounts/);
    await expect(connectWallet(mk({}), 1)).rejects.toThrow(/Wallet call failed/);
    // net_version unsupported is fine
    const s = await connectWallet(mk({ eth_requestAccounts: [MOCK_ACCOUNT], eth_accounts: [MOCK_ACCOUNT], eth_chainId: '0x1' }), 1);
    expect(s.chainId).toBe(1);
  });
  it('reports a user rejection plainly', async () => {
    const p: WalletInfo = { id: 'x', name: 'x', kind: 'injected', provider: { request: () => Promise.reject(Object.assign(new Error('r'), { code: 4001 })) } };
    await expect(connectWallet(p, 1)).rejects.toThrow(/rejected the request/);
  });
});

describe('sending', () => {
  it('rechecks account and chain, then sends and shape-checks the hash', async () => {
    const w = new MockWallet();
    const s = await connectWallet(info(w), 84532);
    const hash = await sendViaWallet(s, { to: ROUTER, data: '0xdeadbeef', value: 10n });
    expect(hash).toBe(HASH);
    expect(w.sent).toMatchObject({ from: MOCK_ACCOUNT, to: ROUTER, data: '0xdeadbeef', value: '0xa', chainId: '0x14a34' });
  });
  it('refuses to send if the account or chain changed after connecting', async () => {
    const w = new MockWallet();
    const s = await connectWallet(info(w), 84532);
    w.chainId = 1;
    await expect(recheckWallet(s)).rejects.toThrow(/network changed/);
    await expect(sendViaWallet(s, { to: ROUTER, data: '0x', value: 0n })).rejects.toThrow(/network changed/);
    const w2 = new MockWallet();
    const s2 = await connectWallet(info(w2), 84532);
    const swapped: WalletInfo = { ...info(w2), provider: { request: (a) => (a.method === 'eth_accounts' ? Promise.resolve(['0x7777777777777777777777777777777777777777']) : w2.request(a)) } };
    await expect(recheckWallet({ ...s2, wallet: swapped })).rejects.toThrow(/account changed/);
  });
  it('checks application authority again after wallet network awaits and before sending', async () => {
    const base = new MockWallet();
    let current = true;
    const session = await connectWallet(info(base), 84532);
    const wrapped = { ...session, wallet: { ...session.wallet, provider: {
      request: async (args: Parameters<MockWallet['request']>[0]) => {
        const value = await base.request(args);
        if (args.method === 'net_version') current = false;
        return value;
      },
    } } };
    await expect(sendViaWallet(wrapped, { to: ROUTER, data: '0x', value: 0n }, () => {
      if (!current) throw new Error('authority changed');
    })).rejects.toThrow('authority changed');
    expect(base.sent).toBeUndefined();
  });
  it('rechecks authority after wallet awaits before asking for a permit signature', async () => {
    const base = new MockWallet();
    const session = await connectWallet(info(base), 84532);
    let current = true;
    const wrapped = { ...session, wallet: { ...session.wallet, provider: {
      request: async (args: Parameters<MockWallet['request']>[0]) => {
        const value = await base.request(args);
        if (args.method === 'net_version') current = false;
        return value;
      },
    } } };
    await expect(signTypedDataViaWallet(wrapped, '{}', () => {
      if (!current) throw new Error('authority changed');
    })).rejects.toThrow('authority changed');
    expect(base.calls.some((call) => call.method === 'eth_signTypedData_v4')).toBe(false);
  });
  it('refuses a provider account-change event during the network check', async () => {
    const base = new MockWallet();
    const session = await connectWallet(info(base), 84532);
    const listeners = new Map<string, () => void>();
    const provider = {
      on: (event: string, listener: () => void) => { listeners.set(event, listener); },
      removeListener: (event: string) => { listeners.delete(event); },
      request: async (args: Parameters<MockWallet['request']>[0]) => {
        const value = await base.request(args);
        if (args.method === 'net_version') listeners.get('accountsChanged')?.();
        return value;
      },
    };
    await expect(sendViaWallet({ ...session, wallet: { ...session.wallet, provider } }, { to: ROUTER, data: '0x', value: 0n })).rejects.toThrow(/changed/);
    expect(base.sent).toBeUndefined();
    expect(listeners.size).toBe(0);
  });
  it('rejects bad hashes and signatures from the wallet', async () => {
    const mk = (send: unknown, sig: unknown): ReturnType<typeof connectWallet> => {
      const w = new MockWallet();
      const base = info(w);
      return connectWallet({ ...base, provider: { request: (a) => (a.method === 'eth_sendTransaction' ? Promise.resolve(send) : a.method === 'eth_signTypedData_v4' ? Promise.resolve(sig) : w.request(a)) } }, 84532);
    };
    const s = await mk('0x123', 'nope');
    await expect(sendViaWallet(s, { to: ROUTER, data: '0x', value: 0n })).rejects.toThrow(/valid transaction hash/);
    await expect(signTypedDataViaWallet(s, '{}')).rejects.toThrow(/invalid signature/);
  });
  it('signs typed data through the wallet', async () => {
    const w = new MockWallet({ typedDataSignature: `0x${'a'.repeat(130)}` });
    const s = await connectWallet(info(w), 84532);
    expect(await signTypedDataViaWallet(s, '{"a":1}')).toBe(`0x${'a'.repeat(130)}`);
  });
  it('treats a user rejection during send as such', async () => {
    const w = new MockWallet({ rejectSend: true });
    const s = await connectWallet(info(w), 84532);
    await expect(sendViaWallet(s, { to: ROUTER, data: '0x', value: 0n })).rejects.toThrow(/rejected the request/);
  });
  it('keys an approval attempt by its invoice and its calldata, and a payment by its invoice only (L2-I3)', async () => {
    const s = await connectWallet(info(new MockWallet()), 84532);
    const approve = buildApproveTx(ROUTER, `0x${'2'.repeat(40)}`, 100n);
    const revoke = buildApproveTx(ROUTER, `0x${'2'.repeat(40)}`, 0n);
    const approval = (tx: TxRequest, scope?: string): string => walletAttemptKey(s, tx, scope === undefined ? { kind: 'approval' } : { kind: 'approval', scope });
    expect(approval(approve, 'invoice-a')).toBe(approval(approve, 'invoice-a'));
    expect(approval(approve, 'invoice-a')).not.toBe(approval(approve, 'invoice-b'));
    // Approve and revoke for one invoice are different actions; the scope narrows the calldata key, it does not replace it.
    expect(approval(approve, 'invoice-a')).not.toBe(approval(revoke, 'invoice-a'));
    expect(approval(approve)).not.toBe(approval(revoke));
    expect(approval(approve)).not.toBe(approval(approve, 'invoice-a'));
    // A payment's calldata carries fresh stealth randomness, so one invoice stays one payment action.
    expect(walletAttemptKey(s, approve, { kind: 'payment', scope: 'invoice-a' })).toBe(walletAttemptKey(s, revoke, { kind: 'payment', scope: 'invoice-a' }));
  });
});

const EXPECT = { from: MOCK_ACCOUNT as `0x${string}`, to: ROUTER as `0x${string}`, data: '0xabcd' as `0x${string}`, value: 5n, chainId: 84532 };
const seen = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  hash: HASH,
  from: MOCK_ACCOUNT,
  to: ROUTER,
  input: '0xabcd',
  value: '0x5',
  chainId: '0x14a34',
  ...patch,
});
const rpc = (answer: () => unknown) => ({ request: () => Promise.resolve(answer()) });
const noSleep = (): Promise<void> => Promise.resolve();

describe('verifySubmission (provider mutation / chain lies caught on the user RPC)', () => {
  it('verifies an identical transaction', async () => {
    expect(await verifySubmission(rpc(() => seen()), HASH as `0x${string}`, EXPECT, noSleep)).toBe('verified');
    expect(await verifySubmission(rpc(() => seen({ chainId: undefined, input: undefined, data: '0xabcd' })), HASH as `0x${string}`, EXPECT, noSleep)).toBe('verified');
  });
  it('reports not-visible-yet after retries', async () => {
    let n = 0;
    const r = { request: () => { n++; return Promise.resolve(null); } };
    expect(await verifySubmission(r, HASH as `0x${string}`, EXPECT, noSleep, 3)).toBe('not-visible-yet');
    expect(n).toBe(3);
  });
  it.each([
    ['call data', { input: '0xabce' }],
    ['value', { value: '0x6' }],
    ['destination contract', { to: '0x2222222222222222222222222222222222222222' }],
    ['sender', { from: '0x2222222222222222222222222222222222222222' }],
    ['chain', { chainId: '0x1' }],
    ['hash', { hash: `0x${'8'.repeat(64)}` }],
  ])('throws on a mutated %s', async (field, patch) => {
    const p = verifySubmission(rpc(() => seen(patch)), HASH as `0x${string}`, EXPECT, noSleep);
    await expect(p).rejects.toThrow(SubmissionMismatchError);
    await expect(p).rejects.toMatchObject({ field });
  });
  it('throws on a contract-creation tx and on malformed shapes', async () => {
    await expect(verifySubmission(rpc(() => seen({ to: null })), HASH as `0x${string}`, EXPECT, noSleep)).rejects.toThrow(SubmissionMismatchError);
    await expect(verifySubmission(rpc(() => 'garbage'), HASH as `0x${string}`, EXPECT, noSleep)).rejects.toThrow(/unexpected transaction shape/);
    await expect(verifySubmission(rpc(() => seen({ value: 'zzz' })), HASH as `0x${string}`, EXPECT, noSleep)).rejects.toThrow(/unexpected transaction shape/);
  });
});

describe('pollReceipt', () => {
  const receipt = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({ status: '0x1', blockNumber: '0x10', to: ROUTER, ...patch });
  it('returns success and reverted states', async () => {
    expect(await pollReceipt(rpc(() => receipt()), HASH as `0x${string}`, ROUTER, noSleep)).toEqual({ status: 'success', blockNumber: 16n });
    expect((await pollReceipt(rpc(() => receipt({ status: '0x0' })), HASH as `0x${string}`, ROUTER, noSleep))?.status).toBe('reverted');
    expect((await pollReceipt(rpc(() => receipt({ to: null })), HASH as `0x${string}`, ROUTER, noSleep))?.status).toBe('success');
  });
  it('returns undefined if no receipt appears and errors on bad shapes', async () => {
    expect(await pollReceipt(rpc(() => null), HASH as `0x${string}`, ROUTER, noSleep, 2)).toBeUndefined();
    await expect(pollReceipt(rpc(() => 5), HASH as `0x${string}`, ROUTER, noSleep)).rejects.toThrow(/receipt shape/);
    await expect(pollReceipt(rpc(() => receipt({ status: 'x' })), HASH as `0x${string}`, ROUTER, noSleep)).rejects.toThrow(/receipt shape/);
    await expect(pollReceipt(rpc(() => receipt({ to: '0x2222222222222222222222222222222222222222' })), HASH as `0x${string}`, ROUTER, noSleep)).rejects.toThrow(SubmissionMismatchError);
  });
});
