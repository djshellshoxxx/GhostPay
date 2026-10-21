import { describe, expect, it } from 'vitest';
import type { SolanaStealthError } from './errors.js';
import {
  createHttpRpc,
  getLatestBlockhash,
  getMinimumBalanceForRentExemption,
  getSignaturesForAddress,
  getSlot,
  getTransaction,
  parseJsonLossless,
  toU64,
} from './rpc.js';
import { MockRpc } from './rpc.mock.testutil.js';

const code = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    return (e as SolanaStealthError).code;
  }
  return 'NO_THROW';
};

function fakeFetch(
  respond: (body: { id: number; method: string }) => { status?: number; text: string } | Error,
): typeof fetch {
  return (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { id: number; method: string };
    const r = respond(body);
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(new Response(r.text, { status: r.status ?? 200 }));
  };
}

describe('createHttpRpc', () => {
  it('validates the URL', async () => {
    expect(await code(() => createHttpRpc({ url: 'not a url' }))).toBe('INVALID_INPUT');
    expect(await code(() => createHttpRpc({ url: 'http://example.com' }))).toBe('INVALID_INPUT');
    expect(await code(() => createHttpRpc({ url: 'https://u:p@example.com' }))).toBe('INVALID_INPUT');
    expect(createHttpRpc({ url: 'http://127.0.0.1:8899' })).toBeDefined();
    expect(createHttpRpc({ url: 'http://localhost:8899' })).toBeDefined();
  });
  it('round-trips a result and keeps u64 precision', async () => {
    const rpc = createHttpRpc({
      url: 'https://rpc.invalid',
      fetch: fakeFetch((b) => ({ text: `{"jsonrpc":"2.0","id":${b.id},"result":18446744073709551615}` })),
    });
    expect(await rpc.request('getSlot', [])).toBe(18446744073709551615n);
  });
  it.each([
    ['http error', () => ({ status: 500, text: '' }), 'TRANSPORT_FAILURE'],
    ['network error', () => new Error('boom'), 'TRANSPORT_FAILURE'],
    ['bad json', () => ({ text: '{' }), 'INVALID_RESPONSE'],
    ['non-object', () => ({ text: '1' }), 'INVALID_RESPONSE'],
    ['id mismatch', () => ({ text: '{"id":999,"result":1}' }), 'INVALID_RESPONSE'],
    ['rpc error', (b: { id: number }) => ({ text: `{"id":${b.id},"error":{"code":-1}}` }), 'RPC_ERROR'],
    ['missing result', (b: { id: number }) => ({ text: `{"id":${b.id}}` }), 'INVALID_RESPONSE'],
  ] as const)('%s', async (_n, respond, expected) => {
    const rpc = createHttpRpc({ url: 'https://rpc.invalid', fetch: fakeFetch(respond) });
    expect(await code(() => rpc.request('getSlot', []))).toBe(expected);
  });
  it('honours abort', async () => {
    const ac = new AbortController();
    ac.abort();
    const rpc = createHttpRpc({ url: 'https://rpc.invalid', fetch: fakeFetch(() => new Error('x')) });
    expect(await code(() => rpc.request('getSlot', [], ac.signal))).toBe('ABORTED');
    const ac2 = new AbortController();
    const rpc2 = createHttpRpc({
      url: 'https://rpc.invalid',
      fetch: fakeFetch(() => {
        ac2.abort();
        return new Error('aborted');
      }),
    });
    expect(await code(() => rpc2.request('getSlot', [], ac2.signal))).toBe('ABORTED');
  });
});

describe('json + typed helpers', () => {
  it('parseJsonLossless', () => {
    expect(parseJsonLossless('{"a":9007199254740993}')).toEqual({ a: 9007199254740993n });
    expect(parseJsonLossless('[1,2.5]')).toEqual([1, 2.5]);
    expect(() => parseJsonLossless('1e300')).toThrow();
  });
  it('toU64', async () => {
    expect(toU64(3)).toBe(3n);
    expect(toU64(3n)).toBe(3n);
    for (const bad of [-1, 1.5, '3', -1n, null])
      expect(await code(() => toU64(bad))).toBe('INVALID_RESPONSE');
  });
  it('typed wrappers parse responses', async () => {
    const rpc = new MockRpc({
      getLatestBlockhash: () => ({ context: {}, value: { blockhash: 'abc', lastValidBlockHeight: 7 } }),
      getMinimumBalanceForRentExemption: () => 890880,
      getSlot: () => 42,
      getSignaturesForAddress: () => [
        { signature: 's', slot: 1, err: null },
        { signature: 't', slot: 2, err: { x: 1 } },
      ],
    });
    expect(await getLatestBlockhash(rpc)).toEqual({ blockhash: 'abc', lastValidBlockHeight: 7n });
    expect(await getMinimumBalanceForRentExemption(rpc, 0)).toBe(890880n);
    expect(await code(() => getMinimumBalanceForRentExemption(rpc, -1))).toBe('INVALID_INPUT');
    expect(await getSlot(rpc)).toBe(42n);
    expect(await getSignaturesForAddress(rpc, 'a', { limit: 2, before: 'z' })).toEqual([
      { signature: 's', slot: 1n, failed: false },
      { signature: 't', slot: 2n, failed: true },
    ]);
    expect(rpc.calls.at(-1)?.params).toEqual(['a', { limit: 2, commitment: 'finalized', before: 'z' }]);
  });
  it('rejects malformed shapes', async () => {
    const bad = new MockRpc({
      getSignaturesForAddress: () => ({}),
      getLatestBlockhash: () => ({ value: { blockhash: 1, lastValidBlockHeight: 1 } }),
      getTransaction: () => [],
    });
    expect(await code(() => getSignaturesForAddress(bad, 'a', { limit: 1 }))).toBe('INVALID_RESPONSE');
    expect(await code(() => getLatestBlockhash(bad))).toBe('INVALID_RESPONSE');
    expect(await code(() => getTransaction(bad, 's'))).toBe('INVALID_RESPONSE');
  });
});

describe('getTransaction', () => {
  const good = {
    slot: 10,
    transaction: {
      signatures: ['sig'],
      message: { accountKeys: ['A', 'B'], instructions: [{ programIdIndex: 1, accounts: [0], data: '2' }] },
    },
    meta: {
      err: null,
      preBalances: [5, 0],
      postBalances: [1, 4],
      preTokenBalances: [],
      postTokenBalances: [{ accountIndex: 1, mint: 'M', owner: 'O', uiTokenAmount: { amount: '12' } }],
      loadedAddresses: { writable: ['C'], readonly: ['D'] },
    },
  };
  it('parses and appends loaded addresses', async () => {
    const tx = await getTransaction(new MockRpc({ getTransaction: () => good }), 'sig');
    expect(tx?.accountKeys).toEqual(['A', 'B', 'C', 'D']);
    expect(tx?.postTokenBalances[0]?.amount).toBe(12n);
    expect(tx?.failed).toBe(false);
    expect(await getTransaction(new MockRpc({ getTransaction: () => null }), 'sig')).toBeNull();
  });
  const mutate = (f: (g: typeof good) => void): unknown => {
    const g = structuredClone(good);
    f(g);
    return g;
  };
  it.each([
    ['sig mismatch', mutate((g) => (g.transaction.signatures = ['other']))],
    ['bad ix list', mutate((g) => ((g.transaction.message as Record<string, unknown>)['instructions'] = 1))],
    [
      'bad accounts',
      mutate((g) => ((g.transaction.message.instructions[0] as Record<string, unknown>)['accounts'] = 1)),
    ],
    ['bad index', mutate((g) => (g.transaction.message.instructions[0]!.programIdIndex = 999))],
    ['bad balances', mutate((g) => ((g.meta as Record<string, unknown>)['preBalances'] = 1))],
    ['bad token amount', mutate((g) => (g.meta.postTokenBalances[0]!.uiTokenAmount.amount = '-1'))],
    ['bad token list', mutate((g) => ((g.meta as Record<string, unknown>)['postTokenBalances'] = 1))],
  ])('%s', async (_n, resp) => {
    expect(await code(() => getTransaction(new MockRpc({ getTransaction: () => resp }), 'sig'))).toBe(
      'INVALID_RESPONSE',
    );
  });
  it('tolerates null token balances and missing owner', async () => {
    const g = mutate((x) => {
      (x.meta as Record<string, unknown>)['preTokenBalances'] = null;
      delete (x.meta.postTokenBalances[0] as Record<string, unknown>)['owner'];
      (x.meta as Record<string, unknown>)['loadedAddresses'] = null;
    });
    const tx = await getTransaction(new MockRpc({ getTransaction: () => g }), 'sig');
    expect(tx?.postTokenBalances[0]?.owner).toBeUndefined();
    expect(tx?.preTokenBalances).toEqual([]);
  });
});
