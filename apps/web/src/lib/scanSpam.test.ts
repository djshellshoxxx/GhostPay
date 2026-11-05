import { CHAINS, type ScannedAnnouncement } from '@ghostpay/chain-adapters';
import { buildErc20Metadata } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { anonymitySet, describeAnonymitySet, splitLanes } from './scanSpam';

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

describe('anonymitySet', () => {
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
