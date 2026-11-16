import { expect, it } from 'vitest';
import { createClient, requireEnabledChain } from '@ghostpay/chain-adapters';
import { createReconciliationApi } from '@ghostpay/ux-vault/portable';
import { MemoryReconciliationStore } from './backup-data.js';
import { NOW, stdoutJson } from './fixtures.testutil.js';
import { BLOCK, paymentWorld } from './payment-fixtures.testutil.js';
import { freshCanonicalContext } from './reconcile-session.js';
import { reconciliationWorld, RECON_CREDS, RECON_LIVE, VIEW_HEX } from './reconciliation-fixtures.testutil.js';
import { run } from './run.js';

const proposeArgs = ['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--json'];
function withTime(world: Awaited<ReturnType<typeof reconciliationWorld>>, timestamp: number | undefined, secondaryOnly = false): void {
  const send = world.io.rpcTransport.send.bind(world.io.rpcTransport);
  world.io.rpcTransport.send = async (...args) => {
    const response = await send(...args);
    const request = JSON.parse(args[1]) as { method: string };
    if (request.method !== 'eth_getBlockByNumber' || (secondaryOnly && !args[0].includes('secondary'))) return response;
    const value = JSON.parse(response) as { result: Record<string, unknown> };
    if (timestamp === undefined) delete value.result['timestamp'];
    else value.result['timestamp'] = `0x${timestamp.toString(16)}`;
    return JSON.stringify(value);
  };
}

it('binds a late scan to the canonical payment time and persists that time after confirmation', async () => {
  const world = await reconciliationWorld();
  world.io.now = NOW + 7200;
  expect(await run([...proposeArgs, '--record', world.recordId, '--out', 'proposal.json'], world.io)).toBe(0);
  expect(stdoutJson(world.io)).toMatchObject({ confirmed: false, paymentVerifiedAtReview: true });
  world.io.out.length = 0;
  expect(await run(['reconcile', 'confirm', '--in', 'history.json', '--proposal', 'proposal.json', ...RECON_CREDS, ...RECON_LIVE, '--approve', '--out', 'confirmed.json', '--json'], world.io)).toBe(0);
  const vault = new (createReconciliationApi().ReconciliationVault)(new MemoryReconciliationStore(world.io.files.get('confirmed.json')), { chainId: 11155111, sellerKeyId: world.recordId.split(':')[0]! }, () => undefined);
  await vault.unlock(Uint8Array.from(Buffer.from(VIEW_HEX, 'hex')));
  const records = await vault.read();
  vault.lock();
  expect(records[0]).toMatchObject({ blockTimestamp: NOW.toString(), recordedAt: (NOW + 7200) * 1000, provenance: 'live-scan' });
});

it.each([undefined, NOW + 3600])('never exports a confirmable proposal from missing or late canonical time (%s)', async (timestamp) => {
  const world = await reconciliationWorld();
  withTime(world, timestamp);
  expect(await run([...proposeArgs, '--record', world.recordId, '--out', 'proposal.json'], world.io)).toBe(1);
  expect(world.io.err.join('')).toContain('NO_EXACT_PROPOSAL');
  expect(world.io.files.has('proposal.json')).toBe(false);
});

it.each([undefined, NOW + 1])('refuses an independent provider with missing or conflicting canonical time (%s)', async (timestamp) => {
  const world = await reconciliationWorld();
  withTime(world, timestamp, true);
  expect(await run([...proposeArgs, '--record', world.recordId, '--secondary-rpc-file', 'secondary.txt', '--out', 'proposal.json'], world.io)).toBe(1);
  expect(world.io.err.join('')).toContain('STALE_CANONICAL_CONTEXT');
  expect(world.io.files.has('proposal.json')).toBe(false);
});

it.each(['missing', 'changed', 'wrong-height', 'same-height-conflict'] as const)('final review rejects %s canonical timing context', async (condition) => {
  const world = paymentWorld();
  const send = world.io.rpcTransport.send.bind(world.io.rpcTransport);
  world.io.rpcTransport.send = async (...args) => {
    const response = await send(...args);
    const request = JSON.parse(args[1]) as { method: string };
    if (request.method !== 'eth_getBlockByNumber') return response;
    const value = JSON.parse(response) as { result: Record<string, unknown> };
    if (condition !== 'missing') value.result['timestamp'] = `0x${(condition === 'changed' ? NOW + 1 : NOW).toString(16)}`;
    if (condition === 'wrong-height') value.result['number'] = '0x65';
    return JSON.stringify(value);
  };
  const client = await createClient(requireEnabledChain(11155111), 'https://primary.example.test', { transport: world.io.rpcTransport });
  const records = [{ blockNumber: '100', blockHash: BLOCK, blockTimestamp: NOW.toString() }];
  if (condition === 'same-height-conflict') records.push({ ...records[0]!, blockTimestamp: (NOW + 1).toString() });
  await expect(freshCanonicalContext({ context: { client }, records, finalityDepth: 10 })).rejects.toMatchObject({ code: condition === 'wrong-height' ? 'RPC_FAILURE' : 'STALE_CANONICAL_CONTEXT' });
});
