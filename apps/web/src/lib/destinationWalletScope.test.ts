// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { watchDestinationWallet } from './destinationWalletScope';

describe('wallet scope for destination review', () => {
  it.each(['request-only', 'unreliable listeners'])('compares during the connected visit for a %s wallet and expires it on blur', (kind) => {
    const invalidate = vi.fn();
    const request = vi.fn();
    const removeListener = vi.fn();
    const stop = watchDestinationWallet(kind === 'request-only' ? { request } : {
      request, on: () => { throw new Error('unavailable'); }, removeListener,
    }, invalidate);
    expect(invalidate).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('blur'));
    expect(invalidate).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new Event('pagehide'));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it('uses provider events even when the tab stays focused and removes its listeners', () => {
    const events = new EventTarget();
    const invalidate = vi.fn();
    const stop = watchDestinationWallet({
      request: vi.fn(), on: (event, f) => events.addEventListener(event, f),
      removeListener: (event, f) => events.removeEventListener(event, f),
    }, invalidate);
    window.dispatchEvent(new Event('blur'));
    expect(invalidate).not.toHaveBeenCalled();
    for (const name of ['accountsChanged', 'chainChanged', 'disconnect']) events.dispatchEvent(new Event(name));
    expect(invalidate).toHaveBeenCalledTimes(3);
    stop();
    events.dispatchEvent(new Event('accountsChanged'));
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
});
