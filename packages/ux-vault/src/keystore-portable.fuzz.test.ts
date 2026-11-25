import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createKeystoreApi } from './keystore-portable.js';
import { PortableVaultError } from './portable-errors.js';
import { KEYSTORE_V1, KEYSTORE_V1_PASSPHRASE, SCHEME1_001 } from './keystore-portable.vectors.testutil.js';

// Light stability fuzzing of the v1 seller keystore reader: hostile or damaged input must fail closed with one of the
// codec's fixed diagnostics. It must never throw a raw runtime error (TypeError, RangeError, SyntaxError), never hang
// and never return keys other than the file's own.
const api = createKeystoreApi();
const ENVELOPE_CODES = new Set(['error.keystore.invalidFile', 'error.keystore.fileTooLarge', 'error.keystore.unsupportedVersion']);
const DECRYPT_CODES = new Set([
  ...ENVELOPE_CODES,
  'error.keystore.wrongPassphraseOrTheKeystoreWasModified',
  'error.keystore.invalidKeys',
  'error.keystore.theKeystoreMetadataDoesNotMatchItsIndependentSellerKeys',
]);
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

function codeOf(error: unknown): string {
  // A raw runtime error fails the property with its class name instead of a fixed code.
  return error instanceof PortableVaultError ? error.code : `${(error as Error).name}: ${(error as Error).message}`;
}
function envelopeOutcome(text: string): string {
  try { api.validateKeystoreEnvelope(text); return 'accepted'; } catch (error) { return codeOf(error); }
}
async function decryptOutcome(text: string, passphrase = KEYSTORE_V1_PASSPHRASE): Promise<string> {
  try {
    const keys = await api.decryptKeystore(text, passphrase);
    const own = hex(keys.spendingKey) === SCHEME1_001.spending && hex(keys.viewingKey) === SCHEME1_001.viewing && hex(keys.signingKey) === SCHEME1_001.signing;
    keys.spendingKey.fill(0); keys.viewingKey.fill(0); keys.signingKey.fill(0);
    return own ? 'own-keys' : 'OTHER KEYS RETURNED';
  } catch (error) {
    return codeOf(error);
  }
}

const json: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  value: fc.oneof({ depthSize: 'small' },
    fc.constant(null), fc.boolean(), fc.double(), fc.integer(), fc.string(), fc.string({ unit: fc.constantFrom(...'0123456789abcdef'), maxLength: 80 }),
    fc.array(tie('value'), { maxLength: 4 }), fc.dictionary(fc.string({ maxLength: 8 }), tie('value'), { maxKeys: 4 })),
})).value;
const FIELDS = ['v', 'kdf', 'kdfParams', 'cipher', 'iv', 'meta', 'ciphertext'] as const;
const NESTED = { kdfParams: ['N', 'r', 'p', 'salt'], meta: ['metaAddress', 'signer'] } as const;

describe('keystore envelope fuzzing (fixed diagnostics only)', () => {
  it('arbitrary text is accepted or refused with a fixed diagnostic', () => {
    fc.assert(fc.property(fc.oneof(fc.string({ maxLength: 400 }), fc.string({ unit: 'binary', maxLength: 200 }), json.map((v) => JSON.stringify(v) ?? '')), (text) => {
      const outcome = envelopeOutcome(text);
      expect(ENVELOPE_CODES.has(outcome), outcome).toBe(true);
    }), { numRuns: 600 });
  });

  it('replacing any field or nested field with arbitrary JSON never escapes the fixed diagnostics', () => {
    const base = JSON.parse(KEYSTORE_V1) as Record<string, unknown>;
    const field = fc.oneof(
      fc.constantFrom(...FIELDS).map((name) => [name] as const),
      fc.constantFrom('kdfParams', 'meta').chain((outer) => fc.constantFrom(...NESTED[outer]).map((inner) => [outer, inner] as const)),
    );
    fc.assert(fc.property(field, json, fc.boolean(), (path, value, remove) => {
      const file = structuredClone(base);
      const parent = path.length === 1 ? file : file[path[0]] as Record<string, unknown>;
      const key = path[path.length - 1]!;
      if (remove) delete parent[key]; else parent[key] = value;
      const outcome = envelopeOutcome(JSON.stringify(file));
      expect(outcome === 'accepted' || ENVELOPE_CODES.has(outcome), outcome).toBe(true);
    }), { numRuns: 800 });
  });

  it('prototype keys, duplicate keys and deep nesting are refused', () => {
    const body = KEYSTORE_V1.slice(1);
    for (const text of [
      `{"__proto__":{"v":1},${body}`,
      `{"constructor":1,${body}`,
      `{"v":1,${body}`,
      `{"v":1,"nest":${'['.repeat(64)}${']'.repeat(64)},${body.replace('"v": 1,', '')}`,
    ]) expect(envelopeOutcome(text)).toBe('error.keystore.invalidFile');
  });
});

describe('keystore decryption fuzzing (damaged copies of the fixed vector)', () => {
  it('a single-character edit anywhere either keeps the same keys or fails closed', async () => {
    await fc.assert(fc.asyncProperty(fc.nat({ max: KEYSTORE_V1.length - 1 }), fc.constantFrom(...'0123456789abcdef"{}[],: x\\'), async (at, c) => {
      const text = KEYSTORE_V1.slice(0, at) + c + KEYSTORE_V1.slice(at + 1);
      const outcome = await decryptOutcome(text);
      expect(outcome === 'own-keys' || DECRYPT_CODES.has(outcome), outcome).toBe(true);
      if (text !== KEYSTORE_V1 && outcome === 'own-keys') {
        // Only a semantically equivalent file (whitespace or a case-insensitive hex digit) can still open.
        expect(JSON.stringify(JSON.parse(text.toLowerCase()))).toBe(JSON.stringify(JSON.parse(KEYSTORE_V1)));
      }
    }), { numRuns: 30 });
  }, 120_000);

  it('arbitrary passphrases never open the file and never throw raw errors', async () => {
    await fc.assert(fc.asyncProperty(fc.string({ maxLength: 64 }).filter((p) => p !== KEYSTORE_V1_PASSPHRASE), async (passphrase) => {
      const outcome = await decryptOutcome(KEYSTORE_V1, passphrase);
      expect(outcome).toBe('error.keystore.wrongPassphraseOrTheKeystoreWasModified');
    }), { numRuns: 12 });
  }, 120_000);
});
