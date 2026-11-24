import { describe, expect, it } from 'vitest';
import * as P from './index.js';
import * as F from './fixtures.testutil.js';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof P.PaymentUriError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

const cases: [string, () => unknown, string][] = [
  // generic
  ['non-string', () => P.parsePaymentUri(1 as unknown as string), 'INVALID_INPUT'],
  ['empty', () => P.parsePaymentUri(''), 'INVALID_INPUT'],
  ['no scheme', () => P.parsePaymentUri('hello'), 'INVALID_SCHEME'],
  ['leading space', () => P.parsePaymentUri(` ethereum:${F.EVM}`), 'INVALID_CHAIN_ID'],
  ['trailing newline', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}\n`), 'INVALID_ENCODING'],
  ['non-ascii raw', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=é`), 'INVALID_ENCODING'],
  ['fragment', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}#x`), 'INVALID_ENCODING'],
  ['too long', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=${'a'.repeat(3000)}`), 'TOO_LONG'],
  ['unknown scheme', () => P.parsePaymentUri('javascript:alert(1)'), 'INVALID_CHAIN_ID'],
  ['bad scheme chars', () => P.parsePaymentUri('1x:foo'), 'INVALID_CHAIN_ID'],
  ['wrong scheme to parser', () => P.parseBitcoinUri('ethereum:x'), 'INVALID_SCHEME'],
  ['empty query', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?`), 'INVALID_QUERY'],
  ['empty value', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=`), 'INVALID_QUERY'],
  ['no equals', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label`), 'INVALID_QUERY'],
  ['stray amp', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=1&`), 'INVALID_QUERY'],
  ['extra equals', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=1=2`), 'INVALID_QUERY'],
  ['bad key', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?a%20b=1`), 'INVALID_QUERY'],
  [
    'too many params',
    () =>
      P.parseBitcoinUri(
        `bitcoin:${F.BTC_BECH32}?${Array.from({ length: 20 }, (_, i) => `k${i}=1`).join('&')}`,
      ),
    'INVALID_QUERY',
  ],
  ['bad pct', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=%zz`), 'INVALID_ENCODING'],
  ['truncated pct', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=%4`), 'INVALID_ENCODING'],
  ['bad utf8', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=%ff%fe`), 'INVALID_ENCODING'],
  ['raw plus', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=a+b`), 'INVALID_ENCODING'],
  // text safety
  ['bidi', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=a%E2%80%AEb`), 'UNSAFE_TEXT'],
  ['control', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=a%00b`), 'UNSAFE_TEXT'],
  ['newline', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?message=a%0Ab`), 'UNSAFE_TEXT'],
  ['zero width', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=a%E2%80%8Bb`), 'UNSAFE_TEXT'],
  ['tag char', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=a%F3%A0%80%81`), 'UNSAFE_TEXT'],
  ['non NFC', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=e%CC%81`), 'UNSAFE_TEXT'],
  ['long label', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?label=${'a'.repeat(129)}`), 'TOO_LONG'],
  ['builder bad label', () => P.buildBitcoinUri({ address: F.BTC_BECH32, label: 'a‮b' }), 'UNSAFE_TEXT'],
  ['builder empty label', () => P.buildBitcoinUri({ address: F.BTC_BECH32, label: '' }), 'UNSAFE_TEXT'],
  // bitcoin
  ['btc dup amount', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=1&amount=2`), 'DUPLICATE_PARAM'],
  ['btc dup case', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=1&AMOUNT=2`), 'DUPLICATE_PARAM'],
  [
    'btc dup req',
    () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=1&req-amount=2`),
    'DUPLICATE_PARAM',
  ],
  ['btc dup unknown', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?x=1&x=2`), 'DUPLICATE_PARAM'],
  ['btc req unknown', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?req-foo=1`), 'UNKNOWN_REQUIRED_PARAM'],
  ['btc req-pop', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?req-pop=x`), 'UNKNOWN_REQUIRED_PARAM'],
  ['btc nothing', () => P.parseBitcoinUri('bitcoin:'), 'INVALID_QUERY'],
  ['btc only label', () => P.parseBitcoinUri('bitcoin:?label=x'), 'INVALID_QUERY'],
  ['btc comma', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=1,5`), 'INVALID_AMOUNT'],
  ['btc exp', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=1e3`), 'INVALID_AMOUNT'],
  ['btc neg', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=-1`), 'INVALID_AMOUNT'],
  ['btc zero', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=0.0`), 'INVALID_AMOUNT'],
  ['btc 9 dp', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=0.000000001`), 'INVALID_AMOUNT'],
  ['btc leading zero', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=01`), 'INVALID_AMOUNT'],
  ['btc dot', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=1.`), 'INVALID_AMOUNT'],
  ['btc .5', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=.5`), 'INVALID_AMOUNT'],
  ['btc inf', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=Infinity`), 'INVALID_AMOUNT'],
  [
    'btc >21M',
    () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=21000000.00000001`),
    'AMOUNT_OVERFLOW',
  ],
  [
    'btc huge',
    () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=${'9'.repeat(200)}`),
    'INVALID_AMOUNT',
  ],
  [
    'btc net mismatch addr/sp',
    () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?sp=${F.spAddr('tsp')}`),
    'NETWORK_MISMATCH',
  ],
  [
    'btc expected net',
    () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}`, { expectedNetwork: 'test' }),
    'NETWORK_MISMATCH',
  ],
  ['btc bad sp', () => P.parseBitcoinUri('bitcoin:?sp=sp1qqqq'), 'INVALID_ADDRESS'],
  ['btc bad ln', () => P.parseBitcoinUri('bitcoin:?lightning=nope'), 'INVALID_ADDRESS'],
  [
    'btc ln vs addr net',
    () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?lightning=lntb1${'q'.repeat(60)}`),
    'NETWORK_MISMATCH',
  ],
  [
    'btc amount injection',
    () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?amount=1%26amount=1000`),
    'INVALID_QUERY',
  ],
  ['btc address injection', () => P.parseBitcoinUri(`bitcoin:${F.BTC_BECH32}%3Famount=1`), 'INVALID_ADDRESS'],
  ['btc build none', () => P.buildBitcoinUri({}), 'INVALID_ADDRESS'],
  ['btc build 0', () => P.buildBitcoinUri({ address: F.BTC_BECH32, amountSats: 0n }), 'INVALID_AMOUNT'],
  [
    'btc build big',
    () => P.buildBitcoinUri({ address: F.BTC_BECH32, amountSats: 2_100_000_000_000_001n }),
    'INVALID_AMOUNT',
  ],
  [
    'btc build mismatch',
    () => P.buildBitcoinUri({ address: F.BTC_BECH32, silentPayment: F.spAddr('tsp') }),
    'NETWORK_MISMATCH',
  ],
  // eip681
  ['eth ens', () => P.parseEip681('ethereum:vitalik.eth'), 'INVALID_ADDRESS'],
  ['eth bad checksum', () => P.parseEip681(`ethereum:${F.EVM.replace('A', 'a')}`), 'BAD_CHECKSUM'],
  ['eth upper', () => P.parseEip681(`ethereum:0x${F.EVM.slice(2).toUpperCase()}`), 'INVALID_ADDRESS'],
  ['eth short', () => P.parseEip681('ethereum:0x1234'), 'INVALID_ADDRESS'],
  ['eth chain 0', () => P.parseEip681(`ethereum:${F.EVM}@0`), 'INVALID_CHAIN_ID'],
  ['eth chain lead0', () => P.parseEip681(`ethereum:${F.EVM}@01`), 'INVALID_CHAIN_ID'],
  ['eth chain big', () => P.parseEip681(`ethereum:${F.EVM}@99999999999999999999`), 'INVALID_CHAIN_ID'],
  ['eth chain alpha', () => P.parseEip681(`ethereum:${F.EVM}@1a`), 'INVALID_CHAIN_ID'],
  [
    'eth chain mismatch',
    () => P.parseEip681(`ethereum:${F.EVM}@10`, { expectedChainId: 1 }),
    'CHAIN_MISMATCH',
  ],
  ['eth chain missing', () => P.parseEip681(`ethereum:${F.EVM}`, { expectedChainId: 1 }), 'CHAIN_MISMATCH'],
  [
    'eth other fn',
    () => P.parseEip681(`ethereum:${F.EVM}/approve?address=${F.EVM2}&uint256=1`),
    'UNSUPPORTED',
  ],
  ['eth unknown param', () => P.parseEip681(`ethereum:${F.EVM}?foo=1`), 'UNKNOWN_REQUIRED_PARAM'],
  [
    'eth value on transfer',
    () => P.parseEip681(`ethereum:${F.EVM}/transfer?address=${F.EVM2}&value=1`),
    'UNKNOWN_REQUIRED_PARAM',
  ],
  ['eth transfer no addr', () => P.parseEip681(`ethereum:${F.EVM}/transfer?uint256=1`), 'INVALID_QUERY'],
  ['eth dup value', () => P.parseEip681(`ethereum:${F.EVM}?value=1&value=2`), 'DUPLICATE_PARAM'],
  [
    'eth dup uint',
    () => P.parseEip681(`ethereum:${F.EVM}/transfer?address=${F.EVM2}&uint256=1&uint256=2`),
    'DUPLICATE_PARAM',
  ],
  [
    'eth dup addr',
    () => P.parseEip681(`ethereum:${F.EVM}/transfer?address=${F.EVM2}&address=${F.EVM3}`),
    'DUPLICATE_PARAM',
  ],
  ['eth gas+gasLimit', () => P.parseEip681(`ethereum:${F.EVM}?gas=1&gasLimit=2`), 'DUPLICATE_PARAM'],
  ['eth value neg', () => P.parseEip681(`ethereum:${F.EVM}?value=-1`), 'INVALID_AMOUNT'],
  ['eth value plus', () => P.parseEip681(`ethereum:${F.EVM}?value=%2B1`), 'INVALID_AMOUNT'],
  ['eth value frac', () => P.parseEip681(`ethereum:${F.EVM}?value=1.5`), 'INVALID_AMOUNT'],
  ['eth value e no digits', () => P.parseEip681(`ethereum:${F.EVM}?value=1e`), 'INVALID_AMOUNT'],
  ['eth value frac>exp', () => P.parseEip681(`ethereum:${F.EVM}?value=1.55e1`), 'INVALID_AMOUNT'],
  ['eth value lead0', () => P.parseEip681(`ethereum:${F.EVM}?value=01`), 'INVALID_AMOUNT'],
  ['eth value 0', () => P.parseEip681(`ethereum:${F.EVM}?value=0`), 'INVALID_AMOUNT'],
  [
    'eth value uint256+1',
    () => P.parseEip681(`ethereum:${F.EVM}?value=${(1n << 256n).toString()}`),
    'AMOUNT_OVERFLOW',
  ],
  ['eth value huge exp', () => P.parseEip681(`ethereum:${F.EVM}?value=1e78`), 'AMOUNT_OVERFLOW'],
  ['eth value exp 4dig', () => P.parseEip681(`ethereum:${F.EVM}?value=1e1000`), 'INVALID_AMOUNT'],
  ['eth value hex', () => P.parseEip681(`ethereum:${F.EVM}?value=0x10`), 'INVALID_AMOUNT'],
  [
    'eth recipient bad sum',
    () => P.parseEip681(`ethereum:${F.EVM}/transfer?address=${F.EVM2.replace('B', 'b')}`),
    'BAD_CHECKSUM',
  ],
  ['eth build 0', () => P.buildEip681Native({ address: F.EVM, value: 0n }), 'INVALID_AMOUNT'],
  ['eth build neg', () => P.buildEip681Native({ address: F.EVM, value: -1n }), 'INVALID_AMOUNT'],
  ['eth build big', () => P.buildEip681Native({ address: F.EVM, value: 1n << 256n }), 'INVALID_AMOUNT'],
  ['eth build chain', () => P.buildEip681Native({ address: F.EVM, chainId: 0 }), 'INVALID_CHAIN_ID'],
  ['eth build addr', () => P.buildEip681Erc20({ token: F.EVM, recipient: 'x' }), 'INVALID_ADDRESS'],
  // eip3770
  ['3770 unknown', () => P.parseChainAddress(`zzz:${F.EVM}`), 'INVALID_CHAIN_ID'],
  ['3770 proto key', () => P.parseChainAddress(`constructor:${F.EVM}`), 'INVALID_CHAIN_ID'],
  ['3770 bad addr', () => P.parseChainAddress('eth:0x12'), 'INVALID_ADDRESS'],
  ['3770 no colon', () => P.parseChainAddress(F.EVM), 'INVALID_INPUT'],
  ['3770 long', () => P.parseChainAddress('a'.repeat(100)), 'INVALID_INPUT'],
  ['3770 build unknown chain', () => P.buildChainAddress(424242, F.EVM), 'INVALID_CHAIN_ID'],
  // solana
  ['sol txn request', () => P.parseSolanaPay('solana:https%3A%2F%2Fexample.com%2Fpay'), 'UNSUPPORTED'],
  ['sol bad recipient', () => P.parseSolanaPay('solana:abc'), 'INVALID_ADDRESS'],
  ['sol 0OIl', () => P.parseSolanaPay(`solana:${'0'.repeat(44)}`), 'INVALID_ADDRESS'],
  ['sol 33-byte', () => P.parseSolanaAddress(P_SOL33), 'INVALID_ADDRESS'],
  ['sol dup amount', () => P.parseSolanaPay(`solana:${F.SOL}?amount=1&amount=2`), 'DUPLICATE_PARAM'],
  ['sol dup label', () => P.parseSolanaPay(`solana:${F.SOL}?label=a&label=b`), 'DUPLICATE_PARAM'],
  [
    'sol dup ref same',
    () => P.parseSolanaPay(`solana:${F.SOL}?reference=${F.SOL_REF}&reference=${F.SOL_REF}`),
    'INVALID_QUERY',
  ],
  [
    'sol too many refs',
    () =>
      P.parseSolanaPay(
        `solana:${F.SOL}?${Array.from({ length: 9 }, (_, i) => `reference=${F.solKey(10 + i)}`).join('&')}`,
      ),
    'INVALID_QUERY',
  ],
  ['sol unknown', () => P.parseSolanaPay(`solana:${F.SOL}?foo=1`), 'UNKNOWN_REQUIRED_PARAM'],
  ['sol bad token', () => P.parseSolanaPay(`solana:${F.SOL}?spl-token=x`), 'INVALID_ADDRESS'],
  ['sol bad ref', () => P.parseSolanaPay(`solana:${F.SOL}?reference=x`), 'INVALID_ADDRESS'],
  ['sol amount 0', () => P.parseSolanaPay(`solana:${F.SOL}?amount=0`), 'INVALID_AMOUNT'],
  ['sol amount neg', () => P.parseSolanaPay(`solana:${F.SOL}?amount=-1`), 'INVALID_AMOUNT'],
  ['sol amount exp', () => P.parseSolanaPay(`solana:${F.SOL}?amount=1e9`), 'INVALID_AMOUNT'],
  [
    'sol amount 19dp',
    () => P.parseSolanaPay(`solana:${F.SOL}?amount=0.0000000000000000001`),
    'INVALID_AMOUNT',
  ],
  ['sol memo long', () => P.parseSolanaPay(`solana:${F.SOL}?memo=${'a'.repeat(257)}`), 'TOO_LONG'],
  ['sol memo bidi', () => P.parseSolanaPay(`solana:${F.SOL}?memo=%E2%80%AE`), 'UNSAFE_TEXT'],
  [
    'sol build dup refs',
    () => P.buildSolanaPay({ recipient: F.SOL, references: [F.SOL_REF, F.SOL_REF] }),
    'INVALID_QUERY',
  ],
  ['sol build bad amount', () => P.buildSolanaPay({ recipient: F.SOL, amount: '-1' }), 'INVALID_AMOUNT'],
  // tron
  ['tron bad addr', () => P.parseTronUri('tron:Tabc'), 'INVALID_ADDRESS'],
  ['tron sol addr', () => P.parseTronUri(`tron:${F.SOL}`), 'INVALID_ADDRESS'],
  [
    'tron checksum',
    () => P.parseTronUri(`tron:${F.TRX.slice(0, -1)}${F.TRX.endsWith('a') ? 'b' : 'a'}`),
    'INVALID_ADDRESS',
  ],
  ['tron network', () => P.parseTronUri(`tron:${F.TRX}?network=evil`), 'INVALID_QUERY'],
  ['tron expected', () => P.parseTronUri(`tron:${F.TRX}?network=nile`, 'mainnet'), 'NETWORK_MISMATCH'],
  ['tron unknown', () => P.parseTronUri(`tron:${F.TRX}?x=1`), 'UNKNOWN_REQUIRED_PARAM'],
  ['tron dup', () => P.parseTronUri(`tron:${F.TRX}?amount=1&amount=1`), 'DUPLICATE_PARAM'],
  ['tron amount', () => P.parseTronUri(`tron:${F.TRX}?amount=1e3`), 'INVALID_AMOUNT'],
  ['tron build net', () => P.buildTronUri({ recipient: F.TRX, network: 'x' as 'nile' }), 'INVALID_QUERY'],
  // invoice link
  ['link http', () => P.parseInvoiceLink('http://a.example/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link userinfo', () => P.parseInvoiceLink('https://evil@a.example/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link query', () => P.parseInvoiceLink('https://a.example/pay?x=1#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link no frag', () => P.parseInvoiceLink('https://a.example/pay'), 'INVALID_LINK'],
  ['link wrong frag', () => P.parseInvoiceLink('https://a.example/pay#gpi=v2.AAAA'), 'INVALID_LINK'],
  ['link bad b64', () => P.parseInvoiceLink('https://a.example/pay#gpi=v1.AA=A'), 'INVALID_LINK'],
  ['link b64 len', () => P.parseInvoiceLink('https://a.example/pay#gpi=v1.AAAAA'), 'INVALID_LINK'],
  ['link ip', () => P.parseInvoiceLink('https://10.0.0.1/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  // G1-03: hosts the WHATWG URL parser reads as IPv4 (its "ends in a number" rule), not only dotted decimal.
  ['link ip decimal int', () => P.parseInvoiceLink('https://2130706433/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link ip hex loopback', () => P.parseInvoiceLink('https://0x7f000001/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link ip hex short', () => P.parseInvoiceLink('https://0x7f.1/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link ip mixed', () => P.parseInvoiceLink('https://1.2.3.0x4/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link ip hex link-local', () => P.parseInvoiceLink('https://0xa9.0xfe.0xa9.0xfe/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link ip hex rfc1918', () => P.parseInvoiceLink('https://0xc0.0xa8.0.1/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link ip octal', () => P.parseInvoiceLink('https://0177.0.0.1/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link ip upper hex', () => P.parseInvoiceLink('https://0X7F000001/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link ip bare 0x label', () => P.parseInvoiceLink('https://a.example.0x/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  [
    'link ip hex loopback in dev',
    () => P.parseInvoiceLink('https://0x7f000001/pay#gpi=v1.AAAA', { allowLocalDev: true }),
    'INVALID_LINK',
  ],
  [
    'link ip hex short over http in dev',
    () => P.parseInvoiceLink('http://0x7f.1/pay#gpi=v1.AAAA', { allowLocalDev: true }),
    'INVALID_LINK',
  ],
  ['link localhost', () => P.parseInvoiceLink('https://localhost/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link unicode host', () => P.parseInvoiceLink('https://exаmple.com/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  [
    'link host allow',
    () => P.parseInvoiceLink('https://b.example/pay#gpi=v1.AAAA', { allowedHosts: ['a.example'] }),
    'INVALID_LINK',
  ],
  ['link port', () => P.parseInvoiceLink('https://a.example:99999/pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link dotdot', () => P.parseInvoiceLink('https://a.example/../pay#gpi=v1.AAAA'), 'INVALID_LINK'],
  ['link long', () => P.parseInvoiceLink(`https://a.example/pay#gpi=v1.${'A'.repeat(23000)}`), 'TOO_LONG'],
  ['link non-string', () => P.parseInvoiceLink(5 as unknown as string), 'INVALID_INPUT'],
  ['link build frag', () => P.buildInvoiceLink('https://a.example', '#x'), 'INVALID_LINK'],
  ['link build origin', () => P.buildInvoiceLink('http://a.example', '#gpi=v1.AAAA'), 'INVALID_LINK'],
  // decimal
  ['dec non-string', () => P.parseDecimal(1 as unknown as string, 8, 10n), 'INVALID_AMOUNT'],
  ['dec fmt 0', () => P.formatAtomic(0n, 8), 'INVALID_AMOUNT'],
  [
    'dec toAtomic scale',
    () => P.toAtomic({ mantissa: 1n, scale: 3, canonical: '0.001' }, 2),
    'INVALID_AMOUNT',
  ],
  [
    'dec toAtomic decimals',
    () => P.toAtomic({ mantissa: 1n, scale: 0, canonical: '1' }, -1),
    'INVALID_AMOUNT',
  ],
];
const P_SOL33 = '1' + F.SOL; // 33 bytes after decode

describe('negative cases', () => {
  for (const [name, fn, want] of cases) {
    it(`${name} -> ${want}`, () => {
      expect(code(fn)).toBe(want);
    });
  }
  it('errors never echo input', () => {
    try {
      P.parseBitcoinUri('bitcoin:SECRETSECRETSECRET');
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRET');
      expect((e as P.PaymentUriError).name).toBe('PaymentUriError');
    }
  });
});
