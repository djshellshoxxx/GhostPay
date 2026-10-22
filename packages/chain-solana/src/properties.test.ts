import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToNumberLE } from '@noble/curves/utils.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeAnnouncementMemo, encodeAnnouncementMemo } from './announcement.js';
import { decodeMetaAddress, encodeMetaAddress, stealthKeysFromSecrets } from './keys.js';
import { L, scalarFromValue } from './secret.js';
import { signWithScalar } from './sign.js';
import { nodeVerifyEd25519 } from './reference.testutil.js';
import { seededRng } from './rng.testutil.js';
import { generateStealthKeys } from './keys.js';
import { checkAnnouncement, deriveStealthSpendScalar, deriveWithEphemeral } from './stealth.js';

const scalar = fc.bigInt({ min: 1n, max: L - 1n });

describe('properties (fast-check)', () => {
  it('derive -> memo -> scan -> spend -> sign verifies under P', () => {
    fc.assert(
      fc.property(scalar, scalar, scalar, fc.uint8Array({ maxLength: 64 }), (s, v, r, msg) => {
        fc.pre(s !== v);
        const keys = stealthKeysFromSecrets(scalarFromValue(s), scalarFromValue(v));
        const meta = decodeMetaAddress(encodeMetaAddress(keys));
        const pay = deriveWithEphemeral(meta, scalarFromValue(r));
        const ann = decodeAnnouncementMemo(encodeAnnouncementMemo(pay));
        const found = checkAnnouncement(ann, keys.viewSecret, keys.spendPublicKey, pay.stealthAddress);
        expect(found?.stealthAddress).toBe(pay.stealthAddress);
        const x = deriveStealthSpendScalar(keys.spendSecret, found!.tweak, pay.stealthPublicKey);
        const sig = signWithScalar(x, msg);
        expect(ed25519.verify(sig, msg, pay.stealthPublicKey, { zip215: false })).toBe(true);
        expect(ed25519.verify(sig, msg, pay.stealthPublicKey)).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it('a foreign view key never detects when the destination is checked', () => {
    fc.assert(
      fc.property(scalar, scalar, scalar, scalar, (s, v, v2, r) => {
        fc.pre(s !== v && v !== v2);
        const keys = stealthKeysFromSecrets(scalarFromValue(s), scalarFromValue(v));
        const pay = deriveWithEphemeral(keys, scalarFromValue(r));
        expect(
          checkAnnouncement(pay, scalarFromValue(v2), keys.spendPublicKey, pay.stealthAddress),
        ).toBeNull();
      }),
      { numRuns: 60 },
    );
  });

  it('raw-scalar signatures verify for any scalar and fail for any other key', () => {
    fc.assert(
      fc.property(scalar, scalar, fc.uint8Array({ maxLength: 100 }), (x, y, msg) => {
        fc.pre(x !== y);
        const sig = signWithScalar(scalarFromValue(x), msg);
        expect(ed25519.verify(sig, msg, ed25519.Point.BASE.multiply(x).toBytes())).toBe(true);
        expect(ed25519.verify(sig, msg, ed25519.Point.BASE.multiply(y).toBytes())).toBe(false);
        // S is canonical (< L), as strict verifiers require.
        expect(bytesToNumberLE(sig.slice(32)) < L).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it('signer: 2000 random (scalar, message) pairs verify under node:crypto and strict noble; nonce never reused', () => {
    const seenR = new Map<string, string>();
    fc.assert(
      fc.property(scalar, fc.uint8Array({ maxLength: 200 }), (x, msg) => {
        const pub = ed25519.Point.BASE.multiply(x).toBytes();
        const sig = signWithScalar(scalarFromValue(x), msg);
        expect(nodeVerifyEd25519(sig, msg, pub)).toBe(true);
        expect(ed25519.verify(sig, msg, pub, { zip215: false })).toBe(true);
        expect(bytesToNumberLE(sig.slice(32)) < L).toBe(true);
        const key = Buffer.from(sig.slice(0, 32)).toString('hex');
        const input = `${x.toString(16)}:${Buffer.from(msg).toString('hex')}`;
        // Same R only for the identical (x, message) input (determinism), never across inputs.
        expect(seenR.get(key) ?? input).toBe(input);
        seenR.set(key, input);
      }),
      { numRuns: 2000, endOnFailure: true },
    );
  });

  it('view-tag false-positive rate is about 1/256 (2048 foreign announcements, seeded)', () => {
    const keys = generateStealthKeys(seededRng('fp-rate'));
    const r = seededRng('fp-rate-r');
    const buf = new Uint8Array(32);
    let hits = 0;
    const N = 2048;
    for (let i = 0; i < N; i++) {
      r.getRandomValues(buf);
      const k = (bytesToNumberLE(buf) % (L - 1n)) + 1n;
      const ephemeralPublicKey = ed25519.Point.BASE.multiply(k).toBytes();
      if (
        checkAnnouncement({ ephemeralPublicKey, viewTag: 0x5a }, keys.viewSecret, keys.spendPublicKey) !==
        null
      ) {
        hits++;
      }
    }
    // Expected 8 (binomial(2048, 1/256)); the RNG is seeded, so the count is deterministic.
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(hits).toBeLessThanOrEqual(24);
  });
});
