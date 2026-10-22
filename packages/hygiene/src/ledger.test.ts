import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DestLedger } from './ledger.js';
import { assertNoConsolidation, sameBlockGate } from './consolidation.js';
import { HygieneError } from './errors.js';
import { A1, A2, A3 } from './fixtures.testutil.js';

const C = 84532;
const ZERO = '0x0000000000000000000000000000000000000000';

describe('DestLedger (AT-HY-3)', () => {
  it('starts empty; nextIndex 0; allocates max+1 and never reuses', () => {
    const l = new DestLedger();
    expect(l.nextIndex()).toBe(0);
    l.record(C, A1, A2, 0);
    l.record(C, A3, A2, 7);
    expect(l.nextIndex()).toBe(8);
  });
  it('rejects a second, different source (HY-CON-1)', () => {
    const l = new DestLedger();
    l.record(C, A1, A2);
    expect(l.canUse(C, A1, A3)).toEqual({ ok: false, reason: 'DEST_HAS_OTHER_SOURCE' });
    expect(() => l.record(C, A1, A3)).toThrow(HygieneError);
    expect(() => assertNoConsolidation(l, C, A1, A3)).toThrow(/DEST_HAS_OTHER_SOURCE/);
    expect(() => assertNoConsolidation(l, C, A1, A2)).not.toThrow();
  });
  it('same source again is ok (dust to same destination), case-insensitive', () => {
    const l = new DestLedger();
    l.record(C, A1, A2);
    expect(l.canUse(C, A1.toUpperCase().replace('0X', '0x'), A2)).toEqual({ ok: true });
    l.record(C, A1, A2);
    expect(l.linkedSources(C, A1)).toEqual([A2]);
  });
  it('is per chain', () => {
    const l = new DestLedger();
    l.record(C, A1, A2);
    expect(l.canUse(11155111, A1, A3)).toEqual({ ok: true });
  });
  it('refuses own-source, protocol and zero destinations', () => {
    const l = new DestLedger([A3]);
    expect(l.canUse(C, A1, A1)).toEqual({ ok: false, reason: 'DEST_IS_OWN_SOURCE' });
    expect(l.canUse(C, A3, A1)).toEqual({ ok: false, reason: 'DEST_IS_PROTOCOL' });
    expect(l.canUse(C, ZERO, A1)).toEqual({ ok: false, reason: 'DEST_IS_PROTOCOL' });
    l.record(C, A1, A2);
    expect(l.canUse(C, A2, A3)).toEqual({ ok: false, reason: 'DEST_IS_OWN_SOURCE' });
  });
  it('chain guard and address validation', () => {
    const l = new DestLedger();
    expect(() => l.canUse(1, A1, A2)).toThrow(/testnet-only/);
    expect(() => l.record(8453, A1, A2)).toThrow(HygieneError);
    expect(() => l.linkedSources(1, A1)).toThrow(HygieneError);
    expect(() => l.canUse(C, '0x12', A2)).toThrow(HygieneError);
    expect(() => l.canUse(C, `0x${'Ab'.repeat(20)}`, A2)).toThrow(/checksum/);
    expect(() => new DestLedger(['zz'])).toThrow(HygieneError);
    expect(l.linkedSources(C, A1)).toEqual([]);
  });
  it('accepts a valid EIP-55 checksummed address', () => {
    const l = new DestLedger();
    expect(l.canUse(C, '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', A2)).toEqual({ ok: true });
  });
  it('index conflicts are rejected', () => {
    const l = new DestLedger();
    l.record(C, A1, A2, 3);
    expect(() => l.record(C, A3, A2, 3)).toThrow(/index reused/);
    expect(() => l.record(C, A1, A2, 4)).toThrow(/index conflict/);
    expect(() => l.record(C, A3, A2, -1)).toThrow(HygieneError);
    expect(() => l.record(C, A3, A2, 1.5)).toThrow(HygieneError);
    l.record(C, A1, A2, 3); // same row same index ok
  });
  it('fills a missing index on an existing row', () => {
    const l = new DestLedger();
    l.record(C, A1, A2);
    l.record(C, A1, A2, 9);
    expect(l.toJSON()[0]?.index).toBe(9);
  });
  it('acknowledged reuse adds a second source but still refuses protocol/own source', () => {
    const l = new DestLedger([A3]);
    l.record(C, A1, A2);
    expect(() => l.record(C, A1, '0x5555555555555555555555555555555555555555')).toThrow();
    l.recordAcknowledgedReuse(C, A1, '0x5555555555555555555555555555555555555555');
    expect(l.linkedSources(C, A1)).toHaveLength(2);
    expect(() => l.recordAcknowledgedReuse(C, A3, A2)).toThrow(HygieneError);
    expect(() => l.recordAcknowledgedReuse(1, A1, A2)).toThrow(HygieneError);
    l.recordAcknowledgedReuse(C, '0x6666666666666666666666666666666666666666', A2); // fresh dest via reuse path
  });
  it('index space exhaustion', () => {
    const l = new DestLedger();
    l.record(C, A1, A2, 0xffff_ffff);
    expect(() => l.nextIndex()).toThrow(/exhausted/);
  });
  it('round-trips through toJSON/from', () => {
    const l = new DestLedger();
    l.record(C, A1, A2, 0);
    l.record(11155111, A3, A2, 1);
    const copy = DestLedger.from(JSON.parse(JSON.stringify(l.toJSON())) as unknown);
    expect(copy.toJSON()).toEqual(l.toJSON());
    expect(copy.nextIndex()).toBe(2);
    const rows = l.toJSON();
    (rows[0]?.sources as string[]).push(A3); // toJSON copies: mutation must not leak
    expect(l.linkedSources(C, A1)).toEqual([A2]);
  });
});

describe('DestLedger.from strictness (HY-CON-4, fuzz)', () => {
  const good = { chainId: C, destination: A1, sources: [A2], index: 0 };
  const bad: [string, unknown][] = [
    ['non-array', { rows: [] }],
    ['null', null],
    ['row null', [null]],
    ['row array', [[]]],
    ['unknown field', [{ ...good, extra: 1 }]],
    [
      'proto field',
      [
        JSON.parse(
          '{"__proto__":{"x":1},"chainId":84532,"destination":"' + A1 + '","sources":["' + A2 + '"]}',
        ),
      ],
    ],
    ['mainnet chain', [{ ...good, chainId: 1 }]],
    ['string chain', [{ ...good, chainId: '84532' }]],
    ['bad dest', [{ ...good, destination: '0x12' }]],
    ['bad source', [{ ...good, sources: ['nope'] }]],
    ['no sources', [{ ...good, sources: [] }]],
    ['sources not array', [{ ...good, sources: A2 }]],
    ['dup source', [{ ...good, sources: [A2, A2.toUpperCase().replace('0X', '0x')] }]],
    ['bad index', [{ ...good, index: -1 }]],
    ['frac index', [{ ...good, index: 0.5 }]],
    ['str index', [{ ...good, index: '1' }]],
    ['dup row', [good, { ...good, index: 1 }]],
    ['dup index', [good, { chainId: C, destination: A3, sources: [A2], index: 0 }]],
  ];
  it.each(bad)('rejects %s', (_n, v) => {
    expect(() => DestLedger.from(v)).toThrow(HygieneError);
  });
  it('accepts rows without index and an empty array', () => {
    expect(DestLedger.from([]).nextIndex()).toBe(0);
    const l = DestLedger.from([{ chainId: C, destination: A1, sources: [A2] }]);
    expect(l.toJSON()).toEqual([{ chainId: C, destination: A1, sources: [A2] }]);
  });
  it('fuzz: arbitrary JSON never throws anything but HygieneError', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        try {
          DestLedger.from(v);
        } catch (e) {
          return e instanceof HygieneError;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });
});

describe('sameBlockGate (HY-CON-3)', () => {
  it('no previous sweep: go', () => {
    expect(sameBlockGate(undefined, 10n)).toEqual({ wait: false, minBlock: 10n });
  });
  it('same block waits for the next', () => {
    expect(sameBlockGate(10n, 10n)).toEqual({ wait: true, minBlock: 11n });
  });
  it('head behind (reorg) waits', () => {
    expect(sameBlockGate(10n, 9n)).toEqual({ wait: true, minBlock: 11n });
  });
  it('next block goes', () => {
    expect(sameBlockGate(10n, 11n)).toEqual({ wait: false, minBlock: 11n });
    expect(sameBlockGate(10n, 50n)).toEqual({ wait: false, minBlock: 50n });
  });
  it('rejects negatives', () => {
    expect(() => sameBlockGate(-1n, 5n)).toThrow(HygieneError);
    expect(() => sameBlockGate(1n, -5n)).toThrow(HygieneError);
  });
});
