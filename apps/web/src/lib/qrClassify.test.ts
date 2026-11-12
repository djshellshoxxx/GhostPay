import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { encodeBase64Url, encodeFragment } from '@ghostpay/invoice-schema';
import { buildBitcoinUri, buildEip681Erc20, buildEip681Native, buildSolanaPay, buildTronUri } from '@ghostpay/payment-uri';
import { encodeMultipart } from '@ghostpay/qr-exchange';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base58, bech32m, createBase58check } from '@scure/base';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeParsed } from '../test/invoiceFixtures';
import { encryptKeystore } from './keystore';
import type { LocalReceipt } from './payExec';
import {
  MAX_QR_TEXT_BYTES,
  QR_FAMILIES,
  QR_FAMILY_SCREEN,
  classifyQrText,
  kindForFamily,
  type QrClassification,
} from './qrClassify';
import { receiptJson, signReceipt } from './receipts';
import { clearSession, generateSession, getSessionPublic } from './session';
import { DEFAULT_SETTINGS } from './settings';
import { exportSettingsExchange } from './settingsExchange';
import { exportSellerPairing } from './sellerPairing';

// ---- Public fixtures (same vectors as packages/payment-uri/src/fixtures.testutil.ts) ----
const EVM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const EVM2 = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const BTC_TESTNET = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const SOL = base58.encode(Uint8Array.from({ length: 32 }, (_, i) => (31 + i * 7 + 1) & 0xff));
const tronRaw = new Uint8Array(21);
tronRaw[0] = 0x41;
for (let i = 1; i < 21; i++) tronRaw[i] = (17 + i * 5) & 0xff;
const TRX = createBase58check(sha256).encode(tronRaw);
const SP = bech32m.encode('sp', [0, ...bech32m.toWords(Uint8Array.from({ length: 66 }, (_, i) => (3 + i * 3) & 0xff))], 130);

const RECEIPT_FIELDS = {
  invoiceDigest: `0x${'a'.repeat(64)}`,
  chainId: 84532,
  txHash: `0x${'b'.repeat(64)}`,
  stealthAddress: `0x${'c'.repeat(40)}`,
  asset: `0x${'d'.repeat(40)}`,
  amountMinorUnits: '2500000000000000000',
  issuedAt: 1_800_000_000,
};
const PROOF: LocalReceipt = {
  kind: 'ghostpay-local-receipt',
  version: 1,
  chainId: 84532,
  txHash: `0x${'ab'.repeat(32)}`,
  router: EVM,
  token: 'native',
  gross: '100',
  fee: '1',
  net: '99',
  invoiceNonce: 'n'.repeat(32),
  fiat: 'USD 10000',
  quote: { source: 'fixed', timestamp: 1, expiresAt: 2 },
  status: 'included',
  createdAt: '2026-10-25T00:00:00.000Z',
};

const META = encodeMetaAddress(generateKeySet());
const KEYSTORE_PASSPHRASE = 'violet comet maple lantern';
const INVOICE_PASSPHRASE = 'correct horse battery staple';

interface Fixtures {
  readonly chunks: readonly string[];
  readonly plainLink: string;
  readonly plainFragment: string;
  readonly bearerLink: string;
  readonly passphraseFragment: string;
  readonly pairing: string;
  readonly settings: string;
  readonly receipt: string;
  readonly proof: string;
  readonly keystore: string;
}
let fx: Fixtures;

beforeAll(async () => {
  const plain = await makeParsed();
  const bearer = await makeParsed({ encrypt: true });
  const passphraseFragment = await encodeFragment(
    { invoice: plain.parsed.invoice, signature: plain.parsed.signature },
    { passphrase: INVOICE_PASSPHRASE, scryptN: 1 << 15 },
  );
  clearSession();
  generateSession();
  const pub = getSessionPublic();
  if (pub === undefined) throw new Error('fixture: no session');
  const pairing = exportSellerPairing(pub, [11155111]);
  clearSession();
  const keystore = await encryptKeystore(
    { spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(32).fill(3) },
    { metaAddress: pub.metaAddress, signer: pub.signerPublicKey },
    KEYSTORE_PASSPHRASE,
    { N: 1 << 14 },
  );
  fx = {
    chunks: encodeMultipart(utf8ToBytes('x'.repeat(900)), { chunkChars: 400 }),
    plainLink: plain.link,
    plainFragment: plain.fragment,
    bearerLink: bearer.link,
    passphraseFragment,
    pairing,
    settings: exportSettingsExchange(DEFAULT_SETTINGS),
    receipt: receiptJson(signReceipt(RECEIPT_FIELDS, new Uint8Array(32).fill(7))),
    proof: JSON.stringify(PROOF),
    keystore,
  };
});

const unknown = (reason: string, format?: string): QrClassification =>
  (format === undefined ? { family: 'unknown', reason } : { family: 'unknown', reason, format }) as QrClassification;
const tamper = (text: string, edit: (o: Record<string, unknown>) => void): string => {
  const o = JSON.parse(text) as Record<string, unknown>;
  edit(o);
  return JSON.stringify(o);
};

describe('classifyQrText: positive cases per family', () => {
  it('multipart fragment: reports session/index/total but never the chunk data', () => {
    expect(fx.chunks.length).toBe(3);
    const result = classifyQrText(fx.chunks[1]!);
    expect(result).toEqual({ family: 'multipart-fragment', validated: true, session: fx.chunks[1]!.split('/')[1], index: 1, total: 3 });
    expect(JSON.stringify(result)).not.toContain(fx.chunks[1]!.split('/')[5]!);
  });

  it('invoice link (plain, bearer key, passphrase) and raw fragment, without returning the bearer payload', () => {
    const plain = classifyQrText(fx.plainLink);
    expect(plain).toEqual({ family: 'invoice-link', validated: false, form: 'link', protection: 'plain' });
    expect(classifyQrText(fx.plainFragment)).toEqual({ family: 'invoice-link', validated: false, form: 'fragment', protection: 'plain' });
    const bearer = classifyQrText(fx.bearerLink);
    expect(bearer).toEqual({ family: 'invoice-link', validated: false, form: 'link', protection: 'bearer-key' });
    expect(classifyQrText(fx.passphraseFragment)).toEqual({ family: 'invoice-link', validated: false, form: 'fragment', protection: 'passphrase' });
    const payload = fx.bearerLink.slice(fx.bearerLink.indexOf('#gpi=v1.') + 8);
    expect(JSON.stringify(bearer)).not.toContain(payload.slice(0, 24));
  });

  it('invoice link honours the allowed-host option of the owning parser', () => {
    expect(classifyQrText(fx.plainLink, { invoiceLink: { allowedHosts: ['app.test'] } }).family).toBe('invoice-link');
    expect(classifyQrText(fx.plainLink, { invoiceLink: { allowedHosts: ['other.test'] } })).toEqual(unknown('malformed', 'invoice-link'));
  });

  it('EVM requests: EIP-681 native and ERC-20, and EIP-3770', () => {
    expect(classifyQrText(buildEip681Native({ address: EVM, chainId: 84532, value: 10n }))).toEqual({ family: 'evm-request', validated: true, standard: 'eip681', chainId: 84532 });
    expect(classifyQrText(buildEip681Erc20({ token: EVM, recipient: EVM2, chainId: 1, amount: 5n }))).toEqual({ family: 'evm-request', validated: true, standard: 'eip681', chainId: 1 });
    expect(classifyQrText(`ethereum:${EVM}`)).toEqual({ family: 'evm-request', validated: true, standard: 'eip681' });
    expect(classifyQrText(`base:${EVM}`)).toEqual({ family: 'evm-request', validated: true, standard: 'eip3770', chainId: 8453 });
    expect(classifyQrText(`gp:${EVM}`, { paymentUri: { chainShortNames: { gp: 77 } } })).toEqual({ family: 'evm-request', validated: true, standard: 'eip3770', chainId: 77 });
  });

  it('bitcoin requests: BIP-21 and silent payments', () => {
    expect(classifyQrText(buildBitcoinUri({ address: BTC_BECH32, amountSats: 1000n }))).toEqual({ family: 'bitcoin-request', validated: true, network: 'main', silentPayment: false });
    expect(classifyQrText(`bitcoin:${BTC_TESTNET}`)).toEqual({ family: 'bitcoin-request', validated: true, network: 'test', silentPayment: false });
    expect(classifyQrText(buildBitcoinUri({ silentPayment: SP }))).toEqual({ family: 'bitcoin-request', validated: true, network: 'main', silentPayment: true });
  });

  it('Solana Pay and TRON requests', () => {
    expect(classifyQrText(buildSolanaPay({ recipient: SOL, amount: '1.5' }))).toEqual({ family: 'solana-request', validated: true });
    expect(classifyQrText(buildTronUri({ recipient: TRX, network: 'nile', amount: '2' }))).toEqual({ family: 'tron-request', validated: true, network: 'nile' });
    expect(classifyQrText(`tron:${TRX}`)).toEqual({ family: 'tron-request', validated: true, network: 'mainnet' });
  });

  it('public meta-address, raw and in its versioned envelope', () => {
    expect(classifyQrText(META)).toEqual({ family: 'public-meta', validated: true, form: 'raw' });
    expect(classifyQrText(JSON.stringify({ format: 'ghostpay-public-meta', v: 1, metaAddress: META }))).toEqual({ family: 'public-meta', validated: true, form: 'json' });
  });

  it('seller pairing, validated against the allowed chains (default: the app pairing chains)', () => {
    expect(classifyQrText(fx.pairing)).toEqual({ family: 'seller-pairing', validated: true });
    expect(classifyQrText(fx.pairing, { sellerPairingChainIds: [11155111] })).toEqual({ family: 'seller-pairing', validated: true });
    expect(classifyQrText(fx.pairing, { sellerPairingChainIds: [84532] })).toEqual(unknown('malformed', 'seller-pairing'));
  });

  it('settings: envelope only (format + integer v), including a future version', () => {
    expect(classifyQrText(fx.settings)).toEqual({ family: 'settings', validated: false, version: 1 });
    expect(classifyQrText(tamper(fx.settings, (o) => { o['v'] = 2; o['settings'] = { anything: true }; }))).toEqual({ family: 'settings', validated: false, version: 2 });
    expect(classifyQrText(tamper(fx.settings, (o) => { o['v'] = '2'; }))).toEqual(unknown('malformed', 'settings'));
    expect(classifyQrText(tamper(fx.settings, (o) => { o['v'] = 0; }))).toEqual(unknown('malformed', 'settings'));
    expect(classifyQrText(tamper(fx.settings, (o) => { delete o['v']; }))).toEqual(unknown('malformed', 'settings'));
  });

  it('seller receipt: signature verified by the owning parser', () => {
    expect(classifyQrText(fx.receipt)).toEqual({ family: 'seller-receipt', validated: true, version: 1 });
    expect(classifyQrText(tamper(fx.receipt, (o) => { o['amountMinorUnits'] = '1'; }))).toEqual(unknown('malformed', 'seller-receipt'));
  });

  it('payment proof: payer local receipt by exact shape', () => {
    expect(classifyQrText(fx.proof)).toEqual({ family: 'payment-proof', validated: false, version: 1, status: 'included' });
    expect(classifyQrText(JSON.stringify({ ...PROOF, status: 'unconfirmed' }))).toEqual({ family: 'payment-proof', validated: false, version: 1, status: 'unconfirmed' });
    expect(classifyQrText(JSON.stringify({ ...PROOF, extra: 1 }))).toEqual(unknown('malformed', 'payment-proof'));
    expect(classifyQrText(JSON.stringify({ ...PROOF, status: 'paid' }))).toEqual(unknown('malformed', 'payment-proof'));
    expect(classifyQrText(JSON.stringify({ ...PROOF, quote: { source: 'fixed' } }))).toEqual(unknown('malformed', 'payment-proof'));
    expect(classifyQrText(JSON.stringify({ ...PROOF, txHash: 'nope' }))).toEqual(unknown('malformed', 'payment-proof'));
  });

  it('encrypted keystore: envelope only, never decrypted, no secret material in the result', () => {
    const result = classifyQrText(fx.keystore);
    expect(result).toEqual({ family: 'encrypted-keystore', validated: true, version: 1 });
    const file = JSON.parse(fx.keystore) as { ciphertext: string; iv: string; kdfParams: { salt: string } };
    for (const secret of [file.ciphertext, file.iv, file.kdfParams.salt]) expect(JSON.stringify(result)).not.toContain(secret);
    expect(classifyQrText(tamper(fx.keystore, (o) => { o['ciphertext'] = 'zz'; }))).toEqual(unknown('malformed', 'encrypted-keystore'));
  });
});

describe('classifyQrText: negatives', () => {
  it('empty and whitespace-only input', () => {
    expect(classifyQrText('')).toEqual(unknown('empty'));
    expect(classifyQrText('   \n\t')).toEqual(unknown('empty'));
  });

  it('size cap is UTF-8 bytes, checked before parsing, and can only be lowered', () => {
    expect(MAX_QR_TEXT_BYTES).toBe(65_536);
    expect(classifyQrText('a'.repeat(MAX_QR_TEXT_BYTES + 1))).toEqual(unknown('too-large'));
    // 21846 three-byte characters: 21846 UTF-16 units but 65538 bytes.
    const multibyte = '\u20ac'.repeat(21_846);
    expect(multibyte.length).toBeLessThan(MAX_QR_TEXT_BYTES);
    expect(classifyQrText(multibyte)).toEqual(unknown('too-large'));
    // Within the cap but not a QR payload.
    expect(classifyQrText('\u20ac'.repeat(21_845))).toEqual(unknown('malformed'));
    // 4-byte characters in a JSON string.
    expect(classifyQrText(`{"format":"ghostpay-settings","v":1,"x":"${'\u{1F600}'.repeat(16_384)}"}`)).toEqual(unknown('too-large'));
    expect(classifyQrText(fx.receipt, { maxBytes: 64 })).toEqual(unknown('too-large'));
    expect(classifyQrText(fx.receipt, { maxBytes: 10_000_000 }).family).toBe('seller-receipt');
    expect(classifyQrText('a'.repeat(MAX_QR_TEXT_BYTES + 1), { maxBytes: 10_000_000 })).toEqual(unknown('too-large'));
    for (const maxBytes of [0, -1, Number.NaN, 1.5]) expect(classifyQrText(fx.receipt, { maxBytes }).family).toBe('seller-receipt');
  });

  it('malformed JSON, duplicate keys (strict parser) and non-object JSON', () => {
    expect(classifyQrText('{"format":"ghostpay-settings","v":1')).toEqual(unknown('malformed'));
    expect(classifyQrText(fx.settings.replace('"v":1', '"v":1,"v":1'))).toEqual(unknown('malformed'));
    expect(classifyQrText(fx.receipt.replace('"version":1', '"version":1,"version":1'))).toEqual(unknown('malformed'));
    expect(classifyQrText('{"format":"ghostpay-settings","v":1.0}')).toEqual(unknown('malformed'));
    expect(classifyQrText('{"__proto__":{"format":"ghostpay-settings"}}')).toEqual(unknown('malformed'));
    expect(classifyQrText('[1,2,3]')).toEqual(unknown('unknown-format'));
    expect(classifyQrText('{}')).toEqual(unknown('unknown-format'));
    expect(classifyQrText('{"format":"ghostpay-something-else","v":1}')).toEqual(unknown('unknown-format'));
    expect(classifyQrText('{"format":"GHOSTPAY-SETTINGS","v":1}')).toEqual(unknown('unknown-format'));
  });

  it('unsupported versions of known formats say which format', () => {
    expect(classifyQrText(tamper(fx.pairing, (o) => { o['v'] = 2; }))).toEqual(unknown('unsupported-version', 'seller-pairing'));
    expect(classifyQrText(JSON.stringify({ format: 'ghostpay-public-meta', v: 2, metaAddress: META }))).toEqual(unknown('unsupported-version', 'public-meta'));
    expect(classifyQrText(tamper(fx.receipt, (o) => { o['version'] = 2; }))).toEqual(unknown('unsupported-version', 'seller-receipt'));
    expect(classifyQrText(JSON.stringify({ ...PROOF, version: 2 }))).toEqual(unknown('unsupported-version', 'payment-proof'));
    expect(classifyQrText(tamper(fx.keystore, (o) => { o['v'] = 2; }))).toEqual(unknown('unsupported-version', 'encrypted-keystore'));
    expect(classifyQrText(fx.chunks[0]!.replace(/^GPQ1\//, 'GPQ2/'))).toEqual(unknown('unsupported-version', 'multipart-fragment'));
    expect(classifyQrText(fx.plainFragment.replace('#gpi=v1.', '#gpi=v2.'))).toEqual(unknown('unsupported-version', 'invoice-link'));
    expect(classifyQrText(fx.plainLink.replace('#gpi=v1.', '#gpi=v2.'))).toEqual(unknown('unsupported-version', 'invoice-link'));
    // Unknown envelope algorithm inside a v1 fragment.
    const futureAlg = `#gpi=v1.${encodeBase64Url(utf8ToBytes('{"alg":"X25519"}'))}`;
    expect(classifyQrText(futureAlg)).toEqual(unknown('unsupported-version', 'invoice-link'));
    // Non-integer versions are malformed, not "update the app".
    expect(classifyQrText(tamper(fx.pairing, (o) => { o['v'] = 'one'; }))).toEqual(unknown('malformed', 'seller-pairing'));
  });

  it('damaged payloads of recognised families are malformed with the family hint', () => {
    const chunk = fx.chunks[0]!;
    expect(classifyQrText(`${chunk.slice(0, -1)}${chunk.endsWith('A') ? 'B' : 'A'}`)).toEqual(unknown('malformed', 'multipart-fragment'));
    expect(classifyQrText('#gpi=v1.***')).toEqual(unknown('malformed', 'invoice-link'));
    expect(classifyQrText('#gpi=v1.')).toEqual(unknown('malformed', 'invoice-link'));
    expect(classifyQrText(`#gpi=v1.${encodeBase64Url(utf8ToBytes('{"alg": "none"}'))}`)).toEqual(unknown('malformed', 'invoice-link'));
    expect(classifyQrText(`#gpi=v1.${encodeBase64Url(utf8ToBytes('[1]'))}`)).toEqual(unknown('malformed', 'invoice-link'));
    expect(classifyQrText(`#gpi=v1.${encodeBase64Url(new Uint8Array([0xff, 0xfe]))}`)).toEqual(unknown('malformed', 'invoice-link'));
    expect(classifyQrText(`#gpi=v1.${'A'.repeat(30_000)}`)).toEqual(unknown('malformed', 'invoice-link'));
    expect(classifyQrText(`https://app.test/${fx.plainFragment.replace('#gpi=v1.', '#gpi=x')}`)).toEqual(unknown('malformed', 'invoice-link'));
    expect(classifyQrText(`https://user@app.test/${fx.plainFragment}`)).toEqual(unknown('malformed', 'invoice-link'));
    expect(classifyQrText(`ethereum:${EVM.toLowerCase().replace('5a', '5b')}x`)).toEqual(unknown('malformed', 'evm-request'));
    expect(classifyQrText(`bitcoin:${BTC_BECH32}?amount=abc`)).toEqual(unknown('malformed', 'bitcoin-request'));
    expect(classifyQrText('solana:notbase58!')).toEqual(unknown('malformed', 'solana-request'));
    expect(classifyQrText('tron:T123')).toEqual(unknown('malformed', 'tron-request'));
    expect(classifyQrText(`eth:${EVM}x`)).toEqual(unknown('malformed', 'evm-request'));
    expect(classifyQrText('st:eth:0x' + '00'.repeat(66))).toEqual(unknown('malformed', 'public-meta'));
    expect(classifyQrText(JSON.stringify({ format: 'ghostpay-public-meta', v: 1, metaAddress: META, extra: 1 }))).toEqual(unknown('malformed', 'public-meta'));
    expect(classifyQrText(tamper(fx.pairing, (o) => { o['check'] = '00000000'; }))).toEqual(unknown('malformed', 'seller-pairing'));
  });

  it('dangerous and unsupported schemes never reach a parser and are never echoed', () => {
    const dangerous = [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'blob:https://app.test/0b3e',
      'intent://scan/#Intent;scheme=zxing;end',
      'about:blank',
      'http://app.test/pay',
      'https://example.test/path?q=1',
      'https://app.test/',
      'mailto:a@example.test',
      'ftp://example.test/x',
      'sms:+15550100',
      'wss://relay.example.test',
      'chrome://settings',
      ' javascript:alert(1)',
    ];
    for (const text of dangerous) {
      const result = classifyQrText(text);
      expect(result, text).toEqual(unknown('unsupported-scheme'));
    }
    // A custom chain registry cannot re-enable a dangerous scheme.
    expect(classifyQrText(`javascript:${EVM}`, { paymentUri: { chainShortNames: { javascript: 1 } } })).toEqual(unknown('unsupported-scheme'));
    // http invoice links only in explicit local development mode, as the owning parser defines.
    const devLink = `http://localhost:5173/${fx.plainFragment}`;
    expect(classifyQrText(devLink)).toEqual(unknown('unsupported-scheme'));
    expect(classifyQrText(devLink, { invoiceLink: { allowLocalDev: true } })).toEqual({ family: 'invoice-link', validated: false, form: 'link', protection: 'plain' });
  });

  it('cross-family confusion: receipt vs proof, settings vs pairing, mixed discriminators are ambiguous', () => {
    expect(classifyQrText(fx.receipt).family).toBe('seller-receipt');
    expect(classifyQrText(fx.proof).family).toBe('payment-proof');
    // A proof carrying a receipt signature, or a receipt carrying the proof discriminator, is not guessed.
    const receipt = JSON.parse(fx.receipt) as Record<string, unknown>;
    expect(classifyQrText(JSON.stringify({ ...PROOF, signature: receipt['signature'], invoiceDigest: receipt['invoiceDigest'] }))).toEqual(unknown('ambiguous'));
    expect(classifyQrText(JSON.stringify({ ...receipt, kind: 'ghostpay-local-receipt' }))).toEqual(unknown('ambiguous'));
    expect(classifyQrText(fx.settings).family).toBe('settings');
    expect(classifyQrText(fx.pairing).family).toBe('seller-pairing');
    expect(classifyQrText(tamper(fx.settings, (o) => { o['kind'] = 'ghostpay-local-receipt'; }))).toEqual(unknown('ambiguous'));
    expect(classifyQrText(tamper(fx.keystore, (o) => { o['format'] = 'ghostpay-settings'; }))).toEqual(unknown('ambiguous'));
    // Pairing text with the settings format is only a settings envelope (callers must run the settings parser).
    expect(classifyQrText(tamper(fx.pairing, (o) => { o['format'] = 'ghostpay-settings'; }))).toEqual({ family: 'settings', validated: false, version: 1 });
    // A keystore is never mistaken for a pairing or public meta-address even though it embeds one.
    expect(classifyQrText(fx.keystore).family).toBe('encrypted-keystore');
  });

  it('leading/trailing whitespace: no repair beyond the owning parser', () => {
    // URI parsers reject surrounding whitespace.
    expect(classifyQrText(` ethereum:${EVM}`)).toEqual(unknown('malformed'));
    expect(classifyQrText(`ethereum:${EVM} `)).toEqual(unknown('malformed', 'evm-request'));
    expect(classifyQrText(`${fx.chunks[0]!}\n`)).toEqual(unknown('malformed', 'multipart-fragment'));
    expect(classifyQrText(` ${fx.plainFragment}`)).toEqual(unknown('malformed'));
    expect(classifyQrText(`${fx.plainLink} `)).toEqual(unknown('malformed', 'invoice-link'));
    expect(classifyQrText(` ${META}`)).toEqual(unknown('malformed'));
    // JSON envelopes allow JSON whitespace, exactly as parseStrictJson and the owning parsers do.
    expect(classifyQrText(`\n ${fx.pairing} \n`).family).toBe('seller-pairing');
    expect(classifyQrText(`  ${fx.settings}\r\n`).family).toBe('settings');
    expect(classifyQrText(`\n${fx.receipt}\n`).family).toBe('seller-receipt');
    // Non-JSON whitespace around JSON is not repaired.
    expect(classifyQrText(`\u00a0${fx.settings}`)).toEqual(unknown('malformed'));
  });

  it('NUL, control, bidi and BOM characters are refused before parsing', () => {
    for (const text of [
      `ethereum:${EVM}\u0000`,
      `\u0000${fx.settings}`,
      `${fx.chunks[0]!}\u0007`,
      `\ufeff${fx.settings}`,
      `${fx.settings.slice(0, 5)}\u202e${fx.settings.slice(5)}`,
      `bitcoin:${BTC_BECH32}\u0085`,
      `tron:${TRX}\u2028`,
      '\u007f',
    ]) {
      expect(classifyQrText(text)).toEqual(unknown('malformed'));
    }
  });

  it('plain text and bare addresses are not a recognised family', () => {
    expect(classifyQrText('hello world')).toEqual(unknown('malformed'));
    expect(classifyQrText(EVM)).toEqual(unknown('malformed'));
    expect(classifyQrText(BTC_BECH32)).toEqual(unknown('malformed'));
    expect(classifyQrText('unknownscheme:abc')).toEqual(unknown('unsupported-scheme'));
  });

  it('never throws for non-string input', () => {
    expect(classifyQrText(undefined as unknown as string)).toEqual(unknown('malformed'));
    expect(classifyQrText(42 as unknown as string)).toEqual(unknown('malformed'));
  });
});

describe('QR_FAMILY_SCREEN and kindForFamily', () => {
  it('maps every family to its owning screen (or none)', () => {
    expect(Object.keys(QR_FAMILY_SCREEN).sort()).toEqual([...QR_FAMILIES].sort());
    expect(QR_FAMILY_SCREEN).toEqual({
      'multipart-fragment': null,
      'invoice-link': 'pay',
      'evm-request': null,
      'bitcoin-request': 'btc',
      'solana-request': 'solana',
      'tron-request': 'tron',
      'public-meta': 'registry',
      'seller-pairing': 'seller',
      settings: 'settings',
      'seller-receipt': 'pay',
      'payment-proof': null,
      'encrypted-keystore': 'seller',
      unknown: null,
    });
  });

  it('maps classifications to the colour-coded QR kind via kindForPayload', () => {
    expect(kindForFamily(classifyQrText(fx.keystore))).toBe('secret');
    expect(kindForFamily(classifyQrText(fx.settings))).toBe('device');
    expect(kindForFamily(classifyQrText(fx.pairing))).toBe('device');
    expect(kindForFamily(classifyQrText(fx.receipt))).toBe('proof');
    expect(kindForFamily(classifyQrText(fx.proof))).toBe('proof');
    expect(kindForFamily(classifyQrText(JSON.stringify({ ...PROOF, status: 'reverted' })))).toBe('caution');
    expect(kindForFamily(classifyQrText(fx.plainLink))).toBe('shareable');
    expect(kindForFamily(classifyQrText(fx.bearerLink))).toBe('bearer');
    expect(kindForFamily(classifyQrText(fx.passphraseFragment))).toBe('shareable');
    expect(kindForFamily(classifyQrText(META))).toBe('shareable');
    expect(kindForFamily(classifyQrText(`bitcoin:${BTC_BECH32}`))).toBe('shareable');
    expect(kindForFamily(classifyQrText(`bitcoin:${BTC_TESTNET}`))).toBe('caution');
    expect(kindForFamily(classifyQrText(`tron:${TRX}`))).toBe('shareable');
    expect(kindForFamily(classifyQrText(buildTronUri({ recipient: TRX, network: 'shasta' })))).toBe('caution');
    expect(kindForFamily(classifyQrText(buildEip681Native({ address: EVM, chainId: 1 })))).toBe('shareable');
    expect(kindForFamily(classifyQrText(buildEip681Native({ address: EVM, chainId: 84532 })))).toBe('caution');
    expect(kindForFamily(classifyQrText(`ethereum:${EVM}`))).toBe('shareable');
    expect(kindForFamily(classifyQrText(buildSolanaPay({ recipient: SOL })))).toBe('shareable');
    expect(kindForFamily(classifyQrText(buildSolanaPay({ recipient: SOL })), { testnet: true })).toBe('caution');
    expect(kindForFamily(classifyQrText(fx.keystore), { testnet: true })).toBe('secret');
    expect(kindForFamily(classifyQrText(fx.chunks[0]!))).toBeNull();
    expect(kindForFamily(classifyQrText(''))).toBeNull();
  });
});
