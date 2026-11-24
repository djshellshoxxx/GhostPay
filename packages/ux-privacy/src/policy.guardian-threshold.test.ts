import { describe, expect, it } from 'vitest';
import { UxPrivacyError } from './errors.js';
import {
  describePolicy,
  toSchemePolicyInput,
  validateFriendlyPolicy,
  type FriendlyPolicy,
} from './policy.js';

const DEST = '0x1111111111111111111111111111111111111111';
const GUARDIAN = '0x2222222222222222222222222222222222222222';
const base: FriendlyPolicy = {
  destination: DEST,
  timeLockSeconds: 86400n,
  spendLimits: [],
};

describe('empty guardian list threshold validation', () => {
  it.each([0, 1, 2])('rejects threshold %i when guardians is an empty array', (threshold) => {
    const policy: FriendlyPolicy = { ...base, guardians: [], guardianThreshold: threshold };
    const result = validateFriendlyPolicy(policy);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'INVALID_THRESHOLD',
        field: 'guardianThreshold',
      }),
    );
  });

  it('refuses invalid empty-list thresholds before describing or converting a policy', () => {
    const policy: FriendlyPolicy = { ...base, guardians: [], guardianThreshold: 1 };
    expect(() => describePolicy(policy)).toThrow(UxPrivacyError);
    expect(() => toSchemePolicyInput(policy)).toThrow(UxPrivacyError);
  });

  it('still accepts no guardians and no threshold, including an explicitly empty list', () => {
    expect(validateFriendlyPolicy(base).ok).toBe(true);
    expect(validateFriendlyPolicy({ ...base, guardians: [] }).ok).toBe(true);
  });

  it('still accepts a valid single guardian and rejects an absent guardian list with threshold', () => {
    expect(
      validateFriendlyPolicy({
        ...base,
        guardians: [{ address: GUARDIAN }],
        guardianThreshold: 1,
      }).ok,
    ).toBe(true);
    expect(validateFriendlyPolicy({ ...base, guardianThreshold: 1 }).ok).toBe(false);
  });
});
