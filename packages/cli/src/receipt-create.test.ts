import { describe, expect, it } from 'vitest';
import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { encodeFragment, invoiceDigest, parseVerifiedReceipt, signInvoice, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { buildErc20Metadata } from '@ghostpay/core-crypto';
import { ghostPayRouterAbi } from '@ghostpay/chain-adapters';
import { receiptCommands } from './commands/receipt.js';
import { invoke, result } from './exchange.testutil.js';
import { allOutput, G, G2, KEY_BYTES, KEY_HEX, SIGNER } from './fixtures.testutil.js';
import { BLOCK, PAYER, PIN, TX, pad, paymentWorld, word } from './payment-fixtures.testutil.js';
import { reconciliationWorld, RECON_CREDS, RECON_PASS, VIEW_HEX } from './reconciliation-fixtures.testutil.js';

const BASE = ['--invoice', 'invoice.json', '--observation', 'claim.json', ...RECON_CREDS,
  '--manifest', 'manifest.json', '--manifest-digest', PIN, '--online', '--rpc-file', 'rpc.txt', '--approve', '--out', 'created-receipt.json'];
const MANUAL_DIGEST = '0x' + 'ef'.repeat(32);
function without(option: string, value = false): string[] {
  const index = BASE.indexOf(option);
  return [...BASE.slice(0, index), ...BASE.slice(index + (value ? 2 : 1))];
}
const MANUAL = [...without('--invoice', true), '--manual-invoice-digest', MANUAL_DIGEST];

describe('receipt creation from current owned canonical payment evidence', () => {
  it('creates the full-GUI manual-digest attestation without claiming an invoice binding', async () => {
    const w = await reconciliationWorld(); w.io.files.delete('invoice.json');
    expect(await invoke(receiptCommands, 'receipt create', MANUAL, w.io)).toBe(0);
    expect(parseVerifiedReceipt(w.io.files.get('created-receipt.json')!)).toMatchObject({ invoiceDigest: MANUAL_DIGEST,
      chainId: 11155111, txHash: TX, stealthAddress: w.recipient, asset: 'native', amountMinorUnits: '100', signerPublicKey: SIGNER });
    expect(result(w.io)).toMatchObject({ invoiceBound: false, manualInvoiceDigest: true, paymentVerifiedAtCreation: true,
      recipientOwnershipVerified: true, receiptIsPaymentProof: false });
    for (const value of [KEY_HEX, VIEW_HEX, RECON_PASS, 'PRIVATE_API_TOKEN']) expect(allOutput(w.io)).not.toContain(value);
    w.io.out.length = 0;
    expect(await invoke(receiptCommands, 'receipt verify', ['--in', 'created-receipt.json', '--pin', SIGNER], w.io)).toBe(0);
    expect(result(w.io)).toMatchObject({ invoiceBound: false, signatureValid: true, paymentVerified: false });
  });

  it.each(['missing', 'both', 'malformed', 'uppercase', 'invoice-passphrase-file', 'invoice-passphrase-env', 'invoice-passphrase-stdin'])('rejects %s receipt mode inputs before reading files, credentials or RPC', async condition => {
    const w = await reconciliationWorld();
    const args = condition === 'missing' ? without('--invoice', true) : condition === 'both' ? [...BASE, '--manual-invoice-digest', MANUAL_DIGEST]
      : condition === 'malformed' ? [...without('--invoice', true), '--manual-invoice-digest', 'not-a-digest']
      : condition === 'uppercase' ? [...without('--invoice', true), '--manual-invoice-digest', MANUAL_DIGEST.toUpperCase()]
      : [...MANUAL, `--${condition}`, ...(condition.endsWith('-stdin') ? [] : ['must-not-be-read'])];
    Object.assign(w.io, { readFile: () => Promise.reject(new Error('no input may be read')) });
    const code = condition === 'missing' || condition === 'both' ? 'RECEIPT_INVOICE_SOURCE'
      : condition === 'malformed' || condition === 'uppercase' ? 'INVALID_MANUAL_INVOICE_DIGEST' : 'PASSPHRASE_UNEXPECTED';
    await expect(invoke(receiptCommands, 'receipt create', args, w.io)).rejects.toMatchObject({ kind: 'usage', code });
    expect(w.calls).toEqual([]); expect(w.io.files.has('created-receipt.json')).toBe(false);
  });

  it.each(['unapproved', 'offline', 'wrong-owner', 'missing-expected', 'pending', 'reorganized'])('keeps manual-digest creation closed for %s evidence', async condition => {
    const w = await reconciliationWorld();
    let args = MANUAL;
    if (condition === 'unapproved') args = MANUAL.filter(value => value !== '--approve');
    if (condition === 'offline') args = MANUAL.filter(value => value !== '--online');
    if (condition === 'wrong-owner') w.io.files.set('claim.json', paymentWorld().io.files.get('claim.json')!);
    if (condition === 'missing-expected') {
      const { expected: _expected, ...claim } = w.current; void _expected;
      w.io.files.set('claim.json', JSON.stringify(claim));
    }
    if (condition === 'pending') w.state.head = '0x64';
    if (condition === 'reorganized') w.state.blockHash = '0x' + '98'.repeat(32);
    const code = condition === 'unapproved' ? 'APPROVAL_REQUIRED' : condition === 'offline' ? 'ONLINE_REQUIRED'
      : condition === 'wrong-owner' ? 'SELLER_RECIPIENT_MISMATCH' : condition === 'missing-expected' ? 'EXPECTED_PAYMENT_REQUIRED' : 'CURRENT_EVIDENCE_REQUIRED';
    await expect(invoke(receiptCommands, 'receipt create', args, w.io)).rejects.toMatchObject({ code });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
    if (!['pending', 'reorganized'].includes(condition)) expect(w.calls).toEqual([]);
  });

  it('labels the human manual digest as unmatched and preserves immutable publication', async () => {
    const w = await reconciliationWorld();
    expect(await invoke(receiptCommands, 'receipt create', MANUAL, w.io, false)).toBe(0);
    expect(allOutput(w.io)).toContain('manually supplied, unmatched invoice digest');
    const original = w.io.files.get('created-receipt.json');
    await expect(invoke(receiptCommands, 'receipt create', MANUAL, w.io)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect(w.io.files.get('created-receipt.json')).toBe(original);
  });

  it('creates the exact GUI signed format after live verification and ownership binding', async () => {
    const w = await reconciliationWorld();
    expect(await invoke(receiptCommands, 'receipt create', BASE, w.io)).toBe(0);
    const receipt = parseVerifiedReceipt(w.io.files.get('created-receipt.json')!);
    expect(receipt).toMatchObject({ invoiceDigest: `0x${Buffer.from(invoiceDigest(w.signed.invoice)).toString('hex')}`,
      chainId: 11155111, txHash: TX, stealthAddress: w.recipient, asset: 'native', amountMinorUnits: '100', signerPublicKey: SIGNER, issuedAt: w.io.now });
    expect(result(w.io)).toMatchObject({ ok: true, created: true, invoiceBound: true, manualInvoiceDigest: false, currentChainVerified: true,
      paymentVerifiedAtCreation: true, recipientOwnershipVerified: true, receiptIsPaymentProof: false, verificationScope: 'operator-pinned-testnet' });
    for (const privateValue of [KEY_HEX, VIEW_HEX, RECON_PASS, 'PRIVATE_API_TOKEN']) expect(allOutput(w.io)).not.toContain(privateValue);
    w.io.out.length = 0;
    expect(await invoke(receiptCommands, 'receipt verify', ['--in', 'created-receipt.json', '--invoice', 'invoice.json', '--pin', SIGNER], w.io)).toBe(0);
    expect(result(w.io)).toMatchObject({ invoiceBound: true, paymentVerified: false });
  });

  it.each(['--approve', '--online', '--out'])('requires explicit %s before publishing a signature', async option => {
    const w = await reconciliationWorld();
    await expect(invoke(receiptCommands, 'receipt create', without(option, option === '--out'), w.io)).rejects.toMatchObject({ kind: 'usage' });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
    expect(w.calls).toEqual([]);
  });

  it('supports a passphrase-protected signed invoice with a separate keystore credential', async () => {
    const w = await reconciliationWorld();
    const invoicePassphrase = 'separate protected invoice phrase';
    const signed = signInvoice({ ...w.signed.invoice, feePolicy: 'seller_pays' }, KEY_BYTES);
    w.io.files.set('invoice.json', await encodeFragment(signed, { passphrase: invoicePassphrase, scryptN: 32768 }));
    w.io.files.set('invoice-pass.txt', invoicePassphrase);
    expect(await invoke(receiptCommands, 'receipt create', [...BASE, '--invoice-passphrase-file', 'invoice-pass.txt'], w.io, false)).toBe(0);
    expect(parseVerifiedReceipt(w.io.files.get('created-receipt.json')!).amountMinorUnits).toBe('100');
    expect(allOutput(w.io)).not.toContain(invoicePassphrase);
    expect(allOutput(w.io)).not.toContain(RECON_PASS);
  });

  it('signs an owned ERC20 transfer with a mismatching scan hint and matching secondary provider', async () => {
    const w = await reconciliationWorld();
    const token = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';
    const recipient = w.recipient as `0x${string}`;
    const [ephemeral, previousMetadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], w.current.log.data);
    const wrongHint = Number.parseInt(previousMetadata.slice(2, 4), 16) ^ 0xff;
    const metadata = `0x${Buffer.from(buildErc20Metadata(wrongHint, token, 100n)).toString('hex')}` as const;
    const log = { ...w.current.log, data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [ephemeral, metadata]) };
    w.io.files.set('claim.json', JSON.stringify({ ...w.current, log, expected: { recipient, asset: token, amount: '100' } }));
    w.io.files.set('invoice.json', JSON.stringify(signInvoice({ ...w.signed.invoice, token }, KEY_BYTES)));
    const transfer = { address: token, blockHash: BLOCK, blockNumber: '0x64', transactionHash: TX, logIndex: '0x3', data: word(100n),
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', pad(PAYER), pad(recipient)] };
    w.state.logs = [log];
    w.state.receipt = { ...(w.state.receipt as object), logs: [transfer, log] };
    w.state.tx = { ...(w.state.tx as object), value: '0x0', input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payERC20',
      args: [token, recipient, 100n, 100n, 1_900_000_000n, ephemeral, metadata] }) };
    expect(await invoke(receiptCommands, 'receipt create', [...BASE, '--secondary-rpc-file', 'secondary.txt'], w.io)).toBe(0);
    expect(parseVerifiedReceipt(w.io.files.get('created-receipt.json')!)).toMatchObject({ asset: token, amountMinorUnits: '100', stealthAddress: recipient });
    expect(w.calls.some(call => call.url.includes('secondary'))).toBe(true);
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid creation clock %s before live verification', async now => {
    const w = await reconciliationWorld(); w.io.now = now;
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'CLOCK_INVALID' });
    expect(w.calls).toEqual([]);
    expect(w.io.files.has('created-receipt.json')).toBe(false);
  });

  it.each([
    ['unsigned', 'INVALID_INVOICE_SIGNATURE'], ['invalid-signature', 'INVALID_INVOICE_SIGNATURE'],
    ['expired', 'INVOICE_EXPIRED'], ['fiat', 'FIXED_INVOICE_REQUIRED'], ['other-signer', 'INVOICE_SCOPE_MISMATCH'],
    ['other-recipient', 'INVOICE_SCOPE_MISMATCH'], ['other-chain', 'INVOICE_CHAIN_MISMATCH'],
    ['other-asset', 'INVOICE_PAYMENT_MISMATCH'], ['other-amount', 'INVOICE_PAYMENT_MISMATCH'],
  ])('refuses %s invoices before signing or network access', async (condition, code) => {
    const w = await reconciliationWorld();
    let invoice = w.signed.invoice;
    let key = KEY_BYTES;
    if (condition === 'expired') w.io.now = invoice.expiresAt;
    if (condition === 'fiat') invoice = { ...invoice, amountPolicy: { mode: 'fiat_quote' } };
    if (condition === 'other-signer') { key = KEY_BYTES.slice(); key[31] = 8; invoice = { ...invoice, signer: signerPublicKeyHex(key) }; }
    if (condition === 'other-recipient') invoice = { ...invoice, metaAddress: `st:eth:0x${G2}${G}` };
    if (condition === 'other-chain') invoice = { ...invoice, chainId: 84532 };
    if (condition === 'other-asset') invoice = { ...invoice, token: '0x' + 'a'.repeat(40) };
    if (condition === 'other-amount') invoice = { ...invoice, amountPolicy: { mode: 'fixed_token', tokenAmount: '101' } };
    const input = condition === 'unsigned' ? invoice : condition === 'invalid-signature' ? { invoice, signature: '0'.repeat(128) } : signInvoice(invoice, key);
    w.io.files.set('invoice.json', JSON.stringify(input));
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
    expect(w.calls).toEqual([]);
  });

  it('refuses a canonical payment to a recipient not owned by the authenticated seller', async () => {
    const w = await reconciliationWorld();
    const foreign = paymentWorld();
    w.io.files.set('claim.json', foreign.io.files.get('claim.json')!);
    Object.assign(w.state, foreign.state);
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'SELLER_RECIPIENT_MISMATCH' });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
  });

  it.each(['pending', 'reorganized', 'failed-provider', 'late-reorg', 'secondary'])('refuses %s evidence without publishing a receipt', async condition => {
    const w = await reconciliationWorld();
    if (condition === 'pending') w.state.head = '0x64';
    if (condition === 'reorganized') w.state.blockHash = '0x' + 'ef'.repeat(32);
    if (condition === 'failed-provider') w.state.fail = true;
    if (condition === 'late-reorg') w.state.reorgAfter = 3;
    if (condition === 'secondary') w.state.secondaryBlockHash = '0x' + 'ef'.repeat(32);
    const args = condition === 'secondary' ? [...BASE, '--secondary-rpc-file', 'secondary.txt'] : BASE;
    await expect(invoke(receiptCommands, 'receipt create', args, w.io)).rejects.toThrow();
    expect(w.io.files.has('created-receipt.json')).toBe(false);
    expect(allOutput(w.io)).not.toContain('PRIVATE_API_TOKEN');
  });

  it.each(['invoice.json', 'claim.json', 'seller.json'])('refuses a %s source changed during live verification', async path => {
    const w = await reconciliationWorld();
    const send = w.io.rpcTransport.send.bind(w.io.rpcTransport); let changed = false;
    w.io.rpcTransport.send = async (...args) => {
      const response = await send(...args);
      if (!changed) { changed = true; w.io.files.set(path, w.io.files.get(path)! + '\n'); }
      return response;
    };
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'STALE_CONTEXT' });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
  });

  it('refuses a reorganization first visible during the final source reread', async () => {
    const w = await reconciliationWorld();
    const read = w.io.readFile.bind(w.io); let keystoreReads = 0;
    Object.assign(w.io, { readFile: async (path: string) => {
      const value = await read(path);
      if (path === 'seller.json' && ++keystoreReads === 3) w.state.blockHash = '0x' + 'ef'.repeat(32);
      return value;
    } });
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'STALE_CANONICAL_CONTEXT' });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
  });

  it('binds decryption to the captured keystore even if its contents change and change back', async () => {
    const w = await reconciliationWorld();
    const read = w.io.readFile.bind(w.io); let keystoreReads = 0;
    Object.assign(w.io, { readFile: (path: string) => {
      if (path === 'seller.json' && ++keystoreReads !== 2) return Promise.resolve('{"untrusted":"captured snapshot must be authenticated"}');
      return read(path);
    } });
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'STALE_CONTEXT' });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
    expect(w.calls).toEqual([]);
  });

  it('validates expected payment facts before contacting the provider', async () => {
    const w = await reconciliationWorld();
    const { expected: _expected, ...input } = w.current; void _expected;
    w.io.files.set('claim.json', JSON.stringify(input));
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'EXPECTED_PAYMENT_REQUIRED' });
    expect(w.calls).toEqual([]);
    expect(w.io.files.has('created-receipt.json')).toBe(false);
  });

  it('classifies a transaction lookup failure as a network error, without signing', async () => {
    const w = await reconciliationWorld();
    const send = w.io.rpcTransport.send.bind(w.io.rpcTransport);
    w.io.rpcTransport.send = (...args) => {
      const request = JSON.parse(args[1]) as { method: string };
      if (request.method === 'eth_getTransactionReceipt') return Promise.reject(new Error('PRIVATE_API_TOKEN must not escape'));
      return send(...args);
    };
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ kind: 'network' });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
  });

  it('rechecks invoice expiry after the live review and requires repeatable inputs', async () => {
    const w = await reconciliationWorld();
    const read = w.io.readFile.bind(w.io);
    Object.assign(w.io, { readFile: async (path: string) => { const text = await read(path); if (path === 'invoice.json' && w.calls.length > 0) w.io.now = w.signed.invoice.expiresAt; return text; } });
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'INVOICE_EXPIRED' });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
    for (const option of ['--invoice', '--observation', '--keystore']) {
      const args = [...BASE]; args[args.indexOf(option) + 1] = '-';
      await expect(invoke(receiptCommands, 'receipt create', args, w.io)).rejects.toMatchObject({ code: 'REPEATABLE_CONTEXT_REQUIRED' });
    }
  });

  it('rejects wrong keystore credentials and preserves existing or failed outputs', async () => {
    const w = await reconciliationWorld();
    w.io.files.set('pass.txt', 'wrong password');
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'BACKUP_AUTHENTICATION_FAILED' });
    w.io.files.set('pass.txt', RECON_PASS); w.io.files.set('created-receipt.json', 'keep existing');
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect(w.io.files.get('created-receipt.json')).toBe('keep existing');
    w.io.files.delete('created-receipt.json'); w.io.failWrites = true;
    await expect(invoke(receiptCommands, 'receipt create', BASE, w.io)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect(w.io.files.has('created-receipt.json')).toBe(false);
  });
});
