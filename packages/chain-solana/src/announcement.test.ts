import { ED25519_TORSION_SUBGROUP } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes } from '@noble/curves/utils.js';
import { base64urlnopad } from '@scure/base';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_HEADER_LENGTH,
  decodeAnnouncement,
  decodeAnnouncementMemo,
  encodeAnnouncement,
  encodeAnnouncementMemo,
  MAX_ANNOUNCEMENT_METADATA,
  MEMO_PREFIX,
} from './announcement.js';
import { SolanaStealthError } from './errors.js';
import { Point } from './point.js';

const code = (c: string): unknown => expect.objectContaining({ code: c });
const R = Point.BASE.multiply(987654321n).toBytes();

describe('binary announcement', () => {
  it('has the documented layout', () => {
    const enc = encodeAnnouncement({
      ephemeralPublicKey: R,
      viewTag: 0xab,
      metadata: Uint8Array.of(1, 2, 3),
    });
    expect(enc.length).toBe(37);
    expect(enc[0]).toBe(1);
    expect(enc.subarray(1, 33)).toEqual(R);
    expect(enc[33]).toBe(0xab);
    expect(Array.from(enc.subarray(34))).toEqual([1, 2, 3]);
    const dec = decodeAnnouncement(enc);
    expect(dec.ephemeralPublicKey).toEqual(R);
    expect(dec.viewTag).toBe(0xab);
    expect(Array.from(dec.metadata)).toEqual([1, 2, 3]);
    expect(encodeAnnouncement({ ephemeralPublicKey: R, viewTag: 0 }).length).toBe(ANNOUNCEMENT_HEADER_LENGTH);
  });

  it('encode rejects bad fields', () => {
    for (const viewTag of [-1, 256, 0.5]) {
      expect(() => encodeAnnouncement({ ephemeralPublicKey: R, viewTag })).toThrow(
        code('INVALID_ANNOUNCEMENT'),
      );
    }
    expect(() =>
      encodeAnnouncement({
        ephemeralPublicKey: R,
        viewTag: 1,
        metadata: new Uint8Array(MAX_ANNOUNCEMENT_METADATA + 1),
      }),
    ).toThrow(code('INVALID_ANNOUNCEMENT'));
    expect(() =>
      encodeAnnouncement({ ephemeralPublicKey: R, viewTag: 1, metadata: [1] as unknown as Uint8Array }),
    ).toThrow(code('INVALID_ANNOUNCEMENT'));
    expect(() => encodeAnnouncement({ ephemeralPublicKey: Point.ZERO.toBytes(), viewTag: 1 })).toThrow(
      code('INVALID_ANNOUNCEMENT'),
    );
    expect(
      encodeAnnouncement({
        ephemeralPublicKey: R,
        viewTag: 1,
        metadata: new Uint8Array(MAX_ANNOUNCEMENT_METADATA),
      }).length,
    ).toBe(290);
  });

  it('decode rejects bad input', () => {
    const good = encodeAnnouncement({ ephemeralPublicKey: R, viewTag: 7 });
    const wrongVersion = good.slice();
    wrongVersion[0] = 2;
    const torsion = good.slice();
    torsion.set(hexToBytes(ED25519_TORSION_SUBGROUP[3] as string), 1);
    const nonCanon = good.slice();
    nonCanon.set(hexToBytes('ee' + 'ff'.repeat(30) + '7f'), 1);
    for (const b of [
      good.subarray(0, 33),
      new Uint8Array(291),
      wrongVersion,
      torsion,
      nonCanon,
      'x' as unknown as Uint8Array,
    ]) {
      expect(() => decodeAnnouncement(b)).toThrow(code('INVALID_ANNOUNCEMENT'));
    }
  });

  it('fuzz: decode either throws SolanaStealthError or re-encodes byte-identically', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 320 }), fc.boolean(), (raw, makeHeader) => {
        const bytes = raw.slice();
        if (makeHeader && bytes.length >= 34) {
          bytes[0] = 1;
          bytes.set(R, 1);
        }
        let dec;
        try {
          dec = decodeAnnouncement(bytes);
        } catch (e) {
          expect(e).toBeInstanceOf(SolanaStealthError);
          return;
        }
        expect(bytesToHex(encodeAnnouncement(dec))).toBe(bytesToHex(bytes));
      }),
      { numRuns: 2000 },
    );
  });

  it('property: encode/decode round trip for valid fields', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 2n ** 252n }),
        fc.integer({ min: 0, max: 255 }),
        fc.uint8Array({ maxLength: MAX_ANNOUNCEMENT_METADATA }),
        (k, viewTag, metadata) => {
          const ephemeralPublicKey = Point.BASE.multiply(k).toBytes();
          const memo = encodeAnnouncementMemo({ ephemeralPublicKey, viewTag, metadata });
          const dec = decodeAnnouncementMemo(memo);
          expect(dec.ephemeralPublicKey).toEqual(ephemeralPublicKey);
          expect(dec.viewTag).toBe(viewTag);
          expect(dec.metadata).toEqual(metadata);
          expect(decodeAnnouncement(encodeAnnouncement(dec))).toEqual(dec);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('memo form', () => {
  it('is ASCII with the documented prefix', () => {
    const memo = encodeAnnouncementMemo({ ephemeralPublicKey: R, viewTag: 1 });
    expect(memo.startsWith(MEMO_PREFIX)).toBe(true);
    expect(/^[\x21-\x7e]+$/.test(memo)).toBe(true);
    expect(memo.length).toBe(MEMO_PREFIX.length + 46);
  });

  it('rejects malformed memos', () => {
    const memo = encodeAnnouncementMemo({ ephemeralPublicKey: R, viewTag: 1 });
    const body = memo.slice(MEMO_PREFIX.length);
    // 34 bytes -> 46 chars; last char carries 4 unused bits. Flip one of them.
    const last = body.at(-1) as string;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const tweaked = body.slice(0, -1) + (alphabet[alphabet.indexOf(last) ^ 1] as string);
    const bad: unknown[] = [
      'GPST1:' + body,
      body,
      memo + '=',
      memo + '==',
      MEMO_PREFIX +
        body.replaceAll('-', '+').replaceAll('_', '/') +
        (body.includes('-') || body.includes('_') ? '' : '+'),
      MEMO_PREFIX + tweaked,
      MEMO_PREFIX + 'A'.repeat(600),
      MEMO_PREFIX + base64urlnopad.encode(new Uint8Array(10)),
      7,
    ];
    for (const b of bad)
      expect(() => decodeAnnouncementMemo(b as string)).toThrow(code('INVALID_ANNOUNCEMENT'));
  });

  it('fuzz: arbitrary memo text never throws anything but SolanaStealthError', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (s) => {
        try {
          const d = decodeAnnouncementMemo(MEMO_PREFIX + s);
          expect(encodeAnnouncementMemo(d)).toBe(MEMO_PREFIX + s);
        } catch (e) {
          expect(e).toBeInstanceOf(SolanaStealthError);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
