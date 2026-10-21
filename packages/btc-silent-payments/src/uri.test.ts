import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateSilentPaymentKeys } from './keys.js';
import { silentPaymentAddress } from './labels.js';
import { SilentPaymentError } from './errors.js';
import { seededRng } from './rng.testutil.js';
import { buildBitcoinUri, parseBitcoinUri } from './uri.js';
import { MAX_MONEY_SATS } from './units.js';

const keys = generateSilentPaymentKeys(seededRng('uri'));
const main = silentPaymentAddress(keys, 'mainnet');
const test = silentPaymentAddress(keys, 'testnet');

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('bitcoin: URI', () => {
  it('builds the documented shape', () => {
    expect(buildBitcoinUri({ address: main })).toBe(`bitcoin:?sp=${main}`);
    expect(buildBitcoinUri({ address: main, amountSats: 150_000_000n })).toBe(
      `bitcoin:?sp=${main}&amount=1.5`,
    );
    expect(buildBitcoinUri({ address: main, amountSats: 1n })).toBe(`bitcoin:?sp=${main}&amount=0.00000001`);
  });

  it('round-trips amount, label and message with special characters', () => {
    const uri = buildBitcoinUri({
      address: main,
      amountSats: 12_345n,
      label: 'Café & Bar=1',
      message: 'order #5 100%',
    });
    const p = parseBitcoinUri(uri, 'mainnet');
    expect(p).toEqual({
      address: main,
      network: 'mainnet',
      amountSats: 12_345n,
      label: 'Café & Bar=1',
      message: 'order #5 100%',
    });
  });

  it('parses without an amount and is scheme case-insensitive', () => {
    expect(parseBitcoinUri(`BITCOIN:?sp=${main}`)).toEqual({ address: main, network: 'mainnet' });
  });

  it('rejects a mainnet address on a testnet check and vice versa (chain mismatch)', () => {
    expect(code(() => parseBitcoinUri(`bitcoin:?sp=${main}`, 'testnet'))).toBe('NETWORK_MISMATCH');
    expect(code(() => parseBitcoinUri(`bitcoin:?sp=${test}`, 'mainnet'))).toBe('NETWORK_MISMATCH');
    expect(parseBitcoinUri(`bitcoin:?sp=${test}`, 'testnet').network).toBe('testnet');
  });

  it('rejects malformed URIs', () => {
    const bad: Array<[string, string]> = [
      ['', 'INVALID_URI'],
      ['http:?sp=x', 'INVALID_URI'],
      ['bitcoin:', 'INVALID_URI'],
      ['bitcoin:?', 'INVALID_URI'],
      [`bitcoin:bc1qxyz?sp=${main}`, 'INVALID_URI'], // on-chain fallback unsupported
      [`bitcoin:?amount=1`, 'INVALID_URI'], // sp missing
      [`bitcoin:?sp=${main}&sp=${main}`, 'INVALID_URI'], // duplicate
      [`bitcoin:?sp=${main}&amount=1&amount=2`, 'INVALID_URI'],
      [`bitcoin:?sp=${main}&req-foo=1`, 'INVALID_URI'], // unknown required parameter
      [`bitcoin:?sp=${main}#frag`, 'INVALID_URI'],
      [`bitcoin:?sp=${main}&=1`, 'INVALID_URI'],
      [`bitcoin:?sp=${main}&novalue`, 'INVALID_URI'],
      [`bitcoin:?sp=${main}&label=%E0%A4%A`, 'INVALID_URI'], // bad percent encoding
      [`bitcoin:?sp=${main}&amount=0`, 'INVALID_AMOUNT'],
      [`bitcoin:?sp=${main}&amount=1e2`, 'INVALID_AMOUNT'],
      [`bitcoin:?sp=${main}&amount=-1`, 'INVALID_AMOUNT'],
      [`bitcoin:?sp=${main}&amount=0.123456789`, 'INVALID_AMOUNT'],
      [`bitcoin:?sp=${main}&amount=`, 'INVALID_AMOUNT'],
      [`bitcoin:?sp=${main.toUpperCase()}`, 'INVALID_ADDRESS'],
      ['bitcoin:?sp=sp1qnotanaddress', 'INVALID_ADDRESS'],
      [`bitcoin:?sp=${'a'.repeat(3000)}`, 'INVALID_URI'],
    ];
    for (const [u, c] of bad)
      expect(
        code(() => parseBitcoinUri(u)),
        u.slice(0, 40),
      ).toBe(c);
    expect(code(() => parseBitcoinUri(5 as unknown as string))).toBe('INVALID_URI');
  });

  it('ignores unknown optional parameters', () => {
    expect(parseBitcoinUri(`bitcoin:?sp=${main}&foo=bar`)).toEqual({ address: main, network: 'mainnet' });
  });

  it('build validates its inputs', () => {
    expect(code(() => buildBitcoinUri({ address: 'sp1bad' }))).toBe('INVALID_ADDRESS');
    expect(code(() => buildBitcoinUri({ address: main, amountSats: 0n }))).toBe('INVALID_AMOUNT');
    expect(code(() => buildBitcoinUri({ address: main, amountSats: -5n }))).toBe('INVALID_AMOUNT');
    expect(code(() => buildBitcoinUri({ address: main, amountSats: MAX_MONEY_SATS + 1n }))).toBe(
      'INVALID_AMOUNT',
    );
    expect(code(() => buildBitcoinUri({ address: main, label: 'x'.repeat(3000) }))).toBe('INVALID_URI');
  });

  it('property: build -> parse is the identity for amounts and free text', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: MAX_MONEY_SATS }),
        fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
        fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
        (amountSats, label, message) => {
          const clean = (s: string | undefined): string | undefined =>
            s === undefined ? undefined : s.normalize('NFC').replace(/[\ud800-\udfff]/g, '');
          const l = clean(label);
          const m = clean(message);
          const uri = buildBitcoinUri({
            address: main,
            amountSats,
            ...(l === undefined ? {} : { label: l }),
            ...(m === undefined ? {} : { message: m }),
          });
          const p = parseBitcoinUri(uri, 'mainnet');
          expect(p.amountSats).toBe(amountSats);
          expect(p.label).toBe(l);
          expect(p.message).toBe(m);
        },
      ),
      { numRuns: 200 },
    );
  });
});
