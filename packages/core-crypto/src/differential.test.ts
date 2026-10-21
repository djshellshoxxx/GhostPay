import {
  checkStealthAddress,
  computeStealthKey,
  generateStealthAddress,
  VALID_SCHEME_ID,
} from '@scopelift/stealth-address-sdk';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/utils.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { publicKeyToAddress } from 'viem/utils';
import {
  checkAnnouncement,
  deriveStealthPayment,
  deriveStealthSecret,
  encodeMetaAddress,
  generateKeySet,
  unsafeRevealSecret,
} from './index.js';
import { seededRng } from './rng.testutil.js';

const N = secp256k1.Point.Fn.ORDER;
const hex = (b: Uint8Array): `0x${string}` => `0x${bytesToHex(b)}`;

/** Independent pure-noble reference (different code path: derives the key first, then the address). */
function referenceDerive(spendPriv: bigint, viewPub: Uint8Array, eph: Uint8Array) {
  const shared = secp256k1.getSharedSecret(eph, viewPub, true);
  const digest = keccak_256(shared);
  const h = bytesToNumberBE(digest) % N;
  const stealthPriv = (spendPriv + h) % N;
  const pub = secp256k1.getPublicKey(numberToBytesBE(stealthPriv, 32), false);
  return { tag: digest[0], priv: stealthPriv, address: publicKeyToAddress(hex(pub)) };
}

describe('differential: @scopelift/stealth-address-sdk 1.0.0-beta.5 and pure-noble reference', () => {
  it('matches on 500 random key sets x 2 payments (address, tag, check, stealth key)', () => {
    const rng = seededRng('ghostpay-differential-v1');
    const stranger = generateKeySet(seededRng('stranger'));
    let payments = 0;
    for (let i = 0; i < 500; i++) {
      const keys = generateKeySet(rng);
      const meta = encodeMetaAddress(keys);
      const spendHex = hex(unsafeRevealSecret(keys.spendingSecret));
      const viewHex = hex(unsafeRevealSecret(keys.viewingSecret));
      for (let j = 0; j < 2; j++) {
        rng.outputs.length = 0;
        const mine = deriveStealthPayment(meta, rng);
        const eph = rng.outputs[0] as Uint8Array; // the only draw made by deriveStealthPayment
        const sdk = generateStealthAddress({
          stealthMetaAddressURI: meta,
          schemeId: VALID_SCHEME_ID.SCHEME_ID_1,
          ephemeralPrivateKey: eph,
        });
        expect(mine.stealthAddress).toBe(sdk.stealthAddress);
        expect(hex(mine.ephemeralPublicKey)).toBe(sdk.ephemeralPublicKey);
        expect(hex(mine.viewTag)).toBe(sdk.viewTag);
        expect(hex(mine.metadataPrefix)).toBe(sdk.viewTag);

        const ref = referenceDerive(
          bytesToNumberBE(unsafeRevealSecret(keys.spendingSecret)),
          keys.viewingPublicKey,
          eph,
        );
        expect(ref.address).toBe(mine.stealthAddress);
        expect(ref.tag).toBe(mine.viewTag[0]);

        const announcement = {
          schemeId: 1n,
          stealthAddress: mine.stealthAddress,
          ephemeralPublicKey: hex(mine.ephemeralPublicKey),
          metadata: hex(mine.metadataPrefix),
        };
        const mineCheck = checkAnnouncement(announcement, keys.viewingSecret, keys.spendingPublicKey);
        const sdkCheck = checkStealthAddress({
          ephemeralPublicKey: sdk.ephemeralPublicKey,
          schemeId: VALID_SCHEME_ID.SCHEME_ID_1,
          spendingPublicKey: hex(keys.spendingPublicKey),
          userStealthAddress: sdk.stealthAddress,
          viewingPrivateKey: viewHex,
          viewTag: sdk.viewTag,
        });
        expect(sdkCheck).toBe(true);
        expect(mineCheck).toEqual({ matches: true, stealthAddress: sdk.stealthAddress });

        // an unrelated recipient must not match (both implementations)
        const otherMine = checkAnnouncement(announcement, stranger.viewingSecret, stranger.spendingPublicKey);
        const otherSdk = checkStealthAddress({
          ephemeralPublicKey: sdk.ephemeralPublicKey,
          schemeId: VALID_SCHEME_ID.SCHEME_ID_1,
          spendingPublicKey: hex(stranger.spendingPublicKey),
          userStealthAddress: sdk.stealthAddress,
          viewingPrivateKey: hex(unsafeRevealSecret(stranger.viewingSecret)),
          viewTag: sdk.viewTag,
        });
        expect(otherMine.matches).toBe(otherSdk);

        const sdkKey = computeStealthKey({
          ephemeralPublicKey: sdk.ephemeralPublicKey,
          schemeId: VALID_SCHEME_ID.SCHEME_ID_1,
          spendingPrivateKey: spendHex,
          viewingPrivateKey: viewHex,
        });
        const mineKey = deriveStealthSecret(announcement, keys);
        expect(hex(unsafeRevealSecret(mineKey))).toBe(sdkKey);
        expect(numberToBytesBE(ref.priv, 32)).toEqual(unsafeRevealSecret(mineKey));
        payments++;
      }
    }
    expect(payments).toBe(1000);
  });
});
