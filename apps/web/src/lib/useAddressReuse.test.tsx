// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from './appLock';
import { clearSession } from './session';
import { useAddressReuse } from './useAddressReuse';
import type { Eip1193Provider, WalletSession } from './wallet';

const candidate = { destination: '0x7777777777777777777777777777777777777777', paymentId: '1'.repeat(64) };
const another = { ...candidate, paymentId: '2'.repeat(64) };

function providerFixture(): { provider: Eip1193Provider; request: ReturnType<typeof vi.fn>; emit(event: string): void; count(): number } {
  const listeners = new Map<string, Set<() => void>>();
  const request = vi.fn(() => Promise.resolve(null));
  return {
    request,
    provider: {
      request,
      on: (event, listener) => { const group = listeners.get(event) ?? new Set(); group.add(listener); listeners.set(event, group); },
      removeListener: (event, listener) => { listeners.get(event)?.delete(listener); },
    },
    emit: (event) => { for (const listener of [...listeners.get(event) ?? []]) listener(); },
    count: () => [...listeners.values()].reduce((count, group) => count + group.size, 0),
  };
}

function session(provider: Eip1193Provider): WalletSession {
  return { wallet: { id: 'wallet', name: 'Test wallet', kind: 'injected', provider }, chainId: 84532, account: '0x5555555555555555555555555555555555555555' };
}

afterEach(() => { cleanup(); clearSession(); });

describe('address reuse lifecycle', () => {
  it('records only explicitly submitted destinations and performs no provider requests', () => {
    const fixture = providerFixture(); const wallet = session(fixture.provider);
    const { result } = renderHook(() => useAddressReuse());
    act(() => { result.current.bind(wallet); });
    expect(result.current.inspect(wallet, candidate)).toBe('not-observed');
    expect(result.current.inspect(wallet, another)).toBe('not-observed');
    act(() => { result.current.observeSubmission(wallet, candidate); });
    expect(result.current.inspect(wallet, another)).toBe('reused');
    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.count()).toBe(3);
  });

  it('retains observations for a new connection object with the same provider and account', () => {
    const fixture = providerFixture(); const wallet = session(fixture.provider);
    const { result } = renderHook(() => useAddressReuse());
    act(() => { result.current.bind(wallet); result.current.observeSubmission(wallet, candidate); });
    const reconnected = session(fixture.provider);
    act(() => { result.current.bind(reconnected); });
    expect(result.current.inspect(reconnected, another)).toBe('reused');
    expect(result.current.inspect(wallet, another)).toBe('unavailable');
    expect(fixture.count()).toBe(3);
  });

  it.each(['accountsChanged', 'chainChanged', 'disconnect'])('revokes immediately on %s and ignores late old callbacks', (event) => {
    const fixture = providerFixture(); const wallet = session(fixture.provider);
    const { result } = renderHook(() => useAddressReuse());
    act(() => { result.current.bind(wallet); result.current.observeSubmission(wallet, candidate); });
    act(() => { fixture.emit(event); result.current.observeSubmission(wallet, another); });
    expect(result.current.inspect(wallet, another)).toBe('unavailable');
    expect(fixture.count()).toBe(0);
    act(() => { result.current.bind(wallet); });
    expect(result.current.inspect(wallet, another)).toBe('not-observed');
  });

  it.each(['lock', 'session'])('clears observations on %s', (event) => {
    const fixture = providerFixture(); const wallet = session(fixture.provider);
    const { result } = renderHook(() => useAddressReuse());
    act(() => { result.current.bind(wallet); result.current.observeSubmission(wallet, candidate); });
    act(() => { if (event === 'lock') notifyAppLock('manual'); else clearSession(); });
    expect(result.current.inspect(wallet, another)).toBe('unavailable');
    expect(fixture.count()).toBe(0);
  });

  it('detaches old providers, clears account changes and releases listeners on unmount', () => {
    const first = providerFixture(); const second = providerFixture();
    const { result, unmount } = renderHook(() => useAddressReuse());
    const original = session(first.provider);
    act(() => { result.current.bind(original); result.current.observeSubmission(original, candidate); });
    const replacement = session(second.provider);
    act(() => { result.current.bind(replacement); });
    expect(result.current.inspect(replacement, another)).toBe('not-observed');
    expect(first.count()).toBe(0);
    unmount();
    expect(second.count()).toBe(0);
    expect(first.request).not.toHaveBeenCalled();
    expect(second.request).not.toHaveBeenCalled();
  });

  it('does not retain observations when provider lifecycle subscriptions are unavailable', () => {
    const wallet = session({ request: vi.fn(() => Promise.resolve(null)) });
    const { result } = renderHook(() => useAddressReuse());
    act(() => { result.current.bind(wallet); result.current.observeSubmission(wallet, candidate); });
    expect(result.current.inspect(wallet, candidate)).toBe('unavailable');
  });

  it('does not let a captured connection callback restore listeners after unmount', () => {
    const fixture = providerFixture(); const wallet = session(fixture.provider);
    const { result, unmount } = renderHook(() => useAddressReuse());
    const captured = result.current;
    act(() => { captured.bind(wallet); captured.observeSubmission(wallet, candidate); });
    unmount();
    act(() => { captured.bind(wallet); captured.observeSubmission(wallet, candidate); });
    expect(captured.inspect(wallet, another)).toBe('unavailable');
    expect(fixture.count()).toBe(0);
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it('binds normally after the Strict Mode setup and cleanup cycle', () => {
    const fixture = providerFixture(); const wallet = session(fixture.provider);
    const { result, unmount } = renderHook(() => useAddressReuse(), { wrapper: StrictMode });
    act(() => { result.current.bind(wallet); result.current.observeSubmission(wallet, candidate); });
    expect(result.current.inspect(wallet, another)).toBe('reused');
    expect(fixture.count()).toBe(3);
    unmount();
    expect(fixture.count()).toBe(0);
  });

  it('detaches partial subscriptions when provider registration throws', () => {
    const fixture = providerFixture();
    const wallet = session({ ...fixture.provider, on: (event, listener) => {
      fixture.provider.on?.(event, listener);
      if (event === 'chainChanged') throw new Error('Registration unavailable');
    } });
    const { result } = renderHook(() => useAddressReuse());
    act(() => { result.current.bind(wallet); result.current.observeSubmission(wallet, candidate); });
    expect(result.current.inspect(wallet, another)).toBe('unavailable');
    expect(fixture.count()).toBe(0);
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it.each(['accountsChanged', 'chainChanged', 'disconnect'])('keeps a synchronous %s event during registration revoked', (changedEvent) => {
    const fixture = providerFixture();
    const wallet = session({ ...fixture.provider, on: (event, listener) => {
      fixture.provider.on?.(event, listener);
      if (event === changedEvent) fixture.emit(event);
    } });
    const { result } = renderHook(() => useAddressReuse());
    act(() => { result.current.bind(wallet); result.current.observeSubmission(wallet, candidate); });
    expect(result.current.inspect(wallet, another)).toBe('unavailable');
    expect(fixture.count()).toBe(0);
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it('keeps callbacks inert if the old provider refuses listener removal', () => {
    const first = providerFixture(); const replacement = providerFixture();
    const original = session({ ...first.provider, removeListener: () => { throw new Error('Removal unavailable'); } });
    const current = session(replacement.provider);
    const { result } = renderHook(() => useAddressReuse());
    act(() => { result.current.bind(original); result.current.observeSubmission(original, candidate); });
    act(() => { first.emit('disconnect'); result.current.bind(current); result.current.observeSubmission(current, candidate); });
    act(() => { first.emit('accountsChanged'); result.current.observeSubmission(original, another); });
    expect(result.current.inspect(original, another)).toBe('unavailable');
    expect(result.current.inspect(current, another)).toBe('reused');
    expect(replacement.count()).toBe(3);
    expect(first.request).not.toHaveBeenCalled();
    expect(replacement.request).not.toHaveBeenCalled();
  });
});
