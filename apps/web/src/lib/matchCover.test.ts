import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COVER_WINDOW_BLOCKS, MATCH_COVER_SIZE, MAX_MATCH_COVER_SIZE, coverWindow, createMatchCover } from './matchCover';

interface Item { readonly announcement: { readonly id: string; readonly blockNumber: bigint } }
const item = (id: string, block = 5n): Item => ({ announcement: { id, blockNumber: block } });
const ids = (xs: readonly { readonly item: Item }[]): string[] => xs.map((s) => s.item.announcement.id);
const KEY_A = new Uint8Array(32).fill(7);
const KEY_B = new Uint8Array(32).fill(9);
const group = (i: Item): string => coverWindow(i.announcement.blockNumber);

describe('match cover planning', () => {
  it('is off unless a size of at least 2 is given, and caps the size', () => {
    expect(createMatchCover(undefined, KEY_A)).toBeUndefined();
    for (const size of [0, 1, -3, 1.5, Number.NaN]) expect(createMatchCover(size, KEY_A)).toBeUndefined();
    expect(createMatchCover(MATCH_COVER_SIZE, KEY_A)?.size).toBe(MATCH_COVER_SIZE);
    expect(createMatchCover(1_000, KEY_A)?.size).toBe(MAX_MATCH_COVER_SIZE);
    expect(() => createMatchCover(4, new Uint8Array(0))).toThrow();
  });

  it('keeps every real item once and in order, and adds size - 1 decoys per covered item from the same window', () => {
    const cover = createMatchCover(4, KEY_A)!;
    const real = [item('r1', 10n), item('r2', 20n)];
    const pool = [...'abcdefgh'].map((c) => item(c, 30n)).concat([item('far', COVER_WINDOW_BLOCKS + 10n)]);
    const steps = cover.plan(real, [...pool, ...real], { group });
    expect(ids(steps.filter((s) => !s.decoy))).toEqual(['r1', 'r2']);
    const decoys = ids(steps.filter((s) => s.decoy));
    expect(new Set(decoys).size).toBe(decoys.length);
    expect(decoys).not.toContain('r1');
    expect(decoys).not.toContain('far');
    // Two covered payments, three decoys each (a decoy shared by both is looked up once).
    expect(decoys.length).toBeGreaterThanOrEqual(3);
    expect(decoys.length).toBeLessThanOrEqual(6);
  });

  it('gives no cover to items the caller excludes and uses what is available when the window is thin', () => {
    const cover = createMatchCover(4, KEY_A)!;
    const real = [item('direct'), item('router')];
    const steps = cover.plan(real, [item('a'), item('b')], { covered: (i) => i.announcement.id === 'router', group });
    expect(ids(steps.filter((s) => !s.decoy))).toEqual(['direct', 'router']);
    expect(ids(steps.filter((s) => s.decoy)).sort()).toEqual(['a', 'b']);
    expect(cover.plan([item('direct')], [item('a')], { covered: () => false }).every((s) => !s.decoy)).toBe(true);
  });

  it('picks the same decoys for the same payment and window on every scan, and different ones for another key', () => {
    const pool = [...'abcdefghijklmnop'].map((c) => item(c));
    const real = [item('payment')];
    const decoysOf = (key: Uint8Array, seed: number): string[] => {
      let n = seed;
      // Any order source: the choice of decoys must not depend on it, only their positions.
      const cover = createMatchCover(4, key, (bound) => (n = (n * 1103515245 + 12345) >>> 0) % bound)!;
      return ids(cover.plan(real, [...pool].reverse(), { group }).filter((s) => s.decoy)).sort();
    };
    const first = decoysOf(KEY_A, 1);
    expect(first).toHaveLength(3);
    for (const seed of [2, 3, 99]) expect(decoysOf(KEY_A, seed)).toEqual(first);
    // Candidate order does not matter either.
    const shuffled = createMatchCover(4, KEY_A)!;
    expect(ids(shuffled.plan(real, pool, { group }).filter((s) => s.decoy)).sort()).toEqual(first);
    expect(decoysOf(KEY_B, 1)).not.toEqual(first);
  });

  it('places the payment at every position among its cover lookups', () => {
    const cover = createMatchCover(4, KEY_A)!;
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const steps = cover.plan([item('payment')], [...'abcdef'].map((c) => item(c)), { group });
      seen.add(steps.findIndex((s) => !s.decoy));
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('holds its invariants for arbitrary pages (property)', () => {
    const arbItem = fc.record({ id: fc.stringMatching(/^[a-f0-9]{1,6}$/), block: fc.bigInt({ min: 0n, max: 5_000n }) }).map((r) => item(r.id, r.block));
    fc.assert(fc.property(fc.integer({ min: 2, max: 20 }), fc.uniqueArray(arbItem, { selector: (i) => i.announcement.id, maxLength: 6 }), fc.array(arbItem, { maxLength: 40 }), (size, real, candidates) => {
      const cover = createMatchCover(size, KEY_A)!;
      const k = cover.size;
      const steps = cover.plan(real, candidates, { group });
      expect(ids(steps.filter((s) => !s.decoy))).toEqual(real.map((r) => r.announcement.id));
      const realIds = new Set(real.map((r) => r.announcement.id));
      const decoys = steps.filter((s) => s.decoy);
      expect(new Set(ids(decoys)).size).toBe(decoys.length);
      expect(decoys.every((d) => !realIds.has(d.item.announcement.id))).toBe(true);
      expect(decoys.length).toBeLessThanOrEqual((k - 1) * real.length);
      // Every decoy shares a window with some covered payment.
      const windows = new Set(real.map(group));
      expect(decoys.every((d) => windows.has(group(d.item)))).toBe(true);
    }), { seed: 0x434f5652, numRuns: 300 });
  });
});
