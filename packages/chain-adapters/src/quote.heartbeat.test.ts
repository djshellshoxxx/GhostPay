import { describe, expect, it } from 'vitest';
import { readPrice, type AggregatorReader } from './quote.js';

const FEED = '0x7777777777777777777777777777777777777777';
const NOW = 1_800_000_000n;
const options = { now: NOW, maxAgeSeconds: 86_400n, heartbeatSeconds: 1_200n };
const reader = (age: bigint): AggregatorReader => ({
  decimals: () => Promise.resolve(8),
  latestRoundData: () => Promise.resolve({ roundId: 1n, answer: 100_000_000n,
    startedAt: NOW - age, updatedAt: NOW - age, answeredInRound: 1n }),
});

describe('LF-365f017ac-1: sourced feed heartbeat caps the caller age', () => {
  it('rejects a price beyond heartbeat plus the original 300-second margin despite a day-long quote', async () => {
    await expect(readPrice(reader(1_501n), FEED, options)).rejects.toThrow('QUOTE_FAILED: stale price');
  });
  it('accepts the exact heartbeat-plus-margin boundary', async () => {
    await expect(readPrice(reader(1_500n), FEED, options)).resolves.toMatchObject({ updatedAt: NOW - 1_500n });
  });
  it('preserves a stricter caller limit', async () => {
    const strict = { ...options, maxAgeSeconds: 60n };
    await expect(readPrice(reader(60n), FEED, strict)).resolves.toBeDefined();
    await expect(readPrice(reader(61n), FEED, strict)).rejects.toThrow('QUOTE_FAILED: stale price');
  });
  it.each([0n, -1n, 604_801n, 1_200, Number.NaN, '1200'])('rejects invalid heartbeat %s before reading', async (heartbeatSeconds) => {
    let reads = 0;
    const counted: AggregatorReader = {
      decimals: () => { reads += 1; return Promise.resolve(8); },
      latestRoundData: () => { reads += 1; return reader(0n).latestRoundData(FEED); },
    };
    await expect(readPrice(counted, FEED, { ...options, heartbeatSeconds: heartbeatSeconds as bigint }))
      .rejects.toThrow('QUOTE_FAILED: feed heartbeat');
    expect(reads).toBe(0);
  });
});
