// Killer tests for surviving Stryker mutants in packages/invoice-schema. Drop into packages/invoice-schema/src/.
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';
import { describe, expect, it } from 'vitest';
import {
  Base64UrlError,
  FRAGMENT_PREFIX,
  FragmentTooLargeError,
  InvoiceError,
  RandomnessError,
  SchemaError,
  canonicalize,
  createInvoice,
  decodeBase64Url,
  encodeBase64Url,
  encodeFragment,
  parseFragment,
  parseStrictJson,
  validateInvoice,
  validatePrivatePart,
  verifyInvoiceSignature,
} from './index.js';
import { newInvoiceInput, sampleInvoice, sampleSigned } from './fixtures.testutil.js';

const pathOf = (fn: () => unknown): string => {
  try { fn(); } catch (e) { if (e instanceof SchemaError) return e.path ?? 'UNDEFINED_PATH'; throw e; }
  return 'NO_THROW';
};
const apathOf = async (p: Promise<unknown>): Promise<string> => {
  try { await p; } catch (e) { if (e instanceof SchemaError) return e.path ?? 'UNDEFINED_PATH'; return `OTHER:${(e as Error).constructor.name}`; }
  return 'NO_THROW';
};
const base = sampleInvoice();
interface Draft {
  token: string; nonce: string; metaAddress: string; signer: string; memo?: string; tax?: unknown; amountPolicy?: unknown;
  quote: { source?: string }; lineItems: [{ quantity: string }]; fiat: { minorUnits: string; currency?: string };
}
const mut = (f: (o: Draft) => void): unknown => { const o = structuredClone(base) as unknown as Draft; f(o); return o; };

describe('killers: schema.ts regex anchors (garbage before/after a well-formed value must be rejected)', () => {
  const addr = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const nonce = base.nonce;
  const cases: Array<[string, (v: string) => unknown, string[]]> = [
    ['token', (v) => mut((o) => { o.token = v; }), [`zz${addr}`, `${addr}zz`, `${addr}0`]],
    ['nonce', (v) => mut((o) => { o.nonce = v; }), [`ab${nonce}`, `${nonce}ab`]],
    ['metaAddress', (v) => mut((o) => { o.metaAddress = v; }), [`x${base.metaAddress}`, `${base.metaAddress}x`]],
    ['signer', (v) => mut((o) => { o.signer = v; }), [`00${base.signer}`, `${base.signer}00`]],
    ['quote.source', (v) => mut((o) => { o.quote.source = v; }), ['chainlink:usdc\n', 'chainlink:usdc usd', '-bad']],
    ['lineItems[0].quantity', (v) => mut((o) => { o.lineItems[0].quantity = v; }), ['x2', '2x', '0', '02', '1234567890']],
    ['fiat.minorUnits', (v) => mut((o) => { o.fiat.minorUnits = v; }), ['x1', '1x', '01', '1'.repeat(31)]],
  ];
  for (const [path, build, bad] of cases) {
    it(`${path} rejects ${bad.length} malformed spellings`, () => {
      for (const v of bad) expect(pathOf(() => validateInvoice(build(v))), `${path}=${JSON.stringify(v)}`).toBe(path);
    });
  }
  it('amountPolicy.tokenAmount: garbage is a SchemaError, never a BigInt SyntaxError', () => {
    for (const v of ['x5', '5x', '0', '05', '9'.repeat(79)]) {
      expect(pathOf(() => validateInvoice(mut((o) => { o.amountPolicy = { mode: 'fixed_token', tokenAmount: v }; }))), v).toBe('amountPolicy.tokenAmount');
    }
  });
});

describe('killers: schema.ts structure', () => {
  it('rejects exotic prototypes (schema.ts:115)', () => {
    class Evil { constructor(o: object) { Object.assign(this, o); } }
    expect(pathOf(() => validateInvoice(new Evil(base)))).toBe('$');
    expect(pathOf(() => validateInvoice(Object.assign(Object.create({ inherited: 1 }), base)))).toBe('$');
  });
  it('missing nested keys report the dotted path (schema.ts:119)', () => {
    expect(pathOf(() => validateInvoice(mut((o) => { delete o.fiat.currency; })))).toBe('fiat.currency');
    expect(pathOf(() => validateInvoice(mut((o) => { delete o.quote.source; })))).toBe('quote.source');
    expect(pathOf(() => validateInvoice(mut((o) => { delete o.tax; })))).toBe('tax');
  });
  it('validatePrivatePart({}) reports $private.lineItems (schema.ts:190)', () => {
    expect(pathOf(() => validatePrivatePart({}))).toBe('$private.lineItems');
  });
  it('lone-surrogate detection is exact at the range edges (schema.ts:136-140)', () => {
    const ok = (m: string) => pathOf(() => validateInvoice(mut((o) => { o.memo = m; })));
    expect(ok('\ud800\udc00')).toBe('NO_THROW');
    expect(ok('\udbff\udfff')).toBe('NO_THROW');
    for (const bad of ['\ud800', '\udbff', '\udc00', '\udfff', 'a\udbff', '\udbffa', '\udc00\udbff', '\udbff\udbff', '\udfffa']) {
      expect(ok(bad), JSON.stringify(bad)).toBe('memo');
    }
  });
  it('createInvoice without getRandomValues is a RandomnessError (schema.ts:306)', () => {
    expect(() => createInvoice(newInvoiceInput(), {} as never)).toThrow(RandomnessError);
  });
});

describe('killers: base64url.ts / json.ts', () => {
  it('rejects non-ASCII input including code point 128 (base64url.ts:61)', () => {
    for (const s of ['\u0080AAA', 'AAA\u0080', 'AA\u00e9A', 'AA\u0100A']) expect(() => decodeBase64Url(s), s).toThrow(Base64UrlError);
  });
  it('JSON whitespace is tolerated everywhere the grammar allows it, and only ws chars (json.ts:25,118,136,146)', () => {
    for (const w of [' ', '\t', '\n', '\r']) {
      expect(parseStrictJson(`${w}{${w}"a"${w}:${w}[${w}1${w},${w}2${w}]${w},${w}"b"${w}:${w}{${w}}${w}}${w}`)).toEqual({ a: [1, 2], b: {} });
      expect(parseStrictJson(`${w}[${w}]${w}`)).toEqual([]);
    }
    for (const bad of ['\f[]', '\v[]', '\u00a0[]', '[1\u00a0]']) expect(() => parseStrictJson(bad), JSON.stringify(bad)).toThrow();
  });
  it('separators must be exactly , and : (json.ts:129,143,153)', () => {
    for (const bad of ['[1x2]', '[1;2]', '{"a":1x"b":2}', '{"a":1;"b":2}', '{"a"x1}', '{a:1}', "{'a':1}", '{"a":1,}', '[1,]', '[,1]', '{,}']) {
      expect(() => parseStrictJson(bad), bad).toThrow();
    }
  });
  it('\\u escapes need exactly four hex digits (json.ts:104)', () => {
    expect(parseStrictJson('"\\u00e9"')).toBe('\u00e9');
    for (const bad of ['"\\u00e"', '"\\u00eg"', '"\\u 0e9"', '"\\u00e9 "x']) expect(() => parseStrictJson(bad), bad).toThrow();
  });
});

describe('killers: sign.ts', () => {
  it('malformed but well-shaped signatures verify false, never throw (sign.ts:109)', () => {
    const s = sampleSigned();
    for (const sig of ['00'.repeat(64), 'ff'.repeat(64), '00'.repeat(32) + 'ff'.repeat(32), 'ff'.repeat(32) + '00'.repeat(32)]) {
      expect(verifyInvoiceSignature({ invoice: s.invoice, signature: sig })).toBe(false);
    }
    for (const sig of [`zz${s.signature}`, `${s.signature}00`, `${s.signature}\n`, s.signature.toUpperCase()]) {
      expect(verifyInvoiceSignature({ invoice: s.invoice, signature: sig })).toBe(false);
    }
  });
});

describe('killers: envelope.ts', () => {
  const frag = (o: unknown): string => FRAGMENT_PREFIX + encodeBase64Url(utf8ToBytes(canonicalize(o)));
  interface Env { alg: string; inv: unknown; sig: string; pub: { signer: string; chainId: unknown }; enc: { k: string; n: string; c: string } }
  const decodeEnv = (f: string): Env =>
    JSON.parse(new TextDecoder().decode(decodeBase64Url(f.slice(FRAGMENT_PREFIX.length)))) as Env;

  it('encoded-length bound is enforced before decoding (envelope.ts:30,232)', async () => {
    const f = FRAGMENT_PREFIX + '!'.repeat(30_000);       // not base64url at all
    await expect(parseFragment(f)).rejects.toBeInstanceOf(FragmentTooLargeError);
    const g = FRAGMENT_PREFIX + 'A'.repeat(21_847);       // one char over ceil(16384*4/3)
    await expect(parseFragment(g)).rejects.toBeInstanceOf(FragmentTooLargeError);
  });

  it('envelope field formats are anchored (envelope.ts:32-36, sign.ts:11)', async () => {
    const s = sampleSigned();
    const plain = decodeEnv(await encodeFragment(s));
    const enc = decodeEnv(await encodeFragment(s, { encrypt: true }));
    const k = enc.enc.k, n = enc.enc.n, c = enc.enc.c, sig = enc.sig;
    const bad = async (env: unknown) => apathOf(parseFragment(frag(env)));
    for (const v of [`zz${sig}`, `${sig}00`]) {
      expect(await bad({ ...plain, sig: v })).toBe('sig');
      expect(await bad({ ...enc, sig: v })).toBe('sig');
    }
    for (const v of [`zz${k}`, `${k}00`]) expect(await bad({ ...enc, enc: { k: v, n, c } })).toBe('enc.k');
    for (const v of [`zz${n}`, `${n}00`]) expect(await bad({ ...enc, enc: { k, n: v, c } })).toBe('enc.n');
    for (const v of [`zz${c}`, `${c}0`]) expect(await bad({ ...enc, enc: { k, n, c: v } })).toBe('enc.c');
    for (const v of [`00${enc.pub.signer}`, `${enc.pub.signer}00`]) {
      expect(await bad({ ...enc, pub: { ...enc.pub, signer: v } })).toBe('signer');
    }
  });

  it('envelope object shapes: exact keys, pub must be a plain object, chainId a safe integer >= 1 (envelope.ts:196-204,264,267)', async () => {
    const s = sampleSigned();
    const plain = decodeEnv(await encodeFragment(s));
    const enc = decodeEnv(await encodeFragment(s, { encrypt: true }));
    const bad = async (env: unknown) => apathOf(parseFragment(frag(env)));
    // right key count, wrong key name
    expect(await bad({ alg: 'none', inv: plain.inv, sigX: plain.sig })).toBe('$envelope');
    expect(await bad({ ...enc, enc: { k: enc.enc.k, n: enc.enc.n, cX: enc.enc.c } })).toBe('$envelope');
    expect(await bad({ ...enc, enc: null })).toBe('$envelope');
    expect(await bad({ ...enc, enc: [] })).toBe('$envelope');
    // pub shapes
    for (const pub of [null, [], 'x', 5]) expect(await bad({ ...enc, pub })).toBe('pub');
    // chainId
    for (const chainId of [0, '8453', null, true]) {
      expect(await bad({ ...enc, pub: { ...enc.pub, chainId } }), String(chainId)).toBe('chainId');
    }
  });

  it('a BOM-prefixed private plaintext is rejected, not silently stripped (envelope.ts:285 ignoreBOM)', async () => {
    const s = sampleSigned();
    const { lineItems, memo, ...pub } = s.invoice;
    const priv = canonicalize({ lineItems, ...(memo === undefined ? {} : { memo }) });
    const key = new Uint8Array(32).fill(9), nonce = new Uint8Array(12).fill(5);
    const aad = new Uint8Array([...utf8ToBytes('GPI1'), 0, 0, 0, 0, 0, 0, 0x21, 0x05, ...Uint8Array.from(Buffer.from(s.invoice.signer, 'hex'))]);
    const mk = (plain: Uint8Array) => frag({
      alg: 'A256GCM', pub,
      enc: { k: bytesToHex(key), n: bytesToHex(nonce), c: bytesToHex(gcm(key, nonce, aad).encrypt(plain)) },
      sig: s.signature,
    });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8ToBytes(priv)]);
    // sanity: the same envelope without BOM is accepted
    expect(s.invoice.chainId).toBe(0x2105);
    expect((await parseFragment(mk(utf8ToBytes(priv)))).encrypted).toBe(true);
    await expect(parseFragment(mk(withBom))).rejects.toBeInstanceOf(InvoiceError);
  });
});
