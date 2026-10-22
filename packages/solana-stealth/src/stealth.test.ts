import { describe, expect, it } from 'vitest';
import { base58 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { ANNOUNCEMENT_PREFIX, encodeAnnouncementMemo, parseAnnouncementMemo } from './announcement.js';
import { publicFromSecret } from './ed25519.js';
import type { SolanaStealthError } from './errors.js';
import { deriveStealthKeysFromSeed, generateStealthKeys } from './keys.js';
import { decodeMetaAddress, encodeMetaAddress, META_ADDRESS_PREFIX } from './meta-address.js';
import { unsafeRevealSecret, wrapScalar } from './secret.js';
import {
  checkAnnouncement,
  deriveSpendKey,
  deriveStealthPayment,
  deriveStealthPaymentWithEphemeral,
} from './stealth.js';
import { hexToBytes, loadVectors, seededRng, toHex } from './testutil.testutil.js';

const V = loadVectors();
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as SolanaStealthError).code;
  }
  return 'NO_THROW';
};
const torsion = hexToBytes(V.invalidPoints['smallOrder']?.[1] as string);

describe('test vectors (cross-checked by scripts/crosscheck_vectors.py)', () => {
  it.each(V.cases.map((c, i) => [i, c] as const))('case %i reproduces', (_i, c) => {
    const keys = deriveStealthKeysFromSeed(hexToBytes(c['seed'] as string));
    expect(toHex(unsafeRevealSecret(keys.spendSecret))).toBe(c['spendSecret']);
    expect(toHex(unsafeRevealSecret(keys.viewSecret))).toBe(c['viewSecret']);
    expect(toHex(keys.spendPublicKey)).toBe(c['spendPublicKey']);
    expect(toHex(keys.viewPublicKey)).toBe(c['viewPublicKey']);
    expect(encodeMetaAddress('devnet', keys.spendPublicKey, keys.viewPublicKey)).toBe(c['metaAddressDevnet']);
    expect(encodeMetaAddress('mainnet', keys.spendPublicKey, keys.viewPublicKey)).toBe(
      c['metaAddressMainnet'],
    );
    const r = wrapScalar(
      BigInt(
        '0x' +
          Buffer.from(hexToBytes(c['ephemeralSecret'] as string))
            .reverse()
            .toString('hex'),
      ),
    );
    const pay = deriveStealthPaymentWithEphemeral(keys.spendPublicKey, keys.viewPublicKey, r);
    expect(toHex(pay.ephemeralPublicKey)).toBe(c['ephemeralPublicKey']);
    expect(pay.viewTag).toBe(c['viewTag']);
    expect(toHex(pay.stealthPublicKey)).toBe(c['stealthPublicKey']);
    expect(pay.stealthAddress).toBe(c['stealthAddress']);
    const m = checkAnnouncement(keys.viewSecret, keys.spendPublicKey, pay.ephemeralPublicKey, pay.viewTag);
    expect(m).not.toBeNull();
    expect(toHex(unsafeRevealSecret(m!.tweak))).toBe(c['tweak']);
    const p = deriveSpendKey(keys.spendSecret, m!.tweak, pay.stealthPublicKey);
    expect(toHex(unsafeRevealSecret(p))).toBe(c['spendKey']);
    expect(encodeAnnouncementMemo(pay.ephemeralPublicKey, pay.viewTag)).toBe(c['memo']);
  });
});

describe('dual-key stealth roundtrip', () => {
  const rng = seededRng('roundtrip');
  const keys = generateStealthKeys(rng);
  it('recipient finds and can spend 50 random payments; other recipients do not', () => {
    const other = generateStealthKeys(rng);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const pay = deriveStealthPayment(keys.spendPublicKey, keys.viewPublicKey, rng);
      seen.add(pay.stealthAddress);
      const m = checkAnnouncement(keys.viewSecret, keys.spendPublicKey, pay.ephemeralPublicKey, pay.viewTag);
      expect(m?.stealthAddress).toBe(pay.stealthAddress);
      const p = deriveSpendKey(keys.spendSecret, m!.tweak, pay.stealthPublicKey);
      expect(publicFromSecret(p)).toEqual(pay.stealthPublicKey);
      expect(base58.decode(pay.stealthAddress)).toEqual(pay.stealthPublicKey);
      const o = checkAnnouncement(other.viewSecret, other.spendPublicKey, pay.ephemeralPublicKey, undefined);
      expect(o?.stealthAddress).not.toBe(pay.stealthAddress);
    }
    expect(seen.size).toBe(50); // unlinkable: fresh address every time
  });
  it('view tag filters; wrong tag returns null; tag skip still matches', () => {
    const pay = deriveStealthPayment(keys.spendPublicKey, keys.viewPublicKey, rng);
    const wrong = (pay.viewTag + 1) % 256;
    expect(checkAnnouncement(keys.viewSecret, keys.spendPublicKey, pay.ephemeralPublicKey, wrong)).toBeNull();
    expect(
      checkAnnouncement(keys.viewSecret, keys.spendPublicKey, pay.ephemeralPublicKey, undefined),
    ).not.toBeNull();
  });
  it('expected stealth key mismatch returns null / throws in deriveSpendKey', () => {
    const pay = deriveStealthPayment(keys.spendPublicKey, keys.viewPublicKey, rng);
    const m = checkAnnouncement(
      keys.viewSecret,
      keys.spendPublicKey,
      pay.ephemeralPublicKey,
      pay.viewTag,
      keys.spendPublicKey,
    );
    expect(m).toBeNull();
    const ok = checkAnnouncement(
      keys.viewSecret,
      keys.spendPublicKey,
      pay.ephemeralPublicKey,
      pay.viewTag,
      pay.stealthPublicKey,
    );
    expect(code(() => deriveSpendKey(keys.spendSecret, ok!.tweak, keys.viewPublicKey))).toBe(
      'DERIVED_KEY_INVALID',
    );
  });
  it('rejects torsion / invalid R and invalid recipient keys before secret math', () => {
    expect(code(() => checkAnnouncement(keys.viewSecret, keys.spendPublicKey, torsion, 0))).toBe(
      'INVALID_POINT',
    );
    expect(code(() => deriveStealthPayment(torsion, keys.viewPublicKey))).toBe('INVALID_POINT');
    expect(code(() => deriveStealthPayment(keys.spendPublicKey, torsion))).toBe('INVALID_POINT');
    expect(code(() => checkAnnouncement(keys.viewSecret, torsion, keys.viewPublicKey, 0))).toBe(
      'INVALID_POINT',
    );
  });
  it('deriveSpendKey rejects p == 0', () => {
    const s = wrapScalar(5n);
    const negS = wrapScalar(7237005577332262213973186563042994240857116359379907606001950938285454250984n);
    expect(code(() => deriveSpendKey(s, negS))).toBe('DERIVED_KEY_INVALID');
  });
});

describe('keys', () => {
  it('seed length is enforced', () => {
    expect(code(() => deriveStealthKeysFromSeed(new Uint8Array(31)))).toBe('INVALID_SEED');
    expect(code(() => deriveStealthKeysFromSeed(new Uint8Array(65)))).toBe('INVALID_SEED');
    expect(code(() => deriveStealthKeysFromSeed('x' as unknown as Uint8Array))).toBe('INVALID_SEED');
  });
  it('spend and view keys differ', () => {
    const k = deriveStealthKeysFromSeed(new Uint8Array(32));
    expect(k.spendPublicKey).not.toEqual(k.viewPublicKey);
  });
});

describe('meta-address', () => {
  const k = deriveStealthKeysFromSeed(new Uint8Array(32).fill(7));
  const s = encodeMetaAddress('devnet', k.spendPublicKey, k.viewPublicKey);
  it('roundtrips with cluster checks', () => {
    expect(s.startsWith(META_ADDRESS_PREFIX)).toBe(true);
    const d = decodeMetaAddress(s, 'devnet');
    expect(d.cluster).toBe('devnet');
    expect(d.spendPublicKey).toEqual(k.spendPublicKey);
    expect(d.viewPublicKey).toEqual(k.viewPublicKey);
    expect(code(() => decodeMetaAddress(s, 'mainnet'))).toBe('NETWORK_MISMATCH');
    for (const c of ['mainnet', 'testnet', 'localnet'] as const) {
      expect(decodeMetaAddress(encodeMetaAddress(c, k.spendPublicKey, k.viewPublicKey)).cluster).toBe(c);
    }
  });
  it('detects every single-character substitution', () => {
    const body = s.slice(META_ADDRESS_PREFIX.length);
    for (let i = 0; i < body.length; i += 3) {
      const ch = body[i] === '2' ? '3' : '2';
      const bad = META_ADDRESS_PREFIX + body.slice(0, i) + ch + body.slice(i + 1);
      expect(['BAD_CHECKSUM', 'INVALID_META_ADDRESS']).toContain(code(() => decodeMetaAddress(bad)));
    }
  });
  const build = (version: number, cluster: number, S: Uint8Array, Vk: Uint8Array): string => {
    // re-encode with a valid checksum to reach the later checks
    const payload = new Uint8Array([version, cluster, ...S, ...Vk]);
    const tag = new TextEncoder().encode('GhostPay/solana-stealth/v1/checksum');
    const cs = sha256(new Uint8Array([tag.length, ...tag, ...payload])).subarray(0, 4);
    return META_ADDRESS_PREFIX + base58.encode(new Uint8Array([...payload, ...cs]));
  };
  it('rejects bad prefix, length, base58, version, cluster, and invalid keys', () => {
    expect(code(() => decodeMetaAddress('st:eth:abc'))).toBe('INVALID_META_ADDRESS');
    expect(code(() => decodeMetaAddress(META_ADDRESS_PREFIX + '0OIl'))).toBe('INVALID_META_ADDRESS');
    expect(code(() => decodeMetaAddress(META_ADDRESS_PREFIX + '2222'))).toBe('INVALID_META_ADDRESS');
    expect(code(() => decodeMetaAddress('x'.repeat(200)))).toBe('INVALID_META_ADDRESS');
    expect(code(() => decodeMetaAddress(1 as unknown as string))).toBe('INVALID_META_ADDRESS');
    expect(code(() => decodeMetaAddress(build(2, 1, k.spendPublicKey, k.viewPublicKey)))).toBe(
      'UNSUPPORTED_VERSION',
    );
    expect(code(() => decodeMetaAddress(build(1, 9, k.spendPublicKey, k.viewPublicKey)))).toBe(
      'INVALID_META_ADDRESS',
    );
    expect(code(() => decodeMetaAddress(build(1, 1, torsion, k.viewPublicKey)))).toBe('INVALID_POINT');
    expect(code(() => encodeMetaAddress('devnet', torsion, k.viewPublicKey))).toBe('INVALID_POINT');
  });
});

describe('announcement memo', () => {
  const k = deriveStealthKeysFromSeed(new Uint8Array(32).fill(9));
  it('roundtrips and stays short ASCII', () => {
    const memo = encodeAnnouncementMemo(k.viewPublicKey, 200);
    expect(memo.length).toBeLessThanOrEqual(52);
    expect(/^[\x20-\x7e]+$/.test(memo)).toBe(true);
    const a = parseAnnouncementMemo(memo);
    expect(a?.viewTag).toBe(200);
    expect(a?.ephemeralPublicKey).toEqual(k.viewPublicKey);
  });
  it('ignores foreign memos and rejects malformed ones', () => {
    expect(parseAnnouncementMemo('hello')).toBeNull();
    expect(parseAnnouncementMemo(5 as unknown as string)).toBeNull();
    expect(code(() => parseAnnouncementMemo(ANNOUNCEMENT_PREFIX + '0'))).toBe('INVALID_ANNOUNCEMENT');
    expect(code(() => parseAnnouncementMemo(ANNOUNCEMENT_PREFIX + '2222'))).toBe('INVALID_ANNOUNCEMENT');
    expect(code(() => parseAnnouncementMemo(ANNOUNCEMENT_PREFIX + 'z'.repeat(100)))).toBe(
      'INVALID_ANNOUNCEMENT',
    );
    expect(
      code(() => parseAnnouncementMemo(ANNOUNCEMENT_PREFIX + base58.encode(new Uint8Array([...torsion, 1])))),
    ).toBe('INVALID_POINT');
    expect(code(() => encodeAnnouncementMemo(k.viewPublicKey, 256))).toBe('INVALID_ANNOUNCEMENT');
    expect(code(() => encodeAnnouncementMemo(k.viewPublicKey, 1.5))).toBe('INVALID_ANNOUNCEMENT');
    expect(code(() => encodeAnnouncementMemo(torsion, 1))).toBe('INVALID_POINT');
  });
});
