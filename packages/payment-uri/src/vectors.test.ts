import { describe, expect, it } from 'vitest';
import {
  buildBitcoinUri,
  buildChainAddress,
  buildEip681Erc20,
  buildEip681Native,
  buildInvoiceLink,
  buildSolanaPay,
  buildTronUri,
  formatAtomic,
  parseBitcoinUri,
  parseBtcAddress,
  parseChainAddress,
  parseDecimal,
  parseEip681,
  parseEip681Number,
  parseEvmAddress,
  parseInvoiceLink,
  parsePaymentUri,
  parseSilentPaymentAddress,
  parseSolanaPay,
  parseSolanaAddress,
  parseTronUri,
  parseTronAddress,
  recipientInfo,
  solanaAtomic,
  toAtomic,
  hasMixedScript,
  pctDecode,
  pctEncode,
} from './index.js';
import * as F from './fixtures.testutil.js';

describe('EIP-55 / addresses', () => {
  it('official checksum vectors', () => {
    for (const a of [F.EVM, F.EVM2, F.EVM3, F.EVM4]) {
      expect(parseEvmAddress(a)).toEqual({ address: a, checksummed: true });
      expect(parseEvmAddress(a.toLowerCase())).toEqual({ address: a, checksummed: false });
    }
  });
  it('btc BIP-173/350 vectors', () => {
    expect(parseBtcAddress(F.BTC_BECH32).type).toBe('p2wpkh');
    expect(parseBtcAddress(F.BTC_BECH32.toUpperCase()).address).toBe(F.BTC_BECH32);
    expect(parseBtcAddress(F.BTC_TAPROOT).type).toBe('p2tr');
    expect(parseBtcAddress(F.BTC_TESTNET).network).toBe('test');
    expect(parseBtcAddress(F.BTC_P2PKH)).toMatchObject({ type: 'p2pkh', network: 'main' });
    expect(parseBtcAddress(F.BTC_P2SH)).toMatchObject({ type: 'p2sh', network: 'main' });
    expect(parseBtcAddress('bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080').network).toBe('regtest');
    expect(parseBtcAddress('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3').type).toBe(
      'p2wsh',
    );
    expect(parseBtcAddress('bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs').type).toBe('witness-unknown');
    expect(parseBtcAddress('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn').network).toBe('test');
    expect(parseBtcAddress('2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc').type).toBe('p2sh');
  });
  it('btc BIP-173/350 invalid vectors', () => {
    for (const bad of [
      'tc1qw508d6qejxtdg4y5r3zarvary0c5xw7kg3g4ty',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5',
      'BC13W508D6QEJXTDG4Y5R3ZARVARY0C5XW7KN40WF2',
      'bc1rw5uspcuh',
      'bc10w508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kw5rljs90',
      'BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P',
      'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh',
      'bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7k7grplx',
      'Bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3',
      'bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxg3ep',
      '',
      'x'.repeat(100),
    ]) {
      expect(() => parseBtcAddress(bad), bad).toThrow();
    }
  });
  it('sp addresses', () => {
    expect(parseSilentPaymentAddress(F.spAddr('sp')).network).toBe('main');
    expect(parseSilentPaymentAddress(F.spAddr('tsp')).network).toBe('test');
    expect(() => parseSilentPaymentAddress(F.spAddr('sp', 3, 1))).toThrow();
    expect(() => parseSilentPaymentAddress(F.spAddr('sp').toUpperCase())).toThrow();
    expect(() => parseSilentPaymentAddress(F.spAddr('sp').slice(0, -1) + 'q')).toThrow();
    expect(() => parseSilentPaymentAddress(BTC_AS_SP)).toThrow();
  });
  it('solana and tron', () => {
    expect(parseSolanaAddress('11111111111111111111111111111111')).toBe('11111111111111111111111111111111');
    expect(parseSolanaAddress(F.SOL)).toBe(F.SOL);
    expect(parseTronAddress('TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy')).toBe('TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy');
    expect(parseTronAddress(F.TRX)).toBe(F.TRX);
  });
});
const BTC_AS_SP = 'sp1' + 'q'.repeat(100);

describe('decimals', () => {
  it('parses exactly', () => {
    expect(parseDecimal('1.50', 8, 10n ** 12n)).toEqual({ mantissa: 15n, scale: 1, canonical: '1.5' });
    expect(toAtomic(parseDecimal('0.00000001', 8, 10n ** 20n), 8)).toBe(1n);
    expect(formatAtomic(150000000n, 8)).toBe('1.5');
    expect(formatAtomic(1n, 0)).toBe('1');
    expect(formatAtomic(100n, 2)).toBe('1');
  });
  it('eip681 numbers', () => {
    expect(parseEip681Number('2.014e18')).toBe(2014000000000000000n);
    expect(parseEip681Number('1')).toBe(1n);
    expect(parseEip681Number('1e3')).toBe(1000n);
    expect(parseEip681Number('0.5e1')).toBe(5n);
  });
});

describe('EIP-681 vectors', () => {
  it('spec native example', () => {
    // The spec's own example has an invalid EIP-55 mixed-case address; a strict parser must reject it (DEVIATIONS.md).
    expect(() => parseEip681('ethereum:0xfb6916095ca1df60bb79Ce92ce3ea74c37c5d359?value=2.014e18')).toThrow(
      'checksum',
    );
    const r = parseEip681('ethereum:0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359?value=2.014e18');
    expect(r).toMatchObject({
      kind: 'native',
      value: 2014000000000000000n,
      checksummed: false,
      legacyPayPrefix: false,
    });
    expect(r.recipient.canonical).toBe(F.EVM2);
  });
  it('spec erc20 example (lowercase accepted, flagged, checksummed output)', () => {
    const r = parseEip681(
      'ethereum:0x89205a3a3b2a69de6dbf7f01ed13b2108b2c43e7/transfer?address=0x8e23ee67d1332ad560396262c48ffbb01f93d052&uint256=1',
    );
    expect(r).toMatchObject({ kind: 'erc20-transfer', amount: 1n, checksummed: false });
  });
  it('chain id, pay- prefix, gas', () => {
    const r = parseEip681(`ethereum:pay-${F.EVM}@137?value=1e18&gas=21000&gasPrice=1e9`);
    expect(r).toMatchObject({ chainId: 137, gasLimit: 21000n, gasPrice: 1000000000n, legacyPayPrefix: true });
    expect(parseEip681(`ethereum:${F.EVM}@1`, { expectedChainId: 1 })).toMatchObject({ chainId: 1 });
  });
  it('builders round trip', () => {
    const n = buildEip681Native({ address: F.EVM.toLowerCase(), chainId: 10, value: 12345n });
    expect(n).toBe(`ethereum:${F.EVM}@10?value=12345`);
    expect(parseEip681(n)).toMatchObject({ kind: 'native', chainId: 10, value: 12345n });
    const t = buildEip681Erc20({ token: F.EVM2, recipient: F.EVM3, chainId: 1, amount: 5n });
    expect(parseEip681(t)).toMatchObject({ kind: 'erc20-transfer', amount: 5n });
    expect(buildEip681Native({ address: F.EVM })).toBe(`ethereum:${F.EVM}`);
    expect(parseEip681(buildEip681Erc20({ token: F.EVM2, recipient: F.EVM3 }))).toMatchObject({
      kind: 'erc20-transfer',
    });
  });
});

describe('EIP-3770', () => {
  it('parse/build', () => {
    expect(parseChainAddress(`eth:${F.EVM}`)).toMatchObject({ chainId: 1, address: F.EVM });
    expect(buildChainAddress(8453, F.EVM.toLowerCase())).toBe(`base:${F.EVM}`);
    expect(parseChainAddress(`custom:${F.EVM}`, { custom: 99 }).chainId).toBe(99);
  });
});

describe('Bitcoin', () => {
  it('BIP-21 spec example', () => {
    // The BIP-21 example address has a bad base58 checksum and must be rejected.
    expect(() =>
      parseBitcoinUri('bitcoin:175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W?amount=20.3&label=Luke-Jr'),
    ).toThrow();
    const A = F.BTC_P2PKH;
    const r = parseBitcoinUri(`bitcoin:${A}?amount=20.3&label=Luke-Jr`);
    expect(r).toMatchObject({
      amountSats: 2030000000n,
      label: 'Luke-Jr',
      network: 'main',
      addressType: 'p2pkh',
    });
    expect(r.address?.canonical).toBe(A);
    const r2 = parseBitcoinUri(`bitcoin:${A}?amount=50&label=Luke-Jr&message=Donation%20for%20project%20xyz`);
    expect(r2.message).toBe('Donation for project xyz');
  });
  it('sp-only (repo form) and combined', () => {
    const sp = F.spAddr('tsp');
    const r = parseBitcoinUri(`bitcoin:?sp=${sp}&amount=0.001`, { expectedNetwork: 'test' });
    expect(r).toMatchObject({ amountSats: 100000n, network: 'test' });
    expect(r.silentPayment?.canonical).toBe(sp);
    expect(parseBitcoinUri(`bitcoin:?sp=${sp}`, { expectedNetwork: 'regtest' }).network).toBe('regtest');
    const both = parseBitcoinUri(`bitcoin:${F.BTC_TESTNET}?sp=${sp}`);
    expect(both.address).toBeDefined();
    expect(both.silentPayment).toBeDefined();
  });
  it('req- and ignored', () => {
    expect(parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?req-amount=1`).amountSats).toBe(100000000n);
    expect(parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?pop=x&foo=bar`).ignored).toEqual(['pop', 'foo']);
    expect(parseBitcoinUri(`BITCOIN:${F.BTC_BECH32}?AMOUNT=1`).amountSats).toBe(100000000n);
  });
  it('lightning', () => {
    const ln = 'lnbc1' + 'q'.repeat(60);
    expect(parseBitcoinUri(`bitcoin:${F.BTC_BECH32}?lightning=${ln.toUpperCase()}`).lightning).toBe(ln);
    expect(parseBitcoinUri(`bitcoin:?lightning=${ln}`).network).toBe('main');
    expect(parseBitcoinUri(`bitcoin:?lightning=lnbcrt1${'q'.repeat(60)}`).network).toBe('regtest');
    expect(parseBitcoinUri(`bitcoin:?lightning=lntb1${'q'.repeat(60)}`).network).toBe('test');
  });
  it('builder', () => {
    expect(
      buildBitcoinUri({ address: F.BTC_BECH32, amountSats: 150000000n, label: 'Ünï & co', message: 'a+b' }),
    ).toBe(`bitcoin:${F.BTC_BECH32}?amount=1.5&label=%C3%9Cn%C3%AF%20%26%20co&message=a%2Bb`);
    const sp = F.spAddr('sp');
    expect(buildBitcoinUri({ silentPayment: sp })).toBe(`bitcoin:?sp=${sp}`);
    expect(buildBitcoinUri({ silentPayment: sp, amountSats: 1n })).toBe(
      `bitcoin:?sp=${sp}&amount=0.00000001`,
    );
  });
});

describe('Solana Pay', () => {
  it('spec-style example', () => {
    const u = `solana:${F.SOL}?amount=1&spl-token=${F.SOL_MINT}&reference=${F.SOL_REF}&reference=${F.SOL_REF2}&label=Michael&message=Thanks%20for%20all%20the%20fish&memo=OrderId5678`;
    const r = parseSolanaPay(u);
    expect(r).toMatchObject({ references: [F.SOL_REF, F.SOL_REF2], label: 'Michael', memo: 'OrderId5678' });
    expect(r.amount?.canonical).toBe('1');
    expect(solanaAtomic(r.amount!, 6)).toBe(1000000n);
    expect(parseSolanaPay(`solana:${F.SOL}`).references).toEqual([]);
  });
  it('overflow and precision at conversion', () => {
    const r = parseSolanaPay(`solana:${F.SOL}?amount=0.0000000001`);
    expect(() => solanaAtomic(r.amount!, 9)).toThrow();
    expect(() => parseSolanaPay(`solana:${F.SOL}?amount=18446744073709551616`)).toThrow('range');
    const big = parseSolanaPay(`solana:${F.SOL}?amount=18446744073709551615`);
    expect(() => solanaAtomic(big.amount!, 1)).toThrow('range');
    expect(solanaAtomic(parseSolanaPay(`solana:${F.SOL}?amount=18446744073709551615`).amount!, 0)).toBe(
      18446744073709551615n,
    );
  });
  it('build', () => {
    expect(buildSolanaPay({ recipient: F.SOL, amount: '1.50' })).toBe(`solana:${F.SOL}?amount=1.5`);
    expect(buildSolanaPay({ recipient: F.SOL })).toBe(`solana:${F.SOL}`);
  });
});

describe('TRON (nonstandard)', () => {
  it('round trip', () => {
    const u = buildTronUri({ recipient: F.TRX, amount: '12.5', token: F.TRX2, network: 'nile', label: 'x' });
    expect(u).toBe(`tron:${F.TRX}?network=nile&amount=12.5&token=${F.TRX2}&label=x`);
    expect(parseTronUri(u, 'nile')).toMatchObject({ network: 'nile' });
    expect(parseTronUri(`tron:${F.TRX}`).network).toBe('mainnet');
    expect(buildTronUri({ recipient: F.TRX, message: 'm' })).toContain('network=mainnet');
  });
});

describe('invoice link', () => {
  const frag = '#gpi=v1.' + 'A'.repeat(40);
  it('round trip', () => {
    const l = buildInvoiceLink('https://Ghostpay.Example', frag);
    expect(l).toBe(`https://ghostpay.example/pay${frag}`);
    expect(parseInvoiceLink(l, { allowedHosts: ['ghostpay.example'] })).toMatchObject({
      host: 'ghostpay.example',
      path: '/pay',
      fragment: frag,
    });
    expect(parseInvoiceLink(`https://a.example:8443${frag}`).origin).toBe('https://a.example:8443');
    expect(parseInvoiceLink(`http://localhost:5173/pay${frag}`, { allowLocalDev: true }).host).toBe(
      'localhost',
    );
    expect(parseInvoiceLink(`http://127.0.0.1/pay${frag}`, { allowLocalDev: true }).host).toBe('127.0.0.1');
  });
  it('accepts names whose last label is not a number, even with numeric or hex-like labels before it', () => {
    for (const host of ['0x7f.example', '1.2.3.example', '10.0.0.1a', 'a0x1.example', '0xg1']) {
      expect(parseInvoiceLink(`https://${host}/pay${frag}`).host).toBe(host);
      // The WHATWG URL parser agrees: these stay domain names, not IPv4 addresses.
      expect(new URL(`https://${host}/pay`).hostname).toBe(host);
    }
  });
});

describe('dispatcher and misc', () => {
  it('routes by scheme', () => {
    expect(parsePaymentUri(`ethereum:${F.EVM}`).kind).toBe('eip681');
    expect(parsePaymentUri(`bitcoin:${F.BTC_BECH32}`).kind).toBe('bitcoin');
    expect(parsePaymentUri(`solana:${F.SOL}`).kind).toBe('solana-pay');
    expect(parsePaymentUri(`tron:${F.TRX}`, { tronNetwork: 'mainnet' }).kind).toBe('tron');
    expect(parsePaymentUri(`eth:${F.EVM}`).kind).toBe('eip3770');
    expect(parsePaymentUri(`https://a.example/pay#gpi=v1.${'A'.repeat(20)}`).kind).toBe('invoice-link');
  });
  it('recipient info', () => {
    const r = recipientInfo('evm', F.EVM);
    expect(r.display).toBe('0x5aAe b605 3F3E 94C9 b9A0 9f33 6694 35E7 Ef1B eAed');
    expect(r.digest).toMatch(/^[0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4}$/);
    expect(recipientInfo('evm', F.EVM2).digest).not.toBe(r.digest);
    expect(recipientInfo('solana', F.SOL).display.replace(/ /g, '')).toBe(F.SOL);
  });
  it('helpers', () => {
    expect(hasMixedScript('pаypal')).toBe(true);
    expect(hasMixedScript('paypal')).toBe(false);
    expect(pctDecode(pctEncode("a b+c!'()*é"))).toBe("a b+c!'()*é");
  });
});
