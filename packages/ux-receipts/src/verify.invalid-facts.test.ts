import { describe, expect, it } from 'vitest';
import { createReceipt, PRESETS } from './disclose.js';
import { record } from './fixtures.testutil.js';
import { verifyReceipt, type ChainLookupResult, type ChainVerifier } from './verify.js';

const fakeVerifier = (response: unknown): ChainVerifier => ({
  lookup: () => Promise.resolve(response as ChainLookupResult),
});

describe('receipt verifier rejects malformed chain confirmation evidence', () => {
  it.each(['yes', 1, null, undefined])(
    'does not report a chain-confirmed receipt for nonboolean confirmed=%s',
    async (confirmed) => {
      const receipt = await createReceipt(record(), PRESETS.full);
      const report = await verifyReceipt(receipt, {
        verifier: fakeVerifier({ status: 'found', facts: { confirmed, amountBase: '1500000' } }),
      });
      expect(report.chain.status).toBe('unavailable');
      expect(report.verdict).toBe('self_consistent_unverified');
      expect(report.caveats).toContain('chain_unavailable');
    },
  );

  it.each([null, undefined])(
    'does not throw when a found response has facts=%s',
    async (facts) => {
      const receipt = await createReceipt(record(), PRESETS.full);
      const report = await verifyReceipt(receipt, {
        verifier: fakeVerifier({ status: 'found', facts }),
      });
      expect(report.chain.status).toBe('unavailable');
      expect(report.verdict).toBe('self_consistent_unverified');
    },
  );

  it('retains actual boolean confirmation and amount matching semantics', async () => {
    const receipt = await createReceipt(record(), PRESETS.full);
    const confirmed = await verifyReceipt(receipt, {
      verifier: fakeVerifier({ status: 'found', facts: { confirmed: true, amountBase: '1500000' } }),
    });
    expect(confirmed.chain.status).toBe('confirmed');
    expect(confirmed.verdict).toBe('chain_confirmed');

    const unconfirmed = await verifyReceipt(receipt, {
      verifier: fakeVerifier({ status: 'found', facts: { confirmed: false, amountBase: '1500000' } }),
    });
    expect(unconfirmed.chain.status).toBe('unconfirmed');
    expect(unconfirmed.verdict).toBe('chain_problem');

    const mismatch = await verifyReceipt(receipt, {
      verifier: fakeVerifier({ status: 'found', facts: { confirmed: true, amountBase: '9' } }),
    });
    expect(mismatch.chain.status).toBe('mismatch');
    expect(mismatch.verdict).toBe('chain_problem');
  });
});
