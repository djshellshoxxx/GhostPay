import { expect, it } from 'vitest';
import { createReconciliationApi, type ReconciliationRecord } from '@ghostpay/ux-vault/portable';
import { run } from './run.js';
import { MemoryReconciliationStore } from './backup-data.js';
import { makeIo, stdoutJson, NOW } from './fixtures.testutil.js';
it('lists authenticated historical records without asserting present chain settlement', async () => {
  const api = createReconciliationApi();
  const vault = new api.ReconciliationVault(new MemoryReconciliationStore(), { chainId: 8453, sellerKeyId: 'ab'.repeat(32) }, () => undefined);
  await vault.unlock(new Uint8Array(32).fill(1));
  const data = await vault.exportEncrypted(); vault.lock();
  const io = makeIo({ state: data, key: '01'.repeat(32) });
  expect(await run(['history', 'list', '--in', 'state', '--viewing-key-file', 'key', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ ok: true, records: [], currentChainVerified: false });
});

async function historyFixture() {
  const api = createReconciliationApi();
  const scope = { chainId: 11155111, sellerKeyId: 'ab'.repeat(32) };
  const vault = new api.ReconciliationVault(new MemoryReconciliationStore(), scope, () => undefined);
  await vault.unlock(new Uint8Array(32).fill(1));
  const base = { version: 1, ...scope, transactionHash: '0x' + 'cd'.repeat(32), blockHash: '0x' + 'ef'.repeat(32), blockNumber: '100', stealthAddress: '0x' + '12'.repeat(20), logIndex: 1, asset: 'native', amountMinorUnits: '42', viewTagMatched: true, recordedAt: NOW * 1000, evidenceStatus: 'verified-at-scan', evidenceSource: 'verified-router-scan' } as const;
  const first: ReconciliationRecord = { ...base, id: `${scope.sellerKeyId}:${scope.chainId}:${base.transactionHash}:${base.stealthAddress}:${base.blockHash}:1` };
  const second: ReconciliationRecord = { ...first, logIndex: 2, id: first.id.slice(0, -1) + '2' };
  await vault.save(first); await vault.save(second);
  const data = await vault.exportEncrypted(); vault.lock();
  return { first, second, io: makeIo({ state: data, key: '01'.repeat(32), wrong: '02'.repeat(32) }) };
}
it('filters and paginates local records, exports a private report, and inspects exact references', async () => {
  const { io, first, second } = await historyFixture();
  expect(await run(['history', 'list', '--in', 'state', '--viewing-key-file', 'key', '--query', 'native', '--offset', '1', '--limit', '1', '--out', 'report', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ total: 2, matched: 2, offset: 1, records: [expect.objectContaining({ id: second.id, provenance: 'live-scan' })], currentChainVerified: false });
  expect(JSON.parse(io.files.get('report')!)).toEqual(stdoutJson(io));
  io.out.length = 0;
  expect(await run(['history', 'inspect', '--in', 'state', '--viewing-key-file', 'key', '--record', first.id, '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ currentChainVerified: false, record: { blockHash: first.blockHash, transactionHash: first.transactionHash, logIndex: first.logIndex } });
  io.out.length = 0;
  expect(await run(['reconcile', 'inspect', '--in', 'state', '--viewing-key-file', 'key', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({ records: 2, competingObservations: [[first.id, second.id]], currentChainVerified: false });
});
it('fails closed on missing records and wrong viewing keys without reporting stored observations', async () => {
  for (const [key, id, code] of [['key', 'absent', 'RECORD_NOT_FOUND'], ['wrong', 'absent', 'BACKUP_AUTHENTICATION_FAILED']]) {
    const { io, first } = await historyFixture();
    expect(await run(['history', 'inspect', '--in', 'state', '--viewing-key-file', key!, '--record', id!, '--json'], io)).toBe(1);
    expect(JSON.parse(io.err.join(''))).toMatchObject({ error: { code } });
    expect(io.out.join('')).not.toContain(first.transactionHash);
  }
});
it('refuses other archive formats and invalid pagination before exposing history', async () => {
  const bytes = new Uint8Array(52); bytes.set(new TextEncoder().encode('GPA1')); bytes.set([1, 17, 8, 1], 4);
  const io = Object.assign(makeIo(), { readBinaryFile: () => Promise.resolve(bytes) });
  expect(await run(['history', 'list', '--in', 'archive', '--json'], io)).toBe(5);
  expect(io.out).toHaveLength(0);
  for (const value of ['0', '2001', '-1', '1.5']) expect(await run(['history', 'list', '--in', 'archive', '--limit', value], io)).toBe(2);
});
