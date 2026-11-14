import { describe, expect, it } from 'vitest';
import { containsTestData, toRealProfileId } from './brand.js';
import { SandboxError } from './errors.js';
import {
  Sandbox,
  assertRealProfile,
  assertSameDomain,
  assertTestProfile,
  type AnyProfile,
} from './sandbox.js';
import { manualClock, seededRng } from './sandbox.testutil.js';

const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return (e as SandboxError).code;
  }
  return undefined;
};
const mk = () => new Sandbox({ rng: seededRng(11), clock: manualClock().clock });

describe('Sandbox', () => {
  it('starts in real mode with chain inaccessible', () => {
    const s = mk();
    expect(s.getState().mode).toBe('real');
    expect(s.banner().visible).toBe(false);
    expect(code(() => s.getChain())).toBe('not-test-mode');
    expect(code(() => s.getFaucet())).toBe('not-test-mode');
    expect(code(() => s.createProfile())).toBe('not-test-mode');
    expect(code(() => s.reset())).toBe('not-test-mode');
  });
  it('enter shows banner; exit wipes data', () => {
    const s = mk();
    s.enter();
    expect(s.banner().visible).toBe(true);
    const p = s.createProfile('Demo');
    s.getFaucet().drip(p.address);
    s.getChain().mine(3);
    expect(s.getChain().getBalance(p.address)).toBe(1_000_000n);
    s.exit();
    expect(s.getState().mode).toBe('real');
    s.enter();
    expect(s.getChain().listAccounts()).toEqual([]);
    expect(code(() => s.getFaucet().drip(p.address))).toBe('unknown-account');
  });
  it('reset wipes but stays in test mode and bumps epoch; faucet limits cleared', () => {
    const s = mk();
    s.enter();
    const e = s.getState().epoch;
    const p = s.createProfile();
    s.getFaucet().drip(p.address);
    s.reset();
    expect(s.getState()).toMatchObject({ mode: 'test', visual: 'test-distinct', epoch: e + 1 });
    expect(s.getChain().listTxs()).toEqual([]);
    const p2 = s.createProfile();
    expect(s.getFaucet().drip(p2.address).ok).toBe(true);
  });
  it('exit when already real is harmless; enter is idempotent', () => {
    const s = mk();
    expect(s.exit().epoch).toBe(0);
    s.enter();
    const st = s.enter();
    expect(st.epoch).toBe(1);
  });
  it('profiles are branded test data', () => {
    const s = mk();
    s.enter();
    const p = s.createProfile();
    expect(containsTestData(p)).toBe(true);
    expect(p.kind).toBe('test');
  });
});

describe('profile mixing guards', () => {
  const s = mk();
  s.enter();
  const t = s.createProfile();
  const r: AnyProfile = { kind: 'real', id: toRealProfileId('alice') };
  it('assertSameDomain allows homogenous sets', () => {
    expect(() => assertSameDomain(t, s.createProfile())).not.toThrow();
    expect(() => assertSameDomain(r, { kind: 'real', id: toRealProfileId('bob') })).not.toThrow();
    expect(() => assertSameDomain()).not.toThrow();
  });
  it('assertSameDomain blocks mixing', () => {
    expect(code(() => assertSameDomain(t, r))).toBe('test-data-in-real-context');
  });
  it('runtime checks catch forged objects that defeat the type system', () => {
    const forgedReal = { kind: 'real', id: t.id } as unknown as AnyProfile;
    const forgedTest = { kind: 'test', id: 'alice' } as unknown as AnyProfile;
    expect(code(() => assertRealProfile(forgedReal))).toBe('test-data-in-real-context');
    expect(code(() => assertTestProfile(forgedTest))).toBe('real-data-in-test-context');
    expect(code(() => assertTestProfile(r))).toBe('real-data-in-test-context');
    expect(code(() => assertRealProfile(t))).toBe('test-data-in-real-context');
    expect(code(() => assertSameDomain(forgedReal))).toBe('test-data-in-real-context');
    expect(code(() => assertSameDomain(forgedTest))).toBe('real-data-in-test-context');
  });
});
