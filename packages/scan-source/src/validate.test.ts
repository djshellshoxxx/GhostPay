import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeSet, parseAnnouncement, setHash } from './validate.js';
import { rawAnn } from './testutil.js';

describe('parseAnnouncement', () => {
  it('accepts a good record, normalises case and recomputes id', () => {
    const r = { ...rawAnn(10, 3), stealthAddress: `0x${'AB'.repeat(20)}`, schemeId: 1n, blockNumber: 10, id: 'evil' };
    const a = parseAnnouncement(r);
    expect(a?.stealthAddress).toBe(`0x${'ab'.repeat(20)}`);
    expect(a?.blockNumber).toBe(10n);
    expect(a?.id).toBe(`${String(rawAnn(10, 3)['blockHash'])}:3`);
  });
  it('rejects every malformed field', () => {
    const bads: Record<string, unknown>[] = [
      { schemeId: '2' }, { schemeId: 'x' }, { schemeId: -1 }, { schemeId: 1.5 }, { schemeId: 2n ** 64n }, { schemeId: '18446744073709551616' }, { schemeId: undefined },
      { stealthAddress: '0x12' }, { stealthAddress: 5 }, { stealthAddress: `0x${'zz'.repeat(20)}` },
      { caller: '0x' }, { ephemeralPublicKey: `0x${'02'.repeat(32)}` }, { metadata: '0x' }, { metadata: '0xabc' }, { metadata: `0x${'00'.repeat(5000)}` },
      { blockHash: '0x00' }, { blockNumber: '-1' }, { blockNumber: 'a' }, { blockNumber: null },
      { logIndex: -1 }, { logIndex: 1.5 }, { logIndex: '1' }, { logIndex: 2 ** 32 },
    ];
    for (const b of bads) expect(parseAnnouncement({ ...rawAnn(10, 3), ...b }), JSON.stringify(b, (_, v: unknown) => (typeof v === 'bigint' ? String(v) : v))).toBeUndefined();
    for (const x of [null, undefined, 5, 'str', []]) expect(parseAnnouncement(x)).toBeUndefined();
    expect(parseAnnouncement(rawAnn(1, 1), 2n)).toBeUndefined();
  });
  it('fuzz: arbitrary junk never throws', () => {
    fc.assert(fc.property(fc.anything(), (x) => { parseAnnouncement(x); }), { numRuns: 500 });
    fc.assert(fc.property(fc.object({ maxDepth: 2 }), (x) => { parseAnnouncement({ ...rawAnn(1, 1), ...x }); }), { numRuns: 300 });
  });
});

describe('normalizeSet / setHash', () => {
  const a = parseAnnouncement(rawAnn(10, 1));
  const b = parseAnnouncement(rawAnn(10, 0));
  const c = parseAnnouncement(rawAnn(20, 0));
  it('sorts, dedupes, drops outside', () => {
    if (!a || !b || !c) throw new Error('fixture');
    const r = normalizeSet([c, a, b, a], 5n, 15n);
    expect(r.announcements.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(r.dropped).toBe(2);
    expect(normalizeSet([a, b, c], 0n, 30n).announcements.map((x) => x.blockNumber)).toEqual([10n, 10n, 20n]);
  });
  it('setHash is order independent and sensitive to every field', () => {
    if (!a || !b || !c) throw new Error('fixture');
    expect(setHash([a, b, c])).toBe(setHash([c, b, a]));
    expect(setHash([a, b])).not.toBe(setHash([a, c]));
    expect(setHash([])).toMatch(/^[0-9a-f]{64}$/);
    const a2 = { ...a, metadata: '0xac' as const };
    expect(setHash([a2])).not.toBe(setHash([a]));
  });
});
