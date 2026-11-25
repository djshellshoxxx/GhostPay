import { describe, expect, it } from 'vitest';
import { createReceipt, PRESETS } from './disclose.js';
import { record, RECIPIENT, SENDER } from './fixtures.testutil.js';
import { verifyReceipt, type ChainLookupResult, type ChainVerifier } from './verify.js';

const verifierFor = (response: unknown): ChainVerifier => ({
  lookup: () => Promise.resolve(response as ChainLookupResult),
});

async function expectUnavailable(response: unknown): Promise<void> {
  const receipt = await createReceipt(record(), PRESETS.full);
  const report = await verifyReceipt(receipt, { verifier: verifierFor(response) });
  expect(report.chain.status).toBe('unavailable');
  expect(report.verdict).toBe('self_consistent_unverified');
  expect(report.caveats).toContain('chain_unavailable');
}

describe('chain verifier contains throwing adapter evidence accessors', () => {
  it('treats a throwing lookup status getter as unavailable', async () => {
    await expectUnavailable({ get status(): never { throw new Error('status getter failed'); } });
  });

  it('treats a throwing found-facts getter as unavailable', async () => {
    await expectUnavailable({ status: 'found', get facts(): never { throw new Error('facts getter failed'); } });
  });

  it.each(['confirmed', 'amountBase', 'assetSymbol', 'sender', 'recipient'] as const)(
    'treats a throwing %s getter as unavailable',
    async (property) => {
      const facts: Record<string, unknown> = { confirmed: true, amountBase: '1500000' };
      Object.defineProperty(facts, property, {
        enumerable: true,
        get(): never { throw new Error('adapter getter failed'); },
      });
      await expectUnavailable({ status: 'found', facts });
    },
  );

  it('treats a throwing lookup proxy as unavailable', async () => {
    // RCPT-L1: the trap must let the promise machinery see `then` as absent. Otherwise the async lookup rejects
    // before verification ever reads the object, and the guard around the property reads is never exercised.
    let guardedReads = 0;
    const lookup = new Proxy({ status: 'found', facts: { confirmed: true, amountBase: '1500000' } }, {
      get(_target, property): never | undefined {
        if (property === 'then') return undefined;
        guardedReads += 1;
        throw new Error('adapter proxy denied property access');
      },
    });
    await expectUnavailable(lookup);
    expect(guardedReads).toBeGreaterThan(0);
  });

  it('reads each lookup accessor exactly once (RCPT-L2)', async () => {
    const reads = new Map<string, number>();
    const counted = <T extends object>(label: string, target: T): T => {
      const out = {} as Record<string, unknown>;
      for (const key of Object.keys(target)) {
        Object.defineProperty(out, key, {
          enumerable: true,
          get(): unknown {
            reads.set(`${label}.${key}`, (reads.get(`${label}.${key}`) ?? 0) + 1);
            return (target as Record<string, unknown>)[key];
          },
        });
      }
      return out as T;
    };
    const facts = counted('facts', { confirmed: true, amountBase: '1500000', assetSymbol: 'USDC', sender: SENDER, recipient: RECIPIENT });
    const lookup = counted('lookup', { status: 'found', facts });
    const receipt = await createReceipt(record(), PRESETS.full);
    await verifyReceipt(receipt, { verifier: verifierFor(lookup) });
    expect(reads.size).toBeGreaterThan(0);
    for (const [name, count] of reads) expect({ name, count }).toEqual({ name, count: 1 });
  });

  it('uses the value read once, even when a getter changes between reads (RCPT-L2)', async () => {
    const receipt = await createReceipt(record(), PRESETS.full);
    const expected = receipt.amount;
    expect(expected).toBeDefined();
    let amountReads = 0;
    const facts = { confirmed: true } as Record<string, unknown>;
    Object.defineProperty(facts, 'amountBase', {
      enumerable: true,
      get: (): unknown => { amountReads += 1; return amountReads === 1 ? expected : 'changed-after-first-read'; },
    });
    const report = await verifyReceipt(receipt, { verifier: verifierFor({ status: 'found', facts }) });
    expect(report.chain.status).toBe('confirmed');
    expect(report.chain.matched).toContain('amount');
  });

  it('preserves valid chain corroboration and an explicit not-found outcome', async () => {
    const receipt = await createReceipt(record(), PRESETS.full);
    const confirmed = await verifyReceipt(receipt, {
      verifier: verifierFor({ status: 'found', facts: { confirmed: true, amountBase: '1500000' } }),
    });
    expect(confirmed.chain.status).toBe('confirmed');
    expect(confirmed.verdict).toBe('chain_confirmed');

    const absent = await verifyReceipt(receipt, { verifier: verifierFor({ status: 'not_found' }) });
    expect(absent.chain.status).toBe('not_found');
    expect(absent.verdict).toBe('chain_problem');
  });
});
