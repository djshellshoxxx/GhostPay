import { describe, expect, it, vi } from 'vitest';
import { notifyAppLock, subscribeAppLock } from './appLock';

describe('app lock signal', () => {
  it('reaches every subscriber with the reason until it unsubscribes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeAppLock(a);
    const offB = subscribeAppLock(b);
    notifyAppLock('idle');
    expect(a).toHaveBeenCalledWith('idle');
    expect(b).toHaveBeenCalledWith('idle');
    offA();
    notifyAppLock('manual');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenLastCalledWith('manual');
    offB();
    offB();
    notifyAppLock('idle');
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('still locks the other views when one listener throws or unsubscribes while locking', () => {
    const after = vi.fn();
    const offFailing = subscribeAppLock(() => {
      throw new Error('view failed to lock');
    });
    let offSelf: () => void = () => undefined;
    offSelf = subscribeAppLock(() => {
      offSelf();
    });
    const offAfter = subscribeAppLock(after);
    expect(() => {
      notifyAppLock('idle');
    }).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    offFailing();
    offAfter();
  });
});
