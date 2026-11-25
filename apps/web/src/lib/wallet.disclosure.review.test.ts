import { erc20Abi } from '@ghostpay/chain-adapters';
import { policyAccountAbi } from '@ghostpay/policy-scheme';
import { encodeFunctionData } from 'viem/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockWallet } from '../test/mockWallet';
import { readAttempts, type AttemptLockManager, type AttemptStorage } from './duplicateAttemptJournal';
import { connectWallet, sendViaWallet, signTypedDataViaWallet, type Eip1193Provider, type WalletInfo, type WalletSession } from './wallet';
import { summarizeWalletCall } from './walletCallSummary';
import { WALLET_DISCLOSURE_MS, WalletDisclosureController, type WalletDisclosureGate } from './walletDisclosure';

// Regressions for the independent review of the disclosure port (findings 1, 2, 4, 5, 6, 8, 9, 10 and the untested
// invariants it listed). Finding 3 (typed-data labels) is covered in walletDisclosure.test.ts.

const info = (provider: Eip1193Provider): WalletInfo => ({ id: 'mock', name: 'Mock', kind: 'injected', provider });
const tx = { to: '0x1111111111111111111111111111111111111111', data: '0xdeadbeef', value: 10n } as const;
const permitJson = JSON.stringify({ types: { Permit: [{ name: 'value', type: 'uint256' }] }, primaryType: 'Permit', message: { value: '1' } });
function store(): AttemptStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}
class EventWallet extends MockWallet {
  public readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void {
    const set = this.listeners.get(event) ?? new Set<() => void>();
    set.add(listener); this.listeners.set(event, set);
  }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(); }
}
function presenter(): WalletDisclosureController {
  const controller = new WalletDisclosureController();
  controller.mount();
  controller.allowPresentation(true);
  return controller;
}
async function approveNext(controller: WalletDisclosureController, method?: string): Promise<void> {
  await vi.waitFor(() => {
    const pending = controller.getSnapshot();
    expect(pending).toBeDefined();
    if (method !== undefined) expect(pending?.request.method).toBe(method);
  });
  controller.approve(controller.getSnapshot()!);
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('a gate that answers without a usable approval fails closed (review finding 1)', () => {
  const malformed: readonly unknown[] = [undefined, null, {}, { assertCurrent: 'yes' }, 7];
  it.each(malformed.map((value) => [JSON.stringify(value) ?? 'undefined', value] as const))('send refuses an approval of %s without calling the wallet', async (_label, value) => {
    const provider = new MockWallet();
    const session: WalletSession = { ...await connectWallet(info(provider), 84532), disclosure: (() => Promise.resolve(value)) as unknown as WalletDisclosureGate };
    provider.calls.length = 0;
    const storage = store();
    await expect(sendViaWallet(session, tx, undefined, { kind: 'transaction', storage })).rejects.toThrow(/cancelled/);
    expect(provider.calls).toEqual([]);
    expect(readAttempts(storage)).toEqual([]);
  });
  it.each(malformed.map((value) => [JSON.stringify(value) ?? 'undefined', value] as const))('signature and connection refuse an approval of %s', async (_label, value) => {
    const gate = (() => Promise.resolve(value)) as unknown as WalletDisclosureGate;
    const provider = new MockWallet();
    const session: WalletSession = { ...await connectWallet(info(provider), 84532), disclosure: gate };
    provider.calls.length = 0;
    await expect(signTypedDataViaWallet(session, permitJson)).rejects.toThrow(/cancelled/);
    await expect(connectWallet(info(provider), 84532, undefined, undefined, { disclosure: gate })).rejects.toThrow(/cancelled/);
    expect(provider.calls).toEqual([]);
  });
});

describe('expected wallet events that arrive after the call resolves (review finding 2)', () => {
  it('accepts a chainChanged announced shortly after an approved switch resolves', async () => {
    const provider = new EventWallet({ chainId: 1 });
    const original = provider.request.bind(provider);
    provider.request = async (args) => {
      if (args.method === 'eth_chainId') await new Promise((resolve) => setTimeout(resolve, 5));
      const result = await original(args);
      if (args.method === 'wallet_switchEthereumChain') setTimeout(() => { provider.emit('chainChanged'); }, 0);
      if (args.method === 'eth_requestAccounts') setTimeout(() => { provider.emit('accountsChanged'); }, 0);
      return result;
    };
    const controller = presenter();
    const operation = connectWallet(info(provider), 84532, undefined, undefined, { disclosure: controller.request });
    await approveNext(controller, 'eth_requestAccounts');
    await approveNext(controller, 'wallet_switchEthereumChain');
    await expect(operation).resolves.toMatchObject({ account: provider.account, chainId: 84532 });
  });

  it('still refuses when the account reported after an approved switch differs from the reviewed one', async () => {
    const provider = new EventWallet({ chainId: 1 });
    const original = provider.request.bind(provider);
    let switched = false;
    provider.request = async (args) => {
      if (switched && args.method === 'eth_accounts') return ['0x7777777777777777777777777777777777777777'];
      const result = await original(args);
      if (args.method === 'wallet_switchEthereumChain') { switched = true; provider.emit('accountsChanged'); }
      return result;
    };
    const controller = presenter();
    const operation = connectWallet(info(provider), 84532, undefined, undefined, { disclosure: controller.request });
    await approveNext(controller, 'eth_requestAccounts');
    await approveNext(controller, 'wallet_switchEthereumChain');
    await expect(operation).rejects.toThrow(/account changed/i);
  });

  it('works with a request-only wallet (no events): nothing is observed, the recheck still runs', async () => {
    const mock = new MockWallet();
    const provider: Eip1193Provider = { request: mock.request.bind(mock) };
    const controller = presenter();
    const connecting = connectWallet(info(provider), 84532, undefined, undefined, { disclosure: controller.request });
    await approveNext(controller, 'eth_requestAccounts');
    const session = await connecting;
    mock.calls.length = 0;
    const sending = sendViaWallet(session, tx, undefined, { kind: 'transaction', storage: store() });
    await approveNext(controller, 'eth_sendTransaction');
    await expect(sending).resolves.toMatch(/^0x[0-9a-f]{64}$/);
    expect(mock.calls.map((call) => call.method)).toEqual(['eth_accounts', 'eth_chainId', 'net_version', 'eth_accounts', 'eth_sendTransaction']);
  });
});

describe('an approval that goes stale around the journal never reaches the wallet', () => {
  it('stale while waiting for the cross-tab lock: no record and no send', async () => {
    const provider = new MockWallet();
    let fresh = true;
    const session: WalletSession = { ...await connectWallet(info(provider), 84532), disclosure: () => Promise.resolve({ assertCurrent: () => { if (!fresh) throw new Error('stale approval'); } }) };
    const storage = store();
    const lockManager: AttemptLockManager = { request: async <T>(_name: string, callback: () => Promise<T>): Promise<T> => { fresh = false; return callback(); } };
    provider.calls.length = 0;
    await expect(sendViaWallet(session, tx, undefined, { kind: 'transaction', storage, lockManager })).rejects.toThrow('stale approval');
    expect(readAttempts(storage)).toEqual([]);
    expect(provider.calls.map((call) => call.method)).not.toContain('eth_sendTransaction');
  });

  it('stale between the journal write and the provider call: the unsent record is removed', async () => {
    const provider = new MockWallet();
    let checks = 0;
    let failAt = Number.POSITIVE_INFINITY;
    const session: WalletSession = { ...await connectWallet(info(provider), 84532), disclosure: () => Promise.resolve({ assertCurrent: () => { checks += 1; if (checks >= failAt) throw new Error('stale approval'); } }) };
    const lockManager: AttemptLockManager = { request: <T>(_name: string, callback: () => Promise<T>): Promise<T> => callback() };
    await sendViaWallet(session, tx, undefined, { kind: 'transaction', storage: store(), lockManager });
    // The last check of a successful send is the one inside invoke(), after the journal record was written.
    failAt = checks;
    checks = 0;
    const storage = store();
    provider.calls.length = 0;
    await expect(sendViaWallet(session, { ...tx, data: '0xdeadbeee' }, undefined, { kind: 'transaction', storage, lockManager })).rejects.toThrow('stale approval');
    expect(readAttempts(storage)).toEqual([]);
    expect(provider.calls.map((call) => call.method)).not.toContain('eth_sendTransaction');
  });
});

describe('approval lifetime and controller edge cases (review findings 4 and 9)', () => {
  it('times an approval from the decision, not from when the review opened', async () => {
    let wall = 1_000_000;
    let mono = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => wall);
    vi.spyOn(performance, 'now').mockImplementation(() => mono);
    const controller = presenter();
    const approval = controller.request({ method: 'eth_requestAccounts', chainId: 1, requestJson: '{}' });
    wall += WALLET_DISCLOSURE_MS - 10_000; mono += WALLET_DISCLOSURE_MS - 10_000;
    controller.approve(controller.getSnapshot()!);
    const approved = await approval;
    // 100 s after the decision is still within the window even though the review was open for 110 s.
    wall += 100_000; mono += 100_000;
    expect(() => { approved.assertCurrent(); }).not.toThrow();
    wall += WALLET_DISCLOSURE_MS; mono += WALLET_DISCLOSURE_MS;
    expect(() => { approved.assertCurrent(); }).toThrow(/cancelled/);
  });

  it('a throwing subscriber neither strands the prompt nor blocks the next request', async () => {
    const controller = presenter();
    controller.subscribe(() => { throw new Error('render failed'); });
    const first = controller.request({ method: 'eth_requestAccounts', chainId: 1, requestJson: '{}' });
    expect(controller.getSnapshot()).toBeDefined();
    controller.cancel(controller.getSnapshot()!);
    await expect(first).rejects.toThrow(/cancelled/);
    const second = controller.request({ method: 'eth_requestAccounts', chainId: 1, requestJson: '{}' });
    controller.approve(controller.getSnapshot()!);
    await expect(second).resolves.toHaveProperty('assertCurrent');
  });

  it('an old unmount cannot switch off a later mount', async () => {
    const controller = new WalletDisclosureController();
    const firstUnmount = controller.mount();
    firstUnmount();
    controller.mount();
    controller.allowPresentation(true);
    firstUnmount();
    const request = controller.request({ method: 'eth_requestAccounts', chainId: 1, requestJson: '{}' });
    controller.approve(controller.getSnapshot()!);
    await expect(request).resolves.toHaveProperty('assertCurrent');
  });
});

describe('what reaches the wallet (review findings 5, 6 and 8)', () => {
  it('hands the wallet a plain copy of the reviewed parameters that it may edit', async () => {
    const mock = new MockWallet();
    const provider: Eip1193Provider = {
      request: (args) => {
        const params = args.params as Record<string, unknown>[] | undefined;
        if (args.method === 'eth_sendTransaction' && params !== undefined) params[0]!['gas'] = '0x5208';
        return mock.request(args);
      },
    };
    const controller = presenter();
    const session: WalletSession = { ...await connectWallet(info(provider), 84532), disclosure: controller.request };
    const sending = sendViaWallet(session, tx, undefined, { kind: 'transaction', storage: store() });
    await vi.waitFor(() => { expect(controller.getSnapshot()).toBeDefined(); });
    const reviewed = controller.getSnapshot()!.request.requestJson;
    controller.approve(controller.getSnapshot()!);
    await expect(sending).resolves.toMatch(/^0x/);
    expect(JSON.parse(reviewed)).toEqual({ method: 'eth_sendTransaction', params: [{ from: session.account, to: tx.to, data: tx.data, value: '0xa', chainId: '0x14a34' }] });
  });

  it('sends the reviewed switch parameters', async () => {
    const provider = new EventWallet({ chainId: 1 });
    const controller = presenter();
    const operation = connectWallet(info(provider), 84532, undefined, undefined, { disclosure: controller.request });
    await approveNext(controller, 'eth_requestAccounts');
    await vi.waitFor(() => { expect(controller.getSnapshot()?.request.method).toBe('wallet_switchEthereumChain'); });
    const reviewed = JSON.parse(controller.getSnapshot()!.request.requestJson) as unknown;
    controller.approve(controller.getSnapshot()!);
    await operation;
    expect(provider.calls.find((call) => call.method === 'wallet_switchEthereumChain')).toEqual(reviewed);
  });

  it('adds an extra ABI to the built-in one instead of replacing it', () => {
    // A built-in ERC-20 call is still labelled when a policy ABI is supplied as the extra ABI.
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [tx.to, 5n] });
    expect(summarizeWalletCall(approve, policyAccountAbi)).toMatchObject({ name: 'approve', fields: [['spender', tx.to], ['value', '5']] });
  });
});
