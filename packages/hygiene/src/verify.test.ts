import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
  TRANSFER_TOPIC,
  addressFreeReceipt,
  assertAddressFree,
  batchedRead,
  parseTransferLogs,
  pickDecoys,
  spentCheck,
  sweepConfirmed,
  type BatchRpc,
} from './verify.js';
import { HygieneError } from './errors.js';
import { assertTestnetChain } from './testnet.js';
import { A1, A2, A3, TOKEN, TOPIC, TX, log, pad, word } from './fixtures.testutil.js';

const STEALTH = '0xabcdef0123456789abcdef0123456789abcdef01';
const DEST = '0x9999999999999999999999999999999999999999';

function mockRpc(
  result: object | string | null | ((m: string, p: readonly unknown[]) => unknown),
  chainId = 84532,
) {
  const calls: { method: string; params: readonly unknown[] }[] = [];
  return {
    chainId,
    calls,
    request: (method: string, params: readonly unknown[]): Promise<unknown> => {
      calls.push({ method, params });
      return Promise.resolve(
        typeof result === 'function'
          ? (result as (m: string, p: readonly unknown[]) => unknown)(method, params)
          : result,
      );
    },
  };
}

describe('constants and guard', () => {
  it('Transfer topic is the keccak of the signature', () => {
    expect(TRANSFER_TOPIC).toBe(TOPIC);
  });
  it('testnet guard', () => {
    for (const c of [31337, 11155111, 84532]) expect(() => assertTestnetChain(c)).not.toThrow();
    for (const c of [1, 8453, 10, 0, 1.5, Number.NaN])
      expect(() => assertTestnetChain(c)).toThrow(HygieneError);
  });
});

describe('parseTransferLogs strictness (HY-VER-7, AT-HY-5 fuzz)', () => {
  const ok = log({ from: A1, to: A2, value: 5n });
  it('parses a good log', () => {
    expect(parseTransferLogs([ok])).toEqual([
      { transactionHash: TX, blockNumber: 100n, from: A1, to: A2, value: 5n },
    ]);
  });
  const mut = (o: Record<string, unknown>) => ({ ...ok, ...o });
  const bad: [string, unknown][] = [
    ['not array', 'x'],
    ['null entry', null],
    ['no topics', mut({ topics: undefined })],
    ['2 topics', mut({ topics: [TOPIC, pad(A1)] })],
    ['4 topics (ERC-721 shape)', mut({ topics: [TOPIC, pad(A1), pad(A2), word(1n)] })],
    ['wrong topic0', mut({ topics: [`0x${'11'.repeat(32)}`, pad(A1), pad(A2)] })],
    ['non-string topic0', mut({ topics: [5, pad(A1), pad(A2)] })],
    ['unpadded topic', mut({ topics: [TOPIC, A1, pad(A2)] })],
    ['dirty padded topic', mut({ topics: [TOPIC, `0x1${'0'.repeat(23)}${A1.slice(2)}`, pad(A2)] })],
    ['short data', mut({ data: '0x01' })],
    ['long data', mut({ data: `${word(1n)}00` })],
    ['non-string data', mut({ data: 5 })],
    ['bad tx', mut({ transactionHash: '0x12' })],
    ['missing tx', mut({ transactionHash: undefined })],
    ['bad block', mut({ blockNumber: '100' })],
    ['leading zero block', mut({ blockNumber: '0x064' })],
    ['removed', mut({ removed: true })],
  ];
  it.each(bad)('drops %s', (_n, v) => {
    expect(parseTransferLogs(Array.isArray(v) || typeof v === 'string' ? v : [v])).toEqual([]);
  });
  it('keeps good entries beside bad ones; uppercase topic0 accepted', () => {
    const up = mut({ topics: [TOPIC.toUpperCase().replace('0X', '0x'), pad(A1), pad(A2)] });
    expect(parseTransferLogs([null, ok, 'junk', up])).toHaveLength(2);
  });
  it('fuzz: arbitrary json never throws', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => Array.isArray(parseTransferLogs(v))),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(fc.array(fc.jsonValue()), (v) => Array.isArray(parseTransferLogs(v))),
      { numRuns: 300 },
    );
  });
});

describe('assertAddressFree', () => {
  it('flags plain, padded and upper-case forms', () => {
    expect(() => assertAddressFree([{ a: STEALTH }], [STEALTH])).toThrow(/protected/);
    expect(() => assertAddressFree([{ t: pad(STEALTH.toLowerCase()) }], [STEALTH])).toThrow(HygieneError);
    expect(() => assertAddressFree([{ t: STEALTH.toUpperCase() }], [STEALTH])).toThrow(HygieneError);
    expect(() => assertAddressFree([{ a: TOKEN }], [STEALTH])).not.toThrow();
  });
});

describe('addressFreeReceipt (AT-HY-5)', () => {
  const args = {
    token: TOKEN as `0x${string}`,
    block: 100n,
    txHash: TX as `0x${string}`,
    stealth: STEALTH as `0x${string}`,
    net: 1000n,
  };
  it('confirmed; request names only the token, topic0 only, one block', async () => {
    const rpc = mockRpc([log({ from: A1, to: STEALTH, value: 1000n })]);
    expect(await addressFreeReceipt(rpc, args)).toBe('confirmed');
    expect(rpc.calls).toHaveLength(1);
    const call = rpc.calls[0];
    expect(call?.method).toBe('eth_getLogs');
    const s = JSON.stringify(call?.params).toLowerCase();
    expect(s).not.toContain(STEALTH.slice(2).toLowerCase());
    expect(s).toContain(TOKEN.slice(2));
    const p = (call?.params[0] ?? {}) as { topics: unknown[]; fromBlock: string; toBlock: string };
    expect(p.topics).toEqual([TOPIC]);
    expect(p.fromBlock).toBe('0x64');
    expect(p.toBlock).toBe('0x64');
  });
  it('confirmed among multiple transfers of the same tx (fee leg + net leg)', async () => {
    const rpc = mockRpc([
      log({ from: A1, to: A3, value: 30n }),
      log({ from: A1, to: STEALTH, value: 1000n }),
    ]);
    expect(await addressFreeReceipt(rpc, args)).toBe('confirmed');
  });
  it('mismatch on wrong value and on wrong recipient', async () => {
    expect(await addressFreeReceipt(mockRpc([log({ from: A1, to: STEALTH, value: 999n })]), args)).toBe(
      'mismatch',
    );
    expect(await addressFreeReceipt(mockRpc([log({ from: A1, to: A3, value: 1000n })]), args)).toBe(
      'mismatch',
    );
  });
  it('absent when no log of that tx, or only other txs', async () => {
    expect(await addressFreeReceipt(mockRpc([]), args)).toBe('absent');
    expect(
      await addressFreeReceipt(
        mockRpc([log({ from: A1, to: STEALTH, value: 1000n, tx: `0x${'cd'.repeat(32)}` })]),
        args,
      ),
    ).toBe('absent');
  });
  it('malformed entries are dropped -> absent; non-array result throws', async () => {
    expect(await addressFreeReceipt(mockRpc([{ junk: 1 }]), args)).toBe('absent');
    await expect(addressFreeReceipt(mockRpc({ error: 'x' }), args)).rejects.toThrow(/RPC_MALFORMED/);
  });
  it('input and chain validation', async () => {
    await expect(addressFreeReceipt(mockRpc([], 1), args)).rejects.toThrow(/testnet-only/);
    await expect(addressFreeReceipt(mockRpc([]), { ...args, txHash: '0x12' })).rejects.toThrow(HygieneError);
    await expect(addressFreeReceipt(mockRpc([]), { ...args, net: 0n })).rejects.toThrow(HygieneError);
    await expect(addressFreeReceipt(mockRpc([]), { ...args, block: -1n })).rejects.toThrow(HygieneError);
    await expect(addressFreeReceipt(mockRpc([]), { ...args, stealth: TOKEN })).rejects.toThrow(HygieneError);
    await expect(addressFreeReceipt(mockRpc([]), { ...args, stealth: '0x1' })).rejects.toThrow(HygieneError);
  });
  it('refuses to send a request that would carry the stealth address (token == stealth in other case is caught earlier)', async () => {
    const rpc = mockRpc([]);
    await expect(
      addressFreeReceipt(rpc, { ...args, token: STEALTH.toLowerCase() as `0x${string}` }),
    ).rejects.toThrow(HygieneError);
    expect(rpc.calls).toHaveLength(0);
  });
});

describe('sweepConfirmed (post-sweep, no getTransactionReceipt)', () => {
  const a = {
    token: TOKEN as `0x${string}`,
    from: STEALTH as `0x${string}`,
    to: DEST as `0x${string}`,
    net: 970n,
    head: 500n,
  };
  it('matches locally; request has only token; range head-3..head', async () => {
    const rpc = mockRpc([log({ from: STEALTH, to: DEST, value: 970n })]);
    expect(await sweepConfirmed(rpc, a)).toBe(true);
    const s = JSON.stringify(rpc.calls[0]?.params).toLowerCase();
    expect(s).not.toContain(STEALTH.slice(2).toLowerCase());
    expect(s).not.toContain(DEST.slice(2));
    const p = (rpc.calls[0]?.params[0] ?? {}) as { fromBlock: string; toBlock: string };
    expect([p.fromBlock, p.toBlock]).toEqual(['0x1f1', '0x1f4']);
    expect(rpc.calls.every((c) => c.method === 'eth_getLogs')).toBe(true);
  });
  it('false on wrong value/from/to; true needs all three', async () => {
    expect(await sweepConfirmed(mockRpc([log({ from: STEALTH, to: DEST, value: 971n })]), a)).toBe(false);
    expect(await sweepConfirmed(mockRpc([log({ from: A1, to: DEST, value: 970n })]), a)).toBe(false);
    expect(await sweepConfirmed(mockRpc([log({ from: STEALTH, to: A1, value: 970n })]), a)).toBe(false);
    expect(await sweepConfirmed(mockRpc([]), a)).toBe(false);
  });
  it('lookback bounds, low head clamps to 0, bad input', async () => {
    const rpc = mockRpc([]);
    await sweepConfirmed(rpc, { ...a, head: 1n, lookback: 3 });
    expect((rpc.calls[0]?.params[0] as { fromBlock: string }).fromBlock).toBe('0x0');
    await expect(sweepConfirmed(rpc, { ...a, lookback: 65 })).rejects.toThrow(HygieneError);
    await expect(sweepConfirmed(rpc, { ...a, lookback: -1 })).rejects.toThrow(HygieneError);
    await expect(sweepConfirmed(rpc, { ...a, lookback: 1.5 })).rejects.toThrow(HygieneError);
    await expect(sweepConfirmed(mockRpc([], 1), a)).rejects.toThrow(HygieneError);
    await expect(sweepConfirmed(rpc, { ...a, net: 0n })).rejects.toThrow(HygieneError);
    await expect(sweepConfirmed(rpc, { ...a, head: -1n })).rejects.toThrow(HygieneError);
  });
});

describe('spentCheck (HY-VER-3)', () => {
  const base = {
    token: TOKEN as `0x${string}`,
    stealth: STEALTH as `0x${string}`,
    fromBlock: 100n,
    head: 150n,
    net: 1000n,
  };
  it('sums outflows from the stealth address, ignores others, address-free', async () => {
    const rpc = mockRpc([
      log({ from: STEALTH, to: DEST, value: 400n }),
      log({ from: A1, to: A2, value: 7n }),
      log({ from: A1, to: STEALTH, value: 5n }),
    ]);
    const r = await spentCheck(rpc, { ...base, routerOnly: true });
    expect(r).toMatchObject({
      outflow: 400n,
      spent: true,
      balanceEstimate: 600n,
      mayBeIncomplete: false,
      scannedTo: 150n,
    });
    expect(JSON.stringify(rpc.calls).toLowerCase()).not.toContain(STEALTH.slice(2).toLowerCase());
  });
  it('not spent; incomplete by default (direct sends possible)', async () => {
    const r = await spentCheck(mockRpc([]), base);
    expect(r).toMatchObject({ spent: false, balanceEstimate: 1000n, mayBeIncomplete: true });
  });
  it('floors balance at 0', async () => {
    const r = await spentCheck(mockRpc([log({ from: STEALTH, to: DEST, value: 2000n })]), base);
    expect(r.balanceEstimate).toBe(0n);
  });
  it('cap truncates, reports incomplete, chunks requests', async () => {
    const rpc = mockRpc([]);
    const r = await spentCheck(rpc, { ...base, head: 100_000n, cap: 5000, chunk: 2000, routerOnly: true });
    expect(r.mayBeIncomplete).toBe(true);
    expect(r.scannedTo).toBe(5099n);
    expect(rpc.calls).toHaveLength(3);
    const last = rpc.calls[2]?.params[0] as { fromBlock: string; toBlock: string };
    expect([last.fromBlock, last.toBlock]).toEqual(['0x1004', '0x13eb']);
  });
  it('default cap is 20000 blocks', async () => {
    const r = await spentCheck(mockRpc([]), { ...base, head: 1_000_000n, routerOnly: true });
    expect(r.scannedTo).toBe(20_099n);
  });
  it('input validation', async () => {
    await expect(spentCheck(mockRpc([]), { ...base, head: 50n })).rejects.toThrow(HygieneError);
    await expect(spentCheck(mockRpc([]), { ...base, cap: 0 })).rejects.toThrow(HygieneError);
    await expect(spentCheck(mockRpc([]), { ...base, chunk: 0 })).rejects.toThrow(HygieneError);
    await expect(spentCheck(mockRpc([], 1), base)).rejects.toThrow(HygieneError);
    await expect(spentCheck(mockRpc([]), { ...base, net: 0n })).rejects.toThrow(HygieneError);
    await expect(spentCheck(mockRpc([]), { ...base, fromBlock: -1n })).rejects.toThrow(HygieneError);
  });
});

/** Deterministic rng double: counter-based (test only). */
function seqRng(start = 1) {
  let n = start;
  return {
    getRandomValues<T extends ArrayBufferView | null>(a: T): T {
      if (a instanceof Uint32Array)
        for (let i = 0; i < a.length; i++) a[i] = n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      return a;
    },
  };
}
const addr = (i: number): string => `0x${i.toString(16).padStart(40, '0')}`;

describe('pickDecoys (AT-HY-6)', () => {
  const pool = Array.from({ length: 30 }, (_, i) => addr(i + 1));
  it('k distinct, excludes owned, case-insensitive', () => {
    const owned = [pool[0] as string, (pool[1] as string).toUpperCase().replace('0X', '0x')];
    const d = pickDecoys(pool, owned, 7, seqRng());
    expect(d).toHaveLength(7);
    expect(new Set(d.map((x) => x.toLowerCase())).size).toBe(7);
    for (const x of d) expect(owned.map((o) => o.toLowerCase())).not.toContain(x.toLowerCase());
  });
  it('dedupes pool; shortage throws', () => {
    expect(() => pickDecoys([addr(1), addr(1), addr(2)], [], 3)).toThrow(/DECOY_SHORTAGE/);
    expect(() => pickDecoys(pool, pool.slice(0, 25), 7)).toThrow(HygieneError);
  });
  it('bad k and bad pool entries', () => {
    expect(() => pickDecoys(pool, [], 0)).toThrow(HygieneError);
    expect(() => pickDecoys(pool, [], 65)).toThrow(HygieneError);
    expect(() => pickDecoys(['nope'], [], 1)).toThrow(HygieneError);
  });
  it('order varies with rng and uses the real CSPRNG by default', () => {
    const a = pickDecoys(pool, [], 7, seqRng(1));
    const b = pickDecoys(pool, [], 7, seqRng(99));
    expect(a).not.toEqual(b);
    expect(pickDecoys(pool, [], 7)).toHaveLength(7);
  });
  it('property: never contains excluded, always k distinct', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 1, max: 15 }), (nEx, k) => {
        const ex = pool.slice(0, nEx);
        const d = pickDecoys(pool, ex, k, seqRng(nEx + k)).map((x) => x.toLowerCase());
        return d.length === k && new Set(d).size === k && d.every((x) => !ex.includes(x));
      }),
      { numRuns: 100 },
    );
  });
});

describe('rng edge cases', () => {
  it('uniform sampling rejects values in the biased tail', () => {
    let first = true;
    const rng = {
      getRandomValues<T extends ArrayBufferView | null>(a: T): T {
        if (a instanceof Uint32Array) a[0] = first ? 0xffff_ffff : 1;
        first = false;
        return a;
      },
    };
    const pool = [addr(1), addr(2), addr(3)];
    expect(pickDecoys(pool, [], 3, rng)).toHaveLength(3);
  });
  it('fails closed when no CSPRNG exists', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      expect(() => pickDecoys([addr(1), addr(2)], [], 2)).toThrow(/no secure random/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('batchedRead (HY-VER-4)', () => {
  const decoys = Array.from({ length: 7 }, (_, i) => addr(0x100 + i));
  const real = { method: 'eth_getTransactionCount' as const, address: STEALTH as `0x${string}` };
  function batchRpc(chainId = 84532) {
    const sent: { method: string; params: readonly unknown[] }[][] = [];
    const rpc: BatchRpc = {
      chainId,
      request: () => Promise.reject(new Error('single request must not be used')),
      batch: (calls) => {
        sent.push([...calls]);
        // answer = lowercase address tail so the test can see which entry was returned
        return Promise.resolve(calls.map((c) => `ans:${String(c.params[0]).toLowerCase()}`));
      },
    };
    return { rpc, sent };
  }
  it('one batch of 8, shuffled, only real answer returned', async () => {
    const { rpc, sent } = batchRpc();
    const out = await batchedRead(rpc, real, decoys, { rng: seqRng(5) });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(8);
    expect(out).toBe(`ans:${STEALTH.toLowerCase()}`);
    expect(sent[0]?.every((c) => c.method === 'eth_getTransactionCount' && c.params[1] === 'latest')).toBe(
      true,
    );
  });
  it('real position varies with rng', async () => {
    const pos = new Set<number>();
    for (let s = 1; s < 40; s++) {
      const { rpc, sent } = batchRpc();
      await batchedRead(rpc, real, decoys, { rng: seqRng(s * 7) });
      pos.add(sent[0]?.findIndex((c) => String(c.params[0]).toLowerCase() === STEALTH.toLowerCase()) ?? -1);
    }
    expect(pos.size).toBeGreaterThan(3);
  });
  it('fails closed without batch support unless allowed; then concurrent single requests', async () => {
    const calls: unknown[] = [];
    const rpc: BatchRpc = {
      chainId: 84532,
      request: (_m, p) => {
        calls.push(p);
        return Promise.resolve(`ans:${String(p[0]).toLowerCase()}`);
      },
    };
    await expect(batchedRead(rpc, real, decoys)).rejects.toThrow(/BATCH_UNSUPPORTED/);
    expect(calls).toHaveLength(0);
    expect(await batchedRead(rpc, real, decoys, { allowUnbatched: true })).toBe(
      `ans:${STEALTH.toLowerCase()}`,
    );
    expect(calls).toHaveLength(8);
  });
  it('rejects too few, duplicate, or real-equal decoys; chain guard', async () => {
    const { rpc } = batchRpc();
    await expect(batchedRead(rpc, real, decoys.slice(0, 6))).rejects.toThrow(/too few/);
    await expect(batchedRead(rpc, real, [...decoys.slice(0, 6), decoys[0] as string])).rejects.toThrow(
      HygieneError,
    );
    await expect(batchedRead(rpc, real, [...decoys.slice(0, 6), STEALTH.toLowerCase()])).rejects.toThrow(
      HygieneError,
    );
    await expect(batchedRead(rpc, real, decoys.slice(0, 3), { minDecoys: 3 })).resolves.toBeDefined();
    await expect(batchedRead(batchRpc(1).rpc, real, decoys)).rejects.toThrow(/testnet-only/);
  });
  it('detects a malformed batch response', async () => {
    const rpc: BatchRpc = {
      chainId: 84532,
      request: () => Promise.resolve(null),
      batch: () => Promise.resolve(['x']),
    };
    await expect(batchedRead(rpc, real, decoys)).rejects.toThrow(/RPC_MALFORMED/);
    const rpc2: BatchRpc = {
      chainId: 84532,
      request: () => Promise.resolve(null),
      batch: () => Promise.resolve('nope' as never),
    };
    await expect(batchedRead(rpc2, real, decoys)).rejects.toThrow(/RPC_MALFORMED/);
  });
});
