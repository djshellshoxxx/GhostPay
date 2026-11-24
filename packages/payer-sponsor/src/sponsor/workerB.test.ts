import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { GuardedBreaker } from '@ghostpay/relayer-guard';
import { buildRelayIntent, NO_PERMIT } from '../relay/intent.js';
import type { RelaySubmitRequest } from './types.js';
import { CHAIN_ID, CTX, DEPLOY, GROSS, ROUTER, TOKEN, harness, nowSec, payArgs, type Harness } from './service.testutil.js';

const payer = privateKeyToAccount(`0x${'11'.repeat(32)}`);

async function req(h: Harness, nonce: bigint): Promise<RelaySubmitRequest> {
  const q = await h.svc.quote(CTX, { mode: 'permit-relay', chainId: CHAIN_ID, token: TOKEN, gross: GROSS });
  const b = buildRelayIntent({
    chainId: CHAIN_ID, relay: DEPLOY.relay, payer: payer.address, router: ROUTER, pay: payArgs(),
    sponsorFee: q.sponsorFee, sponsorFeeTo: q.sponsorFeeTo, deadline: nowSec(h) + 600n, nonce,
  });
  const sig = await payer.signTypedData(b.typedData);
  return { quoteId: q.quoteId, chainId: CHAIN_ID, router: ROUTER, intent: b.intent, routerCalldata: b.routerCalldata, sig, permit: NO_PERMIT };
}

describe('worker B: sponsor lifecycle', () => {
  it('receipt wait failure after a broadcast reports an unknown outcome with the tx hash and charges the budget', async () => {
    // A breaker that stays closed isolates the loss budget under test.
    const breaker = new GuardedBreaker({ windowSize: 1000, minSamples: 1000, failureRatio: 0.99, cooldownMs: 1000, probeTimeoutMs: 1000 });
    const h = harness({ breaker });
    h.chain.receiptThrows = true;
    const err = await h.svc.submitRelay(CTX, await req(h, 1n)).then(() => null, (e: unknown) => e as { code: string; txHash?: string });
    expect(err).not.toBeNull();
    expect(err?.code).toBe('OUTCOME_UNKNOWN');
    expect(err?.txHash).toBe(`0x${'ab'.repeat(32)}`);
    // The broadcast may still be mined: a worst-case cost is charged, so repeats exhaust the client's budget.
    let n = 2n;
    let denied = false;
    for (let i = 0; i < 200 && !denied; i++) {
      await h.svc.submitRelay(CTX, await req(h, n++)).catch(() => undefined);
      denied = !h.loss.allows(CTX.bucket);
    }
    expect(denied).toBe(true);
  });

  it('never runs two sends at once on one chain (shared hot-key nonce)', async () => {
    const h = harness();
    const a = await req(h, 1n);
    const b = await req(h, 2n);
    h.chain.sendHook = () => new Promise((res) => setTimeout(res, 20));
    await Promise.all([h.svc.submitRelay(CTX, a), h.svc.submitRelay(CTX, b)]);
    expect(h.chain.sent).toHaveLength(2);
    expect(h.chain.maxActiveSends).toBe(1);
  });
});
