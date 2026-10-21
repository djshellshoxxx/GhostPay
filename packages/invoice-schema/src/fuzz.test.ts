import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  FRAGMENT_PREFIX,
  InvoiceError,
  encodeBase64Url,
  encodeFragment,
  parseFragment,
  parseStrictJson,
  validateInvoice,
  canonicalize,
} from './index.js';
import { sampleSigned } from './fixtures.testutil.js';

/** Every failure must be a typed InvoiceError; anything else (TypeError, RangeError, hang) is a bug. */
async function assertFailsClosedOrValid(input: string): Promise<void> {
  try {
    const p = await parseFragment(input);
    // Accepting random input is only acceptable if it really is a well-formed envelope.
    expect(p.invoice.v).toBe(1);
  } catch (e) {
    expect(e).toBeInstanceOf(InvoiceError);
  }
}

const RUNS = { numRuns: 400 };
const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

describe('parser fuzzing', () => {
  it('random bytes behind a valid prefix', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 2000 }), async (bytes) => {
        await assertFailsClosedOrValid(FRAGMENT_PREFIX + encodeBase64Url(bytes));
      }),
      RUNS,
    );
  });
  it('random strings (any unicode) as the whole fragment and as the payload', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'binary', maxLength: 300 }), async (s) => {
        await assertFailsClosedOrValid(s);
        await assertFailsClosedOrValid(FRAGMENT_PREFIX + s);
      }),
      RUNS,
    );
  });
  it('malformed base64url: alphabet characters mixed with junk', async () => {
    const junk = fc.string({
      unit: fc.constantFrom(...b64chars.split(''), '=', '+', '/', ' ', '\n', '%', '.', '\u0000', 'é'),
      maxLength: 400,
    });
    await fc.assert(
      fc.asyncProperty(junk, async (s) => assertFailsClosedOrValid(FRAGMENT_PREFIX + s)),
      RUNS,
    );
  });
  it('oversize payloads of every shape are rejected without being parsed', async () => {
    for (const n of [16385, 20000, 100_000, 3_000_000]) {
      await expect(
        parseFragment(FRAGMENT_PREFIX + encodeBase64Url(new Uint8Array(n).fill(0x20))),
      ).rejects.toBeInstanceOf(InvoiceError);
    }
  });
  it('arbitrary JSON documents as envelopes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.json({ maxDepth: 6 }), async (j) => {
        await assertFailsClosedOrValid(FRAGMENT_PREFIX + encodeBase64Url(utf8ToBytes(j)));
      }),
      RUNS,
    );
  });
  it('mutated valid envelopes (byte-level splices, truncations, repeats)', async () => {
    const valid = utf8ToBytes(
      canonicalize({ alg: 'none', inv: sampleSigned().invoice, sig: sampleSigned().signature }),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.nat(valid.length),
        fc.uint8Array({ maxLength: 8 }),
        fc.nat(40),
        async (at, ins, del) => {
          const mutated = Uint8Array.from([
            ...valid.subarray(0, at),
            ...ins,
            ...valid.subarray(Math.min(valid.length, at + del)),
          ]);
          await assertFailsClosedOrValid(FRAGMENT_PREFIX + encodeBase64Url(mutated));
        },
      ),
      { numRuns: 600 },
    );
  });
  it('nested JSON, duplicate keys, prototype keys, huge numbers are rejected as typed errors', async () => {
    const hostile = [
      '['.repeat(8000) + ']'.repeat(8000),
      '{"a":'.repeat(2000) + 'null' + '}'.repeat(2000),
      '{"alg":"none","alg":"A256GCM"}',
      '{"__proto__":{"polluted":true}}',
      '{"alg":"none","constructor":{"prototype":{"polluted":true}}}',
      '{"alg":"none","inv":{"__proto__":{"v":1}}}',
      '{"alg":"none","inv":{"chainId":123456789012345678901234567890}}',
      '{"alg":"none","inv":{"chainId":1e400}}',
      '{"alg":"none","inv":{"chainId":0.1}}',
    ];
    const parsesButFailsSchema = ['{"alg":"\\ud800"}', '{"alg":"none","sig":"\\u0000"}'];
    for (const h of parsesButFailsSchema) {
      await assertFailsClosedOrValid(FRAGMENT_PREFIX + encodeBase64Url(utf8ToBytes(h)));
    }
    for (const h of hostile) {
      await assertFailsClosedOrValid(FRAGMENT_PREFIX + encodeBase64Url(utf8ToBytes(h)));
      expect(() => parseStrictJson(h)).toThrow(InvoiceError);
    }
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
  it('invalid unicode in text fields is rejected by the schema, not silently repaired', () => {
    const inv = sampleSigned().invoice;
    fc.assert(
      fc.property(fc.string({ unit: 'binary', minLength: 1, maxLength: 40 }), (s) => {
        try {
          const v = validateInvoice({ ...inv, memo: s });
          // accepted text must be exactly the input: well-formed, NFC, no controls
          expect(v.memo).toBe(s);
          expect(s).toBe(s.normalize('NFC'));
        } catch (e) {
          expect(e).toBeInstanceOf(InvoiceError);
        }
      }),
      { numRuns: 500 },
    );
  });
  it('arbitrary valid memo text survives plain and encrypted round trips unchanged', async () => {
    const memo = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 60 }).filter((s) => {
      try {
        return validateInvoice({ ...sampleSigned().invoice, memo: s }).memo === s;
      } catch {
        return false;
      }
    });
    await fc.assert(
      fc.asyncProperty(memo, fc.boolean(), async (m, encrypt) => {
        const signed = sampleSigned({ memo: m });
        const p = await parseFragment(await encodeFragment(signed, { encrypt }));
        expect(p.invoice.memo).toBe(m);
        expect(p.verification.signatureValid).toBe(true);
      }),
      { numRuns: 80 },
    );
  });
});
