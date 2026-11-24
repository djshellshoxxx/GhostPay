import { expect, it } from 'vitest';
import { decodeAbiParameters, decodeFunctionData, encodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { ghostPayRouterAbi, type Hex } from '@ghostpay/chain-adapters';
import { buildNativeMetadata } from '@ghostpay/core-crypto';
import { run } from './run.js';
import { stdoutJson } from './fixtures.testutil.js';
import { TX } from './payment-fixtures.testutil.js';
import { reconciliationWorld, RECON_CREDS, RECON_LIVE } from './reconciliation-fixtures.testutil.js';

/*
 * F1 on the CLI reconcile path (2026-11-11). A front-runner can copy the one-time address S and ephemeral key E from a
 * pending router payment and post its own 1-wei router payment with the same (S, E). Both are separate router payments
 * with their own transaction, log and evidence. `reconcile propose` must accept a current context holding both, and the
 * genuine payment must still get its exact invoice proposal. Before the fix the whole batch failed DUPLICATE_OBSERVATION.
 */
const FRONT_TX: Hex = `0x${'ac'.repeat(32)}`;

async function frontRunWorld() {
  const w = await reconciliationWorld();
  const log = w.current.log as Record<string, unknown>;
  const genuineTx = w.state.tx as Record<string, unknown>;
  const genuineReceipt = w.state.receipt;
  const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], log['data'] as Hex);
  const args = decodeFunctionData({ abi: ghostPayRouterAbi, data: genuineTx['input'] as Hex }).args as readonly unknown[];
  const viewTag = Number.parseInt(metadata.slice(2, 4), 16);
  const dustMeta: Hex = `0x${Buffer.from(buildNativeMetadata(viewTag, 1n)).toString('hex')}`;
  const frontLog = { ...log, transactionHash: FRONT_TX, logIndex: '0x2', data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [ephemeral, dustMeta]) };
  const common = { blockHash: log['blockHash'], blockNumber: log['blockNumber'], from: '0x3333333333333333333333333333333333333333', to: genuineTx['to'], transactionIndex: '0x0' };
  const frontReceipt = { ...common, status: '0x1', transactionHash: FRONT_TX, logs: [frontLog] };
  const frontTx = {
    ...common, hash: FRONT_TX, value: '0x1',
    input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payNative', args: [args[0], 1n, args[2], ephemeral, dustMeta] as never }),
  };
  // The fixture RPC serves one receipt/transaction; answer per requested hash.
  const send = w.io.rpcTransport.send.bind(w.io.rpcTransport);
  w.io.rpcTransport.send = async (url, body, init) => {
    const request = JSON.parse(body) as { method: string; params: unknown[] };
    if (request.method === 'eth_getTransactionReceipt' || request.method === 'eth_getTransactionByHash') {
      const front = String(request.params[0]).toLowerCase() === FRONT_TX;
      w.state.receipt = front ? frontReceipt : genuineReceipt;
      w.state.tx = front ? frontTx : genuineTx;
    }
    return send(url, body, init);
  };
  w.state.logs = [frontLog, log];
  const front = { ...w.current, log: frontLog, expected: { ...(w.current.expected as Record<string, unknown>), amount: '1' } };
  return { w, front };
}

it('F1: accepts a front-run and the genuine router observation for one (S, E); the genuine payment keeps its exact proposal', async () => {
  const { w, front } = await frontRunWorld();
  w.io.files.set('current.json', JSON.stringify({ version: 1, observations: [front, w.current] }));
  const code = await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--out', 'proposal.json', '--json'], w.io);
  expect(w.io.err.join('')).not.toContain('DUPLICATE_OBSERVATION');
  expect(code).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ ok: true });
  const proposal = w.io.files.get('proposal.json');
  expect(proposal).toBeDefined();
  expect(proposal).toContain(w.recordId);
  expect(w.recordId.toLowerCase()).toContain(TX.toLowerCase());
});

it('F1: still refuses the exact same router observation supplied twice', async () => {
  const { w } = await frontRunWorld();
  w.io.files.set('current.json', JSON.stringify({ version: 1, observations: [w.current, w.current] }));
  const code = await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--out', 'proposal.json', '--json'], w.io);
  expect(code).toBe(1);
  expect(w.io.err.join('')).toContain('DUPLICATE_OBSERVATION');
});
