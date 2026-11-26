import { describe, expect, it } from 'vitest';
import { UxPrivacyError } from './errors.js';
import {
  describePolicy,
  toSchemePolicyInput,
  validateFriendlyPolicy,
  type FriendlyGuardian,
  type FriendlyPolicy,
  type FriendlySpendLimit,
} from './policy.js';

const DEST = '0x1111111111111111111111111111111111111111';
const GUARDIAN = '0x2222222222222222222222222222222222222222';
const NATIVE = '0x0000000000000000000000000000000000000000';
const limit: FriendlySpendLimit = {
  token: NATIVE,
  symbol: 'ETH',
  decimals: 18,
  limit: 1_000_000_000_000_000_000n,
  windowSeconds: 86400n,
};
const base: FriendlyPolicy = {
  destination: DEST,
  timeLockSeconds: 86400n,
  spendLimits: [limit],
};

function codes(policy: FriendlyPolicy): string[] {
  return validateFriendlyPolicy(policy).issues.map((i) => i.code);
}

describe('reject sparse policy arrays before trusted description/conversion', () => {
  it('rejects a missing spend-limit row rather than silently skipping it', () => {
    const rows: FriendlySpendLimit[] = [limit];
    rows.length = 2; // an actual hole, not an explicit undefined entry
    const policy: FriendlyPolicy = { ...base, spendLimits: rows };
    expect(validateFriendlyPolicy(policy).ok).toBe(false);
    expect(codes(policy)).toContain('INVALID_LIMITS');
    expect(() => describePolicy(policy)).toThrow(UxPrivacyError);
    expect(() => toSchemePolicyInput(policy)).toThrow(UxPrivacyError);
  });

  it('rejects an empty slot in an allowlist even when the destination is listed', () => {
    const entries: string[] = [DEST];
    entries.length = 2;
    const policy: FriendlyPolicy = { ...base, allowlist: entries };
    expect(validateFriendlyPolicy(policy).ok).toBe(false);
    expect(codes(policy)).toContain('INVALID_ADDRESS');
    expect(() => describePolicy(policy)).toThrow(UxPrivacyError);
    expect(() => toSchemePolicyInput(policy)).toThrow(UxPrivacyError);
  });

  it('rejects a hole in a guardian list rather than accepting an underspecified threshold', () => {
    const guardians: FriendlyGuardian[] = [{ address: GUARDIAN }];
    guardians.length = 2;
    const policy: FriendlyPolicy = { ...base, guardians, guardianThreshold: 1 };
    expect(validateFriendlyPolicy(policy).ok).toBe(false);
    expect(codes(policy)).toContain('INVALID_GUARDIANS');
    expect(() => describePolicy(policy)).toThrow(UxPrivacyError);
  });

  it('rejects an entirely sparse nonempty guardian list', () => {
    const guardians = new Array<FriendlyGuardian>(1);
    const policy: FriendlyPolicy = { ...base, guardians, guardianThreshold: 1 };
    expect(validateFriendlyPolicy(policy).ok).toBe(false);
    expect(codes(policy)).toContain('INVALID_GUARDIANS');
  });

  it('preserves ordinary dense and empty-array policies, including the parent threshold fix', () => {
    expect(validateFriendlyPolicy(base).ok).toBe(true);
    expect(validateFriendlyPolicy({ ...base, spendLimits: [] }).ok).toBe(true);
    expect(validateFriendlyPolicy({ ...base, allowlist: [DEST] }).ok).toBe(true);
    expect(validateFriendlyPolicy({
      ...base,
      guardians: [{ address: GUARDIAN }],
      guardianThreshold: 1,
    }).ok).toBe(true);
    expect(codes({ ...base, guardians: [], guardianThreshold: 1 })).toContain('INVALID_THRESHOLD');
    expect(codes({ ...base, guardians: [] })).not.toContain('INVALID_THRESHOLD');
    const scheme = toSchemePolicyInput(base);
    expect(scheme.limits).toHaveLength(1);
    expect(describePolicy(base).lines.some((line) => line.feature === 'spendLimit')).toBe(true);
  });
});
