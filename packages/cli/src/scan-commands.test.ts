import { describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { encodeAbiParameters } from 'viem/utils';
import { buildNativeMetadata, deriveStealthPayment, encodeMetaAddress, parseCompressedPoint } from '@ghostpay/core-crypto';
import { type Hex } from '@ghostpay/chain-adapters';
import { scanCommands } from './commands/scan.js';
import { parseArgs } from './args.js';
import { Ctx } from './ctx.js';
import { counterRandom, G, G2, KEY_HEX, makeIo, stdoutJson, type TestIo } from './fixtures.testutil.js';
import { BLOCK, observation, pad, paymentWorld, PIN, rawLog } from './payment-fixtures.testutil.js';
import { parseScanReport, serializeScanReport, type ScanReport } from './scan-report.js';

const RUN_ARGS = ['--chain', '11155111', '--from-block', '100', '--to-block', '199', '--manifest', 'manifest.json', '--manifest-digest', PIN,
  '--online', '--rpc-file', 'rpc.txt', '--view-key-file', 'view.key', '--spend-public-file', 'spend.pub', '--out', 'scan.json'];

async function execute(name: string, io: TestIo, argv: readonly string[]): Promise<number> {
  const c = scanCommands.find((command) => command.path.join(' ') === name)!;
  return c.handler(new Ctx(io, true), parseArgs(argv, c.opts));
}

function scanWorld() {
  const world = paymentWorld();
  world.io.files.set('view.key', KEY_HEX);
  world.io.files.set('spend.pub', G2);
  const meta = encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(Buffer.from(G2, 'hex')),
    viewingPublicKey: parseCompressedPoint(secp256k1.getPublicKey(Buffer.from(KEY_HEX, 'hex'), true)) });
  const pay = deriveStealthPayment(meta, counterRandom());
  const metadata: Hex = `0x${Buffer.from(buildNativeMetadata(pay.viewTag, 100n)).toString('hex')}`;
  const log = { ...rawLog(), topics: [...(rawLog()['topics'] as Hex[]).slice(0, 2), pad(pay.stealthAddress), (rawLog()['topics'] as Hex[])[3]!],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${Buffer.from(pay.ephemeralPublicKey).toString('hex')}`, metadata]) };
  world.state.logs = [log];
  return { ...world, pay, log, metadata };
}

describe('bounded privacy scanning', () => {
  it('keeps an authenticated zero-progress cursor when the requested range is ahead of the current head', async () => {
    const { io, state } = scanWorld();
    state.head = '0x63';
    expect(await execute('scan run', io, RUN_ARGS)).toBe(0);
    const report = parseScanReport(io.files.get('scan.json')!, Buffer.from(KEY_HEX, 'hex'));
    expect(report).toMatchObject({ cursor: { nextBlock: '100' }, complete: false, observations: [] });
    expect(report.cursor.last).toBeUndefined();
    state.head = '0xc8';
    expect(await execute('scan run', io, [...RUN_ARGS.map((v) => v === 'scan.json' ? 'resumed.json' : v), '--resume', 'scan.json'])).toBe(0);
  });

  it.each([
    ['format', 'another-format'], ['version', 2], ['chainId', '11155111'], ['chainId', -1],
    ['manifestDigest', 'aa'], ['scopeDigest', 'bb'], ['deep', 'false'], ['complete', 1], ['createdAt', 0],
    ['skipped', -1], ['skipped', '1'], ['duplicates', -1], ['duplicates', 0.1], ['authentication', 'bad'],
    ['fromBlock', '01'], ['fromBlock', '200'], ['toBlock', '10100'], ['cursor', { nextBlock: '99' }],
    ['cursor', { nextBlock: '201' }], ['cursor', { nextBlock: '200' }],
    ['cursor', { nextBlock: '200', last: { number: '198', hash: BLOCK } }],
    ['cursor', { nextBlock: '200', last: { number: '199', hash: '0x00' } }],
    ['routerOnlyBlocks', ['99']], ['routerOnlyBlocks', ['200']], ['routerOnlyBlocks', null],
    ['routerOnlyBlocks', Array.from({ length: 257 }, () => '100')], ['observations', null],
    ['observations', Array.from({ length: 257 }, observation)], ['secretKey', KEY_HEX],
  ])('rejects malformed imported scan %s without querying a provider', async (field, value) => {
    const { io, calls } = scanWorld();
    await execute('scan run', io, RUN_ARGS);
    const report = JSON.parse(io.files.get('scan.json')!) as Record<string, unknown>;
    report[field] = value;
    io.files.set('bad.json', JSON.stringify(report));
    calls.length = 0; io.out.length = 0;
    await expect(execute('scan inspect', io, ['--in', 'bad.json'])).rejects.toMatchObject({ exitCode: field === 'format' || field === 'version' ? 5 : 1 });
    expect(calls).toHaveLength(0);
    expect(io.out).toHaveLength(0);
  });

  it.each(['duplicate', 'chain', 'range', 'completion'] as const)('rejects inconsistent %s facts in imported reports', async (which) => {
    const { io, calls } = scanWorld();
    await execute('scan run', io, RUN_ARGS);
    const report = JSON.parse(io.files.get('scan.json')!) as Record<string, unknown>;
    if (which === 'duplicate') report['observations'] = [observation(), observation()];
    if (which === 'chain') report['observations'] = [{ ...observation(), chainId: 84532 }];
    if (which === 'range') report['observations'] = [{ ...observation(), log: { ...rawLog(), blockNumber: '0x63' } }];
    if (which === 'completion') report['complete'] = false;
    io.files.set('bad.json', JSON.stringify(report));
    calls.length = 0;
    await expect(execute('scan inspect', io, ['--in', 'bad.json'])).rejects.toMatchObject({ code: 'INVALID_SCAN_REPORT' });
    expect(calls).toHaveLength(0);
  });

  it('rejects any modification to a valid authenticated report, including public observation content', async () => {
    const { io } = scanWorld();
    await execute('scan run', io, RUN_ARGS);
    const report = parseScanReport(io.files.get('scan.json')!, Buffer.from(KEY_HEX, 'hex'));
    const altered: ScanReport = { ...report, skipped: report.skipped + 1 };
    const encoded = serializeScanReport(altered, Buffer.from(`${'00'.repeat(31)}08`, 'hex'));
    io.files.set('wrong-key.json', encoded);
    await expect(execute('scan inspect', io, ['--in', 'wrong-key.json', '--view-key-file', 'view.key'])).rejects.toMatchObject({ code: 'SCAN_AUTHENTICATION_FAILED' });
  });
  it('previews the public range and strict budgets offline without viewing secrets', async () => {
    const io = makeIo();
    expect(await execute('scan plan', io, ['--chain', '11155111', '--from-block', '100', '--to-block', '199'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, networkUsed: false, blocks: '100', maxLogRequests: 50, maxLogs: 128, paymentVerified: false });
  });

  it('performs a bounded public-range scan, keeps the view key local, and atomically saves a private resumable report', async () => {
    const { io, state, calls } = paymentWorld();
    state.logs = [];
    io.files.set('view.key', KEY_HEX);
    io.files.set('spend.pub', G2);
    expect(await execute('scan run', io, RUN_ARGS)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, complete: true, matches: 0, paymentVerified: false });
    expect(io.out.join('')).not.toContain(KEY_HEX);
    expect(JSON.stringify(calls)).not.toContain(KEY_HEX);
    const report = JSON.parse(io.files.get('scan.json')!) as Record<string, unknown>;
    expect(report).toMatchObject({ format: 'ghostpay-cli-scan', version: 1, chainId: 11155111,
      cursor: { nextBlock: '200', last: { number: '199' } }, observations: [], complete: true });
    expect(io.files.get('scan.json')).not.toContain(KEY_HEX);
  });

  it('inspects saved report structure without treating its cursor MAC or observations as verified', async () => {
    const { io, state } = paymentWorld();
    state.logs = [];
    io.files.set('view.key', KEY_HEX);
    io.files.set('spend.pub', G2);
    await execute('scan run', io, RUN_ARGS);
    io.out.length = 0;
    expect(await execute('scan inspect', io, ['--in', 'scan.json'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, authenticationVerified: false, paymentVerified: false, observations: 0 });
    expect(io.out.join('')).not.toContain('scopeDigest');
  });

  it('finds real ECDH matches, collapses replayed claims, and writes parseable public observations', async () => {
    const { io, state, log, pay, calls } = scanWorld();
    // A third-party (non-router) replay of the same one-time address and ephemeral key folds onto the router record.
    const topics = log['topics'];
    const replay = { ...log, logIndex: '0x5', topics: [topics[0]!, topics[1]!, topics[2]!, pad(`0x${'77'.repeat(20)}`)] };
    state.logs = [log, replay];
    expect(await execute('scan run', io, RUN_ARGS)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ matches: 1, duplicates: 1, paymentVerified: false });
    expect(io.out.join('')).not.toContain(pay.stealthAddress);
    const report = parseScanReport(io.files.get('scan.json')!, Buffer.from(KEY_HEX, 'hex'));
    expect(report.observations).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain(pay.stealthAddress);
    io.out.length = 0;
    expect(await execute('scan inspect', io, ['--in', 'scan.json', '--view-key-file', 'view.key'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ authenticationVerified: true, observations: 1, paymentVerified: false });
  });

  it('F1: keeps every router announcement for one address and ephemeral key, so a front-run cannot hide a payment', async () => {
    const { io, state, log } = scanWorld();
    state.logs = [log, { ...log, logIndex: '0x5' }];
    expect(await execute('scan run', io, RUN_ARGS)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ matches: 2, duplicates: 0, paymentVerified: false });
    const report = parseScanReport(io.files.get('scan.json')!, Buffer.from(KEY_HEX, 'hex'));
    expect(report.observations).toHaveLength(2);
  });

  it('requires explicit deep mode to find router announcements with a wrong view tag', async () => {
    const { io, state, log, pay } = scanWorld();
    const wrong: Hex = `0x${Buffer.from(buildNativeMetadata((pay.viewTag[0]! + 1) & 255, 100n)).toString('hex')}`;
    state.logs = [{ ...log, data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${Buffer.from(pay.ephemeralPublicKey).toString('hex')}`, wrong]) }];
    expect(await execute('scan run', io, RUN_ARGS)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ matches: 0 });
    io.out.length = 0;
    expect(await execute('scan run', io, [...RUN_ARGS.map((v) => v === 'scan.json' ? 'deep.json' : v), '--deep'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ matches: 1 });
  });

  it('resumes a scoped authenticated cursor, rechecks its checkpoint and never overwrites earlier results', async () => {
    const { io, state, calls } = scanWorld();
    state.head = '0x96';
    expect(await execute('scan run', io, RUN_ARGS)).toBe(0);
    const original = io.files.get('scan.json')!;
    expect(stdoutJson(io)).toMatchObject({ complete: false, matches: 1 });
    state.head = '0xc8';
    calls.length = 0; io.out.length = 0;
    const args = [...RUN_ARGS.map((v) => v === 'scan.json' ? 'resumed.json' : v), '--resume', 'scan.json', '--secondary-rpc-file', 'secondary.txt'];
    expect(await execute('scan run', io, args)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ complete: true, matches: 0 });
    expect(io.files.get('scan.json')).toBe(original);
    const ranges = calls.filter((call) => call.method === 'eth_getLogs').map((call) => call.params[0] as { fromBlock: string });
    expect(ranges.every((value) => value.fromBlock === '0x97')).toBe(true);
    await expect(execute('scan run', io, [...RUN_ARGS.map((v) => v === 'scan.json' ? 'again.json' : v), '--resume', 'resumed.json'])).rejects.toMatchObject({ code: 'SCAN_COMPLETE' });
  });

  it('authenticates a resume cursor before any network request, including consistent cursor tampering', async () => {
    const { io, state, calls } = scanWorld();
    state.head = '0x96';
    await execute('scan run', io, RUN_ARGS);
    const tampered = JSON.parse(io.files.get('scan.json')!) as Record<string, unknown>;
    tampered['cursor'] = { nextBlock: '175', last: { number: '174', hash: BLOCK } };
    io.files.set('bad.json', JSON.stringify(tampered));
    calls.length = 0;
    await expect(execute('scan run', io, [...RUN_ARGS.map((v) => v === 'scan.json' ? 'new.json' : v), '--resume', 'bad.json'])).rejects.toMatchObject({ code: 'SCAN_AUTHENTICATION_FAILED' });
    expect(calls).toHaveLength(0);
    expect(io.files.has('new.json')).toBe(false);
  });

  it.each(['deep', 'spending-key', 'viewing-key', 'range'] as const)('rejects a cursor from a changed %s scope', async (change) => {
    const { io, state, calls } = scanWorld();
    state.head = '0x96';
    await execute('scan run', io, RUN_ARGS);
    calls.length = 0;
    const args = [...RUN_ARGS.map((v) => v === 'scan.json' ? 'new.json' : v), '--resume', 'scan.json'];
    if (change === 'deep') args.push('--deep');
    if (change === 'spending-key') io.files.set('spend.pub', G);
    if (change === 'viewing-key') io.files.set('view.key', `${'00'.repeat(31)}08`);
    if (change === 'range') args[args.indexOf('199')] = '198';
    await expect(execute('scan run', io, args)).rejects.toMatchObject({ code: change === 'viewing-key' ? 'SCAN_AUTHENTICATION_FAILED' : 'SCAN_SCOPE_MISMATCH' });
    expect(calls).toHaveLength(0);
  });

  it('stops on a reorganized prior checkpoint and preserves the original cursor', async () => {
    const { io, state } = scanWorld();
    state.head = '0x96';
    await execute('scan run', io, RUN_ARGS);
    const original = io.files.get('scan.json');
    state.head = '0xc8'; state.blockHash = `0x${'ee'.repeat(32)}`;
    await expect(execute('scan run', io, [...RUN_ARGS.map((v) => v === 'scan.json' ? 'new.json' : v), '--resume', 'scan.json'])).rejects.toMatchObject({ code: 'REORG_DETECTED' });
    expect(io.files.get('scan.json')).toBe(original);
    expect(io.files.has('new.json')).toBe(false);
  });

  it('does not publish when providers disagree or when a matched event omits its transaction hash', async () => {
    for (const which of ['provider', 'hash'] as const) {
      const { io, state, log } = scanWorld();
      if (which === 'provider') state.secondaryBlockHash = `0x${'ee'.repeat(32)}`;
      else { const broken = { ...log } as Record<string, unknown>; delete broken['transactionHash']; state.logs = [broken]; }
      const args = which === 'provider' ? [...RUN_ARGS, '--secondary-rpc-file', 'secondary.txt'] : RUN_ARGS;
      await expect(execute('scan run', io, args)).rejects.toMatchObject({ code: which === 'provider' ? 'PROVIDER_DISAGREEMENT' : 'INCOMPLETE_OBSERVATION' });
      expect(io.files.has('scan.json')).toBe(false);
    }
  });

  it('reports router-only spam lanes and withholds unsupported metadata as payment proof', async () => {
    const { io, state, log, pay } = scanWorld();
    const other = { ...log, logIndex: '0x5', topics: [...log.topics.slice(0, 3), pad('0x3333333333333333333333333333333333333333')] };
    const unknownLayout: Hex = `0x${pay.viewTag[0]!.toString(16).padStart(2, '0')}`;
    state.logs = [{ ...log, data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${Buffer.from(pay.ephemeralPublicKey).toString('hex')}`, unknownLayout]) }, other];
    expect(await execute('scan run', io, [...RUN_ARGS, '--max-logs', '1'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ matches: 1, routerOnlyBlocks: 1, paymentVerified: false });
  });

  it.each([
    ['--from-block', '200', 'SCAN_RANGE'], ['--to-block', '10100', 'SCAN_RANGE'],
    ['--max-logs', '257', 'BAD_NUMBER'], ['--max-logs', '0', 'BAD_NUMBER'],
  ])('enforces scan budget %s %s', async (option, value, code) => {
    const { io, calls } = scanWorld();
    const args = [...RUN_ARGS];
    const i = args.indexOf(option);
    if (i === -1) args.push(option, value); else args[i + 1] = value;
    await expect(execute('scan run', io, args)).rejects.toMatchObject({ code });
    expect(calls).toHaveLength(0);
  });

  it('refuses malformed public keys and preserves files after write failure', async () => {
    const { io } = scanWorld();
    io.files.set('spend.pub', 'nope');
    await expect(execute('scan run', io, RUN_ARGS)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    io.files.set('spend.pub', G2); io.failWrites = true;
    await expect(execute('scan run', io, RUN_ARGS)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect(io.files.has('scan.json')).toBe(false);
  });
});
