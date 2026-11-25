import { describe, expect, it } from 'vitest';
import { inspect } from 'node:util';
import { UINT64_MAX } from '../../abi.js';
import { P13Error, toResult } from './errors.js';
import { SecretAmount, assertNoSecretAmount } from './secret.js';

const codeOf = (fn: () => unknown): string => {
  const r = toResult(fn);
  return r.ok ? 'ok' : r.code;
};
const PLAIN = 123_456_789n;

describe('SecretAmount (client-side amount lifecycle)', () => {
  it('holds an in-domain amount and reveals it only inside a callback', () => {
    const s = SecretAmount.from(PLAIN);
    expect(s.reveal((v) => v * 2n)).toBe(PLAIN * 2n);
    expect(SecretAmount.fromDecimalUnits('42').reveal((v) => v)).toBe(42n);
    expect(SecretAmount.from(UINT64_MAX).reveal((v) => v)).toBe(UINT64_MAX);
  });

  it('refuses zero, negative, over-range and malformed amounts', () => {
    expect(codeOf(() => SecretAmount.from(0n))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => SecretAmount.from(-5n))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => SecretAmount.from(UINT64_MAX + 1n))).toBe('P13_AMOUNT_RANGE');
    expect(codeOf(() => SecretAmount.fromDecimalUnits('1e3'))).toBe('P13_INVALID_AMOUNT');
    expect(SecretAmount.from(0n, { min: 0n, max: 10n }).reveal((v) => v)).toBe(0n);
  });

  it('never serialises: JSON, String, template and number coercion throw; inspect is redacted', () => {
    const s = SecretAmount.from(PLAIN);
    expect(codeOf(() => JSON.stringify({ amount: s }))).toBe('P13_SECRET_SERIALIZE');
    expect(codeOf(() => String(s))).toBe('P13_SECRET_SERIALIZE');
    expect(codeOf(() => `${s as unknown as string}`)).toBe('P13_SECRET_SERIALIZE');
    expect(codeOf(() => +(s as unknown as number))).toBe('P13_SECRET_SERIALIZE');
    expect(s.toString()).toBe('[SecretAmount]');
    expect(inspect({ s })).not.toContain(PLAIN.toString());
    expect(inspect(s)).toBe('[SecretAmount]');
    expect(Object.keys(s)).toEqual([]);
    expect(Reflect.ownKeys(s)).toEqual([]);
  });

  it('structuredClone yields an empty object, not the amount', () => {
    const clone: unknown = structuredClone(SecretAmount.from(PLAIN));
    expect(clone).toEqual({});
    expect(clone instanceof SecretAmount).toBe(false);
  });

  it('dispose drops the value; later use fails loudly', () => {
    const s = SecretAmount.from(PLAIN);
    s.dispose();
    s.dispose();
    expect(s.disposed).toBe(true);
    expect(codeOf(() => s.reveal((v) => v))).toBe('P13_SECRET_DISPOSED');
    expect(() => s.reveal((v) => v)).toThrow(P13Error);
  });

  it('equals compares values without revealing them to the caller', () => {
    expect(SecretAmount.from(5n).equals(SecretAmount.from(5n))).toBe(true);
    expect(SecretAmount.from(5n).equals(SecretAmount.from(6n))).toBe(false);
  });
});

describe('assertNoSecretAmount (payload boundary)', () => {
  it('passes plain public payloads', () => {
    expect(() => assertNoSecretAmount({ a: [1, 'x', { b: null }], c: true })).not.toThrow();
  });

  it('finds secrets and raw bigints nested in objects and arrays', () => {
    expect(codeOf(() => assertNoSecretAmount({ a: [{ b: SecretAmount.from(1n) }] }))).toBe('P13_SECRET_SERIALIZE');
    expect(codeOf(() => assertNoSecretAmount({ amount: 5n }))).toBe('P13_SECRET_SERIALIZE');
    expect(codeOf(() => assertNoSecretAmount(new Map([['k', 1]])))).toBe('P13_SECRET_SERIALIZE');
  });

  it('bounds depth and size so a hostile payload cannot hang the check', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 20; i++) deep = [deep];
    expect(codeOf(() => assertNoSecretAmount(deep))).toBe('P13_RECORD_LIMIT');
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(codeOf(() => assertNoSecretAmount(cyclic))).toBe('P13_RECORD_LIMIT');
  });
});
