import { describe, expect, it } from 'vitest';
import { fakeManifest } from '../test/fakeManifest';
import { fixtureFeed, priceRpc } from '../test/fiatFeed';
import { NOW, makeParsed } from '../test/invoiceFixtures';
import { mockRpc } from '../test/mockRpc';
import { assertPayContextFresh, assertReadyToSend, buildFinal, createPayContext, decodeForDisplay, reviewInvoice } from './pay';

async function review() {
  const { parsed } = await makeParsed({ amountMode: 'fiat_quote' });
  return reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) });
}
const deps = { nowSeconds: NOW, findFeedFn: () => fixtureFeed };
describe('checkout with deterministic Chainlink rounds', () => {
  it('binds the round, payer rounding, fee and slippage floor to the decoded transaction', async () => {
    const ctx = await createPayContext(await review(), priceRpc(NOW, 8, NOW, 101_000_000n), deps);
    expect(ctx.estimate).toEqual({ quotedAt: NOW, feed: fixtureFeed.address, roundId: 7n, updatedAt: NOW, expiresAt: NOW + 67, tokenAmount: 99_009_901n });
    const built = buildFinal(ctx, { nowSeconds: NOW });
    expect(decodeForDisplay(built, 84532)).toMatchObject({ gross: 99_009_901n, fee: 247_524n, net: 98_762_377n, minNet: 98_268_566n, deadline: BigInt(NOW + 66) });
    assertReadyToSend(built, ctx);
    expect(() => assertPayContextFresh(ctx, NOW - 1)).toThrow(/expired/);
  });
  it('expires on the earliest of primary age, reference age, offer expiry and five minutes', async () => {
    const r = await review();
    const longFeed = { ...fixtureFeed, heartbeatSec: 3600 };
    for (const [primary, reference, sellerExpiry, expected] of [
      [NOW, NOW, NOW + 900, NOW + 300],
      [NOW - 3958, NOW, NOW + 900, NOW + 3],
      [NOW, NOW - 598, NOW + 900, NOW + 3],
      [NOW, NOW, NOW + 3, NOW + 3],
    ] as const) {
      const invoice = { ...r.invoice, quote: { ...r.invoice.quote, expiresAt: sellerExpiry } };
      const ctx = await createPayContext({ ...r, invoice }, priceRpc(primary, 8, reference), { ...deps, findFeedFn: () => longFeed });
      expect(ctx.estimate?.expiresAt).toBe(expected);
      expect(buildFinal(ctx, { nowSeconds: NOW }).preview.deadline).toBe(BigInt(expected - 1));
      expect(() => assertPayContextFresh(ctx, expected - 1)).not.toThrow();
      expect(() => assertPayContextFresh(ctx, expected)).toThrow(/expired/);
    }
  });
  it('refuses stale, future, depegged, mismatched-decimal and unavailable reads', async () => {
    const r = await review();
    for (const rpc of [priceRpc(NOW - 67), priceRpc(NOW + 1), priceRpc(NOW, 18), priceRpc(NOW, 8, NOW - 601),
      priceRpc(NOW, 8, NOW, 97_999_999n), mockRpc(84532, () => { throw new Error('unavailable'); })]) {
      await expect(createPayContext(r, rpc, deps)).rejects.toMatchObject({ code: 'QUOTE_FAILED' });
    }
    await expect(createPayContext(r, undefined, deps)).rejects.toThrow(/Configure an RPC/);
  });
  it('refuses unavailable pairs, source substitution and currency substitution before any feed calls', async () => {
    const r = await review();
    const rpc = priceRpc();
    for (const changed of [r.invoice, { ...r.invoice, quote: { ...r.invoice.quote, source: 'seller:fixed' } },
      { ...r.invoice, fiat: { ...r.invoice.fiat, currency: 'EUR' } }]) {
      await expect(createPayContext({ ...r, invoice: changed }, rpc, changed === r.invoice ? { nowSeconds: NOW } : deps)).rejects.toMatchObject({ code: 'QUOTE_DISABLED' });
    }
    expect(rpc.calls).toHaveLength(0);
  });
});
