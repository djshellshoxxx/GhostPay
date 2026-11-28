import { describe, expect, it } from 'vitest';
import { initNetState, reduceNet, summarize, type NetState } from './netstate.js';

const NOW = 1_700_000_000_000;

function configured(chains: number[] = [1]): NetState {
  return reduceNet(initNetState(true), { type: 'configure', chainsWithRpc: chains, hasRelayer: false }, NOW);
}

function probe(state: NetState, skew: number, chainId = 1): NetState {
  return reduceNet(state, {
    type: 'probe',
    target: { kind: 'rpc', chainId },
    result: { ok: true, latencyMs: 100, blockTimestampSec: NOW / 1000 - skew },
    atMs: NOW,
  }, NOW);
}

function reconnect(state: NetState): NetState {
  return reduceNet(reduceNet(state, { type: 'browser-offline' }, NOW), { type: 'browser-online' }, NOW);
}

describe('network clock-skew evidence after reconnect', () => {
  it.each([600, -600])('invalidates prior skew of %i seconds when connectivity returns', (skew) => {
    const before = probe(configured(), skew);
    expect(summarize(before, NOW).overall).toBe('clock-skew');
    const after = reconnect(before);
    expect(after.rpc[1]).toMatchObject({ reachability: 'unknown', failures: 0, clockSkewSec: undefined });
    expect(summarize(after, NOW)).toMatchObject({ overall: 'unknown', errorCode: undefined });
    expect(before.rpc[1]?.clockSkewSec).toBe(skew);
  });

  it('clears old clock evidence on every configured chain', () => {
    const after = reconnect(probe(probe(configured([1, 2]), 600), -600, 2));
    expect(summarize(after, NOW).overall).toBe('unknown');
    expect(after.rpc[1]?.clockSkewSec).toBeUndefined();
    expect(after.rpc[2]?.clockSkewSec).toBeUndefined();
  });

  it('still reports a fresh warning or a healthy result after rechecking', () => {
    const after = reconnect(probe(configured(), 600));
    expect(summarize(probe(after, -600), NOW).overall).toBe('clock-skew');
    expect(summarize(probe(after, 0), NOW).overall).toBe('ok');
  });
});
