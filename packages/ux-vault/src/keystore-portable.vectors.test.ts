import { readFileSync } from 'node:fs';
import { checkAnnouncement, deriveStealthSecret, encodeMetaAddress, parseCompressedPoint, secretScalarFromBytes, unsafeRevealSecret, zeroize } from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { describe, expect, it } from 'vitest';
import { createKeystoreApi } from './keystore-portable.js';
import { KEYSTORE_V1, KEYSTORE_V1_PASSPHRASE, SCHEME1_001 } from './keystore-portable.vectors.testutil.js';

// Known-answer test for the unchanged v1 seller keystore (Spec 18 "Legacy keystore compatibility"). The canonical file in
// test-vectors/seller-keystore-v1.json (via keystore-portable.vectors.testutil.ts) must keep decrypting: a format change
// that breaks it would strand every backup users already hold.
interface Scheme1Vector {
  readonly id: string;
  readonly spendingPrivateKey: string;
  readonly viewingPrivateKey: string;
  readonly metaAddress: string;
  readonly ephemeralPublicKey: string;
  readonly viewTag: string;
  readonly stealthAddress: string;
  readonly stealthPrivateKey: string;
}
const SCHEME1 = JSON.parse(readFileSync(new URL('../../../test-vectors/scheme1.json', import.meta.url), 'utf8')) as { vectors: readonly Scheme1Vector[] };
const VECTOR = SCHEME1.vectors.find((v) => v.id === 'scheme1-001')!;

const PASSPHRASE = KEYSTORE_V1_PASSPHRASE;
const SIGNING_KEY = SCHEME1_001.signing;

const api = createKeystoreApi();
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const strip = (value: string): string => value.replace(/^0x/, '').toLowerCase();

function mutate(edit: (file: Record<string, unknown>) => void): string {
  const file = JSON.parse(KEYSTORE_V1) as Record<string, unknown>;
  edit(file);
  return JSON.stringify(file, null, 2);
}
function flipHexChar(value: string, index: number): string {
  const c = value[index]!;
  return value.slice(0, index) + (c === '0' ? '1' : '0') + value.slice(index + 1);
}
async function errorKey(promise: Promise<unknown>): Promise<string | undefined> {
  try { await promise; } catch (error) { return (error as { code?: string }).code ?? String(error); }
  return undefined;
}

describe('v1 seller keystore known-answer restoration (scheme1-001)', () => {
  it('restores the vector keys, and the restored keys rederive the vector stealth address and private key', async () => {
    expect(api.validateKeystoreEnvelope(KEYSTORE_V1).meta.metaAddress).toBe(VECTOR.metaAddress);
    const restored = await api.decryptKeystore(KEYSTORE_V1, PASSPHRASE);
    const spending = secretScalarFromBytes(restored.spendingKey);
    const viewing = secretScalarFromBytes(restored.viewingKey);
    try {
      expect(hex(restored.spendingKey)).toBe(strip(VECTOR.spendingPrivateKey));
      expect(hex(restored.viewingKey)).toBe(strip(VECTOR.viewingPrivateKey));
      expect(hex(restored.signingKey)).toBe(SIGNING_KEY);
      // Public identity recomputed from the restored private keys, not read from the unencrypted header.
      const spendingPublicKey = parseCompressedPoint(secp256k1.getPublicKey(restored.spendingKey, true));
      const viewingPublicKey = parseCompressedPoint(secp256k1.getPublicKey(restored.viewingKey, true));
      expect(encodeMetaAddress({ spendingPublicKey, viewingPublicKey })).toBe(VECTOR.metaAddress);
      expect(hex(secp256k1.getPublicKey(restored.signingKey, true))).toBe(api.validateKeystoreEnvelope(KEYSTORE_V1).meta.signer);

      const announcement = { schemeId: 1n, stealthAddress: VECTOR.stealthAddress, ephemeralPublicKey: VECTOR.ephemeralPublicKey, metadata: VECTOR.viewTag };
      expect(checkAnnouncement(announcement, viewing, spendingPublicKey)).toEqual({ matches: true, stealthAddress: VECTOR.stealthAddress });
      const oneTime = deriveStealthSecret(announcement, { viewingSecret: viewing, spendingSecret: spending });
      const revealed = unsafeRevealSecret(oneTime);
      try {
        expect(hex(revealed)).toBe(strip(VECTOR.stealthPrivateKey));
      } finally {
        zeroize(revealed, oneTime);
      }
    } finally {
      zeroize(spending, viewing, restored.spendingKey, restored.viewingKey, restored.signingKey);
    }
  });

  it('a wrong passphrase and every damaged copy fail closed without returning keys', async () => {
    const wrong = 'error.keystore.wrongPassphraseOrTheKeystoreWasModified';
    const bad = 'error.keystore.invalidFile';
    const ct = (JSON.parse(KEYSTORE_V1) as { ciphertext: string }).ciphertext;
    const cases: readonly (readonly [string, string, string])[] = [
      ['wrong passphrase', KEYSTORE_V1, wrong],
      ['first ciphertext byte', mutate((f) => { f['ciphertext'] = flipHexChar(ct, 0); }), wrong],
      ['authentication tag', mutate((f) => { f['ciphertext'] = flipHexChar(ct, ct.length - 1); }), wrong],
      ['nonce', mutate((f) => { f['iv'] = flipHexChar(f['iv'] as string, 0); }), wrong],
      ['salt', mutate((f) => { (f['kdfParams'] as Record<string, unknown>)['salt'] = flipHexChar((f['kdfParams'] as Record<string, string>)['salt']!, 0); }), wrong],
      // The header is authenticated data: substituting another signer cannot pass as the same backup.
      ['signer header', mutate((f) => { (f['meta'] as Record<string, unknown>)['signer'] = hex(secp256k1.getPublicKey(Uint8Array.from(Buffer.from('66'.repeat(32), 'hex')), true)); }), wrong],
      ['truncated ciphertext', mutate((f) => { f['ciphertext'] = ct.slice(0, 64); }), wrong],
      ['truncated file', KEYSTORE_V1.slice(0, KEYSTORE_V1.length / 2), bad],
      ['extra field', mutate((f) => { f['note'] = 'x'; }), bad],
      ['unsupported version', mutate((f) => { f['v'] = 2; }), 'error.keystore.unsupportedVersion'],
      ['oversized file', KEYSTORE_V1 + ' '.repeat(8 * 1024), 'error.keystore.fileTooLarge'],
    ];
    for (const [name, text, expected] of cases) {
      const passphrase = name === 'wrong passphrase' ? `${PASSPHRASE}x` : PASSPHRASE;
      expect(await errorKey(api.decryptKeystore(text, passphrase)), name).toBe(expected);
    }
  });
});
