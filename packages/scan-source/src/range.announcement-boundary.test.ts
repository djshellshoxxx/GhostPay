import { describe, expect, it } from 'vitest';
import { createRangeSource } from './range.js';
import { headOf, rawAnn } from './testutil.js';
import type { FetchRequest, RangeBackend } from './types.js';

const request: FetchRequest = { chainId: 31337, fromBlock: 1000n, toBlock: 2999n };

describe('range source record isolation', () => {
  it('counts unreadable records and preserves valid records across both windows', async () => {
    const first = rawAnn(1010, 0);
    const unreadable = rawAnn(1020, 0);
    Object.defineProperty(unreadable, 'blockNumber', {
      get() { throw new Error('fixture record is unreadable'); },
    });
    const revoked = Proxy.revocable(rawAnn(2020, 0), {});
    revoked.revoke();
    const calls: FetchRequest[] = [];
    const head = headOf();
    const backend: RangeBackend = {
      getHead: () => Promise.resolve(head),
      getAnnouncements: (req) => {
        calls.push(req);
        if (req.fromBlock === 1000n) {
          return Promise.resolve([first, unreadable, first, rawAnn(1100, 1)]);
        }
        return Promise.resolve([revoked.proxy, rawAnn(2010, 0)]);
      },
    };

    const result = await createRangeSource({ chainId: 31337, backend }).fetch(request);

    expect(calls).toEqual([
      { chainId: 31337, fromBlock: 1000n, toBlock: 1999n },
      { chainId: 31337, fromBlock: 2000n, toBlock: 2999n },
    ]);
    expect(result.coverage).toEqual({ fromBlock: 1000n, toBlock: 2999n });
    expect(result.head).toEqual(head);
    expect(result.announcements.map((a) => [a.blockNumber, a.logIndex])).toEqual([
      [1010n, 0], [1100n, 1], [2010n, 0],
    ]);
    expect(result.skipped).toBe(3); // two unreadable records and one duplicate
  });

  it('does not turn a failed later backend request into a successful partial scan', async () => {
    const failure = new Error('fixture backend unavailable');
    const calls: FetchRequest[] = [];
    const backend: RangeBackend = {
      getHead: () => Promise.resolve(headOf()),
      getAnnouncements: (req) => {
        calls.push(req);
        return req.fromBlock === 1000n
          ? Promise.resolve([rawAnn(1010, 0)])
          : Promise.reject(failure);
      },
    };

    await expect(createRangeSource({ chainId: 31337, backend }).fetch(request)).rejects.toBe(failure);
    expect(calls.map((req) => req.fromBlock)).toEqual([1000n, 2000n]);
  });
});
