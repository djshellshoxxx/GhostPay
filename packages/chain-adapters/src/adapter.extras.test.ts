import { deriveStealthPayment, encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { encodeAbiParameters } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { createEvmAdapter, type DetectedPayment } from './adapter.js';
import { validateManifest } from './deployments.js';
import { FAKE, SEPOLIA, USDC_SEPOLIA, invoiceFor, manifestJson, policyManifestJson } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC } from './logs.js';
import type { ReadbackResult } from './readback.js';
import { createClient } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import { TRANSFER_TOPIC } from './verify.js';
import type { Hex } from './types.js';

const deployment = validateManifest(manifestJson(), 11155111);
const pad = (a: string): string => `0x${a.toLowerCase().replace('0x', '').padStart(64, '0')}`;
const bhash = (n: number, fork = 0): string => `0x${(n + fork * 1000).toString(16).padStart(64, '0')}`;

function ann(meta: string, block: number, caller: string, token = USDC_SEPOLIA) {
  const p = deriveStealthPayment(meta);
  const net = 9_975_000n;
  const md = `0x${Buffer.from(p.metadataPrefix).toString('hex')}a9059cbb${token.slice(2).toLowerCase()}${net.toString(16).padStart(64, '0')}`;
  return {
    stealth: p.stealthAddress,
    log: {
      address: FAKE.announcer,
      topics: [ANNOUNCEMENT_TOPIC, pad('0x1'), pad(p.stealthAddress), pad(caller)],
      data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${Buffer.from(p.ephemeralPublicKey).toString('hex')}`, md as Hex]),
      blockNumber: `0x${block.toString(16)}`,
      blockHash: bhash(block),
      transactionHash: `0x${'ab'.repeat(32)}`,
      logIndex: '0x0',
    },
  };
}

interface World { head: number; fork: number; flipAfterBlockCalls?: number; blockCalls?: number; announcements: unknown[]; transfers: unknown[]; getLogsCalls: { address: string }[] }
async function mk(w: World, extra: Partial<Parameters<typeof createEvmAdapter>[0]> = {}) {
  const client = await createClient(SEPOLIA, 'https://rpc.example.test', {
    sleep: noSleep,
    transport: fakeTransport((m, p) => {
      if (m === 'eth_chainId') return '0xaa36a7';
      if (m === 'eth_blockNumber') return `0x${w.head.toString(16)}`;
      if (m === 'eth_getBlockByNumber') {
        w.blockCalls = (w.blockCalls ?? 0) + 1;
        const res = { number: p[0], hash: bhash(Number(BigInt(p[0] as string)), w.fork), parentHash: bhash(0) };
        if (w.blockCalls === w.flipAfterBlockCalls) w.fork = 1;
        return res;
      }
      const f = p[0] as { address: string; fromBlock: string; toBlock: string };
      w.getLogsCalls.push({ address: f.address });
      const src = f.address.toLowerCase() === FAKE.announcer.toLowerCase() ? w.announcements : w.transfers;
      return (src as { blockNumber: string }[]).filter((l) => BigInt(l.blockNumber) >= BigInt(f.fromBlock) && BigInt(l.blockNumber) <= BigInt(f.toBlock));
    }),
  });
  return createEvmAdapter({ chain: SEPOLIA, deployment, client, ...extra });
}
const world = (over: Partial<World> = {}): World => ({ head: 20, fork: 0, announcements: [], transfers: [], getLogsCalls: [], ...over });
async function collect(a: Awaited<ReturnType<typeof mk>>, keys: ReturnType<typeof generateKeySet>): Promise<DetectedPayment[]> {
  const out: DetectedPayment[] = [];
  for await (const d of a.scan({ fromBlock: 0n }, { viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey }, new AbortController().signal)) out.push(d);
  return out;
}

describe('flatSecurity derives from manifest.policy', () => {
  const cap = async (j: Record<string, unknown>) => {
    const client = await createClient(SEPOLIA, 'https://rpc.example.test', { sleep: noSleep, transport: fakeTransport((m) => (m === 'eth_chainId' ? '0xaa36a7' : null)) });
    return createEvmAdapter({ chain: SEPOLIA, deployment: validateManifest(j, 11155111), client }).fees.flatSecurity;
  };
  it('not_deployed without policy, enforced with a flat fee, not_enforceable with zero fee', async () => {
    expect(await cap(manifestJson())).toBe('not_deployed');
    expect(await cap(policyManifestJson('1000000'))).toBe('enforced');
    expect(await cap(policyManifestJson('0'))).toBe('not_enforceable');
  });
});

describe('readback gate', () => {
  const okResult: ReadbackResult = { ok: true, checks: [{ name: 'chainId', expected: '1', actual: '1', pass: true }] };
  it('refuses to create an adapter when readback failed or is empty; accepts a passing result', async () => {
    const w = world();
    await expect(mk(w, { readback: { ok: false, checks: [{ name: 'router.FEE_RECIPIENT', expected: 'a', actual: 'b', pass: false }] } })).rejects.toThrow(/MANIFEST_READBACK_FAILED/);
    await expect(mk(w, { readback: { ok: true, checks: [] } })).rejects.toThrow(/MANIFEST_READBACK_FAILED/);
    await expect(mk(w, { readback: okResult })).resolves.toBeDefined();
    void invoiceFor;
  });
});

describe('scan verification, confirmations and reorg', () => {
  const mine = generateKeySet();
  const meta = encodeMetaAddress(mine);

  it('router payments are verified without Transfer queries; direct ones need Transfer logs', async () => {
    const r = ann(meta, 3, FAKE.router);
    const d = ann(meta, 5, '0x00000000000000000000000000000000000000ee');
    const w = world({ announcements: [r.log, d.log] });
    const got = await collect(await mk(w), mine);
    expect(got.map((g) => g.verification.status)).toEqual(['verified', 'claimed']);
    expect(got[0]?.verification).toMatchObject({ source: 'router', amount: 9_975_000n });
    expect(got[1]?.verification).toMatchObject({ reason: 'no_transfer_found', claimed: { amount: 9_975_000n } });
    expect(w.getLogsCalls.filter((c) => c.address.toLowerCase() === USDC_SEPOLIA.toLowerCase())).toHaveLength(1);
  });

  it('a real Transfer in the same block and tx upgrades a direct payment to verified', async () => {
    const d = ann(meta, 5, '0x00000000000000000000000000000000000000ee');
    const transfer = {
      address: USDC_SEPOLIA, topics: [TRANSFER_TOPIC, pad('0x77'), pad(d.stealth)], data: `0x${(9_975_000n).toString(16).padStart(64, '0')}`,
      blockNumber: '0x5', blockHash: bhash(5), transactionHash: `0x${'ab'.repeat(32)}`, logIndex: '0x1',
    };
    const got = await collect(await mk(world({ announcements: [d.log], transfers: [transfer] })), mine);
    expect(got[0]?.verification).toMatchObject({ status: 'verified', source: 'transfer_logs', amount: 9_975_000n });
  });

  it('a forged amount for a non-allowlisted token is only claimed (and not queried)', async () => {
    const d = ann(meta, 5, '0x00000000000000000000000000000000000000ee', '0x0000000000000000000000000000000000000bAD');
    const w = world({ announcements: [d.log] });
    const got = await collect(await mk(w), mine);
    expect(got[0]?.verification).toMatchObject({ status: 'claimed', reason: 'token_not_allowlisted' });
    expect(w.getLogsCalls.every((c) => c.address.toLowerCase() === FAKE.announcer.toLowerCase())).toBe(true);
  });

  it('verifyAmounts:false marks direct payments not_checked without extra calls', async () => {
    const d = ann(meta, 5, '0x00000000000000000000000000000000000000ee');
    const w = world({ announcements: [d.log] });
    const got = await collect(await mk(w, { verifyAmounts: false }), mine);
    expect(got[0]?.verification).toMatchObject({ status: 'claimed', reason: 'not_checked' });
    expect(w.getLogsCalls.every((c) => c.address.toLowerCase() === FAKE.announcer.toLowerCase())).toBe(true);
  });

  it('exposes confirmations/final and honours minConfirmations', async () => {
    const shallow = ann(meta, 20, FAKE.router);
    const deep = ann(meta, 3, FAKE.router);
    const w = world({ head: 20, announcements: [deep.log, shallow.log] });
    const all = await collect(await mk(w), mine);
    expect(all.map((g) => g.confirmations)).toEqual([18n, 1n]);
    expect(all.map((g) => g.final)).toEqual([18n > BigInt(SEPOLIA.finalityDepth), false]);
    const confirmed = await collect(await mk(w, { minConfirmations: 18 }), mine);
    expect(confirmed.map((g) => g.announcement.blockNumber)).toEqual([3n]);
  });

  it('calls onReorg with the rollback point when the chain forks between pages', async () => {
    const seen: bigint[] = [];
    // 60 001 blocks need more than the 50-request cap, so the scan takes two passes; fork after pass one.
    const w = world({ head: 60_000, flipAfterBlockCalls: 2 });
    const a = await mk(w, { onReorg: (n) => seen.push(n) });
    await collect(a, mine);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeLessThanOrEqual(50_000n);
  });
});
