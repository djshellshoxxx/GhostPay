import { describe, expect, it } from 'vitest';
import { createInvoice, encodeFragment, invoiceDigest, signInvoice, signReceipt, type Invoice } from '@ghostpay/invoice-schema';
import { crc32Ascii, encodeMultipart, exportSellerPairing } from '@ghostpay/qr-exchange';
import { invoiceCommands } from './commands/invoice.js';
import { receiptCommands } from './commands/receipt.js';
import { qrCommands } from './commands/qr.js';
import { sellerCommands, SUPPORTED_SELLER_CHAINS } from './commands/seller.js';
import { invoke, result } from './exchange.testutil.js';
import { G, G2, KEY_BYTES, SIGNER, SPEC, makeIo, toHex } from './fixtures.testutil.js';

function invoices(over: Partial<Invoice> = {}) {
  const io = makeIo();
  const invoice = createInvoice({ ...SPEC, signer: SIGNER, amountPolicy: { mode: 'fixed_token', tokenAmount: '1000' }, ...over }, io.random);
  const signed = signInvoice(invoice, KEY_BYTES);
  io.files.set('invoice', JSON.stringify(signed));
  return { io, invoice, signed };
}

function receipts(over: Partial<Invoice> = {}) {
  const fixture = invoices({ chainId: 84532, token: 'native', ...over });
  const payload = { invoiceDigest: `0x${toHex(invoiceDigest(fixture.invoice))}`, chainId: fixture.invoice.chainId, txHash: `0x${'b'.repeat(64)}`, stealthAddress: `0x${'c'.repeat(40)}`, asset: fixture.invoice.token, amountMinorUnits: '1000', issuedAt: fixture.io.now };
  const receipt = signReceipt(payload, KEY_BYTES);
  fixture.io.files.set('receipt', JSON.stringify(receipt));
  return { ...fixture, payload, receipt };
}

const sellerSource = { metaAddress: SPEC.metaAddress, signerPublicKey: SIGNER };
const sellerText = () => exportSellerPairing(sellerSource, [84532], SUPPORTED_SELLER_CHAINS);

describe('invoice argument and trust boundaries', () => {
  it.each([
    ['--expected-chain', '0'], ['--expected-chain', '9007199254740992'], ['--expected-asset', 'ETH'],
    ['--expected-recipient', 'bad'], ['--expected-amount', '-1'],
  ])('refuses malformed expectation %s', async (option, value) => {
    const { io } = invoices();
    await expect(invoke(invoiceCommands, 'invoice verify', ['--in', 'invoice', option, value], io)).rejects.toMatchObject({ code: 'BAD_EXPECTATION' });
  });

  it.each([
    ['--expected-chain', '1'], ['--expected-asset', 'native'], ['--expected-recipient', `st:eth:0x${G2}${G}`], ['--expected-amount', '1001'],
  ])('refuses a valid but inconsistent expectation %s', async (option, value) => {
    const { io } = invoices();
    await expect(invoke(invoiceCommands, 'invoice inspect', ['--in', 'invoice', option, value], io)).rejects.toMatchObject({ code: 'INVOICE_EXPECTATION_MISMATCH' });
  });

  it('does not pretend a fiat quote independently fixes a token amount', async () => {
    const { io } = invoices({ amountPolicy: { mode: 'fiat_quote' } });
    await expect(invoke(invoiceCommands, 'invoice verify', ['--in', 'invoice', '--expected-amount', '1000'], io)).rejects.toMatchObject({ code: 'AMOUNT_NOT_FIXED' });
  });

  it('keeps unsigned and invalid-signature results separate and identifies unknown/disabled networks', async () => {
    const { io, invoice, signed } = invoices({ chainId: 999999999 });
    io.files.set('bare', JSON.stringify(invoice));
    await expect(invoke(invoiceCommands, 'invoice verify', ['--in', 'bare'], io)).rejects.toMatchObject({ code: 'NOT_SIGNED' });
    io.files.set('changed', JSON.stringify({ ...signed, signature: '0'.repeat(128) }));
    expect(await invoke(invoiceCommands, 'invoice inspect', ['--in', 'changed'], io, false)).toBe(1);
    expect(io.out.join('')).toContain('INVALID signature');
    io.out.length = 0;
    expect(await invoke(invoiceCommands, 'invoice inspect', ['--in', 'bare'], io)).toBe(0);
    expect(result(io)).toMatchObject({ supportedForPayment: false, chainKnown: false, assetAllowlisted: false, productionReady: false });
  });

  it('does not consume an unrelated password as approval for a plain invoice', async () => {
    const { io } = invoices();
    io.files.set('pass', 'long private passphrase');
    await expect(invoke(invoiceCommands, 'invoice inspect', ['--in', 'invoice', '--passphrase-file', 'pass'], io)).rejects.toMatchObject({ code: 'PASSPHRASE_UNEXPECTED' });
    expect(io.out.join('') + io.err.join('')).not.toContain('long private passphrase');
  });
});

describe('receipt signature, consistency and secret boundaries', () => {
  it.each([
    '{', '{"version":1,"version":1}', '{}', ' '.repeat(65537),
  ])('rejects malformed, ambiguous or oversized receipt input', async (text) => {
    const io = makeIo({ input: text });
    await expect(invoke(receiptCommands, 'receipt inspect', ['--in', 'input'], io)).rejects.toMatchObject({ code: 'INVALID_RECEIPT' });
    expect(io.out).toEqual([]);
  });

  it.each([
    ['--pin', 'bad', 'BAD_PIN'], ['--expected-recipient', 'bad', 'BAD_EXPECTATION'],
    ['--expected-tx', 'bad', 'BAD_EXPECTATION'], ['--expected-asset', 'ETH', 'BAD_EXPECTATION'],
    ['--expected-chain', '0', 'BAD_EXPECTATION'], ['--expected-chain', '9007199254740992', 'BAD_EXPECTATION'],
    ['--expected-amount', '-1', 'BAD_EXPECTATION'], ['--expected-amount', (1n << 256n).toString(), 'BAD_EXPECTATION'],
    ['--expected-recipient', `0x${'d'.repeat(40)}`, 'RECEIPT_EXPECTATION_MISMATCH'],
    ['--expected-tx', `0x${'d'.repeat(64)}`, 'RECEIPT_EXPECTATION_MISMATCH'],
    ['--expected-asset', `0x${'d'.repeat(40)}`, 'RECEIPT_EXPECTATION_MISMATCH'],
    ['--expected-chain', '1', 'RECEIPT_EXPECTATION_MISMATCH'], ['--expected-amount', '1001', 'RECEIPT_EXPECTATION_MISMATCH'],
  ])('refuses incorrect explicit %s expectation', async (option, value, code) => {
    const { io } = receipts();
    await expect(invoke(receiptCommands, 'receipt verify', ['--in', 'receipt', option, value], io)).rejects.toMatchObject({ code });
    expect(io.out).toEqual([]);
  });

  it('requires independent token amount for fiat binding and records the limited meaning of matching facts', async () => {
    const { io, payload } = receipts({ amountPolicy: { mode: 'fiat_quote' } });
    await expect(invoke(receiptCommands, 'receipt verify', ['--in', 'receipt', '--invoice', 'invoice'], io)).rejects.toMatchObject({ code: 'EXPECTED_AMOUNT_REQUIRED' });
    expect(await invoke(receiptCommands, 'receipt verify', ['--in', 'receipt', '--invoice', 'invoice', '--expected-amount', '1000', '--expected-chain', '84532', '--expected-asset', 'native', '--expected-recipient', payload.stealthAddress, '--expected-tx', payload.txHash], io, false)).toBe(0);
    expect(io.out.join('')).toContain('on-chain payment: not independently verified');
  });

  it.each([
    ['chainId', 1, 'RECEIPT_CHAIN_MISMATCH'], ['asset', `0x${'d'.repeat(40)}`, 'RECEIPT_ASSET_MISMATCH'],
    ['invoiceDigest', `0x${'d'.repeat(64)}`, 'RECEIPT_OTHER_INVOICE'],
  ])('rejects signed receipts for inconsistent invoice %s', async (field, value, code) => {
    const { io, payload } = receipts();
    io.files.set('receipt', JSON.stringify(signReceipt({ ...payload, [field]: value }, KEY_BYTES)));
    await expect(invoke(receiptCommands, 'receipt verify', ['--in', 'receipt', '--invoice', 'invoice'], io)).rejects.toMatchObject({ code });
  });

  it('requires an actual invoice signature, does not accept irrelevant passphrases, and keeps export outputs unchanged on failure', async () => {
    const { io, signed } = receipts();
    io.files.set('invoice', JSON.stringify({ ...signed, signature: '0'.repeat(128) }));
    await expect(invoke(receiptCommands, 'receipt verify', ['--in', 'receipt', '--invoice', 'invoice'], io)).rejects.toMatchObject({ code: 'INVALID_INVOICE_SIGNATURE' });
    await expect(invoke(receiptCommands, 'receipt verify', ['--in', 'receipt', '--passphrase-file', 'unused'], io)).rejects.toMatchObject({ code: 'PASSPHRASE_UNEXPECTED' });
    io.failWrites = true;
    await expect(invoke(receiptCommands, 'receipt export', ['--in', 'receipt', '--out', 'new'], io)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect(io.files.has('new')).toBe(false);
  });
});

describe('public seller import lifecycle', () => {
  it('supports unpaired previews, equivalent key comparisons and canonical public copies without applying trust', async () => {
    const io = makeIo({ incoming: sellerText(), current: exportSellerPairing(sellerSource, [], SUPPORTED_SELLER_CHAINS), source: JSON.stringify({ ...sellerSource, chainIds: [] }) });
    expect(await invoke(sellerCommands, 'seller import-public', ['--in', 'incoming'], io, false)).toBe(0);
    expect(io.out.join('')).toContain('not establish identity');
    io.out.length = 0;
    expect(await invoke(sellerCommands, 'seller import-public', ['--in', 'incoming', '--current', 'current', '--out', 'copy'], io)).toBe(0);
    expect(result(io)).toMatchObject({ comparison: 'same', repeated: false, applied: false });
    expect(io.files.get('copy')!.trim()).toBe(sellerText());
    io.out.length = 0;
    expect(await invoke(sellerCommands, 'seller export-public', ['--in', 'source'], io, false)).toBe(0);
    expect(JSON.parse(io.out.join(''))).toMatchObject({ format: 'ghostpay-seller-public', chainIds: [] });
  });

  it.each(['null', '[]', '{"metaAddress":1}', '{', ' '.repeat(2049), sellerText().replace('"v":1', '"v":1,"v":1')])('refuses malformed import and cannot save an invalid preview', async (text) => {
    const io = makeIo({ input: text });
    await expect(invoke(sellerCommands, 'seller import-public', ['--in', 'input', '--out', 'copy'], io)).rejects.toMatchObject({ code: 'INVALID_PUBLIC_SELLER' });
    expect(io.files.has('copy')).toBe(false);
  });
});

describe('QR parsing and format boundaries', () => {
  it('round-trips validated receipt, seller and signed invoice payloads without asserting payment', async () => {
    const { io } = receipts();
    io.files.set('seller', sellerText());
    for (const kind of ['receipt', 'seller', 'invoice']) {
      io.out.length = 0;
      expect(await invoke(qrCommands, 'qr encode', ['--kind', kind, '--in', kind, '--format', 'text', '--out', `${kind}.text`], io)).toBe(0);
      expect(await invoke(qrCommands, 'qr decode', ['--kind', kind, '--in', `${kind}.text`, '--out', `${kind}.back`], io)).toBe(0);
      expect(io.files.get(`${kind}.back`)).toBe(io.files.get(`${kind}.text`));
    }
    io.out.length = 0;
    expect(await invoke(receiptCommands, 'receipt inspect', ['--in', 'receipt.back'], io, false)).toBe(0);
    expect(io.out.join('')).toContain('original digital receipt');
  });

  it('retains an encrypted invoice envelope through decode and never inserts a passphrase into output', async () => {
    const { io, signed } = invoices();
    const passphrase = 'a private QR passphrase';
    const fragment = await encodeFragment(signed, { passphrase, scryptN: 32768 });
    io.files.set('link', fragment); io.files.set('pass', passphrase);
    expect(await invoke(qrCommands, 'qr encode', ['--kind', 'invoice', '--in', 'link', '--format', 'text', '--passphrase-file', 'pass'], io)).toBe(0);
    expect(result(io)).toMatchObject({ result: fragment, paymentVerified: false });
    expect(io.out.join('') + io.err.join('')).not.toContain(passphrase);
  });

  it.each([
    ['--kind', 'secret', 'BAD_QR_KIND'], ['--format', 'png', 'BAD_QR_FORMAT'],
    ['--chunk-chars', '32', 'BAD_QR_FORMAT'], ['--passphrase-file', 'unused', 'PASSPHRASE_UNEXPECTED'],
  ])('rejects unsupported QR option %s', async (option, value, code) => {
    const io = makeIo({ meta: SPEC.metaAddress });
    const args = option === '--kind' ? ['--kind', value] : ['--kind', 'meta', option, value];
    await expect(invoke(qrCommands, 'qr encode', [...args, '--in', 'meta'], io)).rejects.toMatchObject({ code });
  });

  it.each(['abc', '0', '31', '701'])('bounds multipart chunk size %s', async (size) => {
    const io = makeIo({ meta: SPEC.metaAddress });
    await expect(invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--format', 'multipart', '--chunk-chars', size], io)).rejects.toMatchObject({ code: 'BAD_QR_CHUNK_SIZE' });
  });

  it('round-trips a strict transfer document and refuses altered transfer metadata', async () => {
    const io = makeIo({ meta: SPEC.metaAddress });
    await invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--format', 'multipart', '--out', 'transfer'], io);
    const transfer = JSON.parse(io.files.get('transfer')!) as Record<string, unknown>;
    io.out.length = 0;
    expect(await invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'transfer'], io)).toBe(0);
    expect(result(io)).toMatchObject({ payload: SPEC.metaAddress });
    for (const over of [{ v: 2 }, { kind: 'receipt' }, { chunks: null }, { extra: true }]) {
      io.files.set('bad', JSON.stringify({ ...transfer, ...over }));
      await expect(invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'bad'], io)).rejects.toMatchObject({ code: 'INVALID_QR_TRANSFER' });
    }
  });

  it.each([{ chunks: [] }, { chunks: [123] }, { chunks: new Array<number>(129).fill(0) }, { chunks: ['not a frame'] }])('refuses unbounded or malformed scan arrays', async ({ chunks }) => {
    const io = makeIo({ input: JSON.stringify({ format: 'ghostpay-qr-transfer', v: 1, kind: 'meta', chunks }) });
    await expect(invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'input'], io)).rejects.toMatchObject({ code: 'INVALID_QR_TRANSFER' });
  });

  it('rejects conflicting duplicate scans even after completing a transfer, and refuses mixed sessions', async () => {
    const chunks = encodeMultipart(new TextEncoder().encode(SPEC.metaAddress));
    const fields = chunks[0]!.split('/');
    fields[5] = `${fields[5]!.slice(0, -1)}${fields[5]!.endsWith('A') ? 'B' : 'A'}`;
    fields[4] = crc32Ascii(`${fields[1]}/${fields[2]}/${fields[3]}/${fields[5]}`).toString(16).padStart(8, '0');
    const io = makeIo({ conflict: [...chunks, fields.join('/')].join('\n'), mixed: [...chunks, ...encodeMultipart(new TextEncoder().encode(`st:eth:0x${G2}${G}`))].join('\n') });
    for (const file of ['conflict', 'mixed']) await expect(invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', file], io)).rejects.toMatchObject({ code: 'INVALID_QR_TRANSFER' });
  });

  it('refuses invalid UTF-8, unsafe SVG, malformed JSON and large payloads without output', async () => {
    const io = makeIo({ utf8: encodeMultipart(new Uint8Array([255])).join('\n'), svg: '<svg><script>alert(1)</script></svg>', json: '{', large: 'x'.repeat(32769), unicode: 'é'.repeat(20000) });
    for (const [file, code] of [['utf8', 'INVALID_QR_TRANSFER'], ['svg', 'UNSUPPORTED_QR_IMAGE'], ['json', 'INVALID_QR_PAYLOAD'], ['large', 'INVALID_QR_PAYLOAD'], ['unicode', 'INVALID_QR_PAYLOAD']])
      await expect(invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', file!], io)).rejects.toMatchObject({ code });
    expect(io.out).toEqual([]);
  });

  it('bounds SVG geometry and refuses duplicated or damaged QR modules', async () => {
    const io = makeIo({ meta: SPEC.metaAddress });
    await invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--out', 'valid'], io);
    const svg = io.files.get('valid')!;
    const first = svg.match(/M\d+ \d+h1v1h-1z/)![0];
    const cases = [
      [svg.replace(/viewBox="0 0 \d+ \d+"/, 'viewBox="0 0 28 28"'), 'INVALID_QR_IMAGE'],
      [svg.replace(/viewBox="0 0 \d+ \d+"/, 'viewBox="0 0 30 30"'), 'INVALID_QR_IMAGE'],
      [svg.replace(/viewBox="0 0 \d+ \d+"/, 'viewBox="0 0 99 98"'), 'INVALID_QR_IMAGE'],
      [svg.replace(first, 'M0 0h1v1h-1z'), 'INVALID_QR_IMAGE'],
      [svg.replace(first, first + first), 'INVALID_QR_IMAGE'],
      [svg.replace(/d="[^"]*"/, 'd="M4 4h1v1h-1z"'), 'QR_DECODE_FAILED'],
    ];
    for (const [text, code] of cases) {
      io.files.set('bad', text!);
      await expect(invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'bad'], io)).rejects.toMatchObject({ code });
    }
  });
});
