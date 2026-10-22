// PoC/fuzz: invoice fragment parser hardening, malleability, DoS timing, text-spoofing characters.
import { createInvoice, signInvoice, signerPublicKeyHex, encodeFragment, parseFragment, encodeBase64Url, decodeBase64Url, parseStrictJson, canonicalize, verifyInvoiceSignature, invoiceDigest } from '@ghostpay/invoice-schema';
import { generateKeySet, encodeMetaAddress } from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const seller = generateKeySet();
const signKey = secp256k1.utils.randomSecretKey();
const base = (over = {}) => createInvoice({
  chainId: 84532, metaAddress: encodeMetaAddress(seller), fiat: { currency: 'USD', minorUnits: '1000' },
  token: 'native', amountPolicy: { mode: 'fixed_token', tokenAmount: '1000000000000000' },
  quote: { source: 'seller:fixed', timestamp: 1000, expiresAt: 2000, maxSlippageBps: 50 }, expiresAt: 9999999999,
  lineItems: [{ description: 'Widget', quantity: '1', unitMinorUnits: '1000' }], tax: { rateBps: 0, minorUnits: '0' },
  feePolicy: 'payer_pays', signer: signerPublicKeyHex(signKey), ...over });
const frag = async (inv, opts) => encodeFragment(signInvoice(inv, signKey), opts);
const tryParse = async (name, f, expect) => {
  const t0 = performance.now(); let r;
  try { const p = await parseFragment(f); r = `ACCEPTED sigValid=${p.verification.signatureValid}`; } catch (e) { r = `rejected ${e.constructor.name}`; }
  console.log(`${expect === (r.startsWith('rej') ? 'rej' : 'acc') ? 'ok  ' : 'NOTE'} ${name}: ${r} (${(performance.now() - t0).toFixed(1)} ms)`);
};
const wrap = (jsonText) => '#gpi=v1.' + encodeBase64Url(new TextEncoder().encode(jsonText));

const inv = base();
const good = await frag(inv);
await tryParse('baseline valid', good, 'acc');
await tryParse('encrypted valid', await frag(inv, { encrypt: true }), 'acc');
// base64url canonicality
await tryParse('padded base64url', good + '=', 'rej');
for (const bad of ['AAA+', 'AAA/', 'AA A', 'AAA=', 'AAA\n', 'AAAé', 'AAAA\u0000']) { try { decodeBase64Url(bad); console.log('NOTE base64url accepted', JSON.stringify(bad)); } catch { console.log('ok   base64url rejects', JSON.stringify(bad)); } }
// JSON attacks
const env = JSON.parse(new TextDecoder().decode(decodeBase64Url(good.slice(8))));
const canon = (o) => canonicalize(o);
await tryParse('duplicate key', wrap(canon(env).replace('"alg":"none"', '"alg":"none","alg":"none"')), 'rej');
await tryParse('__proto__ key', wrap(canon(env).replace('{"alg"', '{"__proto__":{"x":1},"alg"')), 'rej');
await tryParse('deep nesting 10k "[" (stack DoS?)', wrap('['.repeat(10000)), 'rej');
await tryParse('huge number 1e999', wrap(canon(env).replace('"chainId":84532', '"chainId":1e999')), 'rej');
await tryParse('float 84532.0', wrap(canon(env).replace('"chainId":84532', '"chainId":84532.0')), 'rej');
await tryParse('unicode escape instead of literal (non-canonical)', wrap(canon(env).replace('Widget', 'W\\u0069dget')), 'rej');
await tryParse('lone surrogate via \\ud800 escape', wrap(canon(env).replace('Widget', '\\ud800')), 'rej');
await tryParse('whitespace padding', wrap(' ' + canon(env)), 'rej');
await tryParse('BOM prefix', '#gpi=v1.' + encodeBase64Url(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(canon(env))])), 'rej');
await tryParse('oversize (20k decoded)', '#gpi=v1.' + encodeBase64Url(new Uint8Array(20000).fill(65)), 'rej');
// Timing / ReDoS probes on regex-bearing inputs
for (const [n, s] of [['50k-char hex "k"', '0'.repeat(50000)], ['16KiB of spaces', ' '.repeat(16000)]]) {
  const t0 = performance.now(); try { parseStrictJson(s); } catch {} console.log(`timing ${n}: ${(performance.now() - t0).toFixed(1)} ms`);
}
{ // 16 KiB worst case near limit: many nested arrays depth 7 / many short keys
  const t0 = performance.now(); try { await parseFragment(wrap('{"a":' .repeat(7) + '1' + '}'.repeat(7))); } catch {} console.log(`depth-7 object timing ${(performance.now() - t0).toFixed(1)} ms`);
}
// Signature malleability: high-s variant must be rejected
const signed = signInvoice(inv, signKey);
const r = BigInt('0x' + signed.signature.slice(0, 64)), s = BigInt('0x' + signed.signature.slice(64));
const n = secp256k1.Point.Fn.ORDER;
const hi = (r.toString(16).padStart(64, '0') + (n - s).toString(16).padStart(64, '0'));
console.log('low-s signature verifies:', verifyInvoiceSignature(signed), '| high-s twin verifies:', verifyInvoiceSignature({ invoice: signed.invoice, signature: hi }));
// Cross-version replay: change any field -> signature invalid
for (const [k, v] of [['chainId', 1], ['expiresAt', 9999999998], ['token', '0x' + '11'.repeat(20)]]) {
  try { console.log(`mutate ${k}: sigValid=`, verifyInvoiceSignature({ invoice: { ...signed.invoice, [k]: v }, signature: signed.signature })); } catch (e) { console.log(`mutate ${k}: ${e.constructor.name}`); }
}
// Domain separation: same key signing the same bytes under a different domain is not accepted
import { keccak_256 } from '@noble/hashes/sha3.js';
import { canonicalInvoiceBytes } from '@ghostpay/invoice-schema';
const noPrefix = keccak_256(canonicalInvoiceBytes(signed.invoice));
console.log('signature verifies over keccak(canonical) WITHOUT the domain prefix (expect false):',
  secp256k1.verify(hexToBytes(signed.signature), noPrefix, hexToBytes(signed.invoice.signer), { prehash: false, lowS: true }));
// Display-spoofing text accepted by the schema (bidi override, zero-width, confusables)
for (const [n2, d] of [['RLO U+202E', 'Invoice ‮txt.exe'], ['ZWSP U+200B', 'Pay​ Alice'], ['bidi isolate U+2066', '⁦Total: 1⁩'], ['Cyrillic homoglyph', 'USDС'], ['tag chars U+E0041', 'a\u{E0041}']]) {
  try { const i2 = base({ memo: d }); signInvoice(i2, signKey); console.log(`SPOOF-ACCEPTED ${n2}`); } catch (e) { console.log(`blocked ${n2}: ${e.constructor.name}`); }
}
// Fiat total vs token amount mismatch accepted (fixed_token): USD 10.00 invoice demanding 1000 ETH
{ const i3 = base({ amountPolicy: { mode: 'fixed_token', tokenAmount: '1000000000000000000000' } }); signInvoice(i3, signKey); console.log('SCHEMA accepts fiat=USD 10.00 with fixed_token=1000 ETH (UI must flag; see report).'); }
