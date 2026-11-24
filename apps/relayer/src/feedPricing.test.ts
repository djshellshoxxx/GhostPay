import { describe, expect, it, vi } from 'vitest';
import { findFeed, type AggregatorReader, type RoundData } from '@ghostpay/chain-adapters';
import { ConfiguredPriceSource } from './feedPricing.js';
import { Metrics } from './metrics.js';
import type { AlertEvent } from './alerts.js';
import { USDC } from './harness.testutil.js';

const token = { address: USDC, symbol: 'USDC', decimals: 6, permit: true, usdStable: true } as const;
const round = (over: Partial<RoundData> = {}): RoundData => ({ roundId: 1n, answer: 300_000_000_000n, startedAt: 900n, updatedAt: 990n, answeredInRound: 1n, ...over });
function setup(over: Partial<RoundData> = {}) {
  const feed = findFeed(11155111, 'ETH', 'USD')!; const events: AlertEvent[] = []; const metrics = new Metrics(); const clock = { ms: 1_000_000 };
  const reader = { decimals: vi.fn(() => Promise.resolve(8)), latestRoundData: vi.fn(() => Promise.resolve(round(over))) } satisfies AggregatorReader;
  const source = new ConfiguredPriceSource(new Map([[1, 2_000_000_000n]]), new Map([[11155111,
    { reader, feed: { ...feed, decimals: 8 }, maxAgeSeconds: 30 }]]), { send: (event) => { events.push(event); } }, metrics, () => clock.ms);
  return { reader, source, events, metrics, clock };
}
describe('explicit native/USD feed pricing', () => {
  it('uses exact native/USD conversion, rounds up and carries the source validity deadline', async () => {
    const s = setup(); expect(await s.source.quoteNativeToTokenUnits(11155111, token, 1n)).toEqual({ amount: 1n, validUntil: 1020 });
    expect(await s.source.nativeToTokenUnits(11155111, token, 10n ** 18n)).toBe(3_000_000_000n);
    expect(s.metrics.render()).toContain('relayer_price_age_seconds{chain_id="11155111"} 10');
    s.clock.ms += 5000; expect(s.metrics.render()).toContain('relayer_price_age_seconds{chain_id="11155111"} 15');
    expect(s.events).toEqual([]);
  });
  it('retains explicit fixed mode, without a fabricated age or deadline', async () => {
    const s = setup(); expect(await s.source.quoteNativeToTokenUnits(1, token, 10n ** 18n)).toEqual({ amount: 2_000_000_000n });
    expect(s.metrics.render()).not.toContain('chain_id="1"');
    await expect(s.source.nativeToTokenUnits(2, token, 1n)).rejects.toMatchObject({ code: 'chain_not_supported' });
  });
  it('refuses stale rounds, emits only fixed chain telemetry and never falls back', async () => {
    const s = setup({ updatedAt: 969n });
    await expect(s.source.nativeToTokenUnits(11155111, token, 1n)).rejects.toMatchObject({ code: 'price_stale', status: 503 });
    expect(s.events).toEqual([{ kind: 'price_stale', chainId: 11155111 }]); expect(s.metrics.render()).toContain('relayer_price_stale_total{chain_id="11155111"} 1');
    expect(s.metrics.render()).not.toContain('0x');
  });
  it.each([{ answer: 0n }, { updatedAt: 0n }, { updatedAt: 1001n }, { answeredInRound: 0n }])('rejects invalid round without inventing staleness %#', async (over) => {
    const s = setup(over); await expect(s.source.nativeToTokenUnits(11155111, token, 1n)).rejects.toMatchObject({ code: 'price_unavailable' });
    expect(s.events).toEqual([]);
  });
  it('rejects decimals mismatch and read errors without leaking their details', async () => {
    const s = setup(); vi.mocked(s.reader.decimals).mockResolvedValue(18);
    await expect(s.source.nativeToTokenUnits(11155111, token, 1n)).rejects.toThrow('price_unavailable');
    vi.mocked(s.reader.latestRoundData).mockRejectedValue(new Error('https://secret.endpoint/key'));
    await expect(s.source.nativeToTokenUnits(11155111, token, 1n)).rejects.toThrow('price_unavailable'); expect(s.events).toEqual([]);
  });
  it('rechecks wall time after reads and refuses zero remaining validity', async () => {
    const s = setup(); vi.mocked(s.reader.latestRoundData).mockImplementation(() => { s.clock.ms = 1_020_000; return Promise.resolve(round()); });
    await expect(s.source.nativeToTokenUnits(11155111, token, 1n)).rejects.toMatchObject({ code: 'price_stale' });
    expect(s.events).toEqual([{ kind: 'price_stale', chainId: 11155111 }]);
  });
  it('coalesces only in-flight feed reads, then refreshes on the next conversion', async () => {
    const s = setup(); await Promise.all([s.source.nativeToTokenUnits(11155111, token, 1n), s.source.nativeToTokenUnits(11155111, token, 2n)]);
    expect(s.reader.latestRoundData).toHaveBeenCalledTimes(1); await s.source.nativeToTokenUnits(11155111, token, 1n); expect(s.reader.latestRoundData).toHaveBeenCalledTimes(2);
  });
});
