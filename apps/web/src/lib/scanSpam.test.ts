import { CHAINS, ChainAdapterError, type LogFilter, type RpcLog, type ScannedAnnouncement } from '@ghostpay/chain-adapters';
import { buildErc20Metadata } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { mockRpc } from '../test/mockRpc';
import {
  DEFAULT_SCAN_LANES, FLOOD_PER_BLOCK, PRIVACY_TRANSFER_MAX_LOGS, PRIVACY_TRANSFER_WINDOW_BLOCKS, SCAN_LANES_KEY, TRANSFER_TOPIC,
  anonymitySet, describeAnonymitySet, estimateSimilarTransfers, loadScanLanes, sanitizeScanLanes, saveScanLanes, splitLanes,
} from './scanSpam';

const chain = CHAINS.find((c) => c.chainId === 84532)!; // 2 s blocks: 7 days = 302,400 blocks
const ROUTER = '0x1111111111111111111111111111111111111111';
const META_OK = `0x${Array.from(buildErc20Metadata(0xaa, '0x036CbD53842c5426634e7929541eC2318f3dCF7e', 1_000_000n), (b) => b.toString(16).padStart(2, '0')).join('')}`; // 57 bytes

let n = 0;
function ann(o: { caller?: string; block?: number; eph?: string; metadata?: string } = {}): ScannedAnnouncement {
  n++;
  const block = BigInt(o.block ?? 10);
  return {
    schemeId: 1n,
    stealthAddress: `0x${n.toString(16).padStart(40, '0')}`,
    caller: (o.caller ?? '0x9999999999999999999999999999999999999999') as `0x${string}`,
    ephemeralPublicKey: (o.eph ?? `0x02${n.toString(16).padStart(64, '0')}`),
    metadata: (o.metadata ?? META_OK),
    blockNumber: block,
    blockHash: `0x${block.toString(16).padStart(64, '0')}`,
    logIndex: n,
    id: `x:${String(n)}`,
  };
}

describe('splitLanes', () => {
  it('puts router announcements in the trusted lane and keeps the rest, deprioritising suspected spam without dropping it', () => {
    const real = ann({ caller: ROUTER });
    const odd = ann({ metadata: '0xabcd' });
    const ok = ann();
    const dupA = ann({ eph: `0x02${'77'.repeat(32)}` });
    const dupB = ann({ eph: `0x02${'77'.repeat(32)}` });
    const s = splitLanes([odd, dupA, real, ok, dupB], ROUTER);
    expect(s.trusted).toEqual([real]);
    expect(s.open).toHaveLength(4);
    expect(s.open[0]).toBe(ok);
    expect(new Set(s.open.slice(1))).toEqual(new Set([odd, dupA, dupB]));
    expect(s.suspected).toBe(3);
  });

  it('flags a caller that floods one block', () => {
    const flood = Array.from({ length: 40 }, () => ann({ caller: '0x5555555555555555555555555555555555555555', block: 7 }));
    const s = splitLanes([...flood, ann({ block: 8 })], ROUTER);
    expect(s.suspected).toBe(40);
    expect(s.open[0]?.blockNumber).toBe(8n);
  });
});

describe('splitLanes adversarial matrix (A5)', () => {
  const FLOODER = '0x5555555555555555555555555555555555555555';

  it('drops nothing: every input lands in exactly one lane, whatever the flood', () => {
    const input = [
      ...Array.from({ length: 100 }, () => ann({ caller: FLOODER, block: 3 })),
      ann({ caller: ROUTER }), ann(), ann({ metadata: '0x' }),
    ];
    const s = splitLanes(input, ROUTER);
    expect(s.trusted.length + s.open.length).toBe(input.length);
    expect(new Set([...s.trusted, ...s.open])).toEqual(new Set(input));
  });

  it('flags a caller only above FLOOD_PER_BLOCK in one block, counted per caller and per block', () => {
    const atLimit = Array.from({ length: FLOOD_PER_BLOCK }, () => ann({ caller: FLOODER, block: 4 }));
    expect(splitLanes(atLimit, ROUTER).suspected).toBe(0);
    const over = [...atLimit, ann({ caller: FLOODER, block: 4 })];
    expect(splitLanes(over, ROUTER).suspected).toBe(FLOOD_PER_BLOCK + 1);
    // The same caller spread across blocks, or many callers sharing one block, is not a per-block flood.
    const spread = Array.from({ length: 3 * FLOOD_PER_BLOCK }, (_, i) => ann({ caller: FLOODER, block: 100 + Math.floor(i / FLOOD_PER_BLOCK) }));
    expect(splitLanes(spread, ROUTER).suspected).toBe(0);
    const many = Array.from({ length: 2 * FLOOD_PER_BLOCK }, (_, i) => ann({ caller: `0x${(i + 0x100).toString(16).padStart(40, '0')}`, block: 9 }));
    expect(splitLanes(many, ROUTER).suspected).toBe(0);
  });

  it('a flooder never pushes honest open-lane announcements behind it, and keeps chain order inside each group', () => {
    const honestA = ann({ block: 5 });
    const flood = Array.from({ length: FLOOD_PER_BLOCK + 8 }, () => ann({ caller: FLOODER, block: 5 }));
    const honestB = ann({ block: 6 });
    const s = splitLanes([honestA, ...flood, honestB], ROUTER);
    expect(s.open.slice(0, 2)).toEqual([honestA, honestB]);
    expect(s.open.slice(2)).toEqual(flood);
  });

  it('the router lane is matched case-insensitively and is never deprioritised, even when the router posts in bulk', () => {
    const routerFlood = Array.from({ length: FLOOD_PER_BLOCK * 2 }, () => ann({ caller: ROUTER.toUpperCase().replace('0X', '0x'), block: 7, eph: `0x02${'aa'.repeat(32)}` }));
    const s = splitLanes([ann(), ...routerFlood], ROUTER.toLowerCase());
    expect(s.trusted).toEqual(routerFlood);
    expect(s.suspected).toBe(0);
  });

  it('an attacker replaying an honest ephemeral key only deprioritises it, never removes it', () => {
    const honest = ann({ eph: `0x02${'42'.repeat(32)}` });
    const replay = ann({ caller: FLOODER, eph: `0x02${'42'.repeat(32)}` });
    const s = splitLanes([honest, replay], ROUTER);
    expect(s.open).toEqual([honest, replay]);
    expect(s.suspected).toBe(2);
  });
});

describe('anonymitySet', () => {
  it('is partial when the scan stopped before the head it counts back from (A5)', () => {
    const head = 10_000_000n;
    const a = anonymitySet({ chain, routerBlocks: [head - 400_000n], head, scannedFrom: 0n, scannedTo: head - 350_000n });
    expect(a).toMatchObject({ count7d: 0, count30d: 1, partial: true });
    expect(anonymitySet({ chain, routerBlocks: [], head, scannedFrom: 0n, scannedTo: head }).partial).toBe(false);
  });

  it('counts router announcements in roughly the last 7 and 30 days and buckets them coarsely', () => {
    const head = 10_000_000n;
    const blocks = [head - 10n, head - 100_000n, head - 400_000n, head - 1_000_000n];
    const a = anonymitySet({ chain, routerBlocks: blocks, head, scannedFrom: head - 2_000_000n });
    expect(a).toMatchObject({ count7d: 2, count30d: 4, level: 'low', partial: false });
    const many = Array.from({ length: 250 }, (_, i) => head - BigInt(i));
    expect(anonymitySet({ chain, routerBlocks: many, head, scannedFrom: 0n }).level).toBe('high');
    expect(anonymitySet({ chain, routerBlocks: many.slice(0, 50), head, scannedFrom: 0n }).level).toBe('medium');
    expect(anonymitySet({ chain, routerBlocks: [], head, scannedFrom: head - 10n }).partial).toBe(true);
  });

  it('copy gives the number, states the heuristic limits, and never claims anonymity', () => {
    const text = describeAnonymitySet({ level: 'low', count7d: 3, count30d: 9, partial: true });
    expect(text).toContain('Privacy set: low');
    expect(text).toContain('3');
    expect(text).toMatch(/not a guarantee/);
    expect(text).toMatch(/view-tag/);
    expect(text).toMatch(/amount/);
    expect(text).toMatch(/never sent/);
    expect(text).toMatch(/only the blocks scanned/);
    expect(text).not.toMatch(/anonym|unlinkab|untraceab/i);
  });
});

describe('lane options (spec 05 D4)', () => {
  const FLOODER = '0x5555555555555555555555555555555555555555';

  it('takes a custom per-block flood threshold', () => {
    const three = Array.from({ length: 3 }, () => ann({ caller: FLOODER, block: 4 }));
    expect(splitLanes(three, ROUTER).suspected).toBe(0);
    expect(splitLanes(three, ROUTER, { floodPerBlock: 2 }).suspected).toBe(3);
    expect(splitLanes(three, ROUTER, { floodPerBlock: 3 }).suspected).toBe(0);
  });

  it('with the local spam score off, keeps chain order, flags nothing and still drops nothing', () => {
    const honest = ann({ block: 6 });
    const flood = Array.from({ length: FLOOD_PER_BLOCK + 1 }, () => ann({ caller: FLOODER, block: 5 }));
    const odd = ann({ metadata: '0xabcd' });
    const real = ann({ caller: ROUTER });
    const s = splitLanes([...flood, odd, real, honest], ROUTER, { spamScoring: false });
    expect(s.trusted).toEqual([real]);
    expect(s.open).toEqual([...flood, odd, honest]);
    expect(s.suspected).toBe(0);
  });

  it('sanitizes stored lane settings field by field and fails closed to the defaults', () => {
    expect(sanitizeScanLanes(undefined)).toEqual(DEFAULT_SCAN_LANES);
    expect(sanitizeScanLanes('junk')).toEqual(DEFAULT_SCAN_LANES);
    expect(sanitizeScanLanes({ floodPerBlock: 0, spamScoring: 'yes', privacySetTransfers: 1 })).toEqual(DEFAULT_SCAN_LANES);
    expect(sanitizeScanLanes({ floodPerBlock: 10_001 })).toEqual(DEFAULT_SCAN_LANES);
    expect(sanitizeScanLanes({ floodPerBlock: 7, spamScoring: false, privacySetTransfers: true })).toEqual({ floodPerBlock: 7, spamScoring: false, privacySetTransfers: true });
    expect(DEFAULT_SCAN_LANES).toEqual({ floodPerBlock: FLOOD_PER_BLOCK, spamScoring: true, privacySetTransfers: false });
  });

  it('round-trips through storage under its own key and tolerates missing or failing storage', () => {
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(loadScanLanes(storage)).toEqual(DEFAULT_SCAN_LANES);
    expect(saveScanLanes(storage, { floodPerBlock: 9, spamScoring: true, privacySetTransfers: true })).toBe(true);
    expect([...m.keys()]).toEqual([SCAN_LANES_KEY]);
    expect(loadScanLanes(storage)).toEqual({ floodPerBlock: 9, spamScoring: true, privacySetTransfers: true });
    m.set(SCAN_LANES_KEY, '{not json');
    expect(loadScanLanes(storage)).toEqual(DEFAULT_SCAN_LANES);
    expect(loadScanLanes(undefined)).toEqual(DEFAULT_SCAN_LANES);
    expect(saveScanLanes(undefined, DEFAULT_SCAN_LANES)).toBe(false);
    expect(saveScanLanes({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, DEFAULT_SCAN_LANES)).toBe(false);
  });
});

describe('same-token transfer estimate (spec 05 D3)', () => {
  const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const word = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;
  const transfer = (block: number, amount: bigint, i: number): RpcLog => ({
    address: TOKEN.toLowerCase(), topics: [TRANSFER_TOPIC, word(0x11n), word(0x22n)], data: word(amount),
    blockNumber: `0x${block.toString(16)}`, blockHash: `0x${block.toString(16).padStart(64, '0')}`, logIndex: `0x${i.toString(16)}`,
  });
  const clientWith = (logs: readonly RpcLog[], onFilter?: (f: LogFilter) => void) => mockRpc(84532, (method, params) => {
    if (method !== 'eth_getLogs') throw new Error(`unexpected ${method}`);
    const f = params[0] as LogFilter;
    onFilter?.(f);
    return logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
  });

  it('counts transfers of the token at similar amounts in a fixed recent window, asking with no sender or recipient filter', () => {
    const head = 50_000;
    const logs = [
      transfer(head - 10, 1_000_000n, 0), transfer(head - 20, 1_200_000n, 1), transfer(head - 30, 800_000n, 2),
      transfer(head - 40, 1_260_000n, 3), transfer(head - 50, 740_000n, 4), transfer(head - 60, 5_000_000n, 5),
      transfer(head - PRIVACY_TRANSFER_WINDOW_BLOCKS, 1_000_000n, 6), transfer(head - PRIVACY_TRANSFER_WINDOW_BLOCKS - 1, 1_000_000n, 7),
      { ...transfer(head - 70, 1_000_000n, 8), topics: [TRANSFER_TOPIC, word(0x11n)] },
      { ...transfer(head - 80, 1_000_000n, 9), data: '0x' },
    ];
    const filters: LogFilter[] = [];
    const client = clientWith(logs, (f) => filters.push(f));
    const r = estimateSimilarTransfers({ client, chain, token: TOKEN, amount: 1_000_000n, head: BigInt(head) });
    return r.then((estimate) => {
      // ±25 %: 800k..1.2M (inclusive) count; 740k, 1.26M and 5M do not; outside the window or malformed never counts.
      expect(estimate).toEqual({ status: 'estimate', token: TOKEN, count: 3, windowBlocks: PRIVACY_TRANSFER_WINDOW_BLOCKS });
      expect(filters.length).toBeGreaterThan(0);
      for (const f of filters) {
        expect(f.address.toLowerCase()).toBe(TOKEN.toLowerCase());
        expect(f.topics).toEqual([TRANSFER_TOPIC]);
        expect(f.toBlock - f.fromBlock + 1n).toBeLessThanOrEqual(BigInt(chain.getLogsMaxRange));
      }
      expect(filters[0]?.fromBlock).toBe(BigInt(head - PRIVACY_TRANSFER_WINDOW_BLOCKS + 1));
      expect(filters.at(-1)?.toBlock).toBe(BigInt(head));
    });
  });

  it('starts at genesis on a short chain and reports unknown with the reason on any error or limit', async () => {
    const short = await estimateSimilarTransfers({ client: clientWith([transfer(3, 1_000_000n, 0)]), chain, token: TOKEN, amount: 1_000_000n, head: 5n });
    expect(short).toEqual({ status: 'estimate', token: TOKEN, count: 1, windowBlocks: PRIVACY_TRANSFER_WINDOW_BLOCKS });
    const failing = mockRpc(84532, () => { throw new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32005'); });
    expect(await estimateSimilarTransfers({ client: failing, chain, token: TOKEN, amount: 1_000_000n, head: 50_000n })).toEqual({ status: 'unknown', reason: 'limit' });
    const broken = mockRpc(84532, () => { throw new TypeError('boom'); });
    expect(await estimateSimilarTransfers({ client: broken, chain, token: TOKEN, amount: 1_000_000n, head: 50_000n })).toEqual({ status: 'unknown', reason: 'error' });
    const wrongChain = mockRpc(1, () => []);
    expect(await estimateSimilarTransfers({ client: wrongChain, chain, token: TOKEN, amount: 1_000_000n, head: 50_000n })).toEqual({ status: 'unknown', reason: 'error' });
    const flood = Array.from({ length: PRIVACY_TRANSFER_MAX_LOGS + 1 }, (_, i) => transfer(49_990, 7n, i));
    expect(await estimateSimilarTransfers({ client: clientWith(flood), chain, token: TOKEN, amount: 1_000_000n, head: 50_000n })).toEqual({ status: 'unknown', reason: 'limit' });
    expect(await estimateSimilarTransfers({ client: clientWith([]), chain, token: 'not-an-address', amount: 1_000_000n, head: 50_000n })).toEqual({ status: 'unknown', reason: 'error' });
    expect(await estimateSimilarTransfers({ client: clientWith([]), chain, token: TOKEN, amount: 0n, head: 50_000n })).toEqual({ status: 'unknown', reason: 'error' });
  });

  it('is carried by the privacy set unchanged and described as a labelled estimate without changing the level', () => {
    const head = 10_000_000n;
    const base = anonymitySet({ chain, routerBlocks: [head - 1n], head, scannedFrom: 0n });
    const withEstimate = anonymitySet({ chain, routerBlocks: [head - 1n], head, scannedFrom: 0n, transfers: { status: 'estimate', token: TOKEN, count: 42, windowBlocks: 2000 } });
    expect(withEstimate).toEqual({ ...base, transfers: { status: 'estimate', token: TOKEN, count: 42, windowBlocks: 2000 } });
    expect(base.transfers).toBeUndefined();
    const text = describeAnonymitySet(withEstimate);
    expect(text).toMatch(/estimate/);
    expect(text).toContain('42');
    expect(text).toMatch(/similar amount/);
    const unknown = describeAnonymitySet(anonymitySet({ chain, routerBlocks: [], head, scannedFrom: 0n, transfers: { status: 'unknown', reason: 'limit' } }));
    expect(unknown).toMatch(/unknown/);
    expect(unknown).not.toMatch(/anonym|unlinkab|untraceab/i);
  });
});
