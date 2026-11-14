import { describe, expect, it } from 'vitest';
import { makeIo, NOW, SIGNER, SPEC, stdoutJson } from './fixtures.testutil.js';
import { run } from './run.js';
import { createSubscription } from '@ghostpay/merchant-billing';

export const CONFIG = {
  subscriptionId: 'sub_001', baseUrl: 'https://pay.example.org/',
  plan: { id: 'basic', name: 'Basic', currency: 'USD', amountMinor: '900', taxBps: 0,
    schedule: { anchor: NOW, cadence: { kind: 'monthly', every: 1 } } },
  template: { chainId: SPEC.chainId, metaAddress: SPEC.metaAddress, token: SPEC.token, amountPolicy: SPEC.amountPolicy,
    feePolicy: SPEC.feePolicy, signer: SIGNER, quoteSource: SPEC.quote.source, quoteTtlSeconds: 600, maxSlippageBps: 50 },
} as const;
describe('subscription configuration inspection', () => {
  it('validates the durable runner configuration without issuing a payable invoice or leaking receiving data', async () => {
    const io = makeIo({ config: JSON.stringify(CONFIG) });
    expect(await run(['merchant', 'subscriptions', 'validate', '--in', 'config', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, invoiceIssued: false, paymentVerified: false, chainId: 8453 });
    expect(io.out.join('')).not.toContain(SPEC.metaAddress);
  });
  it('inspects an empty committed snapshot and rejects a corrupt or inconsistent one', async () => {
    const state = { version: 1, config: CONFIG, subscription: createSubscription(CONFIG.subscriptionId, CONFIG.plan, NOW), outbox: [], outboxPath: 'state.outbox.jsonl' };
    const io = makeIo({ state: JSON.stringify(state) });
    expect(await run(['merchant', 'subscriptions', 'inspect', '--in', 'state', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ status: 'active', nextPeriod: 0, periodCount: 0, outboxCount: 0, paymentVerified: false });
    io.files.set('state', JSON.stringify({ ...state, version: 2 }));
    expect(await run(['merchant', 'subscriptions', 'inspect', '--in', 'state', '--json'], io)).toBe(1);
  });
  it.each([{}, { ...CONFIG, secret: 'never-print-me' }, { ...CONFIG, baseUrl: 'javascript:alert(1)' },
    { ...CONFIG, plan: { ...CONFIG.plan, amountMinor: '-1' } }])('fails configuration validation without echoing untrusted data %#', async bad => {
    const io = makeIo({ config: JSON.stringify(bad) });
    expect(await run(['merchant', 'subscriptions', 'validate', '--in', 'config', '--json'], io)).toBe(6);
    expect(io.out.join('') + io.err.join('')).not.toContain('never-print-me');
  });
});
