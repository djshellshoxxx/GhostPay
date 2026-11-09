import { describe, expect, it } from 'vitest';
import { createInvoice, invoiceDigest, signInvoice, signReceipt } from '@ghostpay/invoice-schema';
import { receiptCommands } from './commands/receipt.js';
import { invoke, result } from './exchange.testutil.js';
import { KEY_BYTES, SIGNER, SPEC, makeIo, toHex } from './fixtures.testutil.js';

// Fixed protocol vector: secp256k1 key 7, low-S signature of the specified canonical receipt bytes.
const VECTOR = {
  version: 1, invoiceDigest: `0x${'a'.repeat(64)}`, chainId: 84532, txHash: `0x${'b'.repeat(64)}`,
  stealthAddress: `0x${'c'.repeat(40)}`, asset: 'native', amountMinorUnits: '1000', issuedAt: 1_800_000_000,
  signerPublicKey: '025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc',
  signature: '33c27dbe8230bd04cd9f7e8600beda1988d90cc5d0835311eaeb7a5861f5e9285ad3990d797a9942c58be0505a94cd43ea650f4629569cb098fc61c038085a3b',
} as const;

describe('signed GUI receipt CLI parity', () => {
  it('verifies the published receipt protocol vector without upgrading it to payment proof', async () => {
    const io = makeIo({ receipt: JSON.stringify(VECTOR) });
    expect(await invoke(receiptCommands, 'receipt verify', ['--in', 'receipt'], io)).toBe(0);
    expect(result(io)).toMatchObject({ ok: true, signatureValid: true, invoiceBound: false, signerPinned: false, paymentVerified: false });
  });

  it('inspects public receipt facts and explains the durable original-file requirement', async () => {
    const io = makeIo({ receipt: JSON.stringify(VECTOR) });
    expect(await invoke(receiptCommands, 'receipt inspect', ['--in', 'receipt'], io)).toBe(0);
    expect(result(io)).toMatchObject({ receipt: VECTOR, paymentVerified: false, originalFileRecommended: true });
  });

  it('exports validated deterministic signed JSON with private exclusive output semantics', async () => {
    const io = makeIo({ receipt: JSON.stringify(VECTOR) });
    expect(await invoke(receiptCommands, 'receipt export', ['--in', 'receipt', '--out', 'saved.json'], io)).toBe(0);
    expect(JSON.parse(io.files.get('saved.json') ?? '')).toEqual(VECTOR);
    await expect(invoke(receiptCommands, 'receipt export', ['--in', 'receipt', '--out', 'saved.json'], io)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
  });
});

describe('receipt invoice binding', () => {
  function bound(feePolicy: 'payer_pays' | 'seller_pays' = 'seller_pays') {
    const io = makeIo();
    const invoice = createInvoice({ ...SPEC, chainId: 84532, token: 'native', amountPolicy: { mode: 'fixed_token', tokenAmount: '1000' }, feePolicy, signer: SIGNER }, io.random);
    const receipt = signReceipt({ invoiceDigest: `0x${toHex(invoiceDigest(invoice))}`, chainId: 84532, txHash: VECTOR.txHash, stealthAddress: VECTOR.stealthAddress, asset: 'native', amountMinorUnits: feePolicy === 'seller_pays' ? '998' : '1000', issuedAt: io.now }, KEY_BYTES);
    io.files.set('receipt', JSON.stringify(receipt));
    io.files.set('invoice', JSON.stringify(signInvoice(invoice, KEY_BYTES)));
    return { io, invoice, receipt };
  }

  it.each(['payer_pays', 'seller_pays'] as const)('binds %s exact seller-net amount and explicitly supplied transaction facts', async (feePolicy) => {
    const { io } = bound(feePolicy);
    expect(await invoke(receiptCommands, 'receipt verify', ['--in', 'receipt', '--invoice', 'invoice', '--pin', SIGNER, '--expected-recipient', VECTOR.stealthAddress, '--expected-tx', VECTOR.txHash], io)).toBe(0);
    expect(result(io)).toMatchObject({ invoiceBound: true, signerPinned: true, paymentVerified: false, recipientMatched: true, recipientOwnershipVerified: false });
  });

  it('rejects a correctly signed but wrong amount instead of trusting the seller attestation', async () => {
    const { io, receipt } = bound();
    const payload = { invoiceDigest: receipt.invoiceDigest, chainId: receipt.chainId, txHash: receipt.txHash, stealthAddress: receipt.stealthAddress, asset: receipt.asset, amountMinorUnits: receipt.amountMinorUnits, issuedAt: receipt.issuedAt };
    io.files.set('receipt', JSON.stringify(signReceipt({ ...payload, amountMinorUnits: '999' }, KEY_BYTES)));
    await expect(invoke(receiptCommands, 'receipt verify', ['--in', 'receipt', '--invoice', 'invoice'], io)).rejects.toMatchObject({ code: 'RECEIPT_AMOUNT_MISMATCH' });
  });

  it('refuses a mismatched pinned signer', async () => {
    const { io } = bound();
    await expect(invoke(receiptCommands, 'receipt verify', ['--in', 'receipt', '--pin', SPEC.metaAddress.slice(9, 75)], io)).rejects.toMatchObject({ code: 'RECEIPT_SIGNER_MISMATCH' });
  });

  it('exports stdout as standalone signed JSON and sends retention guidance to stderr', async () => {
    const io = makeIo({ receipt: JSON.stringify(VECTOR) });
    expect(await invoke(receiptCommands, 'receipt export', ['--in', 'receipt'], io, false)).toBe(0);
    expect(JSON.parse(io.out.join(''))).toEqual(VECTOR);
    expect(io.err.join('')).toContain('original digital receipt');
  });
});
