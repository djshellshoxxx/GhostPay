import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { buildNativeMetadata, deriveStealthPayment } from '@ghostpay/core-crypto';
import { ANNOUNCEMENT_TOPIC, CANONICAL_ANNOUNCER, ERC6538_ENTRY_TYPEHASH, ERC6538_REGISTRY, buildLookupCall, ghostPayRouterAbi, manifestDigest, validateManifest } from '@ghostpay/chain-adapters';
import { invoiceDigest, signReceipt, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { checkpointKeyId, createTagArchiveApi } from '@ghostpay/ux-vault/portable';
import { encodeAbiParameters, encodeFunctionData, keccak256 } from 'viem/utils';

// Controlled HTTP fixtures exercise the built binary and real canonical verifier.
// They establish adapter behavior, not public-network acceptance or provider trust.
const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const signing = '00'.repeat(31) + '07';
const spending = '00'.repeat(31) + '01';
const viewing = '00'.repeat(31) + '02';
const passphrase = 'birch-velvet-otter-copper-archer-quartz';
const nextPassphrase = 'larch-silver-ocean-butter-lantern-thrush';
const G = signerPublicKeyHex(Buffer.from(spending, 'hex'));
const G2 = signerPublicKeyHex(Buffer.from(viewing, 'hex'));
const signer = signerPublicKeyHex(Buffer.from(signing, 'hex'));
const meta = `st:eth:0x${G}${G2}`;
const router = '0x0000000000000000000000000000000000000b22';
const relayer = '0x0000000000000000000000000000000000000c33';
const feeRecipient = '0x0000000000000000000000000000000000000d44';
const payer = '0x2222222222222222222222222222222222222222';
const block = `0x${'ab'.repeat(32)}`;
const tx = `0x${'cd'.repeat(32)}`;
const routerCode = '0x60016000';
const relayerCode = '0x60026000';
const word = n => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const pad = address => `0x${address.slice(2).padStart(64, '0')}`;
let dir, server, endpoint, signed, receipt, claim, manifest, pin, rpcReceipt, rpcTransaction;
let canonical = block;
let head = '0xc8';
let requestCount = 0;
const path = name => join(dir, name);
const put = (name, data) => writeFile(path(name), typeof data === 'string' || data instanceof Uint8Array ? data : JSON.stringify(data), { mode: 0o600 });
const credentials = ['--keystore', 'seller.json', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE'];
const viewSource = ['--viewing-key-env', 'TEST_VIEWING_KEY'];
const live = () => ['--manifest', 'manifest.json', '--manifest-digest', pin, '--online', '--rpc-env', 'TEST_RPC_ENDPOINT', '--allow-insecure-localhost'];

async function cli(args, { input, code = 0, env = {} } = {}) {
  const child = spawn(process.execPath, [bin, ...args, '--json'], {
    cwd: dir, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TEST_SIGNING_KEY: signing, TEST_SPENDING_KEY: spending, TEST_VIEWING_KEY: viewing,
      TEST_BACKUP_PASSPHRASE: passphrase, TEST_NEXT_PASSPHRASE: nextPassphrase, TEST_RPC_ENDPOINT: endpoint, ...env },
  });
  let stdout = ''; let stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', s => { stdout += s; }); child.stderr.on('data', s => { stderr += s; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 25_000);
  child.stdin.on('error', () => {}); child.stdin.end(input);
  let status, signal;
  try { [status, signal] = await once(child, 'close'); } finally { clearTimeout(timer); }
  assert.equal(signal, null, `${args[0]} interrupted: ${stderr}`);
  assert.equal(status, code, `${args.slice(0, 3).join(' ')}: ${stderr || stdout}`);
  for (const secret of [signing, viewing, spending, passphrase, nextPassphrase, endpoint]) {
    if (secret) assert.equal((stdout + stderr).includes(secret), false, 'credential must not escape the process');
  }
  const text = stdout || stderr;
  assert.equal(text.trim().split('\n').length, 1, 'one structured result per invocation');
  const result = JSON.parse(text);
  if (code === 0) assert.equal(result.ok, true);
  return result;
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'GhostPay operator compiled '));
  const payment = deriveStealthPayment(meta, globalThis.crypto);
  const recipient = payment.stealthAddress.toLowerCase();
  const ephemeral = `0x${Buffer.from(payment.ephemeralPublicKey).toString('hex')}`;
  const metadata = `0x${Buffer.from(buildNativeMetadata(payment.viewTag, 100n)).toString('hex')}`;
  const log = { address: CANONICAL_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, word(1), pad(recipient), pad(router)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [ephemeral, metadata]),
    blockNumber: '0x64', blockHash: block, transactionHash: tx, logIndex: '0x4' };
  claim = { version: 1, family: 'evm', chainId: 11155111, expected: { recipient, asset: 'native', amount: '100' }, log };
  manifest = { chainId: 11155111, announcer: CANONICAL_ANNOUNCER, router, sweepRelayer: relayer, feeRecipient, feeBps: 25,
    deployTx: { router: `0x${'1'.repeat(64)}`, sweepRelayer: `0x${'2'.repeat(64)}` }, solcVersion: '0.8.28', commit: 'a'.repeat(40),
    bytecodeHashes: { router: keccak256(routerCode), sweepRelayer: keccak256(relayerCode) }, date: '2026-01-01T00:00:00Z' };
  pin = manifestDigest(validateManifest(manifest, 11155111));
  const common = { blockHash: block, blockNumber: '0x64', from: payer, to: router, transactionIndex: '0x0' };
  rpcReceipt = { ...common, status: '0x1', transactionHash: tx, logs: [log] };
  rpcTransaction = { ...common, hash: tx, input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payNative',
    args: [payment.stealthAddress, 100n, 1_900_000_000n, ephemeral, metadata] }), value: '0x64' };
  server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk.toString('utf8');
    const { id, method, params } = JSON.parse(text); requestCount++;
    let result;
    if (method === 'eth_chainId') result = '0xaa36a7';
    else if (method === 'eth_blockNumber') result = head;
    else if (method === 'eth_getCode') result = params[0].toLowerCase() === router ? routerCode : params[0].toLowerCase() === relayer ? relayerCode : '0x6003';
    else if (method === 'eth_call') {
      const data = params[0].data;
      if (data === encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'FEE_BPS' })) result = word(25);
      else if (data === encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'FEE_RECIPIENT' })) result = pad(feeRecipient);
      else if (data === encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'ANNOUNCER' })) result = pad(CANONICAL_ANNOUNCER);
      else if (data === buildLookupCall(payer).data) result = encodeAbiParameters([{ type: 'bytes' }], [`0x${G}${G2}`]);
      else if (params[0].to.toLowerCase() === ERC6538_REGISTRY.toLowerCase()) result = ERC6538_ENTRY_TYPEHASH;
    } else if (method === 'eth_getBlockByNumber') result = { number: params[0], hash: canonical, parentHash: `0x${'11'.repeat(32)}` };
    else if (method === 'eth_getTransactionReceipt') result = rpcReceipt;
    else if (method === 'eth_getTransactionByHash') result = rpcTransaction;
    else if (method === 'eth_getLogs') result = BigInt(params[0].fromBlock) <= 100n && BigInt(params[0].toBlock) >= 100n ? [log] : [];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result === undefined ? { jsonrpc: '2.0', id, error: { code: -32601, message: 'unsupported fixture method' } } : { jsonrpc: '2.0', id, result }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  endpoint = `http://127.0.0.1:${server.address().port}/private-fixture-endpoint`;
  const now = Math.floor(Date.now() / 1000);
  await put('spec.json', { chainId: 11155111, metaAddress: meta, fiat: { currency: 'USD', minorUnits: '100' }, token: 'native',
    amountPolicy: { mode: 'fixed_token', tokenAmount: '100' }, quote: { source: 'offline:fixture', timestamp: now, expiresAt: now + 600, maxSlippageBps: 50 },
    expiresAt: now + 3600, lineItems: [{ description: 'Portable operator fixture', quantity: '1', unitMinorUnits: '100' }],
    tax: { rateBps: 0, minorUnits: '0' }, feePolicy: 'payer_pays' });
  await cli(['invoice', 'create', '--in', 'spec.json', '--key-env', 'TEST_SIGNING_KEY', '--out', 'invoice.json']);
  signed = JSON.parse(await readFile(path('invoice.json'), 'utf8'));
  receipt = signReceipt({ invoiceDigest: `0x${Buffer.from(invoiceDigest(signed.invoice)).toString('hex')}`, chainId: 11155111,
    txHash: tx, stealthAddress: recipient, asset: 'native', amountMinorUnits: '100', issuedAt: now }, Buffer.from(signing, 'hex'));
  await put('receipt.json', receipt); await put('claim.json', claim); await put('manifest.json', manifest);
  await put('observations.json', { version: 1, observations: [claim] }); await put('spend.pub', G);
  await cli(['backup', 'create', '--spending-key-env', 'TEST_SPENDING_KEY', '--viewing-key-env', 'TEST_VIEWING_KEY', '--signing-key-env', 'TEST_SIGNING_KEY', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE', '--out', 'seller.json']);
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (dir) await rm(dir, { recursive: true, force: true });
});

test('compiled invoice, signed receipt, SVG and multipart public exchange are interoperable', async () => {
  assert.equal((await cli(['invoice', 'inspect', '--in', 'invoice.json'])).signatureValid, true);
  assert.equal((await cli(['invoice', 'verify', '--in', 'invoice.json', '--pin', G], { code: 1 })).signerPinned, false);
  assert.equal((await cli(['receipt', 'verify', '--in', 'receipt.json', '--invoice', 'invoice.json', '--pin', signer])).paymentVerified, false);
  await cli(['receipt', 'export', '--in', 'receipt.json', '--out', 'original-receipt.json']);
  assert.deepEqual(JSON.parse(await readFile(path('original-receipt.json'), 'utf8')), receipt);
  await cli(['qr', 'encode', '--kind', 'receipt', '--in', 'receipt.json', '--out', 'receipt.svg']);
  await cli(['qr', 'decode', '--kind', 'receipt', '--in', 'receipt.svg', '--out', 'decoded-receipt.json']);
  assert.deepEqual(JSON.parse(await readFile(path('decoded-receipt.json'), 'utf8')), receipt);
  const multipart = await cli(['qr', 'encode', '--kind', 'receipt', '--in', 'receipt.json', '--format', 'multipart', '--chunk-chars', '500']);
  for (let i = 1; i <= multipart.frameCount; i++) await cli(['qr', 'encode', '--kind', 'receipt', '--in', 'receipt.json', '--format', 'multipart', '--chunk-chars', '500', '--frame', String(i), '--out', `frame-${i}.svg`]);
  const frames = Array.from({ length: multipart.frameCount - 1 }, (_, i) => ['--frame-file', `frame-${i + 2}.svg`]).flat();
  assert.deepEqual(JSON.parse((await cli(['qr', 'decode', '--kind', 'receipt', '--in', 'frame-1.svg', ...frames])).payload), receipt);
  await put('public-source.json', { metaAddress: meta, signerPublicKey: signer, chainIds: [11155111] });
  await cli(['seller', 'export-public', '--in', 'public-source.json', '--out', 'seller-public.json']);
  const imported = await cli(['seller', 'import-public', '--in', 'seller-public.json', '--current', 'seller-public.json']);
  assert.equal(imported.repeated, true); assert.equal(imported.applied, false); assert.equal(imported.trustEstablished, false);
  await put('settings.json', { format: 'ghostpay-settings', v: 1, settings: { delayMinSec: 3, delayMaxSec: 8, lockTimeoutMin: 10, theme: 'dark', autoClearFragment: true } });
  await cli(['qr', 'encode', '--kind', 'settings', '--in', 'settings.json', '--out', 'settings.svg']);
  await cli(['qr', 'decode', '--kind', 'settings', '--in', 'settings.svg', '--out', 'settings-copy.json']);
  const settings = await cli(['config', 'validate', '--kind', 'settings', '--in', 'settings-copy.json']);
  assert.equal(settings.applied, false); assert.equal(settings.browserStorageChanged, false);
});

test('compiled credential, authenticated recovery and immutable output boundaries hold across formats', async () => {
  assert.equal((await cli(['backup', 'inspect', '--in', 'seller.json'])).authenticated, false);
  assert.equal((await cli(['backup', 'verify', '--in', 'seller.json', '--passphrase-stdin'], { input: passphrase })).recordCount, 3);
  assert.equal((await cli(['backup', 'verify', '--in', 'seller.json', '--passphrase-stdin'], { input: 'wrong password', code: 1 })).error.code, 'BACKUP_AUTHENTICATION_FAILED');
  assert.equal((await cli(['backup', 'restore', '--in', 'seller.json', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE', '--dry-run'])).browserStorageChanged, false);
  await cli(['backup', 'restore', '--in', 'seller.json', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE', '--approve', '--out', 'restored.json']);
  const original = await readFile(path('restored.json'));
  await cli(['backup', 'restore', '--in', 'seller.json', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE', '--approve', '--out', 'restored.json'], { code: 3 });
  assert.deepEqual(await readFile(path('restored.json')), original);
  await cli(['backup', 'rekey', '--in', 'seller.json', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE', '--new-passphrase-env', 'TEST_NEXT_PASSPHRASE', '--out', 'rekeyed.json']);
  assert.equal((await cli(['backup', 'verify', '--in', 'rekeyed.json', '--passphrase-env', 'TEST_NEXT_PASSPHRASE'])).authenticated, true);
  const archive = await createTagArchiveApi().encodeArchive({ createdAt: 1, keyVersion: 1, records: [], history: {} }, passphrase, { N: 16384 });
  await put('tags.gpa', archive);
  await cli(['backup', 'restore', '--in', 'tags.gpa', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE', '--approve', '--out', 'restored.gpa']);
  assert.deepEqual(await readFile(path('restored.gpa')), Buffer.from(archive));
  if (process.platform !== 'win32') assert.equal((await stat(path('restored.gpa'))).mode & 0o077, 0);
  await cli(['qr', 'encode', '--kind', 'keystore', '--in', 'seller.json', '--out', 'keystore.svg']);
  const decoded = await cli(['qr', 'decode', '--kind', 'keystore', '--in', 'keystore.svg', '--out', 'qr-keystore.json']);
  assert.equal(decoded.authenticationVerified, false);
  assert.equal((await cli(['backup', 'verify', '--in', 'qr-keystore.json', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE'])).authenticated, true);
});

test('compiled seller key generation publishes only a new encrypted keystore and public metadata', async () => {
  const generated = await cli(['backup', 'generate', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE', '--out', 'generated-seller.json']);
  assert.equal(generated.generated, true); assert.equal(generated.recordCount, 3);
  assert.match(generated.metaAddress, /^st:eth:0x[0-9a-f]{132}$/);
  assert.equal((await cli(['backup', 'verify', '--in', 'generated-seller.json', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE'])).authenticated, true);
  const bytes = await readFile(path('generated-seller.json'));
  await cli(['backup', 'generate', '--passphrase-env', 'TEST_BACKUP_PASSPHRASE', '--out', 'generated-seller.json'], { code: 3 });
  assert.deepEqual(await readFile(path('generated-seller.json')), bytes);
});

test('compiled real verifier distinguishes offline, canonical, pending and reorganized controlled RPC evidence', async () => {
  const before = requestCount;
  assert.equal((await cli(['payment', 'inspect', '--in', 'claim.json'])).status, 'announced');
  await cli(['payment', 'verify', '--in', 'claim.json', '--manifest', 'manifest.json', '--manifest-digest', pin, '--rpc-env', 'TEST_RPC_ENDPOINT'], { code: 2 });
  assert.equal(requestCount, before, 'offline inspection and missing online consent make no request');
  assert.equal((await cli(['payment', 'verify', '--in', 'claim.json', ...live()])).status, 'verified');
  head = '0x64';
  try { assert.equal((await cli(['payment', 'status', '--in', 'claim.json', ...live()], { code: 1 })).status, 'pending-finality'); }
  finally { head = '0xc8'; }
  canonical = `0x${'ef'.repeat(32)}`;
  try { assert.equal((await cli(['payment', 'status', '--in', 'claim.json', ...live()], { code: 1 })).status, 'reorganization-detected'); }
  finally { canonical = block; }
  const registry = await cli(['registry', 'lookup', '--chain', '11155111', '--registrant', payer, '--online', '--rpc-env', 'TEST_RPC_ENDPOINT', '--allow-insecure-localhost']);
  assert.equal(registry.metaAddress, meta); assert.equal(registry.registryBehaviorChecked, true);
  assert.equal(registry.registryCodePinned, false); assert.equal(registry.identityVerified, false);
});

test('compiled receipt creation signs only after explicit approval and fresh owned-payment verification', async () => {
  const source = ['receipt', 'create', '--invoice', 'invoice.json', '--observation', 'claim.json', ...credentials, ...live(), '--out', 'created-receipt.json'];
  await cli(source, { code: 2 });
  const created = await cli([...source, '--approve']);
  assert.equal(created.paymentVerifiedAtCreation, true); assert.equal(created.recipientOwnershipVerified, true);
  assert.equal(created.receiptIsPaymentProof, false);
  const verified = await cli(['receipt', 'verify', '--in', 'created-receipt.json', '--invoice', 'invoice.json', '--pin', signer]);
  assert.equal(verified.invoiceBound, true); assert.equal(verified.paymentVerified, false);
  const bytes = await readFile(path('created-receipt.json'));
  await cli([...source, '--approve'], { code: 3 });
  assert.deepEqual(await readFile(path('created-receipt.json')), bytes);
});

test('compiled manual-digest receipt creation verifies payment without inventing invoice binding', async () => {
  const digest = '0x' + '56'.repeat(32);
  const source = ['receipt', 'create', '--manual-invoice-digest', digest, '--observation', 'claim.json', ...credentials, ...live(), '--out', 'manual-receipt.json'];
  const before = requestCount;
  assert.equal((await cli(source, { code: 2 })).error.code, 'APPROVAL_REQUIRED');
  assert.equal((await cli([...source, '--approve', '--invoice', 'invoice.json'], { code: 2 })).error.code, 'RECEIPT_INVOICE_SOURCE');
  assert.equal(requestCount, before, 'invalid signing consent/mode must not contact RPC');
  const created = await cli([...source, '--approve']);
  assert.equal(created.invoiceBound, false); assert.equal(created.manualInvoiceDigest, true);
  assert.equal(created.paymentVerifiedAtCreation, true); assert.equal(created.recipientOwnershipVerified, true);
  assert.equal(created.receiptIsPaymentProof, false);
  const bytes = await readFile(path('manual-receipt.json'));
  assert.equal(JSON.parse(bytes.toString('utf8')).invoiceDigest, digest);
  const verified = await cli(['receipt', 'verify', '--in', 'manual-receipt.json', '--pin', signer]);
  assert.equal(verified.signatureValid, true); assert.equal(verified.invoiceBound, false); assert.equal(verified.paymentVerified, false);
  await cli(['receipt', 'verify', '--in', 'manual-receipt.json', '--invoice', 'invoice.json'], { code: 1 });
  await cli([...source, '--approve'], { code: 3 });
  assert.deepEqual(await readFile(path('manual-receipt.json')), bytes);
});

test('compiled reconciliation requires reviewed live context and approval while imported history remains untrusted', async () => {
  await cli(['reconcile', 'create', '--chain', '11155111', ...credentials, '--out', 'empty-history.json']);
  await cli(['reconcile', 'register', '--in', 'empty-history.json', '--invoice', 'invoice.json', ...credentials, '--out', 'registered-history.json']);
  const recordId = `${checkpointKeyId(G, G2)}:11155111:${tx}:${claim.expected.recipient}:${block}:4`;
  const context = ['--in', 'registered-history.json', '--observations', 'observations.json', ...credentials, ...live()];
  const proposal = await cli(['reconcile', 'propose', ...context, '--record', recordId, '--out', 'proposal.json']);
  assert.equal(proposal.confirmed, false);
  await cli(['reconcile', 'confirm', ...context, '--proposal', 'proposal.json', '--out', 'unapproved.json'], { code: 2 });
  const confirmed = await cli(['reconcile', 'confirm', ...context, '--proposal', 'proposal.json', '--approve', '--out', 'confirmed-history.json']);
  assert.equal(confirmed.association, 'seller-confirmed'); assert.equal(confirmed.currentChainVerified, true);
  const history = await cli(['history', 'list', '--in', 'confirmed-history.json', ...viewSource]);
  assert.equal(history.currentChainVerified, false); assert.equal(history.total, 1);
  assert.equal((await cli(['history', 'inspect', '--in', 'confirmed-history.json', ...viewSource, '--record', recordId])).currentChainVerified, false);
  await cli(['reconcile', 'archive-receipt', '--in', 'confirmed-history.json', '--receipt', 'receipt.json', ...credentials, '--out', 'archived-history.json']);
  assert.equal((await cli(['reconcile', 'export-receipts', '--in', 'archived-history.json', ...viewSource, '--out', 'receipts.json'])).receiptCount, 1);
  assert.equal((await cli(['reconcile', 'import', '--in', 'empty-history.json', '--backup', 'archived-history.json', ...viewSource, '--approve', '--out', 'imported-history.json'])).currentChainVerified, false);
  const imported = await cli(['history', 'list', '--in', 'imported-history.json', ...viewSource]);
  assert.equal(imported.records[0].provenance, 'imported-history');
  const recordContext = ['--in', 'empty-history.json', '--observations', 'observations.json', ...credentials, ...live(), '--approve'];
  const recorded = await cli(['reconcile', 'record', ...recordContext, '--out', 'unassociated-history.json']);
  assert.equal(recorded.invoiceAssociationConfirmed, false); assert.equal(recorded.currentChainVerified, true);
  const cleared = await cli(['reconcile', 'clear-records', '--in', 'unassociated-history.json', ...viewSource, '--approve', '--out', 'cleared-history.json']);
  assert.equal(cleared.removed, 1); assert.equal(cleared.tombstonesRetained, true);
  assert.equal((await cli(['history', 'list', '--in', 'cleared-history.json', ...viewSource])).total, 0);
  const removedReceipt = await cli(['reconcile', 'remove-receipt', '--in', 'archived-history.json', ...viewSource, '--all', '--approve', '--out', 'without-receipts.json']);
  assert.equal(removedReceipt.removed, 1); assert.equal(removedReceipt.currentChainVerified, false);
  const removedInvoice = await cli(['reconcile', 'remove-invoice', '--in', 'without-receipts.json', ...viewSource, '--all', '--approve', '--out', 'without-invoices.json']);
  assert.equal(removedInvoice.removed, 1); assert.equal(removedInvoice.tombstonesRetained, true);
});

test('compiled private scans authenticate their cursor and keep matches out of terminal output', async () => {
  await cli(['scan', 'run', '--chain', '11155111', '--from-block', '100', '--to-block', '199', ...live(), '--view-key-env', 'TEST_VIEWING_KEY', '--spend-public-file', 'spend.pub', '--out', 'scan.json']);
  const report = JSON.parse(await readFile(path('scan.json'), 'utf8'));
  assert.equal(report.observations.length, 1); assert.equal(report.complete, true);
  // Stdin is the portable private-input route when Windows DACL inspection is unavailable.
  const inspected = await cli(['scan', 'inspect', '--in', '-', '--view-key-env', 'TEST_VIEWING_KEY'], { input: JSON.stringify(report) });
  assert.equal(inspected.authenticationVerified, true); assert.equal(inspected.paymentVerified, false);
  await cli(['scan', 'run', '--chain', '11155111', '--from-block', '100', '--to-block', '199', ...live(), '--view-key-env', 'TEST_VIEWING_KEY', '--spend-public-file', 'spend.pub', '--out', 'scan.json'], { code: 3 });
});

test('compiled merchant planning and diagnostics never imply payment or refund execution', async () => {
  await put('installments.json', { total: '1001', depositBps: 1000, count: 3, startAt: 1, firstDue: 2, intervalSeconds: 3600,
    tolerance: { underpayAbs: '0', underpayBps: 0, overpayAbs: '0', overpayBps: 0 } });
  await cli(['merchant', 'installments', 'plan', '--in', 'installments.json', '--out', 'plan.json']);
  assert.equal((await cli(['merchant', 'installments', 'inspect', '--in', 'plan.json'])).paymentVerified, false);
  await put('event.json', { id: 'evt-compiled', type: 'invoice.paid', createdAt: 1, data: { invoiceId: 'inv-compiled', currency: 'USD', amountMinor: '100' } });
  assert.equal((await cli(['merchant', 'webhooks', 'inspect', '--in', 'event.json'])).replayChecked, false);
  assert.equal((await cli(['config', 'validate', '--kind', 'webhook-event', '--in', 'event.json'])).configurationOnly, true);
  assert.equal((await cli(['merchant', 'refunds', 'execute'], { code: 5 })).error.code, 'REFUND_EXECUTION_UNSUPPORTED');
  assert.equal((await cli(['diagnostics', '--out', 'diagnostics.json'])).networkContacted, false);
  assert.equal((await cli(['chain', 'deployment', 'inspect', '--chain', '11155111', '--in', 'manifest.json'])).deploymentVerified, false);
});
