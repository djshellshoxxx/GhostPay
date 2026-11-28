import { useCallback, useLayoutEffect, useRef } from 'react';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { subscribeAppLock } from './appLock';
import { UserFacingError } from './errors';
import { revokePrivacyReveal } from './privacyMode';
import { captureActiveSessionVersionGuard, subscribeSession } from './session';
import { observeConnectedWallet, type WalletSession } from './wallet';

export interface WalletPrivacyScope {
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
}

export type WalletPrivacyInvalidation = 'wallet' | 'context';

/** A captured presentation lease also bounds every follow-up read from its RPC client. */
export function scopeWalletRpc(rpc: RpcClient, scope: WalletPrivacyScope): RpcClient {
  const run = async <T,>(operation: () => Promise<T>): Promise<T> => {
    scope.assertCurrent();
    const result = await operation();
    scope.assertCurrent();
    return result;
  };
  return {
    chainId: rpc.chainId,
    request: (method, params) => run(() => rpc.request(method, params)),
    blockNumber: () => run(() => rpc.blockNumber()),
    getBlock: (number) => run(() => rpc.getBlock(number)),
    getLogs: (filter) => run(() => rpc.getLogs(filter)),
  };
}

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
    // An account, network or provider change also ends a temporary privacy reveal (#286 item 1).
    if (cause === 'wallet') revokePrivacyReveal();
    latest.current(cause);
  }, [rotate]);
  const capture = useCallback((): WalletPrivacyScope => {
    // Expiry can revoke this hook synchronously, even when it leaves an empty session.
    // Capture the presentation lease first so an old callback cannot acquire the next generation.
    const expected = revision.current;
    const controller = operation.current;
    const assertSession = captureActiveSessionVersionGuard();
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
