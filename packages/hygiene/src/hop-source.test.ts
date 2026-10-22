import { describe, expect, it } from 'vitest';
import { addressOfSecret } from '@ghostpay/chain-adapters';
import { unsafeRevealSecret, type SecretScalar } from '@ghostpay/core-crypto';
import { createHopAddressSource } from './hop-source.js';
import { DestLedger } from './ledger.js';
import { deriveFreshDestination } from './destination.js';
import { A1, A2, META, testKeys, withSeedOf } from './fixtures.testutil.js';

function make(ledger = new DestLedger()) {
  const keys = testKeys();
  return {
    ledger,
    src: createHopAddressSource({ ownMeta: META, withSeed: withSeedOf(), withKeys: (f) => f(keys), ledger }),
  };
}

describe('createHopAddressSource', () => {
  it('hands out distinct indices within a process and matches deriveFreshDestination', async () => {
    const { src } = make();
    const a = await src.next();
    const b = await src.next();
    expect([a.index, b.index]).toEqual([0, 1]);
    expect(a.address).toBe(deriveFreshDestination(META, withSeedOf(), 0).address);
    expect(a.address).not.toBe(b.address);
  });
  it('skips indices already in the ledger (no collision with hygiene destinations)', async () => {
    const ledger = new DestLedger();
    ledger.record(84532, A1, A2, 4);
    const { src } = make(ledger);
    expect((await src.next()).index).toBe(5);
  });
  it('withSecret yields the matching key and zeroizes it afterwards, also on throw', async () => {
    const { src } = make();
    const h = await src.next();
    let held: SecretScalar | undefined;
    const addr = await h.withSecret((s) => {
      held = s;
      return Promise.resolve(addressOfSecret(s));
    });
    expect(addr).toBe(h.address);
    expect(unsafeRevealSecret(held as SecretScalar).every((b) => b === 0)).toBe(true);
    let held2: SecretScalar | undefined;
    await expect(
      h.withSecret((s) => {
        held2 = s;
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(unsafeRevealSecret(held2 as SecretScalar).every((b) => b === 0)).toBe(true);
  });
  it('withSecret rejects (not throws) when keys do not match', async () => {
    const ledger = new DestLedger();
    const wrong = { ...testKeys(), spendingSecret: testKeys().viewingSecret };
    const src = createHopAddressSource({
      ownMeta: META,
      withSeed: withSeedOf(),
      withKeys: (f) => f(wrong),
      ledger,
    });
    const h = await src.next();
    await expect(h.withSecret(() => Promise.resolve(1))).rejects.toThrow();
  });
});
