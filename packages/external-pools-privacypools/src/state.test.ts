import { describe, expect, it } from 'vitest';
import { decodeProofCache, encodeProofCache, readStateLeaves } from './state.js';
import { PoolEnv, POOL } from './fakes.testutil.js';
import { rig } from './harness.testutil.js';

describe('proof cache (EP-VAULT-5)', () => {
  it('round-trips and rejects malformed data', () => {
    const c = { stateLeaves: [1n, 2n ** 200n], aspLeaves: [3n] };
    expect(decodeProofCache(encodeProofCache(c))).toEqual(c);
    const bad = (t: string): void => expect(() => decodeProofCache(new TextEncoder().encode(t))).toThrow(/malformed/);
    bad('nope');
    bad('{"v":2,"s":[],"a":[]}');
    bad('{"v":1,"s":"x","a":[]}');
    bad('{"v":1,"s":[1],"a":[]}');
    bad('{"v":1,"s":["x"],"a":[]}');
    bad('{"v":1,"s":[],"a":[-1]}');
  });
});

describe('readStateLeaves', () => {
  it('detects duplicate and undecodable logs and clamps the last chunk', async () => {
    const r = rig();
    await r.enter();
    await r.enter();
    const reader = r.env.reader();
    const ok = await readStateLeaves(reader, 31337, POOL, 0n, 400n);
    expect(ok.leaves).toHaveLength(2);
    const leaf = r.env.logs.find((l) => l.address === POOL && l.topics.length === 1)!;
    r.env.logs.push({ ...leaf });
    await expect(readStateLeaves(reader, 31337, POOL, 0n)).rejects.toMatchObject({ code: 'STATE_UNAVAILABLE' });
    const env2 = new PoolEnv();
    env2.block = 5000n;
    env2.logs.push({ ...leaf, data: '0x12' });
    await expect(readStateLeaves(env2.reader(), 31337, POOL, 0n)).rejects.toThrow();
    const empty = await readStateLeaves(new PoolEnv().reader(), 31337, POOL, 0n);
    expect(empty).toEqual({ leaves: [], lastRoot: 0n });
  });
});
