import { readFileSync } from 'node:fs';
import { checkAnnouncement, deriveStealthSecret, encodeMetaAddress, parseCompressedPoint, secretScalarFromBytes, unsafeRevealSecret, zeroize } from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { describe, expect, it } from 'vitest';
import { createKeystoreApi } from './keystore-portable.js';

// Known-answer test for the unchanged v1 seller keystore (Spec 18 "Legacy keystore compatibility"). The fixed file
// below was written once by `encryptKeystore` (N=2^14) over the public TEST-ONLY keys of test-vectors/scheme1.json
// vector scheme1-001 plus a synthetic invoice signer 0x44..44. Its bytes must keep decrypting: a format change that
// breaks it would strand every backup users already hold.
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

const PASSPHRASE = 'synthetic vector harbor lantern quartz';
const SIGNING_KEY = '44'.repeat(32);
const KEYSTORE_V1 = JSON.stringify({
  v: 1,
  kdf: 'scrypt',
  kdfParams: { N: 16384, r: 8, p: 1, salt: '1f0b8f2c7bd26980b3fddfc4bb05851e' },
  cipher: 'AES-256-GCM',
  iv: '6e5a77f36728ef62fc3874e2',
  meta: {
    metaAddress: 'st:eth:0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27',
    signer: '032c0b7cf95324a07d05398b240174dc0c2be444d96b159aa6c7f7b1e668680991',
  },
  ciphertext:
    'a2eaefc7a66072801230c3173597ff2ad28b9019578d68703498c440b7719791f8cc4ba2be30ba23889accc64696eeeb2cd572c41694cfd30a1e3973efe08bec45a2293b6184c52970da1db3c753b619730303af8836491fab0791bcef705eadbc229f8e93fea54a11891ed245c0e3814fad3d719432b3ac80c2e7c525e39b01d22e702ce78206530b1c3ee6ec655a23e61bbd9d7ea0b86600d5da6405921c5914b04e7744c2d93e32a918e93368f7c1ecba3508411cf8414bbad8719e1d8a149a6f20851d1e502ad9e0be36cfd54b276d3dff60f3523029b67cd8c962321e27abf5f7b6f4626aec36bc0c1df1c72347b7dbe41566283fecc41ad5e4deb2f2d503eb',
}, null, 2);

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
      ['salt', mutate((f) => { (f['kdfParams'] as Record<string, unknown>)['salt'] = flipHexChar('1f0b8f2c7bd26980b3fddfc4bb05851e', 0); }), wrong],
      // The header is authenticated data: substituting another signer cannot pass as the same backup.
      ['signer header', mutate((f) => { (f['meta'] as Record<string, unknown>)['signer'] = hex(secp256k1.getPublicKey(Uint8Array.from(Buffer.from('55'.repeat(32), 'hex')), true)); }), wrong],
      ['truncated ciphertext', mutate((f) => { f['ciphertext'] = ct.slice(0, 64); }), wrong],
      ['truncated file', KEYSTORE_V1.slice(0, KEYSTORE_V1.length / 2), bad],
      ['extra field', mutate((f) => { f['note'] = 'x'; }), bad],
      ['unsupported version', mutate((f) => { f['v'] = 2; }), 'error.keystore.unsupportedVersion'],
      ['oversized file', KEYSTORE_V1 + ' '.repeat(8 * 1024), 'error.keystore.fileTooLarge'],
    ];
    for (const [name, text, expected] of cases) {
      const passphrase = name === 'wrong passphrase' ? 'synthetic vector harbor lantern quartzz' : PASSPHRASE;
      expect(await errorKey(api.decryptKeystore(text, passphrase)), name).toBe(expected);
    }
  });
});
