import { describe, expect, it } from 'vitest';
import { assertNoPresign, createMemoryPlanStore, createSealedPlanStore, parsePlan, serializePlan } from './store.js';
import { makePlan } from './helpers.testutil.js';
import type { HopPlan } from './types.js';

const throwsCode = (f: () => unknown, c: string): void => {
  try { f(); } catch (e) { expect((e as { code: string }).code).toBe(c); return; }
  throw new Error('no throw');
};

describe('serialisation', () => {
  it('round-trips bigints and has no key/signature-shaped fields (HOP-REQ-7)', async () => {
    const { plan } = await makePlan({ hops: 3 });
    const text = serializePlan(plan);
    expect(text).not.toMatch(/"[^"]*(sig|signature|rawTx|privateKey|secret)[^"]*"\s*:/i);
    expect(parsePlan(text)).toEqual(plan);
  });
  it('refuses forbidden keys anywhere, including nested', async () => {
    const { plan } = await makePlan({ hops: 2 });
    for (const k of ['signature', 'sig', 'rawTx', 'privateKey', 'secretScalar']) {
      const bad = { ...plan, legs: plan.legs.map((l, i) => (i === 0 ? { ...l, [k]: '0x01' } : l)) } as unknown as HopPlan;
      throwsCode(() => serializePlan(bad), 'PRESIGN_FORBIDDEN');
    }
    throwsCode(() => serializePlan({ ...plan, extra: { deep: { privateKey: 1 } } } as unknown as HopPlan), 'PRESIGN_FORBIDDEN');
    throwsCode(() => serializePlan({ ...plan, chainId: 1 }), 'MAINNET_FORBIDDEN');
  });
  it('parse rejects junk and smuggled keys', () => {
    throwsCode(() => parsePlan('{'), 'INVALID_INPUT');
    throwsCode(() => parsePlan('{"a":1}'), 'INVALID_INPUT');
    throwsCode(() => parsePlan('null'), 'INVALID_INPUT');
    throwsCode(() => parsePlan('{"legs":[],"chainId":31337,"signature":"0x"}'), 'PRESIGN_FORBIDDEN');
  });
  it('assertNoPresign: unknown leg field or signing state on waiting leg', async () => {
    const { plan } = await makePlan({ hops: 2 });
    assertNoPresign(plan);
    throwsCode(() => assertNoPresign({ ...plan, legs: plan.legs.map((l) => ({ ...l, payload: 1 })) }), 'PRESIGN_FORBIDDEN');
    throwsCode(() => assertNoPresign({ ...plan, legs: plan.legs.map((l) => ({ ...l, nonce: 1n })) }), 'PRESIGN_FORBIDDEN');
    throwsCode(() => assertNoPresign({ ...plan, legs: plan.legs.map((l) => ({ ...l, txHash: '0x01' as const })) }), 'PRESIGN_FORBIDDEN');
  });
});

describe('stores', () => {
  it('memory store save/load/miss', async () => {
    const { plan } = await makePlan();
    const s = createMemoryPlanStore();
    expect(await s.load(plan.id)).toBeNull();
    await s.save(plan);
    expect(await s.load(plan.id)).toEqual(plan);
  });
  it('sealed store: blob holds no plaintext address; roundtrip', async () => {
    const { plan } = await makePlan();
    const blobs = new Map<string, Uint8Array>();
    const sealer = {
      seal: (b: Uint8Array) => Promise.resolve(b.map((x) => x ^ 0x5a)),
      open: (b: Uint8Array) => Promise.resolve(b.map((x) => x ^ 0x5a)),
    };
    const s = createSealedPlanStore({ put: (k, v) => { blobs.set(k, v); return Promise.resolve(); }, get: (k) => Promise.resolve(blobs.get(k) ?? null) }, sealer);
    expect(await s.load(plan.id)).toBeNull();
    await s.save(plan);
    const raw = new TextDecoder().decode(blobs.get(`hops/${plan.id}`));
    expect(raw).not.toContain(plan.source);
    expect(await s.load(plan.id)).toEqual(plan);
  });
});
