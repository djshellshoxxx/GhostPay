import { describe, expect, it } from 'vitest';
import { UxFeesError } from './errors.js';
import { adviseSweepTiming, type SweepTimingInput } from './timing.js';

const gwei = 1_000_000_000n;
const history = Array.from({ length: 30 }, (_, i) => BigInt(i + 1) * gwei);
const base = (over: Partial<SweepTimingInput> = {}): SweepTimingInput => ({
  history,
  now: 1_800_000_000n,
  current: 25n * gwei,
  ...over,
});
const privacyKeys = (options: Partial<SweepTimingInput>): string[] =>
  adviseSweepTiming(base(options)).privacy.map((note) => note.key);

describe('sweep timing privacy-option runtime validation', () => {
  it.each([
    ['unknown method', 'third-party'],
    ['wrong capitalization', 'SELF'],
    ['empty string', ''],
    ['number', 0],
    ['boolean', false],
    ['null', null],
    ['object', {}],
    ['array', ['self']],
  ])('rejects invalid fundingMethod (%s) rather than suppressing funding privacy guidance', (_label, value) => {
    expect(() => adviseSweepTiming(base({ fundingMethod: value as never }))).toThrow(UxFeesError);
    expect(() => adviseSweepTiming(base({ fundingMethod: value as never }))).toThrow(/fundingMethod/i);
  });

  it.each([
    ['string false', 'false'],
    ['number zero', 0],
    ['null', null],
    ['object', {}],
    ['array', []],
  ])('rejects invalid timingJitter (%s) rather than silently omitting the jitter warning', (_label, value) => {
    expect(() => adviseSweepTiming(base({ timingJitter: value as never }))).toThrow(UxFeesError);
    expect(() => adviseSweepTiming(base({ timingJitter: value as never }))).toThrow(/timingJitter/i);
  });

  it('retains true, false, self, sponsored, and omitted privacy-option behavior', () => {
    // The high current price yields `wait`; that advice must retain its privacy warning.
    expect(adviseSweepTiming(base({})).advice).toBe('wait');
    expect(privacyKeys({ fundingMethod: 'self', timingJitter: false })).toEqual([
      'fees.timing.privacy.timingLinksAddresses',
      'fees.timing.privacy.enableJitter',
      'fees.timing.privacy.selfFundedGasLinks',
      'fees.timing.privacy.waitingHelpsButNotGuaranteed',
      'fees.timing.privacy.avoidFixedSchedule',
    ]);
    expect(privacyKeys({ fundingMethod: 'sponsored', timingJitter: true })).toEqual([
      'fees.timing.privacy.timingLinksAddresses',
      'fees.timing.privacy.sponsoredRelayerSees',
      'fees.timing.privacy.waitingHelpsButNotGuaranteed',
      'fees.timing.privacy.avoidFixedSchedule',
    ]);
    expect(privacyKeys({})).toEqual([
      'fees.timing.privacy.timingLinksAddresses',
      'fees.timing.privacy.waitingHelpsButNotGuaranteed',
      'fees.timing.privacy.avoidFixedSchedule',
    ]);
  });

  it('preserves parent urgency validation', () => {
    expect(() => adviseSweepTiming(base({ urgency: 'emergency' as never }))).toThrow(/urgency/i);
  });
});
