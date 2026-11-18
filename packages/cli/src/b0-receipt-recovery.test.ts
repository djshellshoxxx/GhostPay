import { expect, it } from 'vitest';
import { parseVerifiedReceipt } from '@ghostpay/invoice-schema';
import { run } from './run.js';
import { allOutput, KEY_HEX, SIGNER, stdoutJson } from './fixtures.testutil.js';
import { PIN } from './payment-fixtures.testutil.js';
import { reconciliationWorld, RECON_CREDS, RECON_PASS, VIEW_HEX } from './reconciliation-fixtures.testutil.js';

it('retains a live-verified signed receipt through encrypted offline recovery without promoting historical proof', async () => {
  const w = await reconciliationWorld();
  const original = w.io.files.get('history.json');
  const create = ['receipt', 'create', '--invoice', 'invoice.json', '--observation', 'claim.json',
    ...RECON_CREDS, '--manifest', 'manifest.json', '--manifest-digest', PIN,
    '--online', '--rpc-file', 'rpc.txt', '--approve', '--out', 'receipt.json', '--json'];

  expect(await run(create, w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({
    invoiceBound: true, paymentVerifiedAtCreation: true,
    recipientOwnershipVerified: true, receiptIsPaymentProof: false,
  });
  const receipt = parseVerifiedReceipt(w.io.files.get('receipt.json')!);
  expect(receipt).toMatchObject({ signerPublicKey: SIGNER, chainId: 11155111, stealthAddress: w.recipient });

  const callsAfterCreation = w.calls.length;
  w.io.out.length = 0;
  expect(await run(['receipt', 'verify', '--in', 'receipt.json', '--invoice', 'invoice.json',
    '--pin', SIGNER, '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ invoiceBound: true, signatureValid: true, paymentVerified: false });
  expect(w.calls.length).toBe(callsAfterCreation);

  w.io.out.length = 0;
  expect(await run(['reconcile', 'archive-receipt', '--in', 'history.json',
    '--receipt', 'receipt.json', ...RECON_CREDS, '--out', 'archived.json', '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ receiptCount: 1, currentChainVerified: false });
  expect(w.io.files.get('history.json')).toBe(original);

  w.io.out.length = 0;
  expect(await run(['reconcile', 'import', '--in', 'history.json', '--backup', 'archived.json',
    '--viewing-key-file', 'view.hex', '--approve', '--out', 'recovered.json', '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ currentChainVerified: false, provenance: 'imported-history' });
  expect(w.io.files.get('history.json')).toBe(original);

  w.io.out.length = 0;
  expect(await run(['reconcile', 'inspect', '--in', 'recovered.json',
    '--viewing-key-file', 'view.hex', '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ receipts: 1, currentChainVerified: false });
  w.io.out.length = 0;
  expect(await run(['reconcile', 'export-receipts', '--in', 'recovered.json',
    '--viewing-key-file', 'view.hex', '--out', 'exported.json', '--json'], w.io)).toBe(0);
  expect(JSON.parse(w.io.files.get('exported.json')!)).toEqual([receipt]);
  expect(stdoutJson(w.io)).toMatchObject({ receiptCount: 1, currentChainVerified: false });
  expect(w.calls.length).toBe(callsAfterCreation);
  for (const secret of [KEY_HEX, VIEW_HEX, RECON_PASS, 'PRIVATE_API_TOKEN'])
    expect(allOutput(w.io)).not.toContain(secret);
});
