import { expect, it } from 'vitest';
import { createReconciliationApi } from '@ghostpay/ux-vault/portable';
import { run } from './run.js';
import { MemoryReconciliationStore } from './backup-data.js';
import { makeIo, stdoutJson } from './fixtures.testutil.js';
it('inspects reconciliation safety state without confirming any payment', async () => {
  const api = createReconciliationApi();
  const vault = new api.ReconciliationVault(new MemoryReconciliationStore(), { chainId: 11155111, sellerKeyId: 'ab'.repeat(32) }, () => undefined);
  await vault.unlock(new Uint8Array(32).fill(1));
  const data = await vault.exportEncrypted(); vault.lock();
  const io = makeIo({ state: data, key: '01'.repeat(32) });
  expect(await run(['reconcile', 'inspect', '--in', 'state', '--viewing-key-file', 'key', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ ok: true, records: 0, currentChainVerified: false, readOnly: false });
});

import { allOutput, KEY_HEX, NOW } from './fixtures.testutil.js';
import { reconciliationWorld, RECON_CREDS, RECON_LIVE, VIEW_HEX, RECON_PASS } from './reconciliation-fixtures.testutil.js';
import { parseStrictJson, signReceipt } from '@ghostpay/invoice-schema';
import { KEY_BYTES, SIGNER } from './fixtures.testutil.js';
const clear = (world: Awaited<ReturnType<typeof reconciliationWorld>>): void => { world.io.out.length = 0; world.io.err.length = 0; };
async function proposed(world: Awaited<ReturnType<typeof reconciliationWorld>>): Promise<void> {
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', world.recordId, '--out', 'proposal.json', '--json'], world.io)).toBe(0);
  clear(world);
}
const confirmArgs = ['reconcile', 'confirm', '--in', 'history.json', '--proposal', 'proposal.json', ...RECON_CREDS, ...RECON_LIVE, '--approve', '--out', 'confirmed.json', '--json'];

it('creates and registers the same signed fixed-amount invoice format as the GUI', async () => {
  const w = await reconciliationWorld();
  expect(await run(['reconcile', 'create', '--chain', '11155111', ...RECON_CREDS, '--out', 'empty.json', '--json'], w.io)).toBe(0);
  clear(w);
  expect(await run(['reconcile', 'register', '--in', 'empty.json', '--invoice', 'invoice.json', ...RECON_CREDS, '--out', 'registered.json', '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ invoiceCount: 1, currentChainVerified: false });
  expect(allOutput(w.io)).not.toContain(KEY_HEX); expect(allOutput(w.io)).not.toContain(RECON_PASS);
});
it('rejects a modified invoice signature before registration', async () => {
  const w = await reconciliationWorld();
  w.io.files.set('invoice.json', JSON.stringify({ ...w.signed, signature: '11'.repeat(64) }));
  expect(await run(['reconcile', 'register', '--in', 'history.json', '--invoice', 'invoice.json', ...RECON_CREDS, '--out', 'bad.json', '--json'], w.io)).toBe(1);
  expect(w.io.files.has('bad.json')).toBe(false);
});
it('proposes without changing state and confirms only the reviewed current seller-owned payment', async () => {
  const w = await reconciliationWorld(); const original = w.io.files.get('history.json');
  await proposed(w);
  expect(w.io.files.get('history.json')).toBe(original);
  expect(await run(confirmArgs, w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ association: 'seller-confirmed', currentChainVerified: true, recordId: w.recordId, verificationScope: 'operator-pinned-testnet' });
  expect(w.io.files.get('history.json')).toBe(original);
  const vault = new (createReconciliationApi().ReconciliationVault)(new MemoryReconciliationStore(w.io.files.get('confirmed.json')), { chainId: 11155111, sellerKeyId: w.recordId.split(':')[0]! }, () => undefined);
  await vault.unlock(Uint8Array.from(Buffer.from(VIEW_HEX, 'hex')));
  const state = await vault.readState(); vault.lock();
  expect(state.records).toHaveLength(1);
  expect(state.records[0]).toMatchObject({ provenance: 'live-scan', evidenceStatus: 'verified-at-scan', invoiceDigest: (parseStrictJson(w.io.files.get('proposal.json')!) as Record<string, unknown>)['invoiceDigest'] });
  for (const sensitive of [KEY_HEX, VIEW_HEX, RECON_PASS, 'PRIVATE_API_TOKEN']) expect(allOutput(w.io)).not.toContain(sensitive);
});
it('requires explicit approval before any live confirmation request', async () => {
  const w = await reconciliationWorld(); await proposed(w); const before = w.calls.length;
  expect(await run(confirmArgs.filter(arg => arg !== '--approve'), w.io)).toBe(2);
  expect(w.calls.length).toBe(before); expect(w.io.files.has('confirmed.json')).toBe(false);
});
it('rejects expired and modified proposal context without publishing state', async () => {
  for (const kind of ['expired', 'state', 'observations'] as const) {
    const w = await reconciliationWorld(); await proposed(w);
    if (kind === 'expired') w.io.now += 301;
    if (kind === 'state') w.io.files.set('history.json', w.io.files.get('history.json')! + '\n');
    if (kind === 'observations') w.io.files.set('current.json', w.io.files.get('current.json')! + '\n');
    expect(await run(confirmArgs, w.io)).toBe(1);
    expect(w.io.files.has('confirmed.json')).toBe(false);
  }
});
it('binds confirmation to the reviewed deployment manifest and secondary-provider requirement', async () => {
  const { manifestWire } = await import('./payment-fixtures.testutil.js');
  const { manifestDigest, validateManifest } = await import('@ghostpay/chain-adapters');
  const changed = await reconciliationWorld(); await proposed(changed);
  const manifest = { ...manifestWire(), commit: 'b'.repeat(40) };
  changed.io.files.set('manifest.json', JSON.stringify(manifest));
  const args = [...confirmArgs];
  args[args.indexOf('--manifest-digest') + 1] = manifestDigest(validateManifest(manifest, 11155111));
  expect(await run(args, changed.io)).toBe(1);
  expect(changed.io.files.has('confirmed.json')).toBe(false);

  const downgraded = await reconciliationWorld();
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--secondary-rpc-file', 'secondary.txt', '--record', downgraded.recordId, '--out', 'proposal.json', '--json'], downgraded.io)).toBe(0);
  clear(downgraded);
  expect(await run(confirmArgs, downgraded.io)).toBe(1);
  expect(downgraded.io.files.has('confirmed.json')).toBe(false);
});
it('rejects a current observation unrelated to the seller despite valid canonical payment evidence', async () => {
  const w = await reconciliationWorld();
  const { observation, rawLog, metadata, RECIPIENT, ROUTER } = await import('./payment-fixtures.testutil.js');
  const { encodeFunctionData } = await import('viem/utils');
  const { ghostPayRouterAbi } = await import('@ghostpay/chain-adapters');
  const { G } = await import('./fixtures.testutil.js');
  w.io.files.set('current.json', JSON.stringify({ version: 1, observations: [observation()] }));
  w.state.receipt = { ...(w.state.receipt as Record<string, unknown>), logs: [rawLog()] };
  w.state.tx = { ...(w.state.tx as Record<string, unknown>), to: ROUTER, input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payNative', args: [RECIPIENT, 100n, 1_900_000_000n, `0x${G}`, metadata] }) };
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--out', 'proposal.json', '--json'], w.io)).toBe(1);
  expect(w.io.files.has('proposal.json')).toBe(false);
});
it('accepts fully derived deep-scan ownership when only the public view-tag hint is wrong', async () => {
  const { decodeAbiParameters, encodeAbiParameters, encodeFunctionData } = await import('viem/utils');
  const { ghostPayRouterAbi } = await import('@ghostpay/chain-adapters');
  const w = await reconciliationWorld();
  const [ephemeral, original] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], w.current.log.data);
  const metadata = `0x${(parseInt(original.slice(2, 4), 16) ^ 0x5a).toString(16).padStart(2, '0')}${original.slice(4)}` as const;
  const log = { ...w.current.log, data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [ephemeral, metadata]) };
  w.io.files.set('current.json', JSON.stringify({ version: 1, observations: [{ ...w.current, log }] }));
  w.state.receipt = { ...(w.state.receipt as Record<string, unknown>), logs: [log] };
  w.state.tx = { ...(w.state.tx as Record<string, unknown>), input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payNative', args: [w.recipient as `0x${string}`, 100n, 1_900_000_000n, ephemeral, metadata] }) };
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--out', 'proposal.json', '--json'], w.io)).toBe(0);
});
it('classifies provider failure during authenticated context construction as a network error', async () => {
  const w = await reconciliationWorld(); w.state.fail = true;
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--out', 'proposal.json', '--json'], w.io)).toBe(4);
  expect(JSON.parse(w.io.err.join(''))).toMatchObject({ error: { code: 'RPC_FAILURE' } });
  expect(w.io.files.has('proposal.json')).toBe(false);
});
it('rejects duplicate current observations and refuses an unbounded context', async () => {
  for (const copies of [2, 65]) {
    const w = await reconciliationWorld();
    w.io.files.set('current.json', JSON.stringify({ version: 1, observations: Array.from({ length: copies }, () => w.current) }));
    expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--out', 'proposal.json', '--json'], w.io)).toBe(1);
    expect(w.io.files.has('proposal.json')).toBe(false);
  }
});
it('does not publish confirmations after provider failure or canonical reorganization', async () => {
  for (const condition of ['provider', 'reorg', 'secondary'] as const) {
    const w = await reconciliationWorld(); await proposed(w);
    if (condition === 'provider') w.state.fail = true;
    if (condition === 'reorg') w.state.blockHash = '0x' + 'ee'.repeat(32);
    if (condition === 'secondary') w.state.secondaryBlockHash = '0x' + 'ef'.repeat(32);
    const args = condition === 'secondary' ? [...confirmArgs, '--secondary-rpc-file', 'secondary.txt'] : confirmArgs;
    expect(await run(args, w.io)).not.toBe(0); expect(w.io.files.has('confirmed.json')).toBe(false);
    expect(allOutput(w.io)).not.toContain('PRIVATE_API_TOKEN');
  }
});
it('rejects a mixed-fork context when a reorg happens between two individually verified payments at one height', async () => {
  const { deriveStealthPayment, buildNativeMetadata } = await import('@ghostpay/core-crypto');
  const { encodeAbiParameters, encodeFunctionData } = await import('viem/utils');
  const { ghostPayRouterAbi } = await import('@ghostpay/chain-adapters');
  const { counterRandom } = await import('./fixtures.testutil.js');
  const { META } = await import('./reconciliation-fixtures.testutil.js');
  const { BLOCK, ROUTER, pad } = await import('./payment-fixtures.testutil.js');
  const w = await reconciliationWorld();
  const random = counterRandom(); deriveStealthPayment(META, random);
  const payment = deriveStealthPayment(META, random);
  const ephemeral = `0x${Buffer.from(payment.ephemeralPublicKey).toString('hex')}` as const;
  const metadata = `0x${Buffer.from(buildNativeMetadata(payment.viewTag[0]!, 200n)).toString('hex')}` as const;
  const newHash = '0x' + 'ee'.repeat(32); const txHash = '0x' + 'ac'.repeat(32);
  const firstLog = w.current.log;
  const secondLog = { ...firstLog, blockHash: newHash, transactionHash: txHash, topics: [firstLog.topics[0], firstLog.topics[1], pad(payment.stealthAddress), pad(ROUTER)], data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [ephemeral, metadata]) };
  const second = { ...w.current, log: secondLog, expected: { recipient: payment.stealthAddress, asset: 'native', amount: '200' } };
  const receipt = { ...(w.state.receipt as Record<string, unknown>), blockHash: newHash, transactionHash: txHash, logs: [secondLog] };
  const transaction = { ...(w.state.tx as Record<string, unknown>), blockHash: newHash, hash: txHash, value: '0xc8', input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payNative', args: [payment.stealthAddress, 200n, 1_900_000_000n, ephemeral, metadata] }) };
  w.io.files.set('current.json', JSON.stringify({ version: 1, observations: [w.current, second] }));
  const send = w.io.rpcTransport.send.bind(w.io.rpcTransport); let readsAtHeight = 0;
  w.io.rpcTransport.send = async (...args) => {
    const request = JSON.parse(args[1]) as { id: number; method: string; params: string[] };
    if (request.params[0] === txHash && ['eth_getTransactionReceipt', 'eth_getTransactionByHash'].includes(request.method))
      return JSON.stringify({ jsonrpc: '2.0', id: request.id, result: request.method === 'eth_getTransactionReceipt' ? receipt : transaction });
    const response = await send(...args);
    if (request.method !== 'eth_getBlockByNumber' || request.params[0] !== '0x64') return response;
    const parsed = JSON.parse(response) as { result: { hash: string } };
    parsed.result.hash = ++readsAtHeight <= 3 ? BLOCK : newHash;
    return JSON.stringify(parsed);
  };
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--out', 'proposal.json', '--json'], w.io)).toBe(1);
  expect(w.io.files.has('proposal.json')).toBe(false);
});
it('rejects an implausible chain head first reported by the final review guard', async () => {
  const { MAX_PLAUSIBLE_HEAD } = await import('@ghostpay/chain-adapters');
  const w = await reconciliationWorld();
  const send = w.io.rpcTransport.send.bind(w.io.rpcTransport); let headReads = 0;
  w.io.rpcTransport.send = async (...args) => {
    const request = JSON.parse(args[1]) as { method: string };
    const response = await send(...args);
    if (request.method !== 'eth_blockNumber' || ++headReads < 3) return response;
    const parsed = JSON.parse(response) as { result: string };
    parsed.result = `0x${(MAX_PLAUSIBLE_HEAD + 1n).toString(16)}`;
    return JSON.stringify(parsed);
  };
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--out', 'proposal.json', '--json'], w.io)).toBe(1);
  expect(w.io.files.has('proposal.json')).toBe(false);
});
it('detects a source changed while current evidence is being read', async () => {
  const w = await reconciliationWorld(); await proposed(w);
  const send = w.io.rpcTransport.send.bind(w.io.rpcTransport);
  let changed = false;
  w.io.rpcTransport.send = async (...args) => {
    const result = await send(...args);
    if (!changed) { changed = true; w.io.files.set('history.json', w.io.files.get('history.json')! + '\n'); }
    return result;
  };
  expect(await run(confirmArgs, w.io)).toBe(1); expect(w.io.files.has('confirmed.json')).toBe(false);
});
it('keeps the original state and does not leave a partial successor on failed writes', async () => {
  const w = await reconciliationWorld(); await proposed(w); const original = w.io.files.get('history.json');
  w.io.failWrites = true;
  expect(await run(confirmArgs, w.io)).toBe(3); expect(w.io.files.get('history.json')).toBe(original); expect(w.io.files.has('confirmed.json')).toBe(false);
});
it('reimports identical history idempotently while retaining imported-history provenance', async () => {
  const w = await reconciliationWorld(); await proposed(w); expect(await run(confirmArgs, w.io)).toBe(0); clear(w);
  expect(await run(['reconcile', 'import', '--in', 'history.json', '--backup', 'confirmed.json', '--viewing-key-file', 'view.hex', '--approve', '--out', 'imported.json', '--json'], w.io)).toBe(0); clear(w);
  expect(await run(['reconcile', 'import', '--in', 'imported.json', '--backup', 'confirmed.json', '--viewing-key-file', 'view.hex', '--approve', '--out', 'imported2.json', '--json'], w.io)).toBe(0); clear(w);
  expect(await run(['history', 'list', '--in', 'imported2.json', '--viewing-key-file', 'view.hex', '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ total: 1, currentChainVerified: false, records: [expect.objectContaining({ provenance: 'imported-history' })] });
});
it('archives and exports seller receipts without making them payment evidence', async () => {
  const w = await reconciliationWorld();
  const receipt = signReceipt({ chainId: 11155111, txHash: '0x' + 'ab'.repeat(32), invoiceDigest: '0x' + 'cd'.repeat(32), stealthAddress: w.recipient, asset: 'native', amountMinorUnits: '100', issuedAt: NOW }, KEY_BYTES);
  w.io.files.set('receipt.json', JSON.stringify(receipt));
  expect(await run(['reconcile', 'archive-receipt', '--in', 'history.json', '--receipt', 'receipt.json', ...RECON_CREDS, '--out', 'archived.json', '--json'], w.io)).toBe(0); clear(w);
  expect(await run(['reconcile', 'export-receipts', '--in', 'archived.json', '--viewing-key-file', 'view.hex', '--out', 'receipts.json', '--json'], w.io)).toBe(0);
  expect(JSON.parse(w.io.files.get('receipts.json')!)).toEqual([receipt]);
  expect(stdoutJson(w.io)).toMatchObject({ receiptCount: 1, currentChainVerified: false });
  expect(receipt.signerPublicKey).toBe(SIGNER);
});

it('rejects a valid invoice and a signed receipt from another seller signer', async () => {
  const { signInvoice, signerPublicKeyHex } = await import('@ghostpay/invoice-schema');
  const otherKey = Uint8Array.from(Buffer.from('00'.repeat(31) + '08', 'hex'));
  const w = await reconciliationWorld();
  const foreign = signInvoice({ ...w.signed.invoice, signer: signerPublicKeyHex(otherKey) }, otherKey);
  w.io.files.set('invoice.json', JSON.stringify(foreign));
  expect(await run(['reconcile', 'register', '--in', 'history.json', '--invoice', 'invoice.json', ...RECON_CREDS, '--out', 'bad.json', '--json'], w.io)).toBe(1);
  expect(JSON.parse(w.io.err.join(''))).toMatchObject({ error: { code: 'INVOICE_SCOPE_MISMATCH' } });
  clear(w);
  const receipt = signReceipt({ chainId: 11155111, txHash: '0x' + 'ab'.repeat(32), invoiceDigest: '0x' + 'cd'.repeat(32), stealthAddress: w.recipient, asset: 'native', amountMinorUnits: '100', issuedAt: NOW }, otherKey);
  otherKey.fill(0); w.io.files.set('receipt.json', JSON.stringify(receipt));
  expect(await run(['reconcile', 'archive-receipt', '--in', 'history.json', '--receipt', 'receipt.json', ...RECON_CREDS, '--out', 'bad.json', '--json'], w.io)).toBe(1);
  expect(JSON.parse(w.io.err.join(''))).toMatchObject({ error: { code: 'RECEIPT_SIGNER_MISMATCH' } });
  expect(w.io.files.has('bad.json')).toBe(false);
});

it('lists proposals offline without turning stored evidence into current verification', async () => {
  const w = await reconciliationWorld(); await proposed(w);
  expect(await run(confirmArgs, w.io)).toBe(0); clear(w); const calls = w.calls.length;
  expect(await run(['reconcile', 'propose', '--in', 'confirmed.json', '--viewing-key-file', 'view.hex', '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ currentChainVerified: false, confirmed: false, proposals: [expect.objectContaining({ recordId: w.recordId })] });
  expect(w.calls.length).toBe(calls); clear(w);
  expect(await run(['reconcile', 'propose', '--in', 'confirmed.json', '--viewing-key-file', 'view.hex', '--record', 'absent', '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ proposals: [] }); clear(w);
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ currentChainVerified: true, confirmed: false, proposals: [expect.objectContaining({ recordId: w.recordId, kind: 'exact' })] });
});

it('requires exact live matching context before exporting a confirmable proposal', async () => {
  const w = await reconciliationWorld();
  expect(await run(['reconcile', 'propose', '--in', 'history.json', '--viewing-key-file', 'view.hex', '--record', 'absent', '--out', 'proposal.json', '--json'], w.io)).toBe(2);
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--out', 'proposal.json', '--json'], w.io)).toBe(2);
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', 'absent', '--out', 'proposal.json', '--json'], w.io)).toBe(1);
  expect(w.io.files.has('proposal.json')).toBe(false);
});

it('requires repeatable source and observation files and refuses cross-chain evidence', async () => {
  const w = await reconciliationWorld(); await proposed(w);
  const stdinState = [...confirmArgs]; stdinState[stdinState.indexOf('--in') + 1] = '-';
  expect(await run(stdinState, w.io)).toBe(2);
  const stdinObservation = [...confirmArgs]; stdinObservation[stdinObservation.indexOf('--observations') + 1] = '-';
  expect(await run(stdinObservation, w.io)).toBe(2);
  w.io.files.set('current.json', JSON.stringify({ version: 1, observations: [{ ...w.current, chainId: 84532 }] }));
  expect(await run(confirmArgs, w.io)).toBe(1);
  expect(w.io.files.has('confirmed.json')).toBe(false);
});

it('rejects a reviewed record absent from current evidence and a changed provider endpoint', async () => {
  for (const change of ['record', 'provider'] as const) {
    const w = await reconciliationWorld(); await proposed(w);
    if (change === 'record') {
      const proposal = JSON.parse(w.io.files.get('proposal.json')!) as Record<string, unknown>;
      proposal['recordId'] = 'missing reviewed observation'; w.io.files.set('proposal.json', JSON.stringify(proposal));
    } else w.io.files.set('rpc.txt', 'https://replacement.example.test/OTHER_PRIVATE_API_TOKEN');
    expect(await run(confirmArgs, w.io)).toBe(1);
    expect(w.io.files.has('confirmed.json')).toBe(false);
    expect(allOutput(w.io)).not.toContain('OTHER_PRIVATE_API_TOKEN');
  }
});

it('fails final review if observations change or canonical finality disappears during work', async () => {
  for (const change of ['observations', 'canonical'] as const) {
    const w = await reconciliationWorld(); await proposed(w);
    const send = w.io.rpcTransport.send.bind(w.io.rpcTransport); let heads = 0; let modified = false;
    w.io.rpcTransport.send = async (...args) => {
      const request = JSON.parse(args[1]) as { method: string };
      const response = await send(...args);
      if (change === 'observations' && !modified) { modified = true; w.io.files.set('current.json', w.io.files.get('current.json')! + '\n'); }
      if (change !== 'canonical' || request.method !== 'eth_blockNumber' || ++heads < 3) return response;
      const value = JSON.parse(response) as { result: string }; value.result = '0x64'; return JSON.stringify(value);
    };
    expect(await run(confirmArgs, w.io)).toBe(1); expect(w.io.files.has('confirmed.json')).toBe(false);
  }
});

it('rejects wrong archive formats and seller scopes before changing any local state', async () => {
  const w = await reconciliationWorld();
  expect(await run(['reconcile', 'register', '--in', 'seller.json', '--invoice', 'invoice.json', ...RECON_CREDS, '--out', 'bad.json', '--json'], w.io)).toBe(5);
  expect(await run(['reconcile', 'create', '--chain', '11155111', '--keystore', 'history.json', '--passphrase-file', 'pass.txt', '--out', 'bad.json', '--json'], w.io)).toBe(2);
  const changed = JSON.parse(w.io.files.get('history.json')!) as Record<string, unknown>;
  changed['sellerKeyId'] = 'ab'.repeat(32); w.io.files.set('history.json', JSON.stringify(changed));
  expect(await run(['reconcile', 'register', '--in', 'history.json', '--invoice', 'invoice.json', ...RECON_CREDS, '--out', 'bad.json', '--json'], w.io)).toBe(1);
  expect(w.io.files.has('bad.json')).toBe(false);
});

it('dry-runs imports without publication and rejects missing approval, wrong formats and scope changes', async () => {
  const w = await reconciliationWorld();
  const args = ['reconcile', 'import', '--in', 'history.json', '--backup', 'history.json', '--viewing-key-file', 'view.hex', '--json'];
  const before = w.io.files.size;
  expect(await run([...args, '--dry-run'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ dryRun: true, recordCount: 0, currentChainVerified: false });
  expect(w.io.files.size).toBe(before);
  expect(await run([...args, '--out', 'bad.json'], w.io)).toBe(2);
  const wrong = [...args]; wrong[wrong.indexOf('--backup') + 1] = 'seller.json';
  expect(await run([...wrong, '--dry-run'], w.io)).toBe(2);
  const changed = JSON.parse(w.io.files.get('history.json')!) as Record<string, unknown>;
  changed['chainId'] = 84532; w.io.files.set('other.json', JSON.stringify(changed));
  wrong[wrong.indexOf('--backup') + 1] = 'other.json';
  expect(await run([...wrong, '--dry-run'], w.io)).toBe(1);
  expect(w.io.files.has('bad.json')).toBe(false);
});
