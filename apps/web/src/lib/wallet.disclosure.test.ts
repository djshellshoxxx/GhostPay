import { describe, expect, it, vi } from 'vitest';
import { erc20Abi } from '@ghostpay/chain-adapters';
import { encodeFunctionData } from 'viem/utils';
import { MockWallet } from '../test/mockWallet';
import { connectWallet, sendViaWallet, signTypedDataViaWallet, walletAttemptKey, type Eip1193Provider, type TxRequest, type WalletAttemptOptions, type WalletInfo, type WalletSession } from './wallet';
import { readAttempts, type AttemptStorage } from './duplicateAttemptJournal';
import { WalletDisclosureController } from './walletDisclosure';

interface Approval { assertCurrent(): void }
type Gate = (request: unknown, signal?: AbortSignal) => Promise<Approval>;
type ConnectWithDisclosure = (
  wallet: WalletInfo, chainId: number, assertCurrent?: () => void, signal?: AbortSignal,
  options?: { readonly disclosure: Gate },
) => Promise<WalletSession>;
const connectWithDisclosure = connectWallet as ConnectWithDisclosure;
const info = (provider: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock', kind: 'injected', provider });
const tx = { to: '0x1111111111111111111111111111111111111111', data: '0xdeadbeef', value: 10n } as const;
const decline: Gate = () => Promise.reject(new Error('Disclosure cancelled'));

function presenter(): WalletDisclosureController {
  const controller = new WalletDisclosureController();
  controller.mount();
  controller.allowPresentation(true);
  return controller;
}
function approve(controller: WalletDisclosureController): void {
  const pending = controller.getSnapshot();
  expect(pending).toBeDefined();
  if (pending !== undefined) controller.approve(pending);
}
class EventWallet extends MockWallet {
  public readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void {
    const listeners = this.listeners.get(event) ?? new Set<() => void>();
    listeners.add(listener); this.listeners.set(event, listeners);
  }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of this.listeners.get(event) ?? []) listener(); }
  public countListeners(): number { return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0); }
}
function store(): AttemptStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('wallet privacy disclosure before authority leaves the application', () => {
  it('waits for account-access disclosure and sends nothing when declined', async () => {
    const provider = new MockWallet();
    await expect(connectWithDisclosure(info(provider), 84532, undefined, undefined, { disclosure: decline })).rejects.toThrow('Disclosure cancelled');
    expect(provider.calls).toEqual([]);
  });

  it.each(['accountsChanged', 'chainChanged'])('refuses a %s event between closing the connection preview and invoking the wallet', async (event) => {
    const provider = new EventWallet();
    const remove = provider.removeListener.bind(provider);
    let closingReview = true;
    provider.removeListener = (name, listener) => {
      remove(name, listener);
      if (closingReview) {
        closingReview = false;
        provider.emit(event);
      }
    };
    const controller = presenter();
    const operation = connectWallet(info(provider), 84532, undefined, undefined, { disclosure: controller.request });
    approve(controller);
    await expect(operation).rejects.toThrow(/changed/i);
    expect(provider.calls).toEqual([]);
    expect(provider.countListeners()).toBe(0);
  });

  it('reports the actual token approval and only signals handoff when the wallet receives it', async () => {
    const provider = new MockWallet({ rejectSend: true });
    const controller = presenter();
    const session = { ...await connectWallet(info(provider), 84532), disclosure: controller.request };
    provider.calls.length = 0;
    const amount = (1n << 200n) + 1n;
    const spender = '0x2222222222222222222222222222222222222222';
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
    const transaction = { ...tx, data, value: 0n };
    const onWalletRequest = vi.fn(() => provider.calls.at(-1)?.method);
    const options = { kind: 'approval' as const, storage: store(), onWalletRequest };
    const cancelled = sendViaWallet(session, transaction, undefined, options);
    expect(onWalletRequest).not.toHaveBeenCalled();
    controller.revoke();
    await expect(cancelled).rejects.toThrow(/cancelled/);
    expect(onWalletRequest).not.toHaveBeenCalled();
    const operation = sendViaWallet(session, transaction, undefined, options);
    const preview = controller.getSnapshot()!.request;
    expect(preview).toMatchObject({ nativeValueWei: '0', destination: tx.to, contractCall: {
      name: 'approve', fields: [['spender', spender], ['value', amount.toString()]],
    } });
    expect(provider.calls).toEqual([]);
    transaction.value = 99n;
    approve(controller);
    await expect(operation).rejects.toMatchObject({ rpcCode: 4001 });
    expect(onWalletRequest).toHaveReturnedWith('eth_sendTransaction');
    expect(onWalletRequest).toHaveBeenCalledTimes(1);
    expect(provider.calls.at(-1)).toEqual(JSON.parse(preview.requestJson));
    expect(provider.sent).toBeUndefined();
  });

  it('refuses the transaction before provider reads or sends when disclosure is declined', async () => {
    const provider = new MockWallet();
    const session = { ...await connectWallet(info(provider), 84532), disclosure: decline };
    provider.calls.length = 0;
    await expect(sendViaWallet(session, tx)).rejects.toThrow('Disclosure cancelled');
    expect(provider.calls).toEqual([]);
    expect(provider.sent).toBeUndefined();
  });

  it('refuses the signature before provider reads or signs when disclosure is declined', async () => {
    const provider = new MockWallet();
    const session = { ...await connectWallet(info(provider), 84532), disclosure: decline };
    provider.calls.length = 0;
    await expect(signTypedDataViaWallet(session, '{"primaryType":"Permit","message":{"value":"10"}}')).rejects.toThrow('Disclosure cancelled');
    expect(provider.calls).toEqual([]);
  });

  it('submits the reviewed permit verbatim, and a revoked first review cannot sign its replacement', async () => {
    const provider = new EventWallet();
    const controller = presenter();
    const session = { ...await connectWallet(info(provider), 84532), disclosure: controller.request };
    provider.calls.length = 0;
    const json = JSON.stringify({ primaryType: 'Permit', domain: { chainId: 84532, verifyingContract: tx.to },
      message: { spender: tx.to, value: '9007199254740993' } });
    const stale = signTypedDataViaWallet(session, json);
    const oldPreview = controller.getSnapshot()!;
    provider.emit('chainChanged');
    await expect(stale).rejects.toThrow(/cancelled/);
    const current = signTypedDataViaWallet(session, json);
    controller.approve(oldPreview);
    expect(provider.calls).toEqual([]);
    const preview = controller.getSnapshot()!.request;
    expect(preview).toMatchObject({ account: provider.account, chainId: 84532, destination: tx.to, typedAmount: '9007199254740993' });
    approve(controller);
    await expect(current).resolves.toMatch(/^0x/);
    expect(provider.calls.at(-1)).toEqual(JSON.parse(preview.requestJson));
    expect(provider.calls.map(({ method }) => method)).toEqual(['eth_accounts', 'eth_chainId', 'net_version', 'eth_accounts', 'eth_signTypedData_v4']);
  });

  it('requires a separate immutable chain-switch decision and adds no preview RPC', async () => {
    const provider = new EventWallet({ chainId: 1 }); const controller = presenter();
    const operation = connectWallet(info(provider), 84532, undefined, undefined, { disclosure: controller.request });
    expect(provider.calls).toEqual([]);
    approve(controller);
    await vi.waitFor(() => { expect(controller.getSnapshot()?.request.method).toBe('wallet_switchEthereumChain'); });
    expect(provider.calls.map((call) => call.method)).toEqual(['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'net_version']);
    const preview = controller.getSnapshot()!.request.requestJson;
    approve(controller);
    const session = await operation;
    const actual = provider.calls.find((call) => call.method === 'wallet_switchEthereumChain');
    expect(JSON.parse(preview)).toEqual(actual);
    // Main's connection keeps its call sequence; recheckWallet re-reads the account before every later send or signature.
    expect(provider.calls.map((call) => call.method)).toEqual(['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'net_version', 'wallet_switchEthereumChain', 'eth_chainId', 'net_version']);
    expect(session.disclosure).toBe(controller.request);
    expect(provider.countListeners()).toBe(0);
  });

  it('preserves separate consent while accepting expected permission and requested switch events', async () => {
    const provider = new EventWallet({ chainId: 1 });
    const original = provider.request.bind(provider);
    provider.request = async (args) => {
      const result = await original(args);
      if (args.method === 'eth_requestAccounts') provider.emit('accountsChanged');
      if (args.method === 'wallet_switchEthereumChain') provider.emit('chainChanged');
      return result;
    };
    const controller = presenter();
    const operation = connectWallet(info(provider), 84532, undefined, undefined, { disclosure: controller.request });
    expect(provider.calls).toEqual([]);
    approve(controller);
    await vi.waitFor(() => { expect(controller.getSnapshot()?.request.method).toBe('wallet_switchEthereumChain'); });
    expect(provider.calls.some((call) => call.method === 'wallet_switchEthereumChain')).toBe(false);
    approve(controller);
    await expect(operation).resolves.toMatchObject({ account: provider.account, chainId: 84532, disclosure: controller.request });
    expect(provider.calls.at(-1)?.method).toBe('net_version');
    expect(provider.countListeners()).toBe(0);
  });

  it('cancels pending account disclosure on provider events and releases listeners', async () => {
    const provider = new EventWallet(); const controller = presenter();
    const operation = connectWallet(info(provider), 84532, undefined, undefined, { disclosure: controller.request });
    const rejected = expect(operation).rejects.toThrow(/cancelled/);
    provider.emit('accountsChanged');
    await rejected;
    expect(provider.calls).toEqual([]);
    expect(controller.getSnapshot()).toBeUndefined();
    expect(provider.countListeners()).toBe(0);
  });

  it.each([
    ['transaction', 'on'], ['transaction', 'removeListener'],
    ['signature', 'on'], ['signature', 'removeListener'],
  ] as const)('refuses %s when the provider loses its %s monitoring method before review', async (action, missing) => {
    const original = new EventWallet();
    const connected = await connectWallet(info(original), 84532);
    const provider: Eip1193Provider = {
      request: original.request.bind(original),
      ...(missing === 'on' ? {} : { on: original.on.bind(original) }),
      ...(missing === 'removeListener' ? {} : { removeListener: original.removeListener.bind(original) }),
    };
    const gate = vi.fn(decline);
    const session = { ...connected, wallet: { ...connected.wallet, provider }, disclosure: gate };
    original.calls.length = 0;
    await expect(action === 'transaction' ? sendViaWallet(session, tx) : signTypedDataViaWallet(session, '{}')).rejects.toThrow(/monitored/i);
    expect(gate).not.toHaveBeenCalled();
    expect(original.calls).toEqual([]);
    expect(original.countListeners()).toBe(0);
  });

  it.each(['transaction', 'signature'] as const)('cleans partial %s monitoring before any disclosure or provider call', async (action) => {
    const provider = new EventWallet();
    const connected = await connectWallet(info(provider), 84532);
    const register = provider.on.bind(provider);
    provider.on = (event, listener) => {
      register(event, listener);
      if (event === 'chainChanged') throw new Error('Registration failed after subscribing.');
    };
    const gate = vi.fn(decline);
    const session = { ...connected, disclosure: gate };
    provider.calls.length = 0;
    await expect(action === 'transaction' ? sendViaWallet(session, tx) : signTypedDataViaWallet(session, '{}')).rejects.toThrow(/monitored/i);
    expect(gate).not.toHaveBeenCalled();
    expect(provider.calls).toEqual([]);
    expect(provider.countListeners()).toBe(0);
  });

  it('makes provider callbacks inert before reentrant cleanup and preserves the submitted journal', async () => {
    const provider = new EventWallet();
    const connected = await connectWallet(info(provider), 84532);
    const controller = presenter();
    const session = { ...connected, disclosure: controller.request };
    const storage = store();
    const retained: (() => void)[] = [];
    const unregister = provider.removeListener.bind(provider);
    provider.removeListener = (event, listener) => {
      retained.push(listener);
      listener();
      unregister(event, listener);
    };
    const abort = vi.spyOn(AbortController.prototype, 'abort');
    try {
      const operation = sendViaWallet(session, tx, undefined, { kind: 'transaction', storage });
      approve(controller);
      const hash = await operation;
      expect(hash).toBe(`0x${'9'.repeat(64)}`);
      expect(readAttempts(storage)).toMatchObject([{ status: 'submitted', hash }]);
      expect(provider.countListeners()).toBe(0);
      expect(abort).toHaveBeenCalledTimes(1);
      for (const callback of retained) callback();
      expect(abort).toHaveBeenCalledTimes(1);
    } finally { abort.mockRestore(); }
  });

  it('sends and journals the captured request even if the caller edits its objects while reviewing', async () => {
    const provider = new MockWallet(); const controller = presenter();
    const session = { ...await connectWallet(info(provider), 84532), disclosure: controller.request };
    const mutable: { to: TxRequest['to']; data: TxRequest['data']; value: bigint } = { ...tx };
    const storage = store();
    const options: { kind: WalletAttemptOptions['kind']; scope: string; storage: AttemptStorage } = { kind: 'approval', scope: 'original', storage };
    const key = walletAttemptKey(session, tx, options);
    provider.calls.length = 0;
    const operation = sendViaWallet(session, mutable, undefined, options);
    const preview = controller.getSnapshot()!.request.requestJson;
    mutable.to = '0x2222222222222222222222222222222222222222'; mutable.data = '0x1234'; mutable.value = 99n;
    options.kind = 'payment'; options.scope = 'changed';
    expect(provider.calls).toEqual([]); expect(readAttempts(storage)).toEqual([]);
    approve(controller); await operation;
    const sent = provider.calls.find((call) => call.method === 'eth_sendTransaction');
    expect(JSON.parse(preview)).toEqual(sent);
    expect(provider.sent).toMatchObject({ to: tx.to, data: tx.data, value: '0xa' });
    expect(readAttempts(storage)).toMatchObject([{ key, kind: 'approval', status: 'submitted' }]);
    expect(provider.calls.map((call) => call.method)).toEqual(['eth_accounts', 'eth_chainId', 'net_version', 'eth_accounts', 'eth_sendTransaction']);
  });

  it('cancelling transaction review neither touches the duplicate journal nor calls the provider', async () => {
    const provider = new MockWallet(); const controller = presenter();
    const session = { ...await connectWallet(info(provider), 84532), disclosure: controller.request };
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    provider.calls.length = 0;
    const operation = sendViaWallet(session, tx, undefined, { kind: 'transaction', storage });
    const rejected = expect(operation).rejects.toThrow(/cancelled/);
    controller.revoke(); await rejected;
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
    expect(provider.calls).toEqual([]);
  });

  it.each(['accountsChanged', 'chainChanged', 'disconnect'])('cancels transaction review on %s without any wallet call', async (event) => {
    const provider = new EventWallet(); const controller = presenter();
    const session = { ...await connectWallet(info(provider), 84532), disclosure: controller.request };
    provider.calls.length = 0;
    const operation = sendViaWallet(session, tx);
    const rejected = expect(operation).rejects.toThrow(/cancelled/);
    provider.emit(event); await rejected;
    expect(provider.calls).toEqual([]); expect(provider.countListeners()).toBe(0);
  });

  it('rechecks application authority after approval before the first provider read', async () => {
    const provider = new MockWallet(); const controller = presenter();
    const session = { ...await connectWallet(info(provider), 84532), disclosure: controller.request };
    provider.calls.length = 0;
    let current = true;
    const operation = sendViaWallet(session, tx, () => { if (!current) throw new Error('Authority changed'); });
    const rejected = expect(operation).rejects.toThrow('Authority changed');
    current = false; approve(controller); await rejected;
    expect(provider.calls).toEqual([]);
  });

  it('an approved signature cannot continue after the host is revoked during the wallet recheck', async () => {
    const provider = new MockWallet(); const controller = presenter();
    const connected = await connectWallet(info(provider), 84532);
    const session = { ...connected, disclosure: controller.request, wallet: { ...connected.wallet, provider: {
      request: async (args: Parameters<MockWallet['request']>[0]) => {
        const answer = await provider.request(args);
        controller.revoke();
        return answer;
      },
    } } };
    provider.calls.length = 0;
    const operation = signTypedDataViaWallet(session, '{}');
    const rejected = expect(operation).rejects.toThrow(/cancelled/);
    approve(controller); await rejected;
    expect(provider.calls.map((call) => call.method)).toEqual(['eth_accounts']);
  });

  it('preserves and journals a returned transaction hash even if the host closes after submission starts', async () => {
    const provider = new MockWallet(); const controller = presenter();
    const connected = await connectWallet(info(provider), 84532);
    const storage = store();
    const session = { ...connected, disclosure: controller.request, wallet: { ...connected.wallet, provider: {
      request: async (args: Parameters<MockWallet['request']>[0]) => {
        const answer = await provider.request(args);
        if (args.method === 'eth_sendTransaction') controller.revoke();
        return answer;
      },
    } } };
    const operation = sendViaWallet(session, tx, undefined, { kind: 'transaction', storage });
    approve(controller);
    const hash = await operation;
    expect(hash).toBe(`0x${'9'.repeat(64)}`);
    expect(readAttempts(storage)).toMatchObject([{ status: 'submitted', hash }]);
  });
});
