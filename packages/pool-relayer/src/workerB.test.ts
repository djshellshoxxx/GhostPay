import { TokenBucketLimiter } from '@ghostpay/relayer-guard';
import { describe, expect, it } from 'vitest';
import { RelayerError } from './errors.js';
import { PoolRelayerService } from './service.js';
import { config, fakeChain, goodRequest } from './harness.testutil.js';

const ctx = { clientKey: 'k1', requestId: 'abcdef12-3456' };
const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof RelayerError ? `${String(e.status)}:${e.code}` : 'other';
  }
};

describe('worker B: lane queue bound', () => {
  it.each([NaN, Infinity, -Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects a non-finite, non-positive or unsafe queue capacity (%s)', (maxQueue) => {
      expect(() => new PoolRelayerService({
        config: config(), chains: new Map([[31337, fakeChain()]]),
        verifyProof: () => Promise.resolve(true), maxQueue,
      })).toThrow(/maxQueue/);
    },
  );

  it('captures its validated capacity so later options mutation cannot remove the bound', async () => {
    const chain = fakeChain();
    let entered: () => void = () => undefined;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    chain.simulateWithdraw = async () => { entered(); await gate; return { gasLimit: 120_000n }; };
    const options = { config: config(), chains: new Map([[31337, chain]]),
      verifyProof: () => Promise.resolve(true), maxQueue: 1 };
    const service = new PoolRelayerService(options);
    const first = service.relay(goodRequest(), ctx);
    try {
      await started;
      options.maxQueue = Infinity;
      const rejected = code(service.relay(goodRequest(), ctx));
      release();
      expect(await rejected).toBe('503:queue_full');
      await first;
      // A completed request releases its slot for later work.
      expect(await code(service.relay(goodRequest(), ctx))).toBe('ok');
    } finally {
      release();
      await first;
    }
  });

  it('refuses work beyond maxQueue with 503 queue_full instead of queueing without limit', async () => {
    const chain = fakeChain();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    chain.simulateWithdraw = async () => {
      await gate;
      return { gasLimit: 120_000n };
    };
    const svc = new PoolRelayerService({
      config: config(),
      chains: new Map([[31337, chain]]),
      verifyProof: () => Promise.resolve(true),
      limiter: new TokenBucketLimiter({ ratePerSecond: 1000, burst: 100_000, maxKeys: 100 }),
      receiptTimeoutMs: 10,
      maxQueue: 4,
    });
    const results = Array.from({ length: 10 }, () => code(svc.relay(goodRequest(), ctx)));
    await new Promise((r) => setTimeout(r, 20));
    release();
    const out = await Promise.all(results);
    expect(out.filter((c) => c === '503:queue_full')).toHaveLength(6);
    expect(out.filter((c) => c === 'ok')).toHaveLength(4);
  });
});
