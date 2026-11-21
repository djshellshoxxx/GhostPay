import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import {
  buildTronAnnouncementMemo,
  decodeTronMetaAddress,
  encodeTronMetaAddress,
  LEGACY_TRON_META_PREFIX,
  parseTronAnnouncementMemo,
  TRON_MEMO_LENGTH,
  TRON_META_PREFIX,
} from './meta.js';
import { seededRng } from './testutil.testutil.js';

const code = (c: string): unknown => expect.objectContaining({ code: c });

describe('TRON meta-address codec', () => {
  it('is the core-crypto scheme-1 body under the st:trx:0x prefix', () => {
    const keys = generateKeySet(seededRng(41));
    const meta = encodeTronMetaAddress(keys);
    expect(meta).toBe(TRON_META_PREFIX + encodeMetaAddress(keys).slice(LEGACY_TRON_META_PREFIX.length));
    expect(meta).toMatch(/^st:trx:0x[0-9a-f]{132}$/);
    expect(decodeTronMetaAddress(meta)).toEqual({
      spendingPublicKey: keys.spendingPublicKey,
      viewingPublicKey: keys.viewingPublicKey,
    });
  });

  it('rejects non-strings and foreign prefixes with fixed codes', () => {
    const body = encodeTronMetaAddress(generateKeySet(seededRng(42))).slice(TRON_META_PREFIX.length);
    expect(() => decodeTronMetaAddress(42 as unknown as string)).toThrow(code('INVALID_META_ADDRESS'));
    expect(() => decodeTronMetaAddress(`st:sol:${body}`)).toThrow(code('INVALID_META_ADDRESS'));
    expect(() => decodeTronMetaAddress(`${LEGACY_TRON_META_PREFIX}${body}`)).toThrow(
      code('LEGACY_META_ADDRESS'),
    );
    expect(() => decodeTronMetaAddress(`${LEGACY_TRON_META_PREFIX}${body}`)).toThrow(/st:trx:0x/);
  });
});

describe('GPT1 announcement memo', () => {
  const R = Uint8Array.from({ length: 33 }, (_, i) => (i === 0 ? 2 : i));

  it('builds magic || R || viewTag and parses it back', () => {
    const memo = buildTronAnnouncementMemo(R, 0xab);
    expect(memo.length).toBe(TRON_MEMO_LENGTH);
    expect(Array.from(memo.subarray(0, 4))).toEqual([0x47, 0x50, 0x54, 0x31]);
    expect(parseTronAnnouncementMemo(memo)).toEqual({ ephemeralPublicKey: R, viewTag: 0xab });
  });

  it('build rejects bad fields', () => {
    for (const [r, t] of [
      [R.subarray(0, 32), 1],
      [R, -1],
      [R, 256],
      [R, 1.5],
      ['x', 1],
    ] as const) {
      expect(() => buildTronAnnouncementMemo(r as Uint8Array, t)).toThrow(code('INVALID_INPUT'));
    }
  });

  it('parse returns undefined for anything that is not a GhostPay memo', () => {
    const memo = buildTronAnnouncementMemo(R, 7);
    const wrongMagic = memo.slice();
    wrongMagic[3] = 0x32;
    for (const m of [memo.subarray(0, 37), new Uint8Array(39), wrongMagic, 'GPT1' as unknown as Uint8Array]) {
      expect(parseTronAnnouncementMemo(m)).toBeUndefined();
    }
  });
});
