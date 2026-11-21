import { describe, expect, it } from 'vitest';
import {
  effective,
  initNetState,
  reduceNet,
  summarize,
  type NetState,
  type ProbeResult,
} from './netstate.js';

const NOW = 1_700_000_000_000;
const STALE_AT = NOW - 300_001;
const success: ProbeResult = { ok: true, latencyMs: 100 };

function configured(chains: number[], hasRelayer = false): NetState {
  return reduceNet(
    initNetState(true),
    { type: 'configure', chainsWithRpc: chains, hasRelayer },
    NOW,
  );
}

function rpc(s: NetState, chainId: number, result: ProbeResult = success, atMs = NOW): NetState {
  return reduceNet(s, { type: 'probe', target: { kind: 'rpc', chainId }, result, atMs }, NOW);
}

function relayer(s: NetState, atMs = NOW): NetState {
  return reduceNet(s, { type: 'probe', target: { kind: 'relayer' }, result: success, atMs }, NOW);
}

describe('network-summary stale probe regressions', () => {
  it('stops reporting healthy RPC after the configured freshness window', () => {
    const s = rpc(configured([1]), 1);
    expect(summarize(s, NOW + 300_000).overall).toBe('ok');
    expect(effective(s.rpc[1]!, NOW + 300_001, s.config)).toBe('stale');
    expect(summarize(s, NOW + 300_001).overall).toBe('unknown');
    expect(summarize(rpc(configured([1]), 1, success, STALE_AT), NOW).overall).toBe('unknown');
  });

  it('does not allow a second fresh RPC to mask a stale configured RPC', () => {
    const s = rpc(rpc(configured([1, 2]), 1, success, STALE_AT), 2);
    expect(summarize(s, NOW).overall).toBe('unknown');
  });

  it('does not report OK when its configured relayer check has expired', () => {
    const s = rpc(relayer(configured([1], true), STALE_AT), 1);
    expect(summarize(s, NOW).relayer).toBe('stale');
    expect(summarize(s, NOW).overall).toBe('unknown');
    expect(summarize(rpc(relayer(configured([1], true)), 1), NOW).overall).toBe('ok');
  });

  it('does not report an old clock-skew finding from a stale RPC probe', () => {
    const s = rpc(
      configured([1]),
      1,
      { ok: true, latencyMs: 100, blockTimestampSec: NOW / 1000 - 600 },
      STALE_AT,
    );
    expect(summarize(s, NOW).overall).toBe('unknown');
    const fresh = rpc(
      configured([1]),
      1,
      { ok: true, latencyMs: 100, blockTimestampSec: NOW / 1000 - 600 },
    );
    expect(summarize(fresh, NOW).overall).toBe('clock-skew');
  });

  it('preserves higher-priority unreachable/degraded findings', () => {
    const down = rpc(
      rpc(configured([1, 2]), 1, success, STALE_AT),
      2,
      { ok: false, reason: 'timeout' },
    );
    const downTwice = rpc(down, 2, { ok: false, reason: 'timeout' });
    expect(summarize(downTwice, NOW).overall).toBe('rpc-down');

    const slow = rpc(rpc(configured([1, 2]), 1, success, STALE_AT), 2, { ok: true, latencyMs: 5000 });
    expect(summarize(slow, NOW).overall).toBe('rpc-degraded');
  });

  it('keeps a fresh clock-skew warning ahead of an unrelated stale RPC', () => {
    const s = rpc(
      rpc(configured([1, 2]), 1, success, STALE_AT),
      2,
      { ok: true, latencyMs: 100, blockTimestampSec: NOW / 1000 - 600 },
    );
    expect(summarize(s, NOW).overall).toBe('clock-skew');
  });
});
