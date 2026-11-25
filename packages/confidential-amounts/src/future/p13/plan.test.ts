import { describe, expect, it } from 'vitest';
import { inspect } from 'node:util';
import { createAesGcmSealer, generateRecordKey } from './cipher.js';
import { buildDisclosure, disclosureDigest } from './disclosure.js';
import { CT1_ASSET, CTM_ASSET, NOW, mutable, sampleInvoice, seededBytes } from './fixtures.testutil.js';
import type { OperationContext } from './lifecycle.js';
import { authorizePlan, cancelPlan, prepareConfidentialPlan, reviewPlan, type PlanDeps, type PrepareInput } from './plan.js';
import { ConfidentialRecordStore, createMemoryKv } from './store.js';

const NS = 'p13:profile-1:eip155-31337';
const GATE = {
  enabled: true,
  protocolId: 'ctm-cleartext',
  allowFixture: true,
  consentDigest: disclosureDigest(buildDisclosure('ctm-cleartext')),
};
const PAYER = `0x${'0a'.repeat(20)}`;
const STEALTH = `0x${'0b'.repeat(20)}`;

async function env(epoch = 1) {
  let current = epoch;
  const kv = createMemoryKv();
  const sealer = createAesGcmSealer(await generateRecordKey(), { subtle: globalThis.crypto.subtle, rng: seededBytes(5) });
  const store = new ConfidentialRecordStore(kv, sealer, NS);
  const deps: PlanDeps = { store, epoch: { current: () => current }, clockMs: () => NOW * 1000, rng: seededBytes(9) };
  const ctx = (signal = new AbortController().signal): OperationContext => ({
    operationId: 'op',
    sessionEpoch: current,
    signal,
    deadlineMs: NOW * 1000 + 60_000,
  });
  const input = (overrides: Partial<PrepareInput> = {}): PrepareInput => ({
    invoice: sampleInvoice(),
    asset: mutable(CTM_ASSET),
    approved: [CTM_ASSET],
    gate: GATE,
    payer: PAYER,
    stealth: STEALTH,
    ctx: ctx(),
    ...overrides,
  });
  return { kv, store, deps, ctx, input, setEpoch: (e: number) => (current = e) };
}

describe('prepare and review (fixture only)', () => {
  it('prepares a plan, journals an encrypted record and returns no amount', async () => {
    const e = await env();
    const r = await prepareConfidentialPlan(e.input(), e.deps);
    if (!r.ok) throw new Error(r.code);
    const plan = r.value;
    expect(plan.evidence).toBe('fixture-only');
    expect(plan.publicEffects).toContain('amount'); // fixture: nothing hidden
    expect(plan.planDigest).toMatch(/^sha256:/);
    const text = JSON.stringify(plan);
    for (const leak of ['15000000', '14962500', '37500']) expect(text).not.toContain(leak);
    const list = await e.store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.status === 'ok' && list[0].summary.planDigest).toBe(plan.planDigest);
  });

  it('two preparations of the same invoice get distinct record ids and plan digests', async () => {
    const e = await env();
    const a = await prepareConfidentialPlan(e.input(), e.deps);
    const b = await prepareConfidentialPlan(e.input(), e.deps);
    expect(a.ok && b.ok && a.value.planDigest !== b.value.planDigest).toBe(true);
  });

  it('review returns amounts only as SecretAmounts and refuses a stale revision', async () => {
    const e = await env();
    const r = await prepareConfidentialPlan(e.input(), e.deps);
    if (!r.ok) throw new Error(r.code);
    const id = r.value.recoveryRef.slice('p13-record:'.length);
    const v = await reviewPlan(id, 1, GATE, e.ctx(), e.deps);
    if (!v.ok) throw new Error(v.code);
    expect(v.value.summary.state).toBe('reviewed');
    expect(v.value.amounts.gross.reveal((x) => x)).toBe(15_000_000n);
    expect(inspect(v.value)).not.toContain('15000000');
    expect(() => JSON.stringify(v.value)).toThrow();
    expect(await reviewPlan(id, 1, GATE, e.ctx(), e.deps)).toMatchObject({ ok: false, code: 'P13_RECORD_CONFLICT', retryable: true });
    expect(await reviewPlan(id, 2, GATE, e.ctx(), e.deps)).toMatchObject({ ok: false, code: 'P13_TRANSITION' });
  });

  it('settlement is refused end to end (P13-A01: no synthetic success)', () => {
    expect(authorizePlan(GATE, 31337)).toMatchObject({ ok: false, code: 'P13_SETTLEMENT_DISABLED' });
    expect(authorizePlan({ enabled: false }, 31337)).toMatchObject({ ok: false, code: 'P13_SETTLEMENT_DISABLED' });
  });

  it('cancel discards unsent work and is terminal', async () => {
    const e = await env();
    const r = await prepareConfidentialPlan(e.input(), e.deps);
    if (!r.ok) throw new Error(r.code);
    const id = r.value.recoveryRef.slice('p13-record:'.length);
    expect(await cancelPlan(id, 1, e.ctx(), e.deps)).toMatchObject({ ok: true, value: { state: 'cancelled' } });
    expect(await reviewPlan(id, 2, GATE, e.ctx(), e.deps)).toMatchObject({ ok: false, code: 'P13_TRANSITION' });
    expect(await cancelPlan('ab'.repeat(16), 1, e.ctx(), e.deps)).toMatchObject({ ok: false, code: 'P13_RECORD_INVALID' });
  });
});

describe('refusals (gate, asset, invoice, session)', () => {
  it.each<[string, Partial<PrepareInput>, string]>([
    ['default-off gate', { gate: { enabled: false } }, 'P13_DISABLED'],
    ['CT-1 requested', { gate: { ...GATE, protocolId: 'ct1-zama' } }, 'P13_UNSUPPORTED'],
    ['stale consent', { gate: { ...GATE, consentDigest: `sha256:${'00'.repeat(32)}` } }, 'P13_CONSENT_REQUIRED'],
    ['asset not approved', { approved: [] }, 'P13_ASSET_NOT_APPROVED'],
    ['CT-1 asset with fixture gate', { asset: mutable(CT1_ASSET), approved: [CT1_ASSET] }, 'P13_UNSUPPORTED'],
    ['malformed asset', { asset: { ...mutable(CTM_ASSET), rate: '1' } }, 'P13_INVALID_ASSET'],
    ['fiat invoice', { invoice: sampleInvoice({ amountPolicy: { mode: 'fiat_quote' } }) }, 'P13_INVOICE_INCOMPATIBLE'],
    ['mixed-case payer', { payer: `0x${'0A'.repeat(20)}` }, 'P13_INVALID_ASSET'],
    ['payer equals stealth', { payer: STEALTH }, 'P13_INVALID_ASSET'],
    ['zero stealth', { stealth: `0x${'00'.repeat(20)}` }, 'P13_INVALID_ASSET'],
    ['invoice on Sepolia (fixture is local only)', { invoice: sampleInvoice({ chainId: 11155111 }) }, 'P13_NETWORK_REFUSED'],
  ])('refuses %s and writes nothing', async (_name, overrides, code) => {
    const e = await env();
    expect(await prepareConfidentialPlan(e.input(overrides), e.deps)).toMatchObject({ ok: false, code });
    expect(e.kv.raw.size).toBe(0);
  });

  it('a completion after a lock or account switch is dropped (P13-A11)', async () => {
    const e = await env(1);
    const ctx = e.ctx();
    e.setEpoch(2);
    expect(await prepareConfidentialPlan(e.input({ ctx }), e.deps)).toMatchObject({ ok: false, code: 'P13_STALE' });
    expect(e.kv.raw.size).toBe(0);
  });

  it('a cancelled operation writes nothing', async () => {
    const e = await env();
    const ac = new AbortController();
    ac.abort();
    expect(await prepareConfidentialPlan(e.input({ ctx: e.ctx(ac.signal) }), e.deps)).toMatchObject({ ok: false, code: 'P13_CANCELLED' });
    expect(e.kv.raw.size).toBe(0);
  });

  it('a review in a newer session than the preparation is refused', async () => {
    const e = await env(1);
    const r = await prepareConfidentialPlan(e.input(), e.deps);
    if (!r.ok) throw new Error(r.code);
    e.setEpoch(2);
    const id = r.value.recoveryRef.slice('p13-record:'.length);
    expect(await reviewPlan(id, 1, GATE, e.ctx(), e.deps)).toMatchObject({ ok: false, code: 'P13_STALE' });
    expect(await reviewPlan(id, 1, { enabled: false }, e.ctx(), e.deps)).toMatchObject({ ok: false, code: 'P13_DISABLED' });
    expect(await reviewPlan('cd'.repeat(16), 1, GATE, e.ctx(), e.deps)).toMatchObject({ ok: false, code: 'P13_RECORD_INVALID' });
  });

  it('rejects an rng that returns the wrong length or zeros', async () => {
    const e = await env();
    const short = await prepareConfidentialPlan(e.input(), { ...e.deps, rng: () => new Uint8Array(8) });
    const zero = await prepareConfidentialPlan(e.input(), { ...e.deps, rng: (n) => new Uint8Array(n) });
    expect(short).toMatchObject({ ok: false, code: 'P13_INTERNAL' });
    expect(zero).toMatchObject({ ok: false, code: 'P13_INTERNAL' });
  });
});
