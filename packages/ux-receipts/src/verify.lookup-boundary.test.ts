import { describe, expect, it } from 'vitest';
import { createReceipt, PRESETS } from './disclose.js';
import { record, SENDER, RECIPIENT } from './fixtures.testutil.js';
import { verifyReceipt, type ChainLookupResult, type ChainVerifier } from './verify.js';

const verifierFor = (response: unknown): ChainVerifier => ({
  lookup: () => Promise.resolve(response as ChainLookupResult),
});

const expectUnavailable = async (response: unknown): Promise<void> => {
  const receipt = await createReceipt(record(), PRESETS.full);
  const report = await verifyReceipt(receipt, { verifier: verifierFor(response) });
  expect(report.chain.status).toBe('unavailable');
  expect(report.verdict).toBe('self_consistent_unverified');
  expect(report.caveats).toContain('chain_unavailable');
};

describe('receipt chain verifier runtime lookup boundary', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['boolean', true],
    ['array', [{ status: 'found' }]],
    ['string', 'found'],
  ])('fails closed for %s top-level lookup responses', async (_label, response) => {
    await expectUnavailable(response);
  });

  it.each([
    ['numeric amount', { confirmed: true, amountBase: 1500000 }],
    ['null amount', { confirmed: true, amountBase: null }],
    ['numeric asset', { confirmed: true, amountBase: '1500000', assetSymbol: 7 }],
    ['numeric sender', { confirmed: true, amountBase: '1500000', sender: 17 }],
    ['array recipient', { confirmed: true, amountBase: '1500000', recipient: [] }],
    ['null recipient', { confirmed: true, amountBase: '1500000', recipient: null }],
  ])('fails closed for %s in found evidence', async (_label, facts) => {
    await expectUnavailable({ status: 'found', facts });
  });

  it('retains valid corroboration, unconfirmed, tx-exists-only and not-found outcomes', async () => {
    const receipt = await createReceipt(record(), PRESETS.full);
    const confirmed = await verifyReceipt(receipt, {
      verifier: verifierFor({
        status: 'found',
        facts: {
          confirmed: true,
          amountBase: '1500000',
          assetSymbol: 'USDC',
          sender: SENDER,
          recipient: RECIPIENT,
        },
      }),
    });
    expect(confirmed.chain.status).toBe('confirmed');
    expect(confirmed.verdict).toBe('chain_confirmed');

    const unconfirmed = await verifyReceipt(receipt, {
      verifier: verifierFor({ status: 'found', facts: { confirmed: false, amountBase: '1500000' } }),
    });
    expect(unconfirmed.chain.status).toBe('unconfirmed');
    expect(unconfirmed.verdict).toBe('chain_problem');

    const txExists = await verifyReceipt(receipt, {
      verifier: verifierFor({ status: 'found', facts: { confirmed: true } }),
    });
    expect(txExists.chain.status).toBe('tx_exists_only');
    expect(txExists.verdict).toBe('self_consistent_unverified');

    const missing = await verifyReceipt(receipt, { verifier: verifierFor({ status: 'not_found' }) });
    expect(missing.chain.status).toBe('not_found');
    expect(missing.verdict).toBe('chain_problem');
  });
});
