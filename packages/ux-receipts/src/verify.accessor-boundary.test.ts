import { describe, expect, it } from 'vitest';
import { createReceipt, PRESETS } from './disclose.js';
import { record } from './fixtures.testutil.js';
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
    const lookup = new Proxy({ status: 'found', facts: { confirmed: true, amountBase: '1500000' } }, {
      get(): never { throw new Error('adapter proxy denied property access'); },
    });
    await expectUnavailable(lookup);
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
