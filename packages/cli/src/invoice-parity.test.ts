import { describe, expect, it } from 'vitest';
import { createInvoice, encodeFragment, parseFragment, signInvoice } from '@ghostpay/invoice-schema';
import { invoiceCommands } from './commands/invoice.js';
import { invoke, result } from './exchange.testutil.js';
import { G, KEY_BYTES, SIGNER, SPEC, makeIo } from './fixtures.testutil.js';

describe('invoice inspection and strict document boundary', () => {
  it('inspects an unsigned invoice without asserting signature, seller trust or payment', async () => {
    const io = makeIo();
    const invoice = createInvoice({ ...SPEC, signer: SIGNER }, io.random);
    io.files.set('invoice.json', JSON.stringify(invoice));
    expect(await invoke(invoiceCommands, 'invoice inspect', ['--in', 'invoice.json'], io)).toBe(0);
    expect(result(io)).toMatchObject({ ok: true, signed: false, signatureValid: false, paymentVerified: false, invoice: { chainId: 8453, nonce: invoice.nonce } });
  });

  it('reports expiry without hiding a readable signed invoice', async () => {
    const io = makeIo();
    const signed = signInvoice(createInvoice({ ...SPEC, signer: SIGNER }, io.random), KEY_BYTES);
    io.files.set('invoice.json', JSON.stringify(signed));
    io.now = signed.invoice.expiresAt;
    expect(await invoke(invoiceCommands, 'invoice inspect', ['--in', 'invoice.json'], io)).toBe(0);
    expect(result(io)).toMatchObject({ ok: true, signed: true, signatureValid: true, expired: true, paymentVerified: false });
  });

  it('rejects ambiguous signed wrappers instead of ignoring unknown properties', async () => {
    const io = makeIo();
    const signed = signInvoice(createInvoice({ ...SPEC, signer: SIGNER }, io.random), KEY_BYTES);
    io.files.set('invoice.json', JSON.stringify({ ...signed, paymentVerified: true }));
    await expect(invoke(invoiceCommands, 'invoice verify', ['--in', 'invoice.json'], io)).rejects.toMatchObject({ code: 'BAD_INVOICE_ENVELOPE' });
    expect(io.out).toEqual([]);
  });

  it('refuses non-string signatures instead of downgrading them to unsigned', async () => {
    const io = makeIo();
    const invoice = createInvoice({ ...SPEC, signer: SIGNER }, io.random);
    io.files.set('invoice.json', JSON.stringify({ invoice, signature: 123 }));
    await expect(invoke(invoiceCommands, 'invoice sign', ['--in', 'invoice.json', '--key-file', 'key'], io)).rejects.toMatchObject({ code: 'BAD_INVOICE_ENVELOPE' });
  });
});

describe('protected invoice envelopes and caller expectations', () => {
  it('fails verification when an explicitly requested seller pin does not match', async () => {
    const io = makeIo();
    io.files.set('signed', JSON.stringify(signInvoice(createInvoice({ ...SPEC, signer: SIGNER }, io.random), KEY_BYTES)));
    expect(await invoke(invoiceCommands, 'invoice verify', ['--in', 'signed', '--pin', G], io)).toBe(1);
    expect(result(io)).toMatchObject({ ok: false, signatureValid: true, signerPinned: false });
  });
  it('creates a passphrase-protected link from a private input and verifies it without exposing the passphrase', async () => {
    const io = makeIo({ pass: 'a long test passphrase\n' });
    const signed = signInvoice(createInvoice({ ...SPEC, signer: SIGNER }, io.random), KEY_BYTES);
    io.files.set('signed', JSON.stringify(signed));
    expect(await invoke(invoiceCommands, 'invoice link', ['--in', 'signed', '--base', 'https://pay.test/', '--passphrase-file', 'pass', '--out', 'link'], io)).toBe(0);
    const link = io.files.get('link')!.trim();
    expect((await parseFragment(new URL(link).hash, { passphrase: 'a long test passphrase' })).passphraseProtected).toBe(true);
    io.out.length = 0;
    expect(await invoke(invoiceCommands, 'invoice verify', ['--in', 'link', '--passphrase-file', 'pass'], io)).toBe(0);
    expect(result(io)).toMatchObject({ ok: true, passphraseProtected: true, paymentVerified: false });
    expect(io.out.join('') + io.err.join('')).not.toContain('a long test passphrase');
  });

  it('compares the chain, asset, recipient and fixed amount to caller expectations', async () => {
    const io = makeIo();
    const signed = signInvoice(createInvoice({ ...SPEC, signer: SIGNER, amountPolicy: { mode: 'fixed_token', tokenAmount: '1000' } }, io.random), KEY_BYTES);
    io.files.set('signed', JSON.stringify(signed));
    expect(await invoke(invoiceCommands, 'invoice verify', ['--in', 'signed', '--expected-chain', '8453', '--expected-asset', SPEC.token, '--expected-recipient', SPEC.metaAddress, '--expected-amount', '1000'], io)).toBe(0);
    await expect(invoke(invoiceCommands, 'invoice verify', ['--in', 'signed', '--expected-chain', '1'], io)).rejects.toMatchObject({ code: 'INVOICE_EXPECTATION_MISMATCH' });
  });

  it('identifies supported versus disabled chains without treating an inspect result as a payable approval', async () => {
    const io = makeIo();
    const signed = signInvoice(createInvoice({ ...SPEC, signer: SIGNER, chainId: 84532, token: 'native', amountPolicy: { mode: 'fixed_token', tokenAmount: '1000' } }, io.random), KEY_BYTES);
    io.files.set('link', await encodeFragment(signed));
    expect(await invoke(invoiceCommands, 'invoice inspect', ['--in', 'link'], io)).toBe(0);
    expect(result(io)).toMatchObject({ supportedForPayment: true, paymentVerified: false });
  });
});
