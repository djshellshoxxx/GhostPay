import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NET_CONFIG,
  MAX_TRACKED_CHAINS,
  backoffMs,
  clockSkewSec,
  effective,
  initNetState,
  reduceNet,
  summarize,
  type NetEvent,
  type NetState,
  type ProbeResult,
} from './netstate.js';

const NOW = 1_700_000_000_000;
const okRes = (latencyMs = 100, blockTimestampSec?: number): ProbeResult =>
  blockTimestampSec === undefined ? { ok: true, latencyMs } : { ok: true, latencyMs, blockTimestampSec };
const fail: ProbeResult = { ok: false, reason: 'timeout' };
const rpcProbe = (chainId: number, result: ProbeResult, atMs = NOW): NetEvent => ({
  type: 'probe',
  target: { kind: 'rpc', chainId },
  result,
  atMs,
});
const relProbe = (result: ProbeResult, atMs = NOW): NetEvent => ({
  type: 'probe',
  target: { kind: 'relayer' },
  result,
  atMs,
});
const run = (s: NetState, ...ev: NetEvent[]): NetState => ev.reduce((a, e) => reduceNet(a, e, NOW), s);
const cfg = (chains: number[], hasRelayer: boolean): NetEvent => ({
  type: 'configure',
  chainsWithRpc: chains,
  hasRelayer,
});

describe('clockSkewSec', () => {
  it('10 minutes ahead is 600', () => expect(clockSkewSec(NOW, NOW / 1000 - 600)).toBe(600));
  it('behind is negative', () => expect(clockSkewSec(NOW, NOW / 1000 + 90)).toBe(-90));
});

describe('state machine', () => {
  it('starts unknown/ok per connectivity', () => {
    expect(summarize(initNetState(false), NOW).overall).toBe('offline');
    expect(summarize(initNetState(true), NOW)).toMatchObject({ overall: 'no-rpc', errorCode: 'NO_RPC' });
  });
  it('configured but unprobed is unknown', () => {
    expect(summarize(run(initNetState(true), cfg([1], false)), NOW).overall).toBe('unknown');
  });
  it('one failure is tolerated, two mark unreachable, one success recovers', () => {
    let s = run(initNetState(true), cfg([1], false), rpcProbe(1, okRes()));
    s = run(s, rpcProbe(1, fail));
    expect(summarize(s, NOW).overall).toBe('ok');
    s = run(s, rpcProbe(1, fail));
    expect(summarize(s, NOW)).toMatchObject({
      overall: 'rpc-down',
      rpcDown: [1],
      errorCode: 'RPC_UNREACHABLE',
    });
    s = run(s, rpcProbe(1, okRes()));
    expect(summarize(s, NOW).overall).toBe('ok');
    expect(s.rpc[1]?.failures).toBe(0);
  });
  it('unreachable stays unreachable on further failures', () => {
    const s = run(
      initNetState(true),
      cfg([1], false),
      rpcProbe(1, fail),
      rpcProbe(1, fail),
      rpcProbe(1, fail),
    );
    expect(s.rpc[1]).toMatchObject({ reachability: 'unreachable', failures: 3, lastReason: 'timeout' });
  });
  it('slow latency is degraded', () => {
    const s = run(initNetState(true), cfg([1], false), rpcProbe(1, okRes(3001)));
    expect(summarize(s, NOW).overall).toBe('rpc-degraded');
    expect(s.rpc[1]?.reachability).toBe('degraded');
    expect(run(s, rpcProbe(1, fail)).rpc[1]?.reachability).toBe('degraded');
  });
  it('offline ignores probe failures but accepts successes', () => {
    let s = run(initNetState(true), cfg([1], true), rpcProbe(1, okRes()), { type: 'browser-offline' });
    s = run(s, rpcProbe(1, fail), rpcProbe(1, fail), relProbe(fail));
    expect(s.rpc[1]?.failures).toBe(0);
    expect(summarize(s, NOW).overall).toBe('offline');
    s = run(s, rpcProbe(1, okRes()));
    expect(s.rpc[1]?.reachability).toBe('reachable');
  });
  it('coming back online resets failures and reachability', () => {
    let s = run(
      initNetState(true),
      cfg([1], true),
      rpcProbe(1, fail),
      rpcProbe(1, fail),
      relProbe(fail),
      relProbe(fail),
    );
    expect(summarize(s, NOW).overall).toBe('rpc-down');
    s = run(s, { type: 'browser-offline' }, { type: 'browser-online' });
    expect(s.rpc[1]).toMatchObject({ failures: 0, reachability: 'unknown' });
    expect(s.relayer.reachability).toBe('unknown');
    expect(summarize(s, NOW).overall).toBe('unknown');
  });
  it('relayer down is reported only when configured', () => {
    let s = run(initNetState(true), cfg([1], true), rpcProbe(1, okRes()), relProbe(fail), relProbe(fail));
    expect(summarize(s, NOW)).toMatchObject({
      overall: 'relayer-down',
      errorCode: 'RELAYER_UNREACHABLE',
      relayer: 'unreachable',
    });
    s = run(s, cfg([1], false));
    expect(summarize(s, NOW)).toMatchObject({ overall: 'ok', relayer: 'not-configured' });
    expect(run(s, relProbe(fail)).relayer.failures).toBe(0);
  });
  it('clock skew over 120 s flags CLOCK_SKEW, 120 exactly does not', () => {
    const at = (skew: number) =>
      run(initNetState(true), cfg([1], false), rpcProbe(1, okRes(50, NOW / 1000 - skew)));
    expect(summarize(at(600), NOW)).toMatchObject({ overall: 'clock-skew', errorCode: 'CLOCK_SKEW' });
    expect(summarize(at(-600), NOW).overall).toBe('clock-skew');
    expect(summarize(at(120), NOW).overall).toBe('ok');
    expect(at(600).rpc[1]?.clockSkewSec).toBe(600);
  });
  it('old successes become stale', () => {
    const s = run(initNetState(true), cfg([1], false), rpcProbe(1, okRes(), NOW - 400_000));
    expect(effective(s.rpc[1]!, NOW, s.config)).toBe('stale');
    expect(effective(s.rpc[1]!, NOW - 399_000, s.config)).toBe('reachable');
    expect(effective(initNetState(true).relayer, NOW, DEFAULT_NET_CONFIG)).toBe('unknown');
  });
  it('rejects hostile probe data', () => {
    const s0 = run(initNetState(true), cfg([1], false));
    for (const bad of [okRes(-1), okRes(NaN), okRes(10, -5), okRes(10, Infinity)]) {
      const s = run(s0, rpcProbe(1, bad));
      expect(s.rpc[1]?.lastReason).toBe('bad-response');
      expect(s.rpc[1]?.reachability).not.toBe('reachable');
    }
    expect(run(s0, rpcProbe(1, okRes(), NaN))).toBe(s0);
    expect(run(s0, rpcProbe(2, okRes()))).toBe(s0); // unconfigured chain
    expect(run(s0, rpcProbe(-1, okRes()))).toBe(s0);
    expect(run(s0, relProbe(okRes()))).toBe(s0); // relayer not configured
  });
  it('configure sanitises and caps chain list', () => {
    const many = Array.from({ length: 200 }, (_, i) => i + 1);
    const s = run(initNetState(true), cfg([...many, 0, -3, 1.5, NaN, 5], true));
    expect(s.configuredChains).toHaveLength(MAX_TRACKED_CHAINS);
    expect(Object.keys(s.rpc)).toHaveLength(MAX_TRACKED_CHAINS);
    const kept = run(s, rpcProbe(2, okRes()), cfg([2], true));
    expect(Object.keys(kept.rpc)).toEqual(['2']);
    expect(kept.rpc[2]?.reachability).toBe('reachable');
  });
  it('degraded and down priority: down beats degraded', () => {
    const s = run(
      initNetState(true),
      cfg([1, 2], false),
      rpcProbe(1, okRes(9999)),
      rpcProbe(2, fail),
      rpcProbe(2, fail),
    );
    expect(summarize(s, NOW).overall).toBe('rpc-down');
  });
  it('does not mutate previous state', () => {
    const s0 = run(initNetState(true), cfg([1], false));
    const snap = JSON.stringify(s0);
    run(s0, rpcProbe(1, fail));
    expect(JSON.stringify(s0)).toBe(snap);
  });
  it('state never contains URLs', () => {
    const s = run(initNetState(true), cfg([1], true), rpcProbe(1, okRes()), relProbe(fail));
    expect(JSON.stringify(s)).not.toMatch(/http|:\/\//);
  });
  it('property: arbitrary event sequences keep invariants', () => {
    const res = fc.oneof(
      fc.record({
        ok: fc.constant(true as const),
        latencyMs: fc.double({ noNaN: false }),
        blockTimestampSec: fc.option(fc.double(), { nil: undefined }),
      }),
      fc.record({
        ok: fc.constant(false as const),
        reason: fc.constantFrom('timeout', 'network', 'http', 'chain-mismatch', 'bad-response' as const),
      }),
    );
    const ev = fc.oneof(
      fc.constant<NetEvent>({ type: 'browser-online' }),
      fc.constant<NetEvent>({ type: 'browser-offline' }),
      fc.record({
        type: fc.constant('configure' as const),
        chainsWithRpc: fc.array(fc.integer({ min: -2, max: 5 })),
        hasRelayer: fc.boolean(),
      }),
      fc.record({
        type: fc.constant('probe' as const),
        target: fc.oneof(
          fc.record({ kind: fc.constant('rpc' as const), chainId: fc.integer({ min: -1, max: 6 }) }),
          fc.constant({ kind: 'relayer' as const }),
        ),
        result: res as fc.Arbitrary<ProbeResult>,
        atMs: fc.double(),
      }),
    );
    fc.assert(
      fc.property(fc.array(ev, { maxLength: 40 }), (events) => {
        const s = run(initNetState(true), ...events);
        for (const e of Object.values(s.rpc)) expect(e.failures).toBeGreaterThanOrEqual(0);
        expect(s.configuredChains.every((c) => c > 0)).toBe(true);
        expect(() => summarize(s, NOW)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });
});

describe('backoffMs', () => {
  it('grows and caps with jitter in [cap/2, cap)', () => {
    expect(backoffMs(0, 0)).toBe(1000);
    expect(backoffMs(1, 0)).toBe(2000);
    expect(backoffMs(2, 0.5)).toBe(6000);
    expect(backoffMs(50, 0.999999)).toBeLessThan(60_000);
    expect(backoffMs(50, 0)).toBe(30_000);
  });
  it('sanitises junk', () => {
    expect(backoffMs(NaN, NaN)).toBe(1000);
    expect(backoffMs(-5, 5)).toBeGreaterThanOrEqual(1000);
    expect(backoffMs(1, -1)).toBe(2000);
  });
});
