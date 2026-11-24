import { describe, expect, it } from 'vitest';
import { RejectSpikeDetector } from './rejectSpike.js';
import type { AlertEvent } from './alerts.js';

describe('reject spike detector', () => {
  it('alerts above 100 rejects within five minutes and deduplicates for fifteen minutes', () => {
    let now = 0;
    const events: AlertEvent[] = [];
    const detector = new RejectSpikeDetector([1], { send: (event) => events.push(event) }, () => now);
    for (let i = 0; i < 100; i++) detector.record(1);
    expect(events).toHaveLength(0);
    detector.record(1);
    expect(events).toEqual([{ kind: 'reject_spike', chainId: 1, value: 101, threshold: 100 }]);
    for (let i = 0; i < 1_000; i++) detector.record(1);
    expect(events).toHaveLength(1);
    now = 900_000;
    for (let i = 0; i < 101; i++) detector.record(1);
    expect(events).toHaveLength(2);
  });

  it('expires old rejects and aggregates unconfigured chain identifiers in one fixed bucket', () => {
    let now = 0;
    const events: AlertEvent[] = [];
    const detector = new RejectSpikeDetector([1, 2], { send: (event) => events.push(event) }, () => now);
    for (let i = 0; i < 100; i++) detector.record(1);
    now = 300_000;
    detector.record(1);
    expect(events).toHaveLength(0);
    for (let i = 0; i < 101; i++) detector.record(i + 1000);
    expect(events).toEqual([{ kind: 'reject_spike', value: 101, threshold: 100 }]);
    detector.record(2);
    expect(events).toHaveLength(1);
  });
});
