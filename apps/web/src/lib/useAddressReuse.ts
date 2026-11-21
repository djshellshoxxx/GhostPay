import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeAppLock } from './appLock';
import { LocalAddressReuseLedger, type AddressReuseCandidate, type AddressReuseStatus } from './addressReuse';
import { subscribeSession } from './session';
import type { WalletSession } from './wallet';

interface Binding {
  wallet: WalletSession;
  active: boolean;
  detach(): void;
}

/** Keep only the current wallet's local observations; provider events never trigger a network query. */
export function useAddressReuse(): {
  bind(wallet: WalletSession): void;
  inspect(wallet: WalletSession, candidate: AddressReuseCandidate): AddressReuseStatus;
  observeSubmission(wallet: WalletSession, candidate: AddressReuseCandidate): void;
} {
  const [ledger] = useState(() => new LocalAddressReuseLedger());
  const binding = useRef<Binding | undefined>(undefined);
  const mounted = useRef(false);
  const [, setRevision] = useState(0);
  const revoke = useCallback((): void => {
    const previous = binding.current;
    binding.current = undefined;
    if (previous !== undefined) { previous.active = false; previous.detach(); }
    ledger.clear();
    if (mounted.current) setRevision((value) => value + 1);
  }, [ledger]);

  useEffect(() => {
    mounted.current = true;
    const unLock = subscribeAppLock(revoke);
    const unSession = subscribeSession(revoke);
    return () => {
      mounted.current = false;
      unLock(); unSession();
      const previous = binding.current;
      binding.current = undefined;
      if (previous !== undefined) { previous.active = false; previous.detach(); }
      ledger.clear();
    };
  }, [ledger, revoke]);

  const bind = useCallback((wallet: WalletSession): void => {
    if (!mounted.current) return;
    const provider = wallet.wallet.provider;
    const previous = binding.current;
    if (previous?.active === true && previous.wallet.wallet.provider === provider &&
        previous.wallet.chainId === wallet.chainId && previous.wallet.account.toLowerCase() === wallet.account.toLowerCase()) {
      previous.wallet = wallet;
      return;
    }
    revoke();
    // Without reliable event removal this check cannot retain account-scoped history safely.
    let on: typeof provider.on;
    let remove: typeof provider.removeListener;
    try { on = provider.on?.bind(provider); remove = provider.removeListener?.bind(provider); } catch { return; }
    if (typeof on !== 'function' || typeof remove !== 'function') return;
    const attachListener = on;
    const removeListener = remove;
    const events = ['accountsChanged', 'chainChanged', 'disconnect'] as const;
    const current: Binding = { wallet, active: true, detach: () => {
      for (const event of events) {
        try { removeListener.call(provider, event, changed); } catch { /* Revoked callbacks cannot revive history. */ }
      }
    } };
    const changed = (): void => { if (current.active && binding.current === current) revoke(); };
    binding.current = current;
    try {
      for (const event of events) {
        if (!current.active) { current.detach(); return; }
        attachListener.call(provider, event, changed);
      }
      if (current.active && binding.current === current) ledger.bind(wallet);
      else current.detach();
    } catch { revoke(); }
  }, [ledger, revoke]);

  return {
    bind,
    inspect: (wallet, candidate) => binding.current?.active === true && binding.current.wallet === wallet ? ledger.inspect(wallet, candidate) : 'unavailable',
    observeSubmission: (wallet, candidate) => {
      if (binding.current?.active !== true || binding.current.wallet !== wallet) return;
      ledger.observeSubmission(wallet, candidate);
      setRevision((value) => value + 1);
    },
  };
}
