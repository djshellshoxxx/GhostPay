import { zeroize, type SecretScalar, type StealthKeySet } from '@ghostpay/core-crypto';
import type { Address } from './addr.js';
import { deriveFreshDestination, recoverDestinationKey } from './destination.js';
import type { DestLedger } from './ledger.js';

/**
 * Interface consumed by `@ghostpay/hops` (spec hops.md 4.2). Defined here and, by design, locally in `hops` too:
 * no package imports another method package's internals.
 */
export interface HopAddressSource {
  /** Allocates a never-used index and returns the address + a deferred key accessor. */
  next(): Promise<{
    index: number;
    address: Address;
    withSecret<T>(fn: (s: SecretScalar) => Promise<T>): Promise<T>;
  }>;
}

/**
 * Builds a {@link HopAddressSource} on top of the hygiene derivation and ledger, so hop and destination indices never collide.
 *
 * @remarks Indices come from `max(ledger.nextIndex(), lastAllocated + 1)`. The caller (hops) MUST persist each
 * hop address with `ledger.record(chainId, address, previousSource, index)` before the next `next()` call across
 * restarts; within one process the source never hands out an index twice.
 *
 * @param o.ownMeta Own scheme-1 meta-address.
 * @param o.withSeed Key-material accessor (see {@link deriveFreshDestination}).
 * @param o.withKeys Scoped accessor for the viewing and spending secrets; secrets must not outlive the callback.
 * @param o.ledger Shared destination ledger.
 * @security Derived addresses are never announced and carry no on-chain object. They are the seller's own funds.
 */
export function createHopAddressSource(o: {
  ownMeta: string;
  withSeed: <T>(f: (ikm: Uint8Array) => T) => T;
  withKeys: <T>(f: (k: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>) => T) => T;
  ledger: DestLedger;
}): HopAddressSource {
  let last = -1;
  return {
    next() {
      const index = Math.max(o.ledger.nextIndex(), last + 1);
      last = index;
      const d = deriveFreshDestination(o.ownMeta, o.withSeed, index);
      return Promise.resolve({
        index,
        address: d.address,
        withSecret: <T>(fn: (s: SecretScalar) => Promise<T>): Promise<T> =>
          o.withKeys(async (keys) => {
            const secret = recoverDestinationKey(keys, d);
            try {
              return await fn(secret);
            } finally {
              zeroize(secret);
            }
          }),
      });
    },
  };
}
