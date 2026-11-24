import { useCallback, useLayoutEffect, useRef } from 'react';
import { subscribeAppLock } from './appLock';
import { UserFacingError } from './errors';
import { revokePrivacyReveal } from './privacyMode';
import { captureSessionVersionGuard, subscribeSession } from './session';
import { observeConnectedWallet, type WalletSession } from './wallet';

export interface WalletPrivacyScope {
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
}

export type WalletPrivacyInvalidation = 'wallet' | 'context';

/** View authority only: no keys, history storage, provider requests or broadcast outcomes are erased here. */
export function useWalletPrivacy(wallet: WalletSession | undefined, onInvalidate: (cause: WalletPrivacyInvalidation) => void): {
  readonly capture: () => WalletPrivacyScope;
  readonly begin: () => WalletPrivacyScope;
  readonly invalidate: () => void;
} {
  const mounted = useRef(false);
  const revision = useRef(0);
  const operation = useRef(new AbortController());
  const latest = useRef(onInvalidate);
  latest.current = onInvalidate;

  const rotate = useCallback((): void => {
    revision.current++;
    const previous = operation.current;
    operation.current = new AbortController();
    previous.abort();
  }, []);
  const invalidate = useCallback((cause: WalletPrivacyInvalidation = 'context'): void => {
    if (!mounted.current) return;
    rotate();
    revokePrivacyReveal();
    latest.current(cause);
  }, [rotate]);
  const capture = useCallback((): WalletPrivacyScope => {
    const assertSession = captureSessionVersionGuard();
    const expected = revision.current;
    const controller = operation.current;
    const assertCurrent = (): void => {
      assertSession();
      if (!mounted.current || revision.current !== expected || controller.signal.aborted) {
        throw new UserFacingError({ key: 'error.wallet.theWalletAccountNetworkOrProviderChangedReconnectAndReview' });
      }
    };
    assertCurrent();
    return { signal: controller.signal, assertCurrent };
  }, []);
  const begin = useCallback((): WalletPrivacyScope => {
    // A retained callback must not revive a disposed view or replace a newer pending connection.
    capture().assertCurrent();
    rotate();
    return capture();
  }, [capture, rotate]);

  useLayoutEffect(() => {
    mounted.current = true;
    if (operation.current.signal.aborted) operation.current = new AbortController();
    const unLock = subscribeAppLock(() => { invalidate(); });
    const unSession = subscribeSession(() => { invalidate(); });
    return () => {
      mounted.current = false;
      revision.current++;
      operation.current.abort();
      unLock(); unSession();
    };
  }, [invalidate]);

  useLayoutEffect(() => {
    if (wallet === undefined) return;
    let active = true;
    let stop = (): void => undefined;
    const changed = (): void => {
      if (!active || !mounted.current) return;
      active = false;
      stop();
      invalidate('wallet');
    };
    try {
      stop = observeConnectedWallet(wallet, changed);
      if (!active) stop(); // A provider may synchronously emit while registering a listener.
    } catch { changed(); }
    return () => {
      active = false;
      stop();
      rotate();
    };
  }, [wallet, invalidate, rotate]);

  return { capture, begin, invalidate };
}
