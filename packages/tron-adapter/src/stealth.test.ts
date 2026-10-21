import { readFileSync } from 'node:fs';
import { generateKeySet } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { isTronAddress, tronAddressFromEvm } from './address.js';
import {
  buildAnnouncementMemo,
  checkTronAnnouncement,
  decodeTronMetaAddress,
  deriveTronStealth,
  deriveTronStealthKey,
  encodeTronMetaAddress,
  MEMO_LENGTH,
  parseAnnouncementMemo,
} from './meta.js';
import { seededRng } from './rng.testutil.js';

const V = JSON.parse(readFileSync(new URL('../test-vectors/tron.json', import.meta.url), 'utf8')) as {
  stealth: { meta: string; stealthAddress: string; memoHex: string; ephemeralPublicKey: string; viewTag: number };
};

describe('meta-address', () => {
  it('round-trips and rejects foreign/garbled input', () => {
    const k = generateKeySet(seededRng('m1'));
    const m = encodeTronMetaAddress(k);
    expect(m.startsWith('st:trx:0x')).toBe(true);
    expect(decodeTronMetaAddress(m)).toEqual({ spendingPublicKey: k.spendingPublicKey, viewingPublicKey: k.viewingPublicKey });
    for (const bad of ['', m.replace('trx', 'eth'), m.slice(0, -2), m + '00', `st:trx:0x${'00'.repeat(66)}`, 5 as unknown as string]) {
      expect(() => decodeTronMetaAddress(bad)).toThrow();
    }
  });
});

describe('stealth derive / scan / spend', () => {
  const keys = generateKeySet(seededRng('keys'));
  const meta = encodeTronMetaAddress(keys);

  it('matches the frozen cross-checked vector', () => {
    const s = deriveTronStealth(V.stealth.meta, seededRng('ghostpay-tron-vector-eph'));
    expect(s.stealthAddress).toBe(V.stealth.stealthAddress);
    expect(Buffer.from(s.memo).toString('hex')).toBe(V.stealth.memoHex);
    expect(s.viewTag).toBe(V.stealth.viewTag);
  });
  it('end to end: derive -> detect -> spend key controls address', () => {
    const s = deriveTronStealth(meta, seededRng('e1'));
    expect(isTronAddress(s.stealthAddress)).toBe(true);
    const ann = { stealthAddress: s.stealthAddress, memo: s.memo };
    expect(checkTronAnnouncement(ann, keys.viewingSecret, keys.spendingPublicKey)).toBe(true);
    const k = deriveTronStealthKey(ann, keys);
    expect(k).toHaveLength(32);
  });
  it('each payment is a fresh address', () => {
    expect(deriveTronStealth(meta).stealthAddress).not.toBe(deriveTronStealth(meta).stealthAddress);
  });
  it('does not match other recipients, tampered address, tampered memo', () => {
    const other = generateKeySet(seededRng('other'));
    const s = deriveTronStealth(meta, seededRng('e2'));
    const ann = { stealthAddress: s.stealthAddress, memo: s.memo };
    expect(checkTronAnnouncement(ann, other.viewingSecret, other.spendingPublicKey)).toBe(false);
    const w = tronAddressFromEvm('0x' + '11'.repeat(20));
    expect(checkTronAnnouncement({ ...ann, stealthAddress: w }, keys.viewingSecret, keys.spendingPublicKey)).toBe(false);
    const bad = s.memo.slice();
    bad[37] = (bad[37] as number) ^ 1;
    expect(checkTronAnnouncement({ ...ann, memo: bad }, keys.viewingSecret, keys.spendingPublicKey)).toBe(false);
    expect(checkTronAnnouncement({ ...ann, stealthAddress: 'garbage' }, keys.viewingSecret, keys.spendingPublicKey)).toBe(false);
    expect(() => deriveTronStealthKey({ ...ann, memo: bad }, keys)).toThrow();
    expect(() => deriveTronStealthKey({ ...ann, memo: new Uint8Array(3) }, keys)).toThrow();
    expect(() => deriveTronStealthKey({ ...ann, stealthAddress: w }, keys)).toThrow();
  });
  it('memo codec is strict', () => {
    const eph = new Uint8Array(33).fill(2);
    const m = buildAnnouncementMemo(eph, 7);
    expect(m).toHaveLength(MEMO_LENGTH);
    expect(parseAnnouncementMemo(m)).toEqual({ ephemeral: eph, viewTag: 7 });
    expect(parseAnnouncementMemo(m.subarray(1))).toBeUndefined();
    const bad = m.slice();
    bad[0] = 0;
    expect(parseAnnouncementMemo(bad)).toBeUndefined();
    expect(() => buildAnnouncementMemo(eph, 256)).toThrow();
    expect(() => buildAnnouncementMemo(new Uint8Array(32), 1)).toThrow();
  });
});
