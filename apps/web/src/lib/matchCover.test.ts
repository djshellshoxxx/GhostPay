import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MATCH_COVER_SHARE, createMatchCover, type CoverItem } from './matchCover';

interface Item extends CoverItem { readonly tag: string }
let seq = 0;
/** A router announcement: everything but id, block and log index is its reorg-stable content. */
function item(tag: string, block = 5n, logIndex = seq++, content: Partial<CoverItem['announcement']> = {}): Item {
  return { tag, announcement: { id: `0x${block.toString(16)}:${logIndex}`, blockNumber: block, logIndex, transactionHash: `0x${tag}`, ephemeralPublicKey: `eph-${tag}`, stealthAddress: `addr-${tag}`, metadata: `meta-${tag}`, ...content } };
}
const tags = (xs: readonly { readonly item: Item }[]): string[] => xs.map((s) => s.item.tag);
const decoysOf = (xs: readonly { readonly item: Item; readonly decoy: boolean }[]): string[] => tags(xs.filter((s) => s.decoy));
const KEY_A = new Uint8Array(32).fill(7);
const KEY_B = new Uint8Array(32).fill(9);
const pool = (n: number): Item[] => Array.from({ length: n }, (_, i) => item(`c${i}`, BigInt(i), 0));

describe('match cover planning', () => {
  it('is off unless explicitly enabled, and needs the viewing key', () => {
    expect(createMatchCover(undefined, KEY_A)).toBeUndefined();
    expect(createMatchCover(false, KEY_A)).toBeUndefined();
    expect(createMatchCover(true, KEY_A)).toBeDefined();
    expect(() => createMatchCover(true, new Uint8Array(0))).toThrow();
  });

  it('selects a stable share of announcements: the same answer in every pool, page and reorg', () => {
    const cover = createMatchCover(true, KEY_A)!;
    const many = pool(2000);
    const share = many.filter((c) => cover.selects(c)).length / many.length;
    expect(share).toBeGreaterThan(MATCH_COVER_SHARE - 0.05);
    expect(share).toBeLessThan(MATCH_COVER_SHARE + 0.05);
    // A reorg changes block hash (id), block number and log index, not the announcement's content.
    for (const c of many.slice(0, 200)) {
      const moved = item(c.tag, c.announcement.blockNumber + 3n, c.announcement.logIndex + 7);
      expect(cover.selects(moved)).toBe(cover.selects(c));
    }
    // Another key selects differently.
    const other = createMatchCover(true, KEY_B)!;
    expect(many.some((c) => other.selects(c) !== cover.selects(c))).toBe(true);
  });

  it('decides an altered copy independently: no field of the content keeps the original decision', () => {
    const cover = createMatchCover(true, KEY_A)!;
    const many = pool(400);
    for (const field of ['transactionHash', 'ephemeralPublicKey', 'stealthAddress', 'metadata'] as const) {
      const changed = many.filter((c) => cover.selects(item(c.tag, 1n, 1, { [field]: `altered-${c.tag}` })) !== cover.selects(c)).length;
      // About half differ when the field is hashed; none would differ if it were ignored.
      expect(changed, field).toBeGreaterThan(150);
    }
  });

  it('adds the selected cover of every page, whether or not it holds a payment', () => {
    const cover = createMatchCover(true, KEY_A)!;
    const others = pool(40);
    const expected = others.filter((c) => cover.selects(c)).map((c) => c.tag);
    expect(expected.length).toBeGreaterThan(0);
    expect(decoysOf(cover.plan([], others))).toEqual(expected);
    expect(decoysOf(cover.plan([item('real', 7_000n)], others))).toEqual(expected);
  });

  it('keeps every real item once, never as cover, and never caps a busy page', () => {
    const cover = createMatchCover(true, KEY_A)!;
    const others = pool(500);
    const real = [others[3]!, others[400]!];
    const steps = cover.plan(real, [...others, ...others.slice(0, 50)]);
    expect(tags(steps.filter((s) => !s.decoy))).toEqual(['c3', 'c400']);
    const expected = others.filter((c) => cover.selects(c) && !real.includes(c)).map((c) => c.tag);
    expect(expected.length).toBeGreaterThan(200);
    expect(decoysOf(steps)).toEqual(expected);
  });

  it('puts everything in chain order, even when a real item arrives out of it', () => {
    const cover = createMatchCover(true, KEY_A)!;
    const others = pool(60);
    // Deduplication can put a later claim in an earlier replay's place; that order must not reach the provider.
    const real = [item('late', 55n, 9), item('early', 2n, 9)];
    const blocks = cover.plan(real, others).map((s) => s.item.announcement.blockNumber);
    expect([...blocks].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(blocks);
    expect(tags(cover.plan(real, others).filter((s) => !s.decoy))).toEqual(['early', 'late']);
  });

  it('is split-independent: pages together look up exactly what one page over the same blocks would', () => {
    fc.assert(fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 999 }), { maxLength: 30 }), fc.integer({ min: 0, max: 999 }), (blocks, cut) => {
      const cover = createMatchCover(true, KEY_A)!;
      const all = blocks.map((b) => item(`b${b}`, BigInt(b), 0));
      const low = all.filter((c) => c.announcement.blockNumber < BigInt(cut));
      const high = all.filter((c) => c.announcement.blockNumber >= BigInt(cut));
      const split = [...decoysOf(cover.plan([], low)), ...decoysOf(cover.plan([], high))];
      expect(split.sort()).toEqual(decoysOf(cover.plan([], all)).sort());
    }), { seed: 0x434f5632, numRuns: 200 });
  });

  it('refuses to plan or select after dispose', () => {
    const cover = createMatchCover(true, KEY_A)!;
    cover.dispose();
    expect(() => cover.plan([item('r')], [])).toThrow();
    expect(() => cover.selects(item('c'))).toThrow();
  });
});
