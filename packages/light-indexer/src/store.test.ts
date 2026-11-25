import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ANNOUNCER, hx } from './fake.testutil.js';
import { LogStore, StoreError, type BlockBatch, type StoredHeader } from './store.js';
import type { Hex } from './wire.js';

const ID = { chainId: 31337, announcer: ANNOUNCER, indexedFrom: 0n };
const h = (n: number, salt = 0): StoredHeader => ({ number: BigInt(n), hash: hx((n * 7 + salt) & 0xff, 32), parentHash: n === 0 ? hx(0, 32) : hx(((n - 1) * 7 + salt) & 0xff, 32), omitted: 0 });
const ann = (b: StoredHeader, logIndex: number) => ({
  blockNumber: b.number,
  blockHash: b.hash,
  logIndex,
  transactionHash: hx(0x33, 32),
  schemeId: 1n,
  stealthAddress: hx(0x44, 20),
  caller: hx(0xaa, 20),
  ephemeralPublicKey: `0x02${'55'.repeat(32)}` as Hex,
  metadata: '0xab' as Hex,
});
const blocks = (from: number, to: number, salt = 0): BlockBatch[] =>
  Array.from({ length: to - from + 1 }, (_, i) => {
    const hd = h(from + i, salt);
    return { header: hd, announcements: (from + i) % 2 === 0 ? [ann(hd, 0), ann(hd, 1)] : [] };
  });

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmpDb = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'light-indexer-'));
  dirs.push(d);
  return join(d, 'index.sqlite');
};

describe('LogStore', () => {
  it('appends contiguous blocks and reads headers and announcements back in order', () => {
    const s = LogStore.open(':memory:', ID);
    expect(s.tip()).toBeUndefined();
    s.appendBlocks(blocks(0, 4));
    expect(s.tip()?.number).toBe(4n);
    expect(s.headers(1n, 3n).map((x) => x.number)).toEqual([1n, 2n, 3n]);
    expect(s.header(9n)).toBeUndefined();
    expect(s.announcements(0n, 4n, 100).map((a) => [a.blockNumber, a.logIndex])).toEqual([[0n, 0], [0n, 1], [2n, 0], [2n, 1], [4n, 0], [4n, 1]]);
    expect(s.announcements(0n, 4n, 3)).toHaveLength(3);
    s.close();
  });
  it('refuses gaps, broken parent links, wrong start and foreign announcements, writing nothing', () => {
    const s = LogStore.open(':memory:', ID);
    expect(() => s.appendBlocks(blocks(1, 2))).toThrow(StoreError); // must start at indexedFrom
    s.appendBlocks(blocks(0, 1));
    expect(() => s.appendBlocks(blocks(3, 4))).toThrow(StoreError); // gap
    expect(() => s.appendBlocks(blocks(2, 3, 1))).toThrow(StoreError); // parent link broken
    const hd = h(2);
    expect(() => s.appendBlocks([{ header: hd, announcements: [{ ...ann(hd, 0), blockHash: hx(1, 32) }] }])).toThrow(StoreError);
    expect(() => s.appendBlocks([{ header: hd, announcements: [{ ...ann(hd, 0), blockNumber: 3n }] }])).toThrow(StoreError);
    expect(s.tip()?.number).toBe(1n);
    // a failing statement inside the transaction rolls the whole batch back
    expect(() => s.appendBlocks([{ header: hd, announcements: [ann(hd, 0), ann(hd, 0)] }])).toThrow();
    expect(s.tip()?.number).toBe(1n);
    expect(s.announcements(2n, 2n, 10)).toEqual([]);
    s.close();
  });
  it('rolls back to a common ancestor atomically, or empties the store', () => {
    const s = LogStore.open(':memory:', { ...ID, indexedFrom: 10n });
    s.appendBlocks(blocks(10, 16));
    s.rollbackTo(12n);
    expect(s.tip()?.number).toBe(12n);
    expect(s.announcements(13n, 16n, 10)).toEqual([]);
    expect(s.announcements(10n, 12n, 10)).toHaveLength(4);
    expect(() => s.rollbackTo(8n)).toThrow(StoreError);
    s.rollbackTo(9n);
    expect(s.tip()).toBeUndefined();
    s.appendBlocks(blocks(10, 11, 3)); // restart from indexedFrom on another fork
    expect(s.tip()?.hash).toBe(h(11, 3).hash);
    s.close();
  });
  it('persists across reopen, including the halt flag, and refuses a different identity', () => {
    const path = tmpDb();
    const s = LogStore.open(path, ID);
    s.appendBlocks(blocks(0, 3));
    expect(s.halted).toBe(false);
    s.halt();
    s.close();
    const again = LogStore.open(path, { ...ID, announcer: ANNOUNCER.toUpperCase().replace('0X', '0x') as Hex });
    expect(again.tip()?.number).toBe(3n);
    expect(again.halted).toBe(true);
    again.close();
    expect(() => LogStore.open(path, { ...ID, chainId: 11155111 })).toThrow(StoreError);
    expect(() => LogStore.open(path, { ...ID, announcer: hx(1, 20) })).toThrow(StoreError);
    expect(() => LogStore.open(path, { ...ID, indexedFrom: 1000n })).toThrow(StoreError);
  });
  it('rejects block numbers beyond the safe integer range', () => {
    expect(() => LogStore.open(':memory:', { ...ID, indexedFrom: 1n << 60n })).toThrow(StoreError);
    const s = LogStore.open(':memory:', ID);
    expect(() => s.header(-1n)).toThrow(StoreError);
    s.close();
  });
});
