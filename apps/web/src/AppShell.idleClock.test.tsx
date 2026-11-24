// @vitest-environment jsdom
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLean } from './AppLean';
import { subscribeAppLock } from './lib/appLock';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from './lib/keyVault';
import { clearSession, generateSession, hasSession, importSession } from './lib/session';
import { SETTINGS_KEY } from './lib/settings';
import { makeServices, renderWith, setHash } from './test/render';

let wall: number;
let monotonic: number;
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  clearSession();
  localStorage.clear();
  setHash('');
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
  wall = 1_000_000;
  monotonic = 1000;
  vi.useFakeTimers();
  vi.spyOn(Date, 'now').mockImplementation(() => wall);
  vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
});

afterEach(() => {
  cleanup();
  unsubscribe?.();
  unsubscribe = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  setKeyVaultStoreForTests(undefined);
});

function armed(recoverable = true): { reasons: string[]; services: ReturnType<typeof makeServices> } {
  if (recoverable) importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
  else generateSession();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
  const reasons: string[] = [];
  unsubscribe = subscribeAppLock((reason) => { reasons.push(reason); });
  const services = makeServices();
  renderWith(<AppLean />, services);
  return { reasons, services };
}

async function resume(event: 'pageshow' | 'focus' | 'pointerdown' | 'keydown' | 'visibilitychange'): Promise<void> {
  await act(async () => {
    if (event === 'visibilitychange') document.dispatchEvent(new Event(event));
    else fireEvent(window, new Event(event));
    await Promise.resolve();
  });
}

describe('GP-PAGES-04: idle deadlines across independent clock changes', () => {
  it.each(['pageshow', 'focus', 'visibilitychange', 'pointerdown', 'keydown'] as const)(
    'locks before %s can resume activity after wall-clock rollback with suspended timers',
    async (event) => {
      const { reasons } = armed();
      wall -= 60_000;
      // Some platforms pause the monotonic clock during sleep too. Clock rollback itself must fail closed.
      await resume(event);
      expect(reasons).toEqual(['idle']);
      expect(hasSession()).toBe(false);
    },
  );

  it('locks on monotonic expiry even when wall time stays after its initial value but below the deadline', async () => {
    const { reasons } = armed();
    wall += 30_000;
    monotonic += 60_000;
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('detects rollback since the last lifecycle check, even above the last activity timestamp', async () => {
    const { reasons } = armed();
    wall += 30_000;
    monotonic += 30_000;
    await resume('focus');
    expect(reasons).toEqual([]);
    wall -= 1000;
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('uses wall time when both ordinary timers and the monotonic clock pause during sleep', async () => {
    const { reasons } = armed();
    wall += 60_000;
    await resume('visibilitychange');
    await resume('focus');
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('resets both clocks only for activity before expiry', async () => {
    const { reasons } = armed();
    wall += 45_000;
    monotonic += 45_000;
    await resume('pointerdown');
    wall += 45_000;
    monotonic += 45_000;
    await resume('focus');
    expect(reasons).toEqual([]);
    expect(hasSession()).toBe(true);
    monotonic += 15_000;
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('keeps an unbacked-up key copy while still signalling the lock on clock rollback', async () => {
    const { reasons } = armed(false);
    wall -= 1000;
    await resume('focus');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(true);
  });
});
