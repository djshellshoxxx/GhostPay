import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as P from './index.js';
import * as F from './fixtures.testutil.js';

const safeText = (max: number) =>
  fc
    .string({
      unit: fc.constantFrom(...Array.from('abcXYZ019 -_.,&=+?#%/:é漢😀')),
      minLength: 1,
      maxLength: max,
    })
    .filter((s) => s === s.normalize('NFC'));
const evmArb = fc.constantFrom(F.EVM, F.EVM2, F.EVM3, F.EVM4, F.EVM.toLowerCase());
const u256 = fc.bigInt({ min: 1n, max: (1n << 256n) - 1n });
const dec = fc
  .tuple(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.bigInt({ min: 0n, max: 10n ** 8n - 1n }))
  .filter(([a, b]) => a + b > 0n);

describe('round trips (build -> parse identity)', () => {
  it('eip681 native', () =>
    fc.assert(
      fc.property(
        evmArb,
        fc.option(fc.integer({ min: 1, max: 2 ** 40 }), { nil: undefined }),
        fc.option(u256, { nil: undefined }),
        (address, chainId, value) => {
          const r = P.parseEip681(
            P.buildEip681Native({
              address,
              ...(chainId === undefined ? {} : { chainId }),
              ...(value === undefined ? {} : { value }),
            }),
          );
          expect(r.kind).toBe('native');
          expect(r.chainId).toBe(chainId);
          if (r.kind === 'native') expect(r.value).toBe(value);
          expect(r.recipient.canonical).toBe(P.parseEvmAddress(address).address);
        },
      ),
    ));
  it('eip681 erc20', () =>
    fc.assert(
      fc.property(evmArb, evmArb, fc.option(u256, { nil: undefined }), (token, recipient, amount) => {
        const r = P.parseEip681(
          P.buildEip681Erc20({ token, recipient, ...(amount === undefined ? {} : { amount }) }),
        );
        if (r.kind !== 'erc20-transfer') throw new Error('kind');
        expect(r.amount).toBe(amount);
        expect(r.recipient.canonical).toBe(P.parseEvmAddress(recipient).address);
      }),
    ));
  it('bitcoin', () =>
    fc.assert(
      fc.property(
        fc.option(fc.bigInt({ min: 1n, max: 2_100_000_000_000_000n }), { nil: undefined }),
        fc.option(safeText(100), { nil: undefined }),
        fc.option(safeText(300), { nil: undefined }),
        (amountSats, label, message) => {
          const sp = F.spAddr('sp');
          const u = P.buildBitcoinUri({
            address: F.BTC_BECH32,
            silentPayment: sp,
            ...(amountSats === undefined ? {} : { amountSats }),
            ...(label === undefined ? {} : { label }),
            ...(message === undefined ? {} : { message }),
          });
          const r = P.parseBitcoinUri(u);
          expect(r.amountSats).toBe(amountSats);
          expect(r.label).toBe(label);
          expect(r.message).toBe(message);
          expect(r.silentPayment?.canonical).toBe(sp);
          expect(r.ignored).toEqual([]);
        },
      ),
    ));
  it('solana', () =>
    fc.assert(
      fc.property(dec, safeText(100), safeText(200), fc.boolean(), ([a, b], label, memo, withRefs) => {
        const amount = `${a}.${b.toString().padStart(8, '0')}`;
        const refs = withRefs ? [F.SOL_REF, F.SOL_REF2] : [];
        const r = P.parseSolanaPay(
          P.buildSolanaPay({ recipient: F.SOL, amount, splToken: F.SOL_MINT, references: refs, label, memo }),
        );
        expect(r.amount?.canonical).toBe(P.parseDecimal(amount, 18, 10n ** 40n).canonical);
        expect(r.label).toBe(label);
        expect(r.memo).toBe(memo);
        expect(r.references).toEqual(refs);
      }),
    ));
  it('tron', () =>
    fc.assert(
      fc.property(
        dec,
        safeText(100),
        fc.constantFrom('mainnet', 'nile', 'shasta' as const),
        ([a, b], label, network) => {
          const amount = `${a}.${b}`;
          const r = P.parseTronUri(P.buildTronUri({ recipient: F.TRX, amount, label, network }));
          expect(r.network).toBe(network);
          expect(r.label).toBe(label);
          expect(r.amount?.canonical).toBe(P.parseDecimal(amount, 18, 10n ** 60n).canonical);
        },
      ),
    ));
  it('decimal format/parse', () =>
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 30n }),
        fc.integer({ min: 0, max: 18 }),
        (units, decimals) => {
          const s = P.formatAtomic(units, decimals);
          expect(P.toAtomic(P.parseDecimal(s, 18, 10n ** 60n), decimals)).toBe(units);
        },
      ),
    ));
  it('percent coding', () =>
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !/[\uD800-\uDFFF]/.test(s)),
        (s) => {
          expect(P.pctDecode(P.pctEncode(s))).toBe(s);
        },
      ),
    ));
});

describe('hostile input never crashes with anything but PaymentUriError', () => {
  const alphabet = 'abcdefABCDEF0123456789:?&=%/@#+.-_ x‮\u0000é';
  const seeds = [
    `ethereum:${F.EVM}`,
    `bitcoin:${F.BTC_BECH32}?amount=1&label=x`,
    `solana:${F.SOL}?amount=1`,
    `tron:${F.TRX}`,
    `eth:${F.EVM}`,
    'https://a.example/pay#gpi=v1.AAAA',
  ];
  it('mutations', () =>
    fc.assert(
      fc.property(
        fc.constantFrom(...seeds),
        fc.nat(200),
        fc.string({ unit: fc.constantFrom(...alphabet.split('')), maxLength: 6 }),
        fc.nat(5),
        (seed, pos, ins, del) => {
          const s = seed.slice(0, pos) + ins + seed.slice(pos + del);
          try {
            const parsed = P.parsePaymentUri(s);
            // anything accepted must re-serialise stably where a builder exists
            const r = parsed.kind === 'bitcoin' ? parsed.value : undefined;
            if (r?.address !== undefined && r.ignored.length === 0) {
              const again = P.parseBitcoinUri(
                P.buildBitcoinUri({
                  address: r.address.canonical,
                  ...(r.amountSats === undefined ? {} : { amountSats: r.amountSats }),
                  ...(r.label === undefined ? {} : { label: r.label }),
                }),
              );
              expect(again.amountSats).toBe(r.amountSats);
            }
          } catch (e) {
            expect(e).toBeInstanceOf(P.PaymentUriError);
          }
        },
      ),
      { numRuns: 3000 },
    ));
  it('arbitrary strings', () =>
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        for (const f of [
          P.parsePaymentUri,
          P.parseEip681,
          P.parseBitcoinUri,
          P.parseSolanaPay,
          P.parseTronUri,
          P.parseInvoiceLink,
          P.parseChainAddress,
        ]) {
          try {
            (f as (x: string) => unknown)(s);
          } catch (e) {
            expect(e).toBeInstanceOf(P.PaymentUriError);
          }
        }
      }),
      { numRuns: 2000 },
    ));
  it('amount parsing never accepts non-canonical numerics', () =>
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'0123456789.eE+-, x'.split('')), maxLength: 20 }),
        (s) => {
          try {
            const d = P.parseDecimal(s, 8, 10n ** 20n);
            expect(s).toMatch(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/);
            expect(d.mantissa > 0n).toBe(true);
          } catch (e) {
            expect(e).toBeInstanceOf(P.PaymentUriError);
          }
        },
      ),
    ));
});
