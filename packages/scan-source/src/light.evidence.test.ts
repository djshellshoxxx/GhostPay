import { describe, expect, it, vi } from 'vitest';
import { describeScanEvidence } from './evidence.js';
import { ScanSourceError } from './errors.js';
import { createLightSource } from './light.js';
import { createQuorumSource } from './quorum.js';
import { createRangeSource } from './range.js';
import type { Hex, LightClient, PublicLogSource } from './types.js';
import { blockHash, fakeBackend, headOf, rawAnn, RAW } from './testutil.js';

/** PRIV-T07: what the light-client source does and does not establish. Synthetic data only. */
const REQ = { chainId: 31337, fromBlock: 1200n, toBlock: 1700n } as const;
const FORK: Hex = `0x${'5f'.repeat(32)}`;
const range = (raw?: readonly unknown[], head = headOf()): PublicLogSource => createRangeSource({ chainId: 31337, backend: fakeBackend(raw, head) });

const codeOf = async (f: () => unknown): Promise<string | undefined> => {
  try {
    await f();
  } catch (e) {
    return e instanceof ScanSourceError ? e.code : 'other';
  }
  return undefined;
};

function lc(over: Partial<LightClient> = {}): LightClient {
  return {
    head: () => Promise.resolve(headOf()),
    blockHash: (n) => Promise.resolve(blockHash(n)),
    getBalance: () => Promise.resolve(0n),
    getTransactionCount: () => Promise.resolve(0n),
    getCode: () => Promise.resolve('0x'),
    getStorageAt: () => Promise.resolve('0x00'),
    verifiesLogs: false,
    ...over,
  };
}
const light = (client: LightClient, inner: PublicLogSource = range()): PublicLogSource => createLightSource({ chainId: 31337, lc: client, inner });
const ids = (r: { announcements: readonly { id: string }[] }): string[] => r.announcements.map((a) => a.id);

describe('light source evidence (PRIV-T07)', () => {
  it('correct header verification: returns the inner result untouched and asks the client about every distinct block', async () => {
    const asked: bigint[] = [];
    const client = lc({ blockHash: (n) => (asked.push(n), Promise.resolve(blockHash(n))) });
    const inner = await range().fetch(REQ);
    const r = await light(client).fetch(REQ);
    expect(r).toStrictEqual(inner);
    expect(new Set(asked)).toStrictEqual(new Set([inner.head.number, ...inner.announcements.map((a) => a.blockNumber)]));
    expect(asked.length).toBe(new Set(asked).size);
  });

  it('a light client hash in different letter case still matches (hex compared case-insensitively)', async () => {
    const r = await light(lc({ blockHash: (n) => Promise.resolve(blockHash(n).toUpperCase().replace('0X', '0x') as Hex) })).fetch(REQ);
    expect(r.announcements.length).toBeGreaterThan(0);
  });

  it('incorrect header: the light client disagrees with the inner head hash => HEAD_MISMATCH', async () => {
    const client = lc({ blockHash: (n) => Promise.resolve(n === headOf().number ? FORK : blockHash(n)) });
    expect(await codeOf(() => light(client).fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('incorrect header: the light client disagrees on an announcement block => HEAD_MISMATCH', async () => {
    const client = lc({ blockHash: (n) => Promise.resolve(n === 1500n ? FORK : blockHash(n)) });
    expect(await codeOf(() => light(client).fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('missing header: lc.blockHash undefined for the head => HEAD_MISMATCH', async () => {
    const client = lc({ blockHash: (n) => Promise.resolve(n === headOf().number ? undefined : blockHash(n)) });
    expect(await codeOf(() => light(client).fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('missing header: lc.blockHash undefined for an announcement block => HEAD_MISMATCH', async () => {
    const client = lc({ blockHash: (n) => Promise.resolve(n === 1131n ? undefined : blockHash(n)) });
    expect(await codeOf(() => light(client).fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('LIMITATION: a verified header with an OMITTED log inside a real block returns normally (no completeness check)', async () => {
    const full = await light(lc()).fetch(REQ);
    const victim = RAW.filter((r) => r['blockNumber'] === '1500');
    expect(victim).toHaveLength(2);
    const omitted = RAW.filter((r) => r !== victim[1]);
    const r = await light(lc(), range(omitted)).fetch(REQ);
    expect(ids(r)).toHaveLength(ids(full).length - 1);
    expect(ids(full).filter((i) => !ids(r).includes(i))).toStrictEqual([`${blockHash(1500n)}:2`]);
    // every block hash the client confirmed is still real: nothing in the result betrays the omission
    expect(r.head).toStrictEqual(full.head);
    expect(r.coverage).toStrictEqual(full.coverage);
    expect(r.skipped).toBe(0);
  });

  it('LIMITATION: omission is not detected even when ALL logs of an announcement block are dropped', async () => {
    const r = await light(lc(), range(RAW.filter((x) => x['blockNumber'] !== '1500'))).fetch(REQ);
    expect(r.announcements.some((a) => a.blockNumber === 1500n)).toBe(false);
  });

  it('omission with verifiesLogs === false: integrity is unverified and evidence says completeness is NOT verified', async () => {
    const s = light(lc({ verifiesLogs: false }), range(RAW.filter((x) => x !== RAW[RAW.length - 1])));
    await s.fetch(REQ);
    expect(s.integrity).toBe('unverified');
    expect(describeScanEvidence(s)).toStrictEqual({ blockIdentity: 'verified', recordInclusion: 'unverified', intervalCompleteness: 'unverified' });
  });

  it('omission with verifiesLogs === true: integrity reads proof, yet completeness is still never claimed', async () => {
    const s = light(lc({ verifiesLogs: true }), range(RAW.filter((x) => x !== RAW[RAW.length - 1])));
    const r = await s.fetch(REQ);
    expect(s.integrity).toBe('proof');
    expect(ids(r)).not.toContain(`${blockHash(1500n)}:2`);
    expect(describeScanEvidence(s, { lightClient: { verifiesLogs: true } })).toStrictEqual({
      blockIdentity: 'verified',
      recordInclusion: 'verified',
      intervalCompleteness: 'unverified',
    });
  });

  it('LIMITATION (event proofs): no log/receipt proof is ever requested; a record with altered content in a real block passes', async () => {
    const getters = { getBalance: vi.fn(() => Promise.resolve(0n)), getTransactionCount: vi.fn(() => Promise.resolve(0n)), getCode: vi.fn(() => Promise.resolve('0x' as Hex)), getStorageAt: vi.fn(() => Promise.resolve('0x00' as Hex)) };
    const forged = RAW.map((x) => (x['blockNumber'] === '1500' && x['logIndex'] === 1 ? { ...x, metadata: '0xcd', stealthAddress: `0x${'ee'.repeat(20)}` } : x));
    const r = await light(lc({ ...getters, verifiesLogs: true }), range(forged)).fetch(REQ);
    const hit = r.announcements.find((a) => a.id === `${blockHash(1500n)}:1`);
    expect(hit?.metadata).toBe('0xcd');
    expect(hit?.stealthAddress).toBe(`0x${'ee'.repeat(20)}`);
    for (const g of Object.values(getters)) expect(g).not.toHaveBeenCalled();
  });

  it('LIMITATION (event proofs): integrity "proof" is derived from the lc.verifiesLogs flag alone, never from a checked proof', () => {
    expect(light(lc({ verifiesLogs: true })).integrity).toBe('proof');
    expect(light(lc({ verifiesLogs: false })).integrity).toBe('unverified');
  });

  it('LIMITATION (stale state): lc.head() is never consulted, so a light client lagging behind the inner head only fails via blockHash', async () => {
    const head = vi.fn(() => Promise.resolve(headOf(100n)));
    // blockHash still answers for the future head => the stale head() is not noticed at all
    const r = await light(lc({ head })).fetch(REQ);
    expect(r.head).toStrictEqual(headOf());
    expect(head).not.toHaveBeenCalled();
  });

  it('stale light client that cannot vouch for blocks beyond its own head => HEAD_MISMATCH', async () => {
    const client = lc({ head: () => Promise.resolve(headOf(1400n)), blockHash: (n) => Promise.resolve(n <= 1400n ? blockHash(n) : undefined) });
    expect(await codeOf(() => light(client).fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('LIMITATION (untrusted checkpoint): the source has no checkpoint notion; a client on a different chain is only caught by hash mismatch', async () => {
    const forkClient = lc({ blockHash: (n) => Promise.resolve(n >= 1000n ? FORK : blockHash(n)) });
    expect(await codeOf(() => light(forkClient).fetch(REQ))).toBe('HEAD_MISMATCH');
    // a client whose (untrusted) checkpoint agrees with the inner source is indistinguishable from an honest one
    const colluding = lc({ blockHash: (n) => Promise.resolve(blockHash(n)) });
    const r = await light(colluding).fetch(REQ);
    expect(r.announcements.length).toBeGreaterThan(0);
  });

  it('unsupported chain: factory, fetch and chain mismatch are distinct, specific errors', async () => {
    const mk = (chainId: number): unknown => createLightSource({ chainId, lc: lc(), inner: range() });
    expect(() => mk(1)).toThrow(expect.objectContaining({ code: 'TESTNET_ONLY' }));
    expect(() => mk(31337.5)).toThrow(expect.objectContaining({ code: 'TESTNET_ONLY' }));
    const s = light(lc());
    expect(await codeOf(() => s.fetch({ ...REQ, chainId: 1 }))).toBe('TESTNET_ONLY');
    expect(await codeOf(() => s.fetch({ ...REQ, chainId: 11155111 }))).toBe('INVALID_ARGUMENT');
  });

  it('unsupported chain: the light client and inner source are never queried', async () => {
    const blockHashSpy = vi.fn(() => Promise.resolve(undefined));
    const innerFetch = vi.fn();
    const inner = { kind: 'range', integrity: 'unverified', fetch: innerFetch } as unknown as PublicLogSource;
    const s = createLightSource({ chainId: 31337, lc: lc({ blockHash: blockHashSpy }), inner });
    await codeOf(() => s.fetch({ ...REQ, chainId: 1 }));
    await codeOf(() => s.fetch({ ...REQ, chainId: 84532 }));
    expect(innerFetch).not.toHaveBeenCalled();
    expect(blockHashSpy).not.toHaveBeenCalled();
  });

  it('provider disagreement below the light source: a quorum inner that disagrees fails closed with SOURCE_DISAGREE', async () => {
    const quorum = createQuorumSource([range(), range(RAW.filter((x) => x['blockNumber'] !== '1500' || x['logIndex'] !== 2))], 2);
    expect(await codeOf(() => light(lc(), quorum).fetch(REQ))).toBe('SOURCE_DISAGREE');
  });

  it('provider disagreement: inner source vs light client on the head hash is HEAD_MISMATCH, not a silent pick', async () => {
    const inner = range(undefined, { number: headOf().number, hash: FORK });
    expect(await codeOf(() => light(lc(), inner).fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('reorg: the inner source reports two hashes for one block within a result => HEAD_MISMATCH', async () => {
    const inner: PublicLogSource = {
      kind: 'range',
      integrity: 'unverified',
      fetch: async (r) => {
        const res = await range().fetch(r);
        const a = res.announcements[0];
        if (!a) throw new Error('fixture');
        return { ...res, announcements: [a, { ...a, logIndex: 77, blockHash: FORK }] };
      },
    };
    expect(await codeOf(() => light(lc(), inner).fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('reorg: the light client changes its answer for a block between fetches => second fetch is HEAD_MISMATCH', async () => {
    let reorged = false;
    const client = lc({ blockHash: (n) => Promise.resolve(reorged && n === 1500n ? FORK : blockHash(n)) });
    const s = light(client);
    expect((await s.fetch(REQ)).announcements.length).toBeGreaterThan(0);
    reorged = true;
    expect(await codeOf(() => s.fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('reorg: the inner source starts serving a reorged hash for a block the client already confirmed => HEAD_MISMATCH', async () => {
    let reorged = false;
    const inner: PublicLogSource = {
      kind: 'range',
      integrity: 'unverified',
      fetch: async (r) => {
        const res = await range().fetch(r);
        if (!reorged) return res;
        return { ...res, announcements: res.announcements.map((a) => ({ ...a, blockHash: a.blockNumber === 1500n ? FORK : a.blockHash })) };
      },
    };
    const s = light(lc(), inner);
    await s.fetch(REQ);
    reorged = true;
    expect(await codeOf(() => s.fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('rawAnn fixtures are consistent with blockHash (guards the fixture itself)', () => {
    expect(rawAnn(1500, 1)['blockHash']).toBe(blockHash(1500n));
  });
});
