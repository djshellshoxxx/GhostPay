import { describe, expect, it } from 'vitest';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import { connectWallet, type WalletInfo } from './wallet';

class EventWallet extends MockWallet {
  public readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void {
    const set = this.listeners.get(event) ?? new Set<() => void>();
    set.add(listener); this.listeners.set(event, set);
  }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(); }
  public count(): number { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
const info = (wallet: MockWallet): WalletInfo => ({ id: 'test', name: 'Test', kind: 'injected', provider: wallet });

describe('wallet connection lifecycle', () => {
  it('does not read or switch after a pending account request is aborted', async () => {
    const wallet = new EventWallet({ chainId: 1 });
    const original = wallet.request.bind(wallet);
    let release!: (value: unknown) => void;
    const held = new Promise<unknown>((resolve) => { release = resolve; });
    wallet.request = (args) => args.method === 'eth_requestAccounts' ? held : original(args);
    const controller = new AbortController();
    const result = connectWallet(info(wallet), 84532, undefined, controller.signal);
    controller.abort(); release([MOCK_ACCOUNT]);
    await expect(result).rejects.toThrow();
    expect(wallet.calls).toHaveLength(0);
    expect(wallet.count()).toBe(0);
  });
  it('checks caller authority before a chain switch after delayed network consistency', async () => {
    const wallet = new EventWallet({ chainId: 1 });
    const original = wallet.request.bind(wallet);
    let current = true;
    wallet.request = (args) => { if (args.method === 'net_version') current = false; return original(args); };
    const assertCurrent = (): void => { if (!current) throw new Error('fixture revoked'); };
    await expect(connectWallet(info(wallet), 84532, assertCurrent)).rejects.toThrow('fixture revoked');
    expect(wallet.calls.some((call) => call.method === 'wallet_switchEthereumChain')).toBe(false);
    expect(wallet.count()).toBe(0);
  });
  it('detects an account changed silently during the expected chain switch', async () => {
    const wallet = new EventWallet({ chainId: 1 });
    const original = wallet.request.bind(wallet);
    let switched = false;
    wallet.request = (args) => {
      if (args.method === 'wallet_switchEthereumChain') switched = true;
      if (args.method === 'eth_accounts' && switched) return Promise.resolve(['0x6666666666666666666666666666666666666666']);
      return original(args);
    };
    await expect(connectWallet(info(wallet), 84532)).rejects.toThrow(/account/i);
    expect(wallet.count()).toBe(0);
  });
  it('allows initial account permission events and the requested chain-switch event', async () => {
    const wallet = new EventWallet({ chainId: 1 });
    const original = wallet.request.bind(wallet);
    wallet.request = async (args) => {
      const result = await original(args);
      if (args.method === 'eth_requestAccounts') wallet.emit('accountsChanged');
      if (args.method === 'wallet_switchEthereumChain') wallet.emit('chainChanged');
      return result;
    };
    await expect(connectWallet(info(wallet), 84532)).resolves.toMatchObject({ account: MOCK_ACCOUNT, chainId: 84532 });
    expect(wallet.count()).toBe(0);
  });
  it('rejects a disconnect while checking the returned account', async () => {
    const wallet = new EventWallet();
    const original = wallet.request.bind(wallet);
    wallet.request = (args) => { if (args.method === 'eth_accounts') wallet.emit('disconnect'); return original(args); };
    await expect(connectWallet(info(wallet), 84532)).rejects.toThrow();
    expect(wallet.calls.some((call) => call.method === 'eth_chainId')).toBe(false);
    expect(wallet.count()).toBe(0);
  });
  it('removes partially registered listeners when monitoring throws', async () => {
    const wallet = new EventWallet();
    const on = wallet.on.bind(wallet);
    wallet.on = (event, listener) => { on(event, listener); if (event === 'chainChanged') throw new Error('fixture registration failure'); };
    await expect(connectWallet(info(wallet), 84532)).rejects.toThrow(/monitored/i);
    expect(wallet.count()).toBe(0);
  });
});
