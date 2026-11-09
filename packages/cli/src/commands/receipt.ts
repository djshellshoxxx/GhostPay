import { bindReceiptToInvoice, invoiceDigest, parseVerifiedReceipt, receiptJson, SignedReceiptError, type SignedReceipt } from '@ghostpay/invoice-schema';
import { grossForNet, routerSplit } from '@ghostpay/chain-adapters';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { failError, usageError } from '../io.js';
import { toHex } from '../hex.js';
import { PASSPHRASE_OPTS, readInvoiceInput } from './invoice.js';
import type { Command } from './types.js';

const MEANING = 'A valid seller signature proves control of the signing key and integrity of signed fields. It does not independently prove payment or real-world seller identity.';
const RETENTION = 'Preserve the original digital receipt file whenever possible. A QR code is a representation of that serialized data.';

export async function readReceipt(ctx: Ctx, path: string): Promise<SignedReceipt> {
  const text = await ctx.read(path);
  try { return parseVerifiedReceipt(text); }
  catch { throw failError('INVALID_RECEIPT', 'receipt is malformed, oversized, unsupported or has an invalid signature.'); }
}

async function inspect(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const receipt = await readReceipt(ctx, requireValue(a, 'in'));
  ctx.out({ ok: true, receipt, signatureValid: true, paymentVerified: false, originalFileRecommended: true, meaning: MEANING, retention: RETENTION },
    `${receiptJson(receipt)}\n${MEANING}\n${RETENTION}`);
  return 0;
}

async function verify(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const receipt = await readReceipt(ctx, requireValue(a, 'in'));
  const pin = a.values.get('pin');
  if (pin !== undefined && !/^(?:02|03)[0-9a-f]{64}$/.test(pin)) throw usageError('BAD_PIN', 'pin must be a canonical compressed public key.');
  if (pin !== undefined && pin !== receipt.signerPublicKey) throw failError('RECEIPT_SIGNER_MISMATCH', 'receipt signer differs from the explicitly supplied key.');
  const recipient = a.values.get('expected-recipient');
  const txHash = a.values.get('expected-tx');
  const asset = a.values.get('expected-asset');
  const chain = a.values.get('expected-chain');
  const expectedAmount = a.values.get('expected-amount');
  if ((recipient !== undefined && !/^0x[0-9a-f]{40}$/.test(recipient)) ||
      (txHash !== undefined && !/^0x[0-9a-f]{64}$/.test(txHash)) ||
      (asset !== undefined && asset !== 'native' && !/^0x[0-9a-f]{40}$/.test(asset)) ||
      (chain !== undefined && (!/^[1-9][0-9]{0,15}$/.test(chain) || !Number.isSafeInteger(Number(chain)))) ||
      (expectedAmount !== undefined && (!/^[1-9][0-9]{0,77}$/.test(expectedAmount) || BigInt(expectedAmount) >= 1n << 256n)))
    throw usageError('BAD_EXPECTATION', 'expected receipt facts must use canonical chain, asset, address, hash and base-unit amount formats.');
  if ((recipient !== undefined && recipient !== receipt.stealthAddress) || (txHash !== undefined && txHash !== receipt.txHash) ||
      (asset !== undefined && asset !== receipt.asset) || (chain !== undefined && Number(chain) !== receipt.chainId) ||
      (expectedAmount !== undefined && expectedAmount !== receipt.amountMinorUnits))
    throw failError('RECEIPT_EXPECTATION_MISMATCH', 'receipt does not match the supplied expected payment facts.');
  const invoicePath = a.values.get('invoice');
  let invoiceBound = false;
  let signerMatch: string | undefined;
  if (invoicePath !== undefined) {
    const input = await readInvoiceInput(ctx, a, invoicePath);
    if (!input.signatureValid) throw failError('INVALID_INVOICE_SIGNATURE', 'invoice binding requires a valid signed invoice.');
    const invoice = input.invoice;
    let amount = expectedAmount;
    if (invoice.amountPolicy.mode === 'fixed_token') {
      const wanted = BigInt(invoice.amountPolicy.tokenAmount);
      amount = routerSplit(invoice.feePolicy === 'payer_pays' ? grossForNet(wanted) : wanted).net.toString();
    }
    if (amount === undefined) throw usageError('EXPECTED_AMOUNT_REQUIRED', 'a fiat-quote invoice needs independently supplied seller-net token base units via --expected-amount.');
    try {
      const bound = bindReceiptToInvoice(receipt, {
        invoiceDigest: `0x${toHex(invoiceDigest(invoice))}`, chainId: invoice.chainId,
        asset: invoice.token, amountMinorUnits: amount, invoiceSignerPublicKey: invoice.signer,
        invoiceSignatureValid: input.signatureValid,
        ...(pin === undefined ? {} : { trustedSignerPublicKey: pin }),
        ...(recipient === undefined ? {} : { stealthAddress: recipient }),
        ...(txHash === undefined ? {} : { txHash }),
      });
      signerMatch = bound.signerMatch;
      invoiceBound = true;
    } catch (error) {
      if (error instanceof SignedReceiptError)
        throw failError(error.code.startsWith('RECEIPT_') ? error.code : `RECEIPT_${error.code}`, 'receipt does not match the signed invoice and expected payment facts.');
      throw error;
    }
  } else if (Object.keys(PASSPHRASE_OPTS).some((key) => a.values.has(key) || a.flags.has(key))) {
    throw usageError('PASSPHRASE_UNEXPECTED', 'receipt passphrase options apply only to the invoice supplied with --invoice.');
  }
  ctx.out({ ok: true, signatureValid: true, invoiceBound, signerPinned: pin !== undefined,
    ...(signerMatch === undefined ? {} : { signerMatch }), recipientMatched: recipient !== undefined,
    recipientOwnershipVerified: false, transactionMatched: txHash !== undefined,
    paymentVerified: false, originalFileRecommended: true, receipt, meaning: MEANING, retention: RETENTION },
    `Receipt signature: valid\nInvoice binding: ${invoiceBound ? 'signed fields match' : 'not checked'}\nRecipient ownership and on-chain payment: not independently verified\n${MEANING}\n${RETENTION}`);
  return 0;
}

async function exportReceipt(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const receipt = await readReceipt(ctx, requireValue(a, 'in'));
  const text = receiptJson(receipt);
  const wrote = await ctx.writeOut(a, `${text}\n`);
  ctx.note(RETENTION);
  ctx.out({ ok: true, paymentVerified: false, originalFileRecommended: true, ...(wrote ? { out: a.values.get('out') } : { receipt }), retention: RETENTION }, wrote ? 'Exported original signed receipt.' : text);
  return 0;
}

export const receiptCommands: readonly Command[] = [
  { path: ['receipt', 'inspect'], summary: 'inspect a validated signed seller receipt',
    usage: 'ghostpay receipt inspect --in RECEIPT.json|-\n  Example: ghostpay receipt inspect --in receipt.json --json\n  Valid signatures attest to key control; they do not independently establish payment.',
    opts: { in: 'value' }, handler: inspect },
  { path: ['receipt', 'verify'], summary: 'verify a seller receipt signature without asserting payment',
    usage: 'ghostpay receipt verify --in RECEIPT.json|- [--invoice SIGNED_INVOICE.json|LINK_FILE] [--pin PUBLIC_KEY] [--expected-chain ID] [--expected-asset ASSET] [--expected-amount SELLER_NET_BASE_UNITS] [--expected-recipient ADDRESS] [--expected-tx HASH] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--allow-insecure-localhost]\n  Example: ghostpay receipt verify --in receipt.json --invoice invoice.json --json\n  Fixed-token invoice binding uses the existing router fee math. Fiat quotes require an independently supplied seller-net amount. Signature and field consistency do not prove recipient ownership or on-chain payment.',
    opts: { in: 'value', invoice: 'value', pin: 'value', 'expected-chain': 'value', 'expected-asset': 'value', 'expected-amount': 'value', 'expected-recipient': 'value', 'expected-tx': 'value', 'allow-insecure-localhost': 'flag', ...PASSPHRASE_OPTS }, handler: verify },
  { path: ['receipt', 'export'], summary: 'export deterministic signed receipt JSON',
    usage: 'ghostpay receipt export --in RECEIPT.json|- [--out FILE] [--force]\n  Example: ghostpay receipt export --in receipt.json --out saved-receipt.json\n  Preserve the original digital receipt file rather than relying only on QR representations.',
    opts: { in: 'value', ...OUT_OPTS }, handler: exportReceipt },
];
