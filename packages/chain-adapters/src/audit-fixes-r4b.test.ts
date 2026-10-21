import { encodeAbiParameters, keccak256 } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { createEvmAdapter } from './adapter.js';
import { loadDeployment, validateManifest } from './deployments.js';
import { FAKE, SEPOLIA, manifestJson, payment, recipient } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC, MAX_PLAUSIBLE_HEAD, fetchAnnouncements, type ScanCursor } from './logs.js';
import { verifyDeploymentOnChain } from './readback.js';
import { createClient, type RpcClient } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import type { Hex } from './types.js';

const bh = (n: number, fork = 0): Hex => `0x${(n + 1000 * fork).toString(16).padStart(64, '0')}`;
const word = (a: string): Hex => `0x${a.replace('0x', '').toLowerCase().padStart(64, '0')}`;
const { meta } = recipient();
const PAY = payment(meta);
const ephHex = (): Hex => `0x${Buffer.from(PAY.ephemeralPublicKey).toString('hex')}`;
const logAt = (block: number, hash: Hex = bh(block)): Record<string, unknown> => ({
  address: FAKE.announcer,
  topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(PAY.stealthAddress), word(FAKE.router)],
  data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [ephHex(), `0x${'ab'}${'00'.repeat(56)}`]),
  blockNumber: `0x${block.toString(16)}`,
  blockHash: hash,
  logIndex: '0x0',
});

interface Sim {
  head: number | bigint;
  forkFrom: number;
  fork: boolean;
  logs: Record<string, unknown>[];
  nullBlocks?: Set<number>;
  level?: number;
  onGetLogs?: (n: number) => void;
}
async function simClient(sim: Sim): Promise<RpcClient> {
  let getLogsCalls = 0;
  const t = fakeTransport((m, p) => {
    if (m === 'eth_chainId') return '0xaa36a7';
    if (m === 'eth_blockNumber') return `0x${sim.head.toString(16)}`;
    if (m === 'eth_getBlockByNumber') {
      const n = Number(BigInt(p[0] as string));
      if (BigInt(n) > BigInt(sim.head) || sim.nullBlocks?.has(n) === true) return null;
      return { number: p[0], hash: bh(n, sim.fork && n >= sim.forkFrom ? (sim.level ?? 1) : 0), parentHash: bh(Math.max(0, n - 1)) };
    }
    if (m === 'eth_getLogs') {
      const f = p[0] as { fromBlock: string; toBlock: string };
      const from = BigInt(f.fromBlock);
      const to = BigInt(f.toBlock);
      sim.onGetLogs?.(++getLogsCalls);
      return sim.logs.filter((l) => BigInt(l['blockNumber'] as string) >= from && BigInt(l['blockNumber'] as string) <= to);
    }
    return null;
  });
  return createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, sleep: noSleep, retries: 0 });
}
const CHAIN = { ...SEPOLIA, getLogsMaxRange: 10, finalityDepth: 2 };
const run = async (sim: Sim, extra: Record<string, unknown> = {}, cursor: ScanCursor = { nextBlock: 0n }) =>
  fetchAnnouncements({ chain: CHAIN, client: await simClient(sim), announcer: FAKE.announcer, cursor, ...extra });
const stable = (head: number, logs: Record<string, unknown>[] = []): Sim => ({ head, forkFrom: 0, fork: false, logs });

describe('item 1: hostile head', () => {
  it('rejects an absurdly high head (2^200) before issuing any getLogs', async () => {
    await expect(run({ ...stable(0), head: 1n << 200n })).rejects.toThrow(/implausible chain head/);
    await expect(run({ ...stable(0), head: MAX_PLAUSIBLE_HEAD + 1n })).rejects.toThrow(/implausible chain head/);
  });
  it('accepts a head at the plausibility bound', async () => {
    const sim = { ...stable(0), head: MAX_PLAUSIBLE_HEAD };
    const r = await run(sim, { maxRequests: 1 }, { nextBlock: MAX_PLAUSIBLE_HEAD - 3n });
    expect(r.truncated).toBe(false);
  });
  it('rejects a head that moved behind the verified checkpoint', async () => {
    const sim = stable(30);
    const first = await run(sim);
    const back = stable(20);
    // checkpoint block 30 now unknown to the lower chain => treated as reorg, never a silent "nothing to do"
    const r = await run(back, {}, first.cursor);
    expect(r.reorg).toBeDefined();
    // a provider that still knows the checkpoint hash but reports a lower head contradicts itself
    const liar = await simClient(stable(30));
    const lying: RpcClient = { ...liar, blockNumber: () => Promise.resolve(20n) };
    await expect(fetchAnnouncements({ chain: CHAIN, client: lying, announcer: FAKE.announcer, cursor: first.cursor })).rejects.toThrow(/behind the verified checkpoint/);
  });
  it('fails closed when the head block itself is unavailable', async () => {
    await expect(run({ ...stable(15), nullBlocks: new Set([15]) })).rejects.toThrow(/head block unavailable/);
  });
});

describe('item 2 (S3-14): log blockHash cross-check', () => {
  const forged = (): Sim => stable(30, [logAt(5, bh(5, 7))]);
  it('default (off) keeps the previous behaviour', async () => {
    expect((await run(forged())).announcements).toHaveLength(1);
  });
  it('rejects a log whose blockHash is not the canonical hash of its block', async () => {
    await expect(run(forged(), { verifyLogBlocks: true })).rejects.toThrow(/log block hash differs/);
  });
  it('accepts consistent logs (also in a window-end block) and rejects a vanished block', async () => {
    const ok = await run(stable(30, [logAt(5), logAt(9), logAt(30)]), { verifyLogBlocks: true });
    expect(ok.announcements).toHaveLength(3);
    await expect(run({ ...stable(30, [logAt(5)]), nullBlocks: new Set([5]) }, { verifyLogBlocks: true })).rejects.toThrow(/log block unavailable/);
  });
  it('createEvmAdapter forwards verifyLogBlocks to scan', async () => {
    const deployment = validateManifest(manifestJson(), 11155111);
    const sim = stable(12, [logAt(5, bh(5, 7))]);
    const client = await simClient(sim);
    const keys = { viewingSecret: new Uint8Array(32) } as never;
    const adapter = createEvmAdapter({ chain: SEPOLIA, deployment, client, verifyLogBlocks: true });
    await expect(
      (async () => {
        for await (const x of adapter.scan({ fromBlock: 0n }, keys, new AbortController().signal)) void x;
      })(),
    ).rejects.toThrow(/log block hash differs/);
  });
});

describe('item 1: reorg deeper than finalityDepth (opt-in checkpoint history)', () => {
  const scanned = async (historySize?: number) => {
    const extra = historySize === undefined ? {} : { historySize };
    return { first: await run(stable(39), extra), extra };
  };
  it('without history a 25-block reorg is only rolled back by finalityDepth (documented limit)', async () => {
    const { first } = await scanned();
    expect(first.cursor.history).toBeUndefined();
    const r = await run({ head: 45, forkFrom: 14, fork: true, logs: [] }, {}, first.cursor);
    expect(r.reorg).toEqual({ rolledBackTo: 38n });
  });
  it('with history the cursor rewinds to the newest checkpoint that is still canonical', async () => {
    const { first, extra } = await scanned(8);
    expect(first.cursor.last?.number).toBe(39n);
    expect(first.cursor.history?.map((c) => c.number)).toEqual([9n, 19n, 29n]);
    const r = await run({ head: 45, forkFrom: 14, fork: true, logs: [logAt(15)] }, extra, first.cursor);
    expect(r.reorg).toEqual({ rolledBackTo: 10n });
    expect(r.cursor.last?.number).toBe(45n);
  });
  it('a shallow reorg still rolls back by finalityDepth only when history agrees', async () => {
    const { first, extra } = await scanned(8);
    const r = await run({ head: 45, forkFrom: 39, fork: true, logs: [] }, extra, first.cursor);
    expect(r.reorg).toEqual({ rolledBackTo: 30n });
  });
  it('when no checkpoint is canonical it rewinds below the oldest one', async () => {
    const { first, extra } = await scanned(8);
    const r = await run({ head: 45, forkFrom: 0, fork: true, logs: [] }, extra, first.cursor);
    expect(r.reorg).toEqual({ rolledBackTo: 8n });
    expect(r.cursor.nextBlock).toBe(46n);
  });
  it('an unchanged chain reports no reorg and keeps extending the history (bounded)', async () => {
    const { first, extra } = await scanned(2);
    expect(first.cursor.history?.map((c) => c.number)).toEqual([19n, 29n]);
    const second = await run(stable(60), extra, first.cursor);
    expect(second.reorg).toBeUndefined();
    expect(second.cursor.history?.length).toBe(2);
    expect(second.cursor.history?.every((c) => c.number < (second.cursor.last as { number: bigint }).number)).toBe(true);
  });
  it('a reorg inside a truncated multi-window scan keeps the checkpoints below the affected window', async () => {
    const sim: Sim = stable(60);
    const client = await simClient(sim);
    let calls = 0;
    const flaky: RpcClient = {
      ...client,
      getLogs: async (f) => {
        calls++;
        if (calls === 2) { sim.fork = true; sim.forkFrom = 12; }
        return client.getLogs(f);
      },
    };
    const r = await fetchAnnouncements({ chain: CHAIN, client: flaky, announcer: FAKE.announcer, cursor: { nextBlock: 0n }, maxRequests: 2, historySize: 4 });
    expect(r.reorg).toEqual({ rolledBackTo: 10n });
    expect(r.cursor.last).toEqual({ number: 9n, hash: bh(9) });
  });
  it('uses the finalityDepth rollback when it is deeper than the matching checkpoint', async () => {
    const h = { number: 38n, hash: bh(38) };
    const cur: ScanCursor = { nextBlock: 40n, last: { number: 39n, hash: bh(39) }, history: [h] };
    const r = await run({ head: 45, forkFrom: 39, fork: true, logs: [] }, { historySize: 4 }, cur);
    expect(r.reorg).toEqual({ rolledBackTo: 38n });
  });
  it('keeps the history when there is nothing new to scan', async () => {
    const { first, extra } = await scanned(8);
    const again = await run(stable(39), extra, first.cursor);
    expect(again.cursor).toEqual(first.cursor);
  });
  it('a reorg found on resume that moves again during the scan restarts from the resume rollback point', async () => {
    const { first, extra } = await scanned(8);
    const sim: Sim = { head: 45, forkFrom: 30, fork: true, logs: [], onGetLogs: () => { sim.level = 2; } };
    // first call: fork level 1 at resume (checkpoints 39 and 29 mismatch? 29 < 30 matches), then level 2 mid-scan
    const r = await run(sim, { ...extra, toBlock: 40n }, first.cursor);
    expect(r.reorg).toEqual({ rolledBackTo: 30n });
    expect(r.cursor.nextBlock).toBe(30n);
    expect(r.truncated).toBe(true);
  });
  it('fails closed when a window boundary block is unavailable', async () => {
    await expect(run({ ...stable(30), nullBlocks: new Set([9]) })).rejects.toThrow(/window boundary block unavailable/);
  });
  it('clamps invalid historySize to off', async () => {
    const r = await run(stable(39), { historySize: Number.NaN });
    expect(r.cursor.history).toBeUndefined();
  });
});

describe('item 3: manifest signature hook (off by default)', () => {
  const text = (sig?: string): string => JSON.stringify({ ...manifestJson(), ...(sig === undefined ? {} : { signature: sig }) });
  it('default: signature carried, never verified (unchanged)', () => {
    expect(loadDeployment(text('0x00'), 11155111).signature).toBe('0x00');
  });
  it('hook receives the validated manifest and signature; true accepts', () => {
    let seen: unknown;
    const m = loadDeployment(text('0xabcd'), 11155111, { verifySignature: (mm, s) => { seen = [mm.router, s]; return true; } });
    expect(seen).toEqual([FAKE.router, '0xabcd']);
    expect(m.chainId).toBe(11155111);
  });
  it('rejects a missing signature, a false/non-boolean result and a throwing hook', () => {
    expect(() => loadDeployment(text(), 11155111, { verifySignature: () => true })).toThrow(/signature: not verified/);
    expect(() => loadDeployment(text('0x01'), 11155111, { verifySignature: () => false })).toThrow(/INVALID_MANIFEST/);
    expect(() => loadDeployment(text('0x01'), 11155111, { verifySignature: (() => 1) as never })).toThrow(/INVALID_MANIFEST/);
    expect(() => loadDeployment(text('0x01'), 11155111, { verifySignature: () => { throw new Error('boom'); } })).toThrow(/INVALID_MANIFEST/);
  });
});

describe('item 3: on-chain read-back helper', () => {
  const ROUTER_CODE: Hex = '0x6080aa';
  const RELAYER_CODE: Hex = '0x6080bb';
  const mk = () => {
    const json = manifestJson();
    json['bytecodeHashes'] = { router: keccak256(ROUTER_CODE), sweepRelayer: keccak256(RELAYER_CODE) };
    return validateManifest(json, 11155111);
  };
  const pad = (a: string): string => `0x${'0'.repeat(24)}${a.slice(2).toLowerCase()}`;
  const num = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
  const node = async (over: Partial<Record<string, unknown>> = {}, calls: string[] = []): Promise<RpcClient> => {
    const code: Record<string, string> = {
      [FAKE.router.toLowerCase()]: ROUTER_CODE,
      [FAKE.relayer.toLowerCase()]: RELAYER_CODE,
      [FAKE.announcer.toLowerCase()]: '0x60ff',
    };
    const t = fakeTransport((m, p) => {
      calls.push(m);
      if (m === 'eth_chainId') return '0xaa36a7';
      if (m in over) return typeof over[m] === 'function' ? (over[m] as (p: unknown[]) => unknown)(p) : over[m];
      if (m === 'eth_getCode') return code[(p[0] as string).toLowerCase()] ?? '0x';
      if (m === 'eth_call') {
        const data = (p[0] as { data: string }).data;
        if (data === keccak256(new TextEncoder().encode('FEE_RECIPIENT()')).slice(0, 10)) return pad(FAKE.feeRecipient);
        if (data === keccak256(new TextEncoder().encode('ANNOUNCER()')).slice(0, 10)) return pad(FAKE.announcer);
        if (data === keccak256(new TextEncoder().encode('FEE_BPS()')).slice(0, 10)) return num(25);
      }
      return null;
    });
    return createClient(SEPOLIA, 'https://rpc.example.test', { transport: t, sleep: noSleep, retries: 0 });
  };
  it('accepts a matching deployment', async () => {
    await expect(verifyDeploymentOnChain(await node(), mk())).resolves.toBeUndefined();
  });
  it('accepts with an agreeing second endpoint and rejects a disagreeing one', async () => {
    await expect(verifyDeploymentOnChain(await node(), mk(), { secondary: await node() })).resolves.toBeUndefined();
    const other = await node({ eth_getCode: '0x6080cc' });
    await expect(verifyDeploymentOnChain(await node(), mk(), { secondary: other })).rejects.toThrow(/providers disagree/);
  });
  it('rejects different code, missing code, and getter mismatches', async () => {
    await expect(verifyDeploymentOnChain(await node({ eth_getCode: '0x6080cc' }), mk())).rejects.toThrow(/code hash differs/);
    await expect(verifyDeploymentOnChain(await node({ eth_getCode: '0x' }), mk())).rejects.toThrow(/no code at address/);
    const m = mk();
    const wrongBps = await node({ eth_call: num(30) });
    await expect(verifyDeploymentOnChain(wrongBps, m)).rejects.toThrow(/FEE_RECIPIENT differs/);
  });
  it('rejects each getter mismatch and an announcer without code', async () => {
    const sel = (sig: string): string => keccak256(new TextEncoder().encode(sig)).slice(0, 10);
    const calls = (answers: Record<string, string>) => (p: unknown[]): string => answers[(p[0] as { data: string }).data] ?? '0x';
    const good = { [sel('FEE_RECIPIENT()')]: pad(FAKE.feeRecipient), [sel('ANNOUNCER()')]: pad(FAKE.announcer), [sel('FEE_BPS()')]: num(25) };
    await expect(verifyDeploymentOnChain(await node({ eth_call: calls({ ...good, [sel('ANNOUNCER()')]: pad(FAKE.router) }) }), mk())).rejects.toThrow(/ANNOUNCER differs/);
    await expect(verifyDeploymentOnChain(await node({ eth_call: calls({ ...good, [sel('FEE_BPS()')]: num(30) }) }), mk())).rejects.toThrow(/FEE_BPS differs/);
    await expect(verifyDeploymentOnChain(await node({ eth_call: calls(good) }), mk())).resolves.toBeUndefined();
    const noAnnouncer = await node({ eth_getCode: (p: unknown[]) => ((p[0] as string).toLowerCase() === FAKE.announcer.toLowerCase() ? '0x' : (p[0] as string).toLowerCase() === FAKE.router.toLowerCase() ? ROUTER_CODE : RELAYER_CODE) });
    await expect(verifyDeploymentOnChain(noAnnouncer, mk())).rejects.toThrow(/announcer: no code/);
  });
  it('checks policy implementation and factory code hashes when the manifest has a policy', async () => {
    const IMPL = '0x0000000000000000000000000000000000000e55';
    const FACT = '0x0000000000000000000000000000000000000f66';
    const TOK = '0x0000000000000000000000000000000000000a77';
    const REC = '0x0000000000000000000000000000000000000b88';
    const implCode: Hex = '0x6080dd';
    const factCode: Hex = '0x6080ee';
    const json = manifestJson();
    json['bytecodeHashes'] = { router: keccak256(ROUTER_CODE), sweepRelayer: keccak256(RELAYER_CODE), policyImplementation: keccak256(implCode), policyFactory: keccak256(factCode) };
    json['deployTx'] = { router: `0x${'1'.repeat(64)}`, sweepRelayer: `0x${'2'.repeat(64)}`, policyImplementation: `0x${'5'.repeat(64)}`, policyFactory: `0x${'6'.repeat(64)}` };
    Object.assign(json, { policyImplementation: IMPL, policyFactory: FACT, policyFeeToken: TOK, policyFlatFee: '1000', policyFeeRecipient: REC });
    const m = validateManifest(json, 11155111);
    expect(m.policy).toBeDefined();
    const sel = (sig: string): string => keccak256(new TextEncoder().encode(sig)).slice(0, 10);
    const answers: Record<string, string> = { [sel('FEE_RECIPIENT()')]: pad(FAKE.feeRecipient), [sel('ANNOUNCER()')]: pad(FAKE.announcer), [sel('FEE_BPS()')]: num(25) };
    const codes = (impl: Hex) => (p: unknown[]): string => {
      const a = (p[0] as string).toLowerCase();
      if (a === FAKE.router.toLowerCase()) return ROUTER_CODE;
      if (a === FAKE.relayer.toLowerCase()) return RELAYER_CODE;
      if (a === FAKE.announcer.toLowerCase()) return '0x60ff';
      if (a === IMPL.toLowerCase()) return impl;
      return a === FACT.toLowerCase() ? factCode : '0x';
    };
    const eth_call = (p: unknown[]): string => answers[(p[0] as { data: string }).data] ?? '0x';
    await expect(verifyDeploymentOnChain(await node({ eth_getCode: codes(implCode), eth_call }), m)).resolves.toBeUndefined();
    await expect(verifyDeploymentOnChain(await node({ eth_getCode: codes('0x6080ff'), eth_call }), m)).rejects.toThrow(/policyImplementation: code hash differs/);
  });
  it('rejects malformed node answers and chain mismatches', async () => {
    await expect(verifyDeploymentOnChain(await node({ eth_getCode: 5 }), mk())).rejects.toThrow(/malformed eth_getCode/);
    const badCall = await node({ eth_call: '0x12' });
    await expect(verifyDeploymentOnChain(badCall, mk())).rejects.toThrow(/malformed eth_call/);
    const other = { ...(await node()), chainId: 1 } as RpcClient;
    await expect(verifyDeploymentOnChain(other, mk())).rejects.toThrow(/CHAIN_MISMATCH/);
    await expect(verifyDeploymentOnChain(await node(), mk(), { secondary: other })).rejects.toThrow(/CHAIN_MISMATCH/);
  });
});
