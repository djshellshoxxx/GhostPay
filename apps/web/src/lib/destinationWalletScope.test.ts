import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchDestinationWallet } from './destinationWalletScope';

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('wallet scope for destination review', () => {
  it.each(['request-only', 'unreliable listeners'])('compares during the connected visit for a %s wallet and expires it when the page is left', (kind) => {
    const invalidate = vi.fn();
    const request = vi.fn();
    const removeListener = vi.fn();
    const stop = watchDestinationWallet(kind === 'request-only' ? { request } : {
      request, on: () => { throw new Error('unavailable'); }, removeListener,
    }, invalidate);
    expect(invalidate).not.toHaveBeenCalled();
    // The wallet's own signing popup takes focus: that is not leaving the page.
    window.dispatchEvent(new Event('blur'));
    expect(invalidate).not.toHaveBeenCalled();
    // A visible-state change without hiding does not count either.
    document.dispatchEvent(new Event('visibilitychange'));
    expect(invalidate).not.toHaveBeenCalled();
    (document as unknown as { hidden: boolean }).hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(invalidate).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pagehide'));
    expect(invalidate).toHaveBeenCalledTimes(2);
    stop();
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(invalidate).toHaveBeenCalledTimes(2);
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
