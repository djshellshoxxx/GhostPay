/**
 * PRIV-06 finding F1: localCheckpointStore write rules (no last-writer-wins).
 *
 * - A plain save is forward-only: it never replaces a stored cursor with an older one.
 * - A save with `expected` is a compare-and-swap: it writes only while the slot still holds exactly `expected` (`null` for an
 *   empty slot), so the slot's owner can move it backward but a writer that lost the slot cannot.
 * - An unreadable or malformed stored value counts as an empty slot.
 *
 * Synthetic cursors and an in-memory Storage only; the seeded multi-writer case models several tabs sharing one localStorage.
 */
import type { ScanCursor } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import { checkpointKeyId, localCheckpointStore, type CheckpointStore } from './scanClient';

const CHAIN = 84532;
const KEY = checkpointKeyId('02aa', '03bb');
const OTHER_KEY = checkpointKeyId('02cc', '03dd');
const VIEW = new Uint8Array(32).fill(5);
const hashOf = (n: number): `0x${string}` => `0x${n.toString(16).padStart(64, '0')}`;
const at = (next: number, salt = 0): ScanCursor => ({ nextBlock: BigInt(next), last: { number: BigInt(next - 1), hash: hashOf(next * 7 + salt) } });

function memory() {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
  return { map, storage, open: (): CheckpointStore => localCheckpointStore(storage, (_id, use) => use(VIEW)) };
}

/** Writes raw text into the slot the store uses for (CHAIN, KEY): found as the only key that a save created. */
function slotName(m: ReturnType<typeof memory>): string {
  const probe = m.open();
  probe.save(CHAIN, KEY, at(1));
  const [name] = [...m.map.keys()];
  probe.clear(CHAIN, KEY);
  return name!;
}

describe('localCheckpointStore plain save is forward-only', () => {
  it('writes into an empty slot and moves forward', () => {
    const s = memory().open();
    s.save(CHAIN, KEY, at(100));
    expect(s.load(CHAIN, KEY)).toEqual(at(100));
    s.save(CHAIN, KEY, at(200));
    expect(s.load(CHAIN, KEY)).toEqual(at(200));
  });

  it('refuses an older cursor and keeps the newer one', () => {
    const s = memory().open();
    s.save(CHAIN, KEY, at(200));
    s.save(CHAIN, KEY, at(199));
    s.save(CHAIN, KEY, { nextBlock: 0n });
    expect(s.load(CHAIN, KEY)).toEqual(at(200));
  });

  it('accepts the same height with another anchor (the later writer of an equal position wins)', () => {
    const s = memory().open();
    s.save(CHAIN, KEY, at(200, 1));
    s.save(CHAIN, KEY, at(200, 2));
    expect(s.load(CHAIN, KEY)).toEqual(at(200, 2));
  });

  it('keeps each chain and key scope independent', () => {
    const s = memory().open();
    s.save(CHAIN, KEY, at(500));
    s.save(CHAIN, OTHER_KEY, at(10));
    s.save(CHAIN + 1, KEY, at(20));
    expect(s.load(CHAIN, KEY)).toEqual(at(500));
    expect(s.load(CHAIN, OTHER_KEY)).toEqual(at(10));
    expect(s.load(CHAIN + 1, KEY)).toEqual(at(20));
  });
});

describe('localCheckpointStore save with `expected` is a compare-and-swap', () => {
  it('lets the owner move its own checkpoint backward (reorg rollback, replay, restart)', () => {
    const s = memory().open();
    s.save(CHAIN, KEY, at(900), null);
    s.save(CHAIN, KEY, at(300), at(900));
    expect(s.load(CHAIN, KEY)).toEqual(at(300));
    s.save(CHAIN, KEY, { nextBlock: 0n }, at(300));
    expect(s.load(CHAIN, KEY)).toEqual({ nextBlock: 0n });
  });

  it('refuses a writer whose expectation is stale, whether its cursor is older or newer', () => {
    const s = memory().open();
    s.save(CHAIN, KEY, at(500));
    s.save(CHAIN, KEY, at(100), at(400));
    s.save(CHAIN, KEY, at(900), at(400));
    s.save(CHAIN, KEY, at(900), at(500, 3)); // same height, different anchor: not the cursor it read
    expect(s.load(CHAIN, KEY)).toEqual(at(500));
  });

  it('`null` means the writer saw an empty slot: refused once another writer filled it', () => {
    const s = memory().open();
    s.save(CHAIN, KEY, at(50), null);
    expect(s.load(CHAIN, KEY)).toEqual(at(50));
    s.save(CHAIN, KEY, at(60), null);
    expect(s.load(CHAIN, KEY)).toEqual(at(50));
  });

  it('refuses a writer that expected a cursor after another writer cleared the slot', () => {
    const s = memory().open();
    s.save(CHAIN, KEY, at(50));
    s.clear(CHAIN, KEY);
    s.save(CHAIN, KEY, at(60), at(50));
    expect(s.load(CHAIN, KEY)).toBeUndefined();
  });

  it('compares anchors case-insensitively', () => {
    const s = memory().open();
    const lower: `0x${string}` = `0x${'ab'.repeat(32)}`;
    const upper: `0x${string}` = `0x${'AB'.repeat(32)}`;
    s.save(CHAIN, KEY, { nextBlock: 10n, last: { number: 9n, hash: lower } });
    s.save(CHAIN, KEY, at(5), { nextBlock: 10n, last: { number: 9n, hash: upper } });
    expect(s.load(CHAIN, KEY)).toEqual(at(5));
  });

  it('treats a cursor without an anchor and one with an anchor as different', () => {
    const s = memory().open();
    s.save(CHAIN, KEY, { nextBlock: 10n });
    s.save(CHAIN, KEY, at(5), at(10));
    expect(s.load(CHAIN, KEY)).toEqual({ nextBlock: 10n });
    s.save(CHAIN, KEY, at(5), { nextBlock: 10n });
    expect(s.load(CHAIN, KEY)).toEqual(at(5));
  });
});

describe('malformed and failing storage', () => {
  it.each([
    ['not JSON', '{'],
    ['JSON null', 'null'],
    ['a number', '42'],
    ['a non-decimal position', '{"nextBlock":"0x10"}'],
    ['an oversized position', `{"nextBlock":"${'9'.repeat(21)}"}`],
    ['a null anchor', '{"nextBlock":"10","last":null}'],
    ['an empty string', ''],
  ])('a stored value with %s counts as empty: plain and null-expected saves both replace it', (_label, raw) => {
    const m = memory();
    const name = slotName(m);
    const s = m.open();
    m.map.set(name, raw);
    expect(s.load(CHAIN, KEY)).toBeUndefined();
    s.save(CHAIN, KEY, at(5));
    expect(s.load(CHAIN, KEY)).toEqual(at(5));
    m.map.set(name, raw);
    s.save(CHAIN, KEY, at(6), null);
    expect(s.load(CHAIN, KEY)).toEqual(at(6));
  });

  it('a throwing getItem refuses nothing and a throwing setItem is swallowed', () => {
    const map = new Map<string, string>();
    let failGet = true;
    const storage = {
      getItem: (k: string) => { if (failGet) throw new Error('denied'); return map.get(k) ?? null; },
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    };
    const s = localCheckpointStore(storage, (_id, use) => use(VIEW));
    expect(() => s.save(CHAIN, KEY, at(7))).not.toThrow();
    failGet = false;
    expect(s.load(CHAIN, KEY)).toEqual(at(7));
    const full = localCheckpointStore({ ...storage, setItem: () => { throw new Error('quota'); } }, (_id, use) => use(VIEW));
    expect(() => full.save(CHAIN, KEY, at(9), at(7))).not.toThrow();
    expect(s.load(CHAIN, KEY)).toEqual(at(7));
  });

  it('without the seller keys nothing is written, whatever `expected` says', () => {
    const m = memory();
    const locked = localCheckpointStore(m.storage, () => undefined);
    locked.save(CHAIN, KEY, at(7), null);
    locked.save(CHAIN, KEY, at(8));
    expect(m.map.size).toBe(0);
  });
});

/** mulberry32: small deterministic PRNG so every fuzz failure reproduces from its seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const same = (a: ScanCursor | undefined, b: ScanCursor | undefined): boolean => JSON.stringify(a, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)) === JSON.stringify(b, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));

describe('seeded multi-writer fuzz (tabs sharing one localStorage)', () => {
  it.each([1, 2, 3, 0x5eed, 20261126])('seed %i: the store follows the write rules and a stale owner never changes the slot', (seed) => {
    const next = rng(seed);
    const m = memory();
    const name = slotName(m);
    const tabs = Array.from({ length: 4 }, () => ({ store: m.open(), owned: undefined as ScanCursor | undefined }));
    let model: ScanCursor | undefined;
    const pick = (): ScanCursor => (next() < 0.1 ? { nextBlock: BigInt(Math.floor(next() * 1000)) } : at(1 + Math.floor(next() * 1000), Math.floor(next() * 3)));
    for (let step = 0; step < 2000; step++) {
      const tab = tabs[Math.floor(next() * tabs.length)]!;
      const op = next();
      const before = model;
      if (op < 0.2) {
        tab.owned = tab.store.load(CHAIN, KEY);
      } else if (op < 0.55) {
        // An owner write as runScan makes it: expected is the cursor this tab last read or wrote.
        const cursor = pick();
        tab.store.save(CHAIN, KEY, cursor, tab.owned ?? null);
        if (same(model, tab.owned)) { model = cursor; tab.owned = cursor; }
        else expect(m.open().load(CHAIN, KEY)).toEqual(before);
      } else if (op < 0.85) {
        const cursor = pick();
        tab.store.save(CHAIN, KEY, cursor);
        if (model === undefined || cursor.nextBlock >= model.nextBlock) model = cursor;
      } else if (op < 0.95) {
        tab.store.clear(CHAIN, KEY);
        model = undefined;
      } else {
        m.map.set(name, next() < 0.5 ? '{' : '{"nextBlock":"x"}');
        model = undefined;
      }
      expect(m.open().load(CHAIN, KEY)).toEqual(model);
    }
  });
});
