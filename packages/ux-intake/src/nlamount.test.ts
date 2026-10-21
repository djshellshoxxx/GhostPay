import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseNlAmount, separatorsForLocale, type NlAmountOptions } from './nlamount.js';

const ASSETS = [
  { symbol: 'USDC', decimals: 6, aliases: ['dollars'] },
  { symbol: 'ETH', decimals: 18, aliases: ['ether'] },
  { symbol: 'BTC', decimals: 8 },
  { symbol: 'JPY', decimals: 0 },
];
const O: NlAmountOptions = { assets: ASSETS };
const amt = (s: unknown, o: NlAmountOptions = O) => {
  const r = parseNlAmount(s, o);
  return r.ok ? `${r.value.amount}:${r.value.symbol}` : r.code;
};

describe('digits', () => {
  it('parses plain and decimal values to base units', () => {
    expect(amt('20 usdc')).toBe('20000000:USDC');
    expect(amt('1.5 ETH')).toBe('1500000000000000000:ETH');
    expect(amt('0.00000001 btc')).toBe('1:BTC');
    expect(amt('1500 jpy')).toBe('1500:JPY');
    expect(amt('  12.50   usdc ')).toBe('12500000:USDC');
    expect(amt('5 dollars')).toBe('5000000:USDC');
    expect(amt('2 ether')).toBe('2000000000000000000:ETH');
  });
  it('treats an unambiguous single comma as a decimal ("1,5 eth")', () => {
    const r = parseNlAmount('1,5 eth', O);
    expect(r).toMatchObject({
      ok: true,
      value: { amount: 1_500_000_000_000_000_000n, separators: 'unambiguous', normalized: '1.5' },
    });
    expect(amt('0,123 eth')).toBe('123000000000000000:ETH');
    expect(amt('1,2345 usdc')).toBe('1234500:USDC');
    expect(amt('12,5 usdc')).toBe('12500000:USDC');
  });
  it('multipliers', () => {
    expect(amt('1.5k usdc')).toBe('1500000000:USDC');
    expect(amt('2K usdc')).toBe('2000000000:USDC');
    expect(amt('3m usdc')).toBe('3000000000000:USDC');
    expect(amt('1b jpy')).toBe('1000000000:JPY');
    expect(amt('1.5 k usdc')).toBe('1500000000:USDC');
    expect(amt('2 thousand jpy')).toBe('2000:JPY');
    expect(amt('1 million jpy')).toBe('1000000:JPY');
    expect(amt('1.5k', { ...O, defaultAsset: 'USDC' })).toBe('1500000000:USDC');
    expect(amt('0.5 k jpy')).toBe('500:JPY');
  });
  it('unambiguous grouping and mixed separators without locale', () => {
    expect(amt('1,234,567 jpy')).toBe('1234567:JPY');
    expect(amt('1.234.567 jpy')).toBe('1234567:JPY');
    expect(amt('1,234.56 usdc')).toBe('1234560000:USDC');
    expect(amt('1.234,56 usdc')).toBe('1234560000:USDC');
  });
  it('rejects ambiguous separators without a locale', () => {
    for (const s of ['1,234 usdc', '1.234 usdc', '12,345 eth', '999.999 usdc'])
      expect(amt(s)).toBe('ambiguous-separator');
  });
  it('rejects bad grouping / bad numbers', () => {
    expect(amt('12,34,567 jpy')).toBe('bad-grouping');
    expect(amt('1,2345,678 jpy')).toBe('bad-grouping');
    expect(amt('1,234.56,7 usdc')).toBe('bad-number');
    expect(amt('1.234,56.7 usdc')).toBe('bad-number');
    expect(amt('01 usdc')).toBe('bad-number');
    expect(amt('00,5 usdc')).toBe('bad-number');
    expect(amt('1.2.3 usdc')).toBe('bad-grouping');
    expect(amt('.5 usdc')).toBe('bad-number');
    expect(amt(',5 usdc')).toBe('bad-number');
    expect(amt('+5 usdc')).toBe('bad-number');
    expect(amt('$5')).toBe('bad-number');
    expect(amt('1. usdc')).toBe('unexpected-token');
  });
});

describe('locales', () => {
  it('resolves "1,234" by locale', () => {
    expect(amt('1,234 usdc', { ...O, locale: 'en' })).toBe('1234000000:USDC');
    expect(amt('1,234 usdc', { ...O, locale: 'de' })).toBe('1234000:USDC');
    expect(amt('1.234 usdc', { ...O, locale: 'de' })).toBe('1234000000:USDC');
    expect(amt('1.234 usdc', { ...O, locale: 'en-US' })).toBe('1234000:USDC');
  });
  it('supports space groups (fr/ru) and Swiss apostrophes', () => {
    expect(amt('1 234,56 usdc', { ...O, locale: 'fr' })).toBe('1234560000:USDC');
    expect(amt('1 234,56 usdc', { ...O, locale: 'fr-FR' })).toBe('1234560000:USDC');
    expect(amt('1 234 jpy', { ...O, locale: 'ru' })).toBe('1234:JPY');
    expect(amt("1'234.5 usdc", { ...O, locale: 'de-CH' })).toBe('1234500000:USDC');
    expect(amt('1’234.5 usdc', { ...O, locale: 'de_CH' })).toBe('1234500000:USDC');
  });
  it('is strict inside a locale', () => {
    expect(amt('1,5 eth', { ...O, locale: 'en' })).toBe('bad-grouping');
    expect(amt('1.5.5 eth', { ...O, locale: 'de' })).toBe('bad-grouping');
    expect(amt('1,234,5 eth', { ...O, locale: 'de' })).toBe('bad-number');
    expect(amt('1 2 usdc', { ...O, locale: 'fr' })).toBe('bad-grouping');
    expect(amt('1,5 2 usdc', { ...O, locale: 'fr' })).toBe('bad-number');
    expect(amt('1 234 usdc', { ...O, locale: 'en' })).toBe('unexpected-token');
  });
  it('rejects unknown or malformed locales', () => {
    expect(amt('1 usdc', { ...O, locale: 'xx' })).toBe('unsupported-locale');
    expect(amt('1 usdc', { ...O, locale: 'en; DROP' })).toBe('unsupported-locale');
    expect(separatorsForLocale('en')).toEqual({ decimal: '.', groups: ',' });
    expect(separatorsForLocale('de-AT')).toEqual({ decimal: ',', groups: '.' });
    expect(separatorsForLocale('')).toBeNull();
  });
});

describe('words', () => {
  it('parses english number words', () => {
    expect(amt('twenty usdc')).toBe('20000000:USDC');
    expect(amt('Twenty-Five usdc')).toBe('25000000:USDC');
    expect(amt('one hundred and five jpy')).toBe('105:JPY');
    expect(amt('one hundred five jpy')).toBe('105:JPY');
    expect(amt('three hundred twelve thousand four hundred and one jpy')).toBe('312401:JPY');
    expect(amt('two million jpy')).toBe('2000000:JPY');
    expect(amt('nineteen jpy')).toBe('19:JPY');
    expect(amt('one point five eth')).toBe('1500000000000000000:ETH');
    expect(amt('zero point zero five usdc')).toBe('50000:USDC');
    expect(amt('ten', { ...O, defaultAsset: 'JPY' })).toBe('10:JPY');
    expect(amt('zero jpy', { ...O, allowZero: true })).toBe('0:JPY');
    expect(amt('five thousand dollars')).toBe('5000000000:USDC');
    expect(amt('one billion jpy')).toBe('1000000000:JPY');
    expect(amt('one hundred thousand jpy')).toBe('100000:JPY');
  });
  it('rejects ill-formed words', () => {
    for (const s of [
      'usdc',
      'hundred usdc',
      'and five usdc',
      'five and usdc',
      'twenty hundred jpy',
      'twenty twenty jpy',
      'twenty thirteen jpy',
      'five five jpy',
      'one thousand thousand jpy',
      'one thousand one million jpy',
      'thousand jpy',
      'one hundred and jpy',
      'point five usdc',
      'one point usdc',
      'one point five point two usdc',
      'one point twenty usdc',
      'zero five jpy',
      'one hundred hundred jpy',
      'twelve hundred jpy',
      'five twelve jpy',
    ])
      expect(amt(s)).toBe('bad-words');
    expect(amt('twenty usdc extra')).toBe('unexpected-token');
    expect(amt('twenty')).toBe('missing-asset');
    expect(amt('twenty k usdc')).toBe('unexpected-token');
  });
});

describe('assets', () => {
  it('requires an allowlisted asset', () => {
    expect(amt('5 doge')).toBe('asset-not-allowed');
    expect(amt('5')).toBe('missing-asset');
    expect(amt('5 usdt')).toBe('asset-not-allowed');
    expect(amt('5 us$')).toBe('unexpected-token');
    expect(amt('5 usdc eth')).toBe('unexpected-token');
    expect(amt('5kusdc')).toBe('unexpected-token');
    expect(amt('5e3 usdc')).toBe('unexpected-token');
    expect(amt('5%')).toBe('unexpected-token');
  });
  it('validates configuration', () => {
    const bad = (o: NlAmountOptions) => () => parseNlAmount('1 usdc', o);
    expect(bad({ assets: [{ symbol: 'usdc', decimals: 6 }] })).toThrow(TypeError);
    expect(bad({ assets: [{ symbol: 'USDC', decimals: 19 }] })).toThrow(TypeError);
    expect(
      bad({
        assets: [
          { symbol: 'USDC', decimals: 6 },
          { symbol: 'XYZ', decimals: 1, aliases: ['usdc'] },
        ],
      }),
    ).toThrow(TypeError);
    expect(bad({ assets: [{ symbol: 'USDC', decimals: 6, aliases: ['million'] }] })).toThrow(TypeError);
    expect(bad({ assets: [{ symbol: 'USDC', decimals: 6, aliases: ['Bad Alias'] }] })).toThrow(TypeError);
    expect(bad({ assets: ASSETS, defaultAsset: 'NOPE' })).toThrow(TypeError);
  });
});

describe('homoglyphs and hostile input', () => {
  it('rejects mixed-script and look-alike symbols', () => {
    expect(amt('5 usdс')).toBe('mixed-script'); // Cyrillic es
    expect(amt('5 еth')).toBe('mixed-script'); // Cyrillic ie
    expect(amt('5 εth')).toBe('mixed-script'); // Greek epsilon
    expect(amt('5 етһ')).toBe('non-ascii'); // all-Cyrillic look-alike of ETH
    expect(amt('五 usdc')).toBe('mixed-script');
  });
  it('rejects non-ASCII digits, minus, fullwidth, emoji', () => {
    for (const s of ['٥ usdc', '１ usdc', '1 usdc❤', '−1 usdc', '1² usdc', '1⁄2 eth'])
      expect(amt(s)).toBe('non-ascii');
  });
  it('rejects invisible characters', () => {
    for (const s of ['1​ usdc', '1 usdc‮', '1\tusdc', '1\nusdc', '\u00001 usdc', '1 usdc'])
      expect(amt(s)).toBe('invisible-char');
  });
  it('rejects negatives, zero, overflow, excess precision, bad types, size', () => {
    expect(amt('-5 usdc')).toBe('negative');
    expect(amt('(5) usdc')).toBe('negative');
    expect(amt('minus five usdc')).toBe('negative');
    expect(amt('Negative five usdc')).toBe('negative');
    expect(amt('0 usdc')).toBe('zero');
    expect(amt('0.0 usdc')).toBe('zero');
    expect(amt('1.0000001 usdc')).toBe('too-many-decimals');
    expect(amt('1.5 jpy')).toBe('too-many-decimals');
    expect(amt('0.0005k jpy')).toBe('too-many-decimals');
    expect(amt('0.0001k jpy')).toBe('too-many-decimals');
    expect(amt('1' + '0'.repeat(40) + ' jpy')).toBe('too-large');
    expect(amt('0.' + '1'.repeat(31) + ' jpy')).toBe('too-large');
    expect(amt('9'.repeat(30) + ' b jpy')).toBe('too-large');
    expect(amt('11 usdc', { ...O, maxBase: 10_000_000n })).toBe('too-large');
    expect(amt('10 usdc', { ...O, maxBase: 10_000_000n })).toBe('10000000:USDC');
    expect(amt(5)).toBe('not-string');
    expect(amt('')).toBe('empty');
    expect(amt('   ')).toBe('empty');
    expect(amt('1 usdc' + ' '.repeat(200))).toBe('too-long');
    expect(amt('constructor')).toBe('bad-words');
    expect(amt('1 constructor')).toBe('asset-not-allowed');
    expect(amt('1 __proto__')).toBe('unexpected-token');
    expect(amt('?')).toBe('bad-number');
  });
});

describe('properties', () => {
  it('canonical decimals round-trip exactly (no float error)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 29n }), fc.constantFrom(0, 6, 8, 18), (n, d) => {
        const s = n.toString().padStart(d + 1, '0');
        const dec = d === 0 ? s : `${s.slice(0, s.length - d)}.${s.slice(s.length - d)}`;
        const sym = (ASSETS.find((a) => a.decimals === d) as { symbol: string }).symbol;
        const r = parseNlAmount(`${dec} ${sym}`, O);
        return r.ok && r.value.amount === n;
      }),
      { numRuns: 200 },
    );
  });
  it('never throws on arbitrary strings and only emits allowlisted symbols', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 140 }), (s) => {
        const r = parseNlAmount(s, O);
        return !r.ok || (['USDC', 'ETH', 'BTC', 'JPY'].includes(r.value.symbol) && r.value.amount > 0n);
      }),
      { numRuns: 500 },
    );
  });
  it('digits-only 3-group values without locale are always ambiguous', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999 }),
        fc.integer({ min: 0, max: 999 }),
        fc.constantFrom(',', '.'),
        (a, b, sep) => {
          const r = parseNlAmount(`${a}${sep}${String(b).padStart(3, '0')} usdc`, O);
          return !r.ok && r.code === 'ambiguous-separator';
        },
      ),
      { numRuns: 100 },
    );
  });
});
