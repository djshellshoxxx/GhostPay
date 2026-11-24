// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from './appLock';
import { clearSession, suspendSession } from './session';
import { useWalletPrivacy } from './useWalletPrivacy';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import { recheckWallet, type WalletSession } from './wallet';

class EventWallet extends MockWallet {
  public readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void { const set = this.listeners.get(event) ?? new Set<() => void>(); set.add(listener); this.listeners.set(event, set); }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(); }
  public count(): number { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
const session = (provider: MockWallet): WalletSession => ({ wallet: { id: 'fixture', name: 'Fixture', kind: 'injected', provider }, account: MOCK_ACCOUNT, chainId: 84532 });
beforeEach(clearSession);
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

describe('view wallet privacy authority', () => {
  it.each(['accountsChanged', 'chainChanged', 'disconnect'])('revokes on %s and removes listeners synchronously', (event) => {
    const provider = new EventWallet(); const wallet = session(provider); const invalidated = vi.fn();
    const hook = renderHook(() => useWalletPrivacy(wallet, invalidated));
    const scope = hook.result.current.capture();
    expect(provider.count()).toBe(3);
    act(() => { provider.emit(event); });
    expect(scope.signal.aborted).toBe(true); expect(() => scope.assertCurrent()).toThrow();
    expect(provider.count()).toBe(0); expect(invalidated).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['app lock', () => { notifyAppLock('manual'); }],
    ['session clear', clearSession],
    ['session suspension', suspendSession],
  ] as const)('invalidates pending connections on %s', (_name, invalidate) => {
    const invalidated = vi.fn(); const hook = renderHook(() => useWalletPrivacy(undefined, invalidated));
    const scope = hook.result.current.begin(); act(invalidate);
    expect(scope.signal.aborted).toBe(true); expect(() => scope.assertCurrent()).toThrow(); expect(invalidated).toHaveBeenCalledTimes(1);
  });
  it('revokes a request-only wallet as soon as a recheck reports another account', async () => {
    const wallet = session(new MockWallet({ lieAboutAccounts: true }));
    const invalidated = vi.fn();
    const hook = renderHook(() => useWalletPrivacy(wallet, invalidated));
    const scope = hook.result.current.capture();
    await act(async () => { await expect(recheckWallet(wallet)).rejects.toThrow(); });
    expect(invalidated).toHaveBeenCalledOnce();
    expect(scope.signal.aborted).toBe(true);
    expect(() => scope.assertCurrent()).toThrow();
  });
  it('rejects a captured begin after unmount and does not revive a scope', () => {
    const invalidated = vi.fn(); const hook = renderHook(() => useWalletPrivacy(undefined, invalidated));
    const begin = hook.result.current.begin; const scope = begin(); hook.unmount();
    expect(scope.signal.aborted).toBe(true); expect(() => begin()).toThrow(); expect(invalidated).not.toHaveBeenCalled();
  });
  it('replaces an earlier pending connection without allowing it to regain authority', () => {
    const hook = renderHook(() => useWalletPrivacy(undefined, vi.fn()));
    const first = hook.result.current.begin(); const second = hook.result.current.begin();
    expect(first.signal.aborted).toBe(true); expect(() => first.assertCurrent()).toThrow(); expect(() => second.assertCurrent()).not.toThrow();
  });
  it('keeps one live subscription in Strict Mode and removes it at unmount', () => {
    const provider = new EventWallet(); const wallet = session(provider);
    const hook = renderHook(() => useWalletPrivacy(wallet, vi.fn()), { wrapper: ({ children }: { readonly children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    expect(provider.count()).toBe(3); expect(() => hook.result.current.capture().assertCurrent()).not.toThrow();
    hook.unmount(); expect(provider.count()).toBe(0);
  });
  it.each(['throws', 'emits'] as const)('cleans up when provider registration %s synchronously', (kind) => {
    const provider = new EventWallet(); const on = provider.on.bind(provider);
    provider.on = (event, listener) => { on(event, listener); if (event === 'chainChanged') { if (kind === 'throws') throw new Error('fixture'); listener(); } };
    const invalidated = vi.fn(); const wallet = session(provider);
    renderHook(() => useWalletPrivacy(wallet, invalidated));
    expect(invalidated).toHaveBeenCalledTimes(1); expect(provider.count()).toBe(0);
  });
  it('makes orphaned callbacks inert when provider removal fails', () => {
    const provider = new EventWallet(); const wallet = session(provider); const invalidated = vi.fn();
    provider.removeListener = () => { throw new Error('fixture removal failure'); };
    const hook = renderHook(() => useWalletPrivacy(wallet, invalidated)); hook.unmount();
    act(() => { provider.emit('disconnect'); notifyAppLock('manual'); });
    expect(invalidated).not.toHaveBeenCalled();
  });
});
