import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COVER_WINDOW_BLOCKS, MATCH_COVER_SHARE, MAX_COVER_PER_PAGE, coverWindow, createMatchCover, type CoverItem } from './matchCover';

interface Item extends CoverItem { readonly tag: string }
let seq = 0;
/** A router announcement: `tx` and `eph` are its reorg-stable identity; id/block/logIndex may change on a reorg. */
function item(tag: string, block = 5n, logIndex = seq++, tx = tag, eph = `eph-${tag}`): Item {
  return { tag, announcement: { id: `0x${block.toString(16)}:${logIndex}`, blockNumber: block, logIndex, transactionHash: `0x${tx}`, ephemeralPublicKey: eph } };
}
const tags = (xs: readonly { readonly item: Item }[]): string[] => xs.map((s) => s.item.tag);
const KEY_A = new Uint8Array(32).fill(7);
const KEY_B = new Uint8Array(32).fill(9);
const all = (): boolean => true;

describe('match cover planning', () => {
  it('is off unless explicitly enabled, and needs the viewing key', () => {
    expect(createMatchCover(undefined, KEY_A)).toBeUndefined();
    expect(createMatchCover(false, KEY_A)).toBeUndefined();
    expect(createMatchCover(true, KEY_A)).toBeDefined();
    expect(() => createMatchCover(true, new Uint8Array(0))).toThrow();
  });

  it('selects a stable share of announcements: the same answer in every pool, page and reorg', () => {
    const cover = createMatchCover(true, KEY_A)!;
    const many = Array.from({ length: 2000 }, (_, i) => item(`c${i}`, BigInt(i % 900), i));
    const share = many.filter((c) => cover.selects(c)).length / many.length;
    expect(share).toBeGreaterThan(MATCH_COVER_SHARE - 0.05);
    expect(share).toBeLessThan(MATCH_COVER_SHARE + 0.05);
    // A reorg changes block hash (id), block number and log index, not the transaction or the ephemeral key.
    for (const c of many.slice(0, 200)) {
      const moved = item(c.tag, c.announcement.blockNumber + 3n, c.announcement.logIndex + 7, c.tag, `eph-${c.tag}`);
      expect(cover.selects(moved)).toBe(cover.selects(c));
    }
    // Another key selects differently.
    const other = createMatchCover(true, KEY_B)!;
    expect(many.some((c) => other.selects(c) !== cover.selects(c))).toBe(true);
  });

  it('keeps every real item once and in its order, merged in chain order with the selected cover of its windows', () => {
    const cover = createMatchCover(true, KEY_A)!;
    const real = [item('r1', 100n, 1), item('r2', 500n, 1)];
    const pool = Array.from({ length: 40 }, (_, i) => item(`c${i}`, BigInt(50 + i * 20), 0)).concat([item('far', COVER_WINDOW_BLOCKS + 10n, 0)]);
    const steps = cover.plan(real, [...pool, ...real], all);
    expect(tags(steps.filter((s) => !s.decoy))).toEqual(['r1', 'r2']);
    const decoys = steps.filter((s) => s.decoy).map((s) => s.item.tag);
    const expected = pool.filter((c) => cover.selects(c) && coverWindow(c.announcement.blockNumber) === 0n).map((c) => c.tag);
    expect(expected.length).toBeGreaterThan(0);
    expect([...decoys].sort()).toEqual([...expected].sort());
    expect(decoys).not.toContain('far');
    // Chain order throughout: the lookup order says nothing beyond the set itself.
    const blocks = steps.map((s) => s.item.announcement.blockNumber);
    expect([...blocks].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(blocks);
  });

  it('adds nothing when no item is covered, and nothing from windows without a covered item', () => {
    const cover = createMatchCover(true, KEY_A)!;
    const pool = Array.from({ length: 20 }, (_, i) => item(`c${i}`, 10n + BigInt(i), 0));
    expect(cover.plan([item('direct', 1n)], pool, () => false).every((s) => !s.decoy)).toBe(true);
    const otherWindow = cover.plan([item('r', COVER_WINDOW_BLOCKS * 3n)], pool, all);
    expect(otherWindow.filter((s) => s.decoy)).toHaveLength(0);
  });

  it('caps the cover of a busy page', () => {
    const cover = createMatchCover(true, KEY_A)!;
    const pool = Array.from({ length: 500 }, (_, i) => item(`c${i}`, BigInt(i), 0));
    const steps = cover.plan([item('r', 999n, 9)], pool, all);
    expect(steps.filter((s) => s.decoy)).toHaveLength(MAX_COVER_PER_PAGE);
  });

  it('is monotone: a page that sees part of a window looks up exactly the selected announcements it sees', () => {
    fc.assert(fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 999 }), { maxLength: 30 }), fc.integer({ min: 0, max: 999 }), (blocks, cut) => {
      const cover = createMatchCover(true, KEY_A)!;
      const pool = blocks.map((b) => item(`b${b}`, BigInt(b), 0));
      const real = item('real', 500n, 1);
      const full = new Set(tags(cover.plan([real], pool, all).filter((s) => s.decoy)));
      const part = tags(cover.plan([real], pool.filter((c) => c.announcement.blockNumber >= BigInt(cut)), all).filter((s) => s.decoy));
      // Below the cap the choice is per announcement, so any page's cover is the full cover restricted to that page.
      for (const t of part) expect(full.has(t)).toBe(true);
      expect(part.length).toBe([...full].filter((t) => Number(t.slice(1)) >= cut).length);
    }), { seed: 0x434f5632, numRuns: 200 });
  });

  it('refuses to plan after dispose', () => {
    const cover = createMatchCover(true, KEY_A)!;
    cover.dispose();
    expect(() => cover.plan([item('r')], [item('c')], all)).toThrow();
  });
});
