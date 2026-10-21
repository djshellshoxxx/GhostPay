import { describe, expect, it } from 'vitest';
import { bech32mDecode, bech32mEncode } from './bech32m.js';
import { SilentPaymentError } from './errors.js';
import { readVectorText } from './vectors.testutil.js';

const text = readVectorText('bip-0350.mediawiki');

function section(from: string, to: string): string {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('section not found');
  return text.slice(a, b);
}

/** Valid BIP-350 Bech32m strings, parsed from the saved BIP text. */
const valid = [
  ...section('The following strings are valid Bech32m:', 'No string can be').matchAll(/<tt>(.+?)<\/tt>/g),
].map((m) => m[1] as string);

/** Invalid BIP-350 Bech32m strings with their reason, parsed from the saved BIP text. */
const invalid = [
  ...section('The following string are not valid Bech32m', '===Test vectors for v0-v16').matchAll(
    /^\* (?:0x([0-9A-F]{2}) \+ )?<tt>(.+?)<\/tt>: (.*)$/gm,
  ),
].map((m) => ({
  str: (m[1] === undefined ? '' : String.fromCharCode(Number.parseInt(m[1], 16))) + (m[2] as string),
  why: m[3] as string,
}));

const segwitValid = [
  ...section(
    'The following list gives valid segwit addresses',
    'The following list gives invalid segwit',
  ).matchAll(/^\* <tt>(\S+)<\/tt>: <tt>/gm),
].map((m) => m[1] as string);

const segwitInvalid = [
  ...section('The following list gives invalid segwit addresses', '==Appendix').matchAll(
    /^\* <tt>(\S+)<\/tt>: (.*)$/gm,
  ),
].map((m) => ({ str: m[1] as string, why: m[2] as string }));

describe('BIP-350 vectors (parsed from test-vectors/bip-0350.mediawiki)', () => {
  it('parsed the expected number of vectors', () => {
    expect(valid).toHaveLength(7);
    expect(invalid).toHaveLength(14);
    expect(segwitValid).toHaveLength(8);
    expect(segwitInvalid).toHaveLength(15);
  });

  it.each(valid)('accepts valid Bech32m %s and re-encodes it in lowercase', (s) => {
    const d = bech32mDecode(s, 90);
    expect(bech32mEncode(d.hrp, d.words, 90)).toBe(s.toLowerCase());
  });

  it.each(invalid)('rejects invalid Bech32m ($why)', ({ str }) => {
    expect(() => bech32mDecode(str, 90)).toThrow(SilentPaymentError);
  });

  it('accepts the version 1 to 16 segwit strings and rejects Bech32-checksum/mixed-case ones', () => {
    const v1plus = segwitValid.filter((s) => {
      try {
        return (bech32mDecode(s, 90).words[0] ?? 0) !== 0;
      } catch {
        return false;
      }
    });
    // v0 addresses use the Bech32 constant and are correctly NOT Bech32m.
    expect(v1plus).toHaveLength(5);
    const checksumCases = segwitInvalid.filter((v) =>
      /Bech32 instead of Bech32m|Invalid character in checksum|Mixed case/.test(v.why),
    );
    expect(checksumCases).toHaveLength(5);
    for (const v of checksumCases) expect(() => bech32mDecode(v.str, 90), v.why).toThrow(SilentPaymentError);
  });

  it('honours the length limit', () => {
    const long = valid.find((s) => s.length > 83) as string;
    expect(() => bech32mDecode(long, 80)).toThrow(SilentPaymentError);
    expect(() => bech32mDecode(long, 90)).not.toThrow();
  });

  it('rejects non-string input and bad encode arguments with a stable error', () => {
    expect(() => bech32mDecode(5 as unknown as string, 90)).toThrow(SilentPaymentError);
    expect(() => bech32mEncode('', [1], 90)).toThrow(SilentPaymentError);
    expect(() => bech32mEncode('sp', [32], 90)).toThrow(SilentPaymentError);
  });
});
