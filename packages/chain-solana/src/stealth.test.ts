import { ED25519_TORSION_SUBGROUP, ed25519 } from '@noble/curves/ed25519.js';
import { hexToBytes, numberToBytesLE } from '@noble/curves/utils.js';
import { describe, expect, it } from 'vitest';
import { decodeAnnouncement } from './announcement.js';
import { reduceDigest, reduceDigestNonZero } from './hash.js';
import { encodeMetaAddress, generateStealthKeys, stealthKeysFromSecrets } from './keys.js';
import { decodeAddress, Point } from './point.js';
import { seededRng } from './rng.testutil.js';
import { L, scalarFromValue, scalarValue } from './secret.js';
import { signWithScalar } from './sign.js';
import {
  addTweak,
  checkAnnouncement,
  deriveStealthPayment,
  deriveStealthSpendScalar,
  deriveWithEphemeral,
  sharedSecretPoint,
} from './stealth.js';

const rng = seededRng('stealth.test');

describe('stealth round trip', () => {
  it('sender derives, receiver detects, spend key signs for P', () => {
    const keys = generateStealthKeys(rng);
    const meta = encodeMetaAddress(keys);
    const pay = deriveStealthPayment(meta, rng);
    expect(decodeAddress(pay.stealthAddress)).toEqual(pay.stealthPublicKey);

    const ann = decodeAnnouncement(pay.announcement);
    expect(ann.viewTag).toBe(pay.viewTag);
    const found = checkAnnouncement(ann, keys.viewSecret, keys.spendPublicKey, pay.stealthAddress);
    expect(found).not.toBeNull();
    expect(found?.stealthAddress).toBe(pay.stealthAddress);

    const x = deriveStealthSpendScalar(keys.spendSecret, found!.tweak, pay.stealthPublicKey);
    expect(Point.BASE.multiply(scalarValue(x)).toBytes()).toEqual(pay.stealthPublicKey);
    const msg = new TextEncoder().encode('solana tx message');
    const sig = signWithScalar(x, msg, pay.stealthPublicKey);
    expect(ed25519.verify(sig, msg, pay.stealthPublicKey)).toBe(true);
    expect(ed25519.verify(sig, msg, pay.stealthPublicKey, { zip215: false })).toBe(true);
  });

  it('two payments to the same meta-address are unlinkable addresses', () => {
    const keys = generateStealthKeys(rng);
    const a = deriveStealthPayment(keys, rng);
    const b = deriveStealthPayment(keys, rng);
    expect(a.stealthAddress).not.toBe(b.stealthAddress);
    expect(a.ephemeralPublicKey).not.toEqual(b.ephemeralPublicKey);
  });

  it('works without an expected address (caller must then check the account)', () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    expect(checkAnnouncement(pay, keys.viewSecret, keys.spendPublicKey)?.stealthAddress).toBe(
      pay.stealthAddress,
    );
  });
});

describe('non-detection', () => {
  it('a different view key does not detect', () => {
    const keys = generateStealthKeys(rng);
    const other = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    expect(checkAnnouncement(pay, other.viewSecret, keys.spendPublicKey, pay.stealthAddress)).toBeNull();
  });

  it('a flipped view tag returns null', () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    const ann = { ephemeralPublicKey: pay.ephemeralPublicKey, viewTag: pay.viewTag ^ 1 };
    expect(checkAnnouncement(ann, keys.viewSecret, keys.spendPublicKey)).toBeNull();
  });

  it('a different destination returns null even when the view tag matches', () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    const other = deriveStealthPayment(keys, rng);
    expect(checkAnnouncement(pay, keys.viewSecret, keys.spendPublicKey, other.stealthAddress)).toBeNull();
  });

  it('a wrong spend public key derives a different P', () => {
    const keys = generateStealthKeys(rng);
    const other = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    expect(checkAnnouncement(pay, keys.viewSecret, other.spendPublicKey, pay.stealthAddress)).toBeNull();
  });

  it('hostile announcement fields return null, never throw', () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    for (const viewTag of [-1, 256, 1.5, Number.NaN]) {
      expect(
        checkAnnouncement(
          { ephemeralPublicKey: pay.ephemeralPublicKey, viewTag },
          keys.viewSecret,
          keys.spendPublicKey,
        ),
      ).toBeNull();
    }
    const Rp = Point.fromBytes(pay.ephemeralPublicKey);
    const hostile: Uint8Array[] = [
      ...ED25519_TORSION_SUBGROUP.map((h) => hexToBytes(h)),
      ...ED25519_TORSION_SUBGROUP.slice(1).map((h) => Rp.add(Point.fromBytes(hexToBytes(h), true)).toBytes()),
      numberToBytesLE(2n ** 255n - 19n + 1n, 32),
      numberToBytesLE(2n, 32),
      new Uint8Array(31),
    ];
    for (const R of hostile) {
      for (let viewTag = 0; viewTag < 256; viewTag += 51) {
        expect(
          checkAnnouncement({ ephemeralPublicKey: R, viewTag }, keys.viewSecret, keys.spendPublicKey),
        ).toBeNull();
      }
    }
  });

  it("throws only for the caller's own malformed inputs", () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    expect(() => checkAnnouncement(pay, keys.viewSecret, keys.spendPublicKey, 'not-base58-0OIl')).toThrow(
      expect.objectContaining({ code: 'INVALID_ADDRESS' }),
    );
    expect(() => checkAnnouncement(pay, keys.viewSecret, Point.ZERO.toBytes())).toThrow(
      expect.objectContaining({ code: 'INVALID_POINT' }),
    );
  });
});

describe('degenerate cases', () => {
  it('sharedSecretPoint clears the cofactor: a pure torsion point maps to the identity', () => {
    for (const h of ED25519_TORSION_SUBGROUP) {
      expect(() => sharedSecretPoint(Point.fromBytes(hexToBytes(h), true), 3n)).toThrow(
        expect.objectContaining({ code: 'IDENTITY_POINT' }),
      );
    }
    // and removes a torsion component: [8](k(Q+T)) == [8](kQ)
    const Q = Point.BASE.multiply(5n);
    const T = Point.fromBytes(hexToBytes(ED25519_TORSION_SUBGROUP[1] as string), true);
    expect(sharedSecretPoint(Q.add(T), 11n).equals(sharedSecretPoint(Q, 11n))).toBe(true);
  });

  it('addTweak rejects the identity (h = -s)', () => {
    const s = 77n;
    expect(() => addTweak(Point.BASE.multiply(s), L - s)).toThrow(
      expect.objectContaining({ code: 'IDENTITY_POINT' }),
    );
  });

  it('deriveStealthSpendScalar rejects x = 0 and a mismatching P', () => {
    const s = scalarFromValue(5n);
    expect(() => deriveStealthSpendScalar(s, scalarFromValue(L - 5n))).toThrow(
      expect.objectContaining({ code: 'ZERO_STEALTH_KEY' }),
    );
    expect(() => deriveStealthSpendScalar(s, scalarFromValue(1n), Point.BASE.multiply(7n).toBytes())).toThrow(
      expect.objectContaining({ code: 'KEY_MISMATCH' }),
    );
    expect(scalarValue(deriveStealthSpendScalar(s, scalarFromValue(L - 1n)))).toBe(4n);
  });

  it('reduceDigestNonZero rejects a digest equal to L (and 0), reduceDigest allows it', () => {
    const d = new Uint8Array(64);
    d.set(numberToBytesLE(L, 32));
    expect(() => reduceDigestNonZero(d)).toThrow(expect.objectContaining({ code: 'ZERO_HASH' }));
    expect(() => reduceDigestNonZero(new Uint8Array(64))).toThrow(
      expect.objectContaining({ code: 'ZERO_HASH' }),
    );
    expect(reduceDigest(d)).toBe(0n);
  });

  it('sender rejects S == V', () => {
    const keys = generateStealthKeys(rng);
    const bad = { spendPublicKey: keys.spendPublicKey, viewPublicKey: keys.spendPublicKey };
    expect(() => deriveWithEphemeral(bad, scalarFromValue(9n))).toThrow(
      expect.objectContaining({ code: 'KEY_REUSE' }),
    );
  });

  it('stealthKeysFromSecrets rejects s == v', () => {
    expect(() => stealthKeysFromSecrets(scalarFromValue(3n), scalarFromValue(3n))).toThrow(
      expect.objectContaining({ code: 'KEY_REUSE' }),
    );
  });
});
