// @vitest-environment jsdom
import fc from 'fast-check';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { notifyAppLock } from './appLock';
import { clearSession, generateSession, suspendSession } from './session';
import { useWalletPrivacy, type WalletPrivacyInvalidation, type WalletPrivacyScope } from './useWalletPrivacy';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import type { WalletSession } from './wallet';

// Light model-based fuzz of presentation generations: random session/lock events, wallet swaps (including A -> B -> A
// with the very same session objects), provider events and new pending operations, interleaved with deferred callbacks
// that hold scopes from earlier generations. Fixed seed for reproducible failures.
const RUNS = { seed: 0x57505246, numRuns: 300 } as const;

class EventWallet extends MockWallet {
  public readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void { const set = this.listeners.get(event) ?? new Set<() => void>(); set.add(listener); this.listeners.set(event, set); }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(); }
  public count(): number { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

type Op =
  | { readonly op: 'capture' } | { readonly op: 'begin' }
  | { readonly op: 'lock' } | { readonly op: 'clear' } | { readonly op: 'load' } | { readonly op: 'suspend' }
  | { readonly op: 'emit'; readonly event: 'accountsChanged' | 'chainChanged' | 'disconnect'; readonly target: 0 | 1 }
  | { readonly op: 'wallet'; readonly to: 0 | 1 | 'none' }
  | { readonly op: 'rerender' };
const opArb: fc.Arbitrary<Op> = fc.oneof(
  { arbitrary: fc.constantFrom<Op>({ op: 'capture' }, { op: 'begin' }), weight: 4 },
  { arbitrary: fc.constantFrom<Op>({ op: 'lock' }, { op: 'clear' }, { op: 'load' }, { op: 'suspend' }, { op: 'rerender' }), weight: 3 },
  { arbitrary: fc.record({ op: fc.constant('emit' as const), event: fc.constantFrom('accountsChanged' as const, 'chainChanged' as const, 'disconnect' as const), target: fc.constantFrom(0 as const, 1 as const) }), weight: 2 },
  { arbitrary: fc.record({ op: fc.constant('wallet' as const), to: fc.constantFrom(0 as const, 1 as const, 'none' as const) }), weight: 3 },
);

beforeEach(clearSession);
afterEach(() => { cleanup(); clearSession(); });

describe('wallet privacy generations under random event sequences (fuzz)', () => {
  it('keeps exactly the latest generation live and never revives an older scope, including A -> B -> A', () => {
    fc.assert(fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
      clearSession();
      const providers = [new EventWallet(), new EventWallet()] as const;
      // Stable identities: switching back to A reuses the original A session object.
      const wallets: readonly WalletSession[] = providers.map((provider, i) => ({
        wallet: { id: `fixture-${i}`, name: `Fixture ${i}`, kind: 'injected' as const, requireLifecycleEvents: true, provider },
        account: MOCK_ACCOUNT, chainId: 84532,
      }));
      let epoch = 0;
      // Model of the real session: keys loaded, and whether idle suspended them (only loaded keys can be suspended).
      let keys = false;
      let suspended = false;
      let current: WalletSession | undefined;
      const causes: WalletPrivacyInvalidation[] = [];
      let expectedCauses = 0;
      const hook = renderHook(({ wallet }: { readonly wallet: WalletSession | undefined }) =>
        useWalletPrivacy(wallet, (cause) => { causes.push(cause); }), { initialProps: { wallet: current } });
      const scopes: { readonly scope: WalletPrivacyScope; readonly epoch: number }[] = [];
      const setWallet = (next: WalletSession | undefined): void => {
        // Replacing or removing an observed wallet rotates the operation in its observer cleanup. Connecting a wallet
        // where none was observed adds authority and revokes nothing (a pending connect scope must survive it).
        if (current !== undefined && next !== current) epoch++;
        current = next;
        hook.rerender({ wallet: next });
      };
      const live = (scope: WalletPrivacyScope): boolean => { try { scope.assertCurrent(); return true; } catch { return false; } };

      for (const step of ops) {
        switch (step.op) {
          case 'capture':
          case 'begin': {
            let scope: WalletPrivacyScope | undefined;
            try { scope = step.op === 'capture' ? hook.result.current.capture() : hook.result.current.begin(); }
            catch { expect(suspended, 'a capture may refuse only while keys are suspended').toBe(true); break; }
            expect(suspended).toBe(false);
            if (step.op === 'begin') epoch++;
            scopes.push({ scope, epoch });
            break;
          }
          case 'lock': act(() => { notifyAppLock('manual'); }); epoch++; expectedCauses++; break;
          case 'clear': act(() => { clearSession(); }); epoch++; expectedCauses++; keys = false; suspended = false; break;
          case 'load': act(() => { generateSession(); }); epoch++; expectedCauses++; keys = true; suspended = false; break;
          // suspendSession always emits; it suspends authority only when keys are loaded.
          case 'suspend': act(() => { suspendSession(); }); epoch++; expectedCauses++; suspended = keys; break;
          case 'emit': {
            const target = wallets[step.target];
            const observed = target === current;
            act(() => { providers[step.target].emit(step.event); });
            if (observed) {
              epoch++; expectedCauses++;
              expect(causes.at(-1)).toBe('wallet');
              // Consumers drop the revoked wallet (Pay and WalletAttempts both do); emulate that contract.
              setWallet(undefined);
            }
            break;
          }
          case 'wallet': setWallet(step.to === 'none' ? undefined : wallets[step.to]); break;
          case 'rerender': hook.rerender({ wallet: current }); break;
        }
        for (const { scope, epoch: at } of scopes) {
          // A scope cannot be captured while suspended, and suspension starts a new generation, so liveness is exactly
          // "captured in the current generation".
          expect(live(scope), `scope from generation ${at} at generation ${epoch}`).toBe(at === epoch);
          // Aborted signals never come back; only the current generation's signal may still be open.
          if (at !== epoch) expect(scope.signal.aborted).toBe(true);
        }
        // No listener leaks: only the currently observed wallet holds the three lifecycle listeners.
        providers.forEach((provider, i) => { expect(provider.count()).toBe(wallets[i] === current ? 3 : 0); });
        expect(causes).toHaveLength(expectedCauses);
      }
      hook.unmount();
      for (const { scope } of scopes) { expect(live(scope)).toBe(false); expect(scope.signal.aborted).toBe(true); }
      expect(providers[0].count() + providers[1].count()).toBe(0);
    }), RUNS);
  });
});
