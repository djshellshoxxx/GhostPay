import { expect, it } from 'vitest';
import { createReconciliationApi, type ReconciliationVaultHandle } from '@ghostpay/ux-vault/portable';
import { invoiceDigest, signReceipt } from '@ghostpay/invoice-schema';
import { run } from './run.js';
import { MemoryReconciliationStore } from './backup-data.js';
import { KEY_BYTES, NOW, stdoutJson } from './fixtures.testutil.js';
import { reconciliationWorld, RECON_CREDS, RECON_LIVE, SELLER_ID, VIEW_HEX } from './reconciliation-fixtures.testutil.js';

type World = Awaited<ReturnType<typeof reconciliationWorld>>;
const core = createReconciliationApi();
const recordArgs = ['reconcile', 'record', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--approve', '--out', 'recorded.json', '--json'];
const local = ['--in', 'history.json', '--viewing-key-file', 'view.hex', '--approve', '--out', 'next.json', '--json'];
const clear = (w: World): void => { w.io.out.length = 0; w.io.err.length = 0; };
async function open(w: World, file = 'history.json'): Promise<ReconciliationVaultHandle> {
  const vault = new core.ReconciliationVault(new MemoryReconciliationStore(w.io.files.get(file)), { sellerKeyId: SELLER_ID, chainId: 11155111 }, () => undefined, () => NOW * 1000);
  await vault.unlock(Uint8Array.from(Buffer.from(VIEW_HEX, 'hex')));
  return vault;
}
async function state(w: World, file: string) {
  const vault = await open(w, file);
  try { return await vault.readState(); } finally { vault.lock(); }
}
async function seedReceipt(w: World) {
  const receipt = signReceipt({ chainId: 11155111, txHash: '0x' + 'ab'.repeat(32), invoiceDigest: '0x' + 'cd'.repeat(32), stealthAddress: w.recipient, asset: 'native', amountMinorUnits: '100', issuedAt: NOW }, KEY_BYTES);
  const vault = await open(w); await vault.archiveReceipt(receipt, NOW * 1000);
  w.io.files.set('history.json', await vault.exportEncrypted()); vault.lock();
  return receipt;
}

it('records a fresh seller-owned payment without requiring or confirming an invoice match', async () => {
  const w = await reconciliationWorld();
  const vault = await open(w); await vault.clearInvoices();
  w.io.files.set('history.json', await vault.exportEncrypted()); vault.lock();
  const original = w.io.files.get('history.json');
  expect(await run(recordArgs, w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ currentChainVerified: true, freshRecordCount: 1, invoiceAssociationConfirmed: false, manualAnnotation: false });
  const saved = await state(w, 'recorded.json');
  expect(saved.records).toHaveLength(1); expect(saved.invoices).toHaveLength(0);
  expect(saved.records[0]).toMatchObject({ id: w.recordId, provenance: 'live-scan', evidenceStatus: 'verified-at-scan' });
  expect(saved.records[0]).not.toHaveProperty('invoiceDigest');
  expect(w.io.files.get('history.json')).toBe(original);
});

it('does not promote a signed receipt when canonical RPC evidence is unavailable', async () => {
  const w = await reconciliationWorld();
  await seedReceipt(w);
  const original = w.io.files.get('history.json');
  w.state.fail = true;

  expect(await run(recordArgs, w.io)).toBe(4);
  expect(w.calls.length).toBeGreaterThan(0);
  expect(w.io.files.has('recorded.json')).toBe(false);

  const proposal = ['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE,
    '--record', w.recordId, '--out', 'proposal.json', '--json'];
  expect(await run(proposal, w.io)).toBe(4);
  expect(w.io.files.has('proposal.json')).toBe(false);
  expect(w.io.files.get('history.json')).toBe(original);
  const saved = await state(w, 'history.json');
  expect(saved.records).toHaveLength(0);
  expect(saved.receipts).toHaveLength(1);
  expect(w.io.err.join('')).not.toContain('PRIVATE_API_TOKEN');
});

it('clears observations while retaining invoice registrations and archived receipts', async () => {
  const w = await reconciliationWorld(); await seedReceipt(w);
  expect(await run(recordArgs, w.io)).toBe(0); clear(w);
  const args = [...local]; args[args.indexOf('--in') + 1] = 'recorded.json';
  expect(await run(['reconcile', 'clear-records', ...args], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ removed: 1, currentChainVerified: false, tombstonesRetained: true });
  const saved = await state(w, 'next.json');
  expect(saved.records).toHaveLength(0); expect(saved.invoices).toHaveLength(1); expect(saved.receipts).toHaveLength(1);
  expect((await state(w, 'recorded.json')).records).toHaveLength(1);
});

it('removes only the selected invoice registration from a new encrypted successor', async () => {
  const w = await reconciliationWorld();
  const digest = `0x${Buffer.from(invoiceDigest(w.signed.invoice)).toString('hex')}`;
  expect(await run(['reconcile', 'remove-invoice', ...local, '--invoice-digest', digest], w.io)).toBe(0);
  expect((await state(w, 'next.json')).invoices).toHaveLength(0);
  expect((await state(w, 'history.json')).invoices).toHaveLength(1);
});

it('removes only the selected archived receipt without treating it as payment evidence', async () => {
  const w = await reconciliationWorld(); const receipt = await seedReceipt(w);
  expect(await run(['reconcile', 'remove-receipt', ...local, '--receipt-signature', receipt.signature], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ removed: 1, currentChainVerified: false });
  expect((await state(w, 'next.json')).receipts).toHaveLength(0);
  expect((await state(w, 'history.json')).receipts).toHaveLength(1);
});

it('keeps manual annotations explicitly unverified and rejects conflicting annotations on repeated records', async () => {
  const w = await reconciliationWorld();
  const annotation = '0x' + '12'.repeat(32);
  expect(await run([...recordArgs, '--record', w.recordId, '--manual-invoice-digest', annotation], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ invoiceAssociationConfirmed: false, manualAnnotation: true });
  expect((await state(w, 'recorded.json')).records[0]?.invoiceDigest).toBe(annotation);
  const repeated = [...recordArgs]; repeated[repeated.indexOf('--in') + 1] = 'recorded.json'; repeated[repeated.indexOf('--out') + 1] = 'repeated.json';
  clear(w); expect(await run(repeated, w.io)).toBe(0);
  expect((await state(w, 'repeated.json')).records).toHaveLength(1);
  const conflicting = [...repeated]; conflicting[conflicting.indexOf('--out') + 1] = 'conflict.json';
  expect(await run([...conflicting, '--record', w.recordId, '--manual-invoice-digest', '0x' + '34'.repeat(32)], w.io)).toBe(1);
  expect(w.io.files.has('conflict.json')).toBe(false);
});

it('requires explicit approval and an exact current record for any manual annotation', async () => {
  const w = await reconciliationWorld();
  expect(await run(recordArgs.filter(a => a !== '--approve'), w.io)).toBe(2);
  expect(w.calls).toHaveLength(0);
  for (const additions of [['--manual-invoice-digest', '0x' + '12'.repeat(32)], ['--record', w.recordId, '--manual-invoice-digest', 'malformed']]) {
    expect(await run([...recordArgs, ...additions], w.io)).toBe(2);
    expect(w.calls).toHaveLength(0);
  }
  expect(await run([...recordArgs, '--record', 'missing'], w.io)).toBe(1);
  expect(w.io.files.has('recorded.json')).toBe(false);
});

it('does not record duplicate evidence or publish after a late canonical reorganization', async () => {
  for (const condition of ['duplicate', 'reorg'] as const) {
    const w = await reconciliationWorld();
    if (condition === 'duplicate') w.io.files.set('current.json', JSON.stringify({ version: 1, observations: [w.current, w.current] }));
    else w.state.reorgAfter = 4;
    expect(await run(recordArgs, w.io)).toBe(1);
    expect(w.io.files.has('recorded.json')).toBe(false);
  }
});

it('never promotes restored observations without fresh live evidence', async () => {
  const w = await reconciliationWorld(); expect(await run(recordArgs, w.io)).toBe(0);
  expect(await run(['reconcile', 'import', '--in', 'history.json', '--backup', 'recorded.json', '--viewing-key-file', 'view.hex', '--approve', '--out', 'imported.json', '--json'], w.io)).toBe(0);
  expect((await state(w, 'imported.json')).records[0]?.provenance).toBe('imported-history');
  const args = [...recordArgs]; args[args.indexOf('--in') + 1] = 'imported.json'; args[args.indexOf('--out') + 1] = 'reverified.json';
  w.state.fail = true;
  expect(await run(args, w.io)).toBe(4);
  expect(w.io.files.has('reverified.json')).toBe(false);
  expect((await state(w, 'imported.json')).records[0]?.provenance).toBe('imported-history');
  w.state.fail = false;
  expect(await run(args, w.io)).toBe(0);
  expect((await state(w, 'reverified.json')).records[0]?.provenance).toBe('live-scan');
});

it('classifies transaction-provider failures as network errors without persisting an observation', async () => {
  const w = await reconciliationWorld();
  const send = w.io.rpcTransport.send.bind(w.io.rpcTransport);
  Object.assign(w.io.rpcTransport, { send: (url: string, raw: string, init: Parameters<typeof send>[2]): Promise<string> => {
    const request = JSON.parse(raw) as { method: string };
    if (request.method === 'eth_getTransactionByHash') return Promise.reject(new Error('PRIVATE_PROVIDER_DETAIL'));
    return send(url, raw, init);
  } });
  expect(await run(recordArgs, w.io)).toBe(4);
  expect(w.io.err.join('')).toContain('RPC_FAILURE');
  expect(w.io.err.join('')).not.toContain('PRIVATE_PROVIDER_DETAIL');
  expect(w.io.files.has('recorded.json')).toBe(false);
});

it('preserves reorg tombstones through clearing and old-backup imports and refuses resurrection by record', async () => {
  const w = await reconciliationWorld(); expect(await run(recordArgs, w.io)).toBe(0);
  const vault = await open(w, 'recorded.json');
  await vault.invalidateFrom(100n, [], () => Promise.resolve('0x' + 'ef'.repeat(32)));
  w.io.files.set('invalidated.json', await vault.exportEncrypted()); vault.lock();
  const args = [...local]; args[args.indexOf('--in') + 1] = 'invalidated.json';
  expect(await run(['reconcile', 'clear-records', ...args], w.io)).toBe(0);
  expect(await run(['reconcile', 'import', '--in', 'next.json', '--backup', 'recorded.json', '--viewing-key-file', 'view.hex', '--approve', '--out', 'reimported.json', '--json'], w.io)).toBe(0);
  expect((await state(w, 'reimported.json')).records[0]).toMatchObject({ evidenceStatus: 'invalidated-after-reorg', provenance: 'imported-history' });
  const revive = [...recordArgs]; revive[revive.indexOf('--in') + 1] = 'reimported.json'; revive[revive.indexOf('--out') + 1] = 'revived.json';
  expect(await run(revive, w.io)).toBe(1);
  expect(w.io.files.has('revived.json')).toBe(false);
});

it('retains saturated read-only state even after every observation is cleared', async () => {
  const w = await reconciliationWorld(); expect(await run(recordArgs, w.io)).toBe(0);
  const vault = await open(w, 'recorded.json');
  const { provenance, ...base } = (await vault.read())[0]!; void provenance;
  const observed = Array.from({ length: core.MAX_RECONCILIATION_RECORDS + 1 }, (_, index) => {
    const transactionHash = `0x${BigInt(index + 1).toString(16).padStart(64, '0')}`;
    return { ...base, transactionHash, id: `${SELLER_ID}:11155111:${transactionHash}:${base.stealthAddress}:${base.blockHash}:${base.logIndex}` };
  });
  await expect(vault.invalidateFrom(100n, observed, () => Promise.resolve('0x' + 'ef'.repeat(32)))).rejects.toThrow();
  w.io.files.set('saturated.json', await vault.exportEncrypted()); vault.lock();
  const args = [...local]; args[args.indexOf('--in') + 1] = 'saturated.json';
  clear(w); expect(await run(['reconcile', 'clear-records', ...args], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ readOnly: true, tombstonesRetained: true });
  expect(await state(w, 'next.json')).toMatchObject({ readOnly: true, records: [] });
});

it('supports approved all-invoice and all-receipt cleanup without affecting observations or the other collection', async () => {
  for (const kind of ['invoice', 'receipt'] as const) {
    const w = await reconciliationWorld(); await seedReceipt(w); expect(await run(recordArgs, w.io)).toBe(0);
    const args = [...local]; args[args.indexOf('--in') + 1] = 'recorded.json'; clear(w);
    expect(await run(['reconcile', `remove-${kind}`, ...args, '--all'], w.io)).toBe(0);
    expect(stdoutJson(w.io)).toMatchObject({ removed: 1, currentChainVerified: false });
    const saved = await state(w, 'next.json'); expect(saved.records).toHaveLength(1);
    expect(saved.invoices).toHaveLength(kind === 'invoice' ? 0 : 1);
    expect(saved.receipts).toHaveLength(kind === 'receipt' ? 0 : 1);
  }
});

it('requires approved exact cleanup selectors and does not overwrite existing output files', async () => {
  const w = await reconciliationWorld(); const receipt = await seedReceipt(w);
  for (const command of ['clear-records', 'remove-invoice', 'remove-receipt'])
    expect(await run(['reconcile', command, ...local.filter(a => a !== '--approve')], w.io)).toBe(2);
  for (const [command, selector, value] of [['remove-invoice', '--invoice-digest', '0x' + 'ab'.repeat(32)], ['remove-receipt', '--receipt-signature', receipt.signature]]) {
    expect(await run(['reconcile', command!, ...local], w.io)).toBe(2);
    expect(await run(['reconcile', command!, ...local, selector!, 'invalid'], w.io)).toBe(2);
    expect(await run(['reconcile', command!, ...local, selector!, value!, '--all'], w.io)).toBe(2);
  }
  expect(await run(['reconcile', 'remove-invoice', ...local, '--invoice-digest', '0x' + 'ab'.repeat(32)], w.io)).toBe(1);
  expect(await run(['reconcile', 'remove-receipt', ...local, '--receipt-signature', 'ab'.repeat(64)], w.io)).toBe(1);
  expect(w.io.files.has('next.json')).toBe(false);
  w.io.files.set('next.json', 'keep this prior result');
  expect(await run(['reconcile', 'clear-records', ...local], w.io)).toBe(3);
  expect(await run(['reconcile', 'clear-records', ...local, '--force'], w.io)).toBe(2);
  expect(w.io.files.get('next.json')).toBe('keep this prior result');
});

it('rejects nonrepeatable or concurrently changed cleanup sources and interrupted writes', async () => {
  for (const condition of ['stdin', 'changed', 'write'] as const) {
    const w = await reconciliationWorld(); const original = w.io.files.get('history.json');
    const args = [...local];
    if (condition === 'stdin') args[args.indexOf('--in') + 1] = '-';
    if (condition === 'changed') {
      const read = w.io.readFile.bind(w.io); let reads = 0;
      Object.assign(w.io, { readFile: (p: string) => {
        if (p === 'history.json' && ++reads === 2) w.io.files.set(p, original + '\n');
        return read(p);
      } });
    }
    if (condition === 'write') w.io.failWrites = true;
    expect(await run(['reconcile', 'clear-records', ...args], w.io)).toBe(condition === 'stdin' ? 2 : condition === 'changed' ? 1 : 3);
    expect(w.io.files.has('next.json')).toBe(false);
    expect(w.io.files.get('history.json')).toBe(condition === 'changed' ? original + '\n' : original);
  }
});
