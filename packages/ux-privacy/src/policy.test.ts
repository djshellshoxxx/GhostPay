import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { UxPrivacyError } from './errors.js';
import {
  UNLIMITED_LIMIT,
  describePolicy,
  formatDuration,
  formatUnits,
  shortAddress,
  toSchemePolicyInput,
  validateFriendlyPolicy,
  type FriendlyPolicy,
} from './policy.js';

const DEST = '0x1111111111111111111111111111111111111111';
const G1 = '0x2222222222222222222222222222222222222222';
const G2 = '0x3333333333333333333333333333333333333333';
const USDC = '0x4444444444444444444444444444444444444444';
const NATIVE = '0x0000000000000000000000000000000000000000';

const base: FriendlyPolicy = {
  name: 'Savings',
  destination: DEST,
  timeLockSeconds: 2n * 86400n,
  spendLimits: [
    { token: NATIVE, symbol: 'ETH', decimals: 18, limit: 1_500_000_000_000_000_000n, windowSeconds: 86400n },
    { token: USDC, symbol: 'USDC', decimals: 6, limit: 250_000_000n, windowSeconds: 7n * 86400n },
  ],
};
const codes = (p: FriendlyPolicy) => validateFriendlyPolicy(p).issues.map((i) => `${i.severity}:${i.code}`);

describe('formatting', () => {
  it('durations', () => {
    expect(formatDuration(0n)).toBe('0 seconds');
    expect(formatDuration(1n)).toBe('1 second');
    expect(formatDuration(3600n)).toBe('1 hour');
    expect(formatDuration(90061n)).toBe('1 day 1 hour');
    expect(formatDuration(172800n)).toBe('2 days');
    expect(formatDuration(150n)).toBe('2 minutes 30 seconds');
    expect(() => formatDuration(-1n)).toThrow(UxPrivacyError);
  });
  it('units', () => {
    expect(formatUnits(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    expect(formatUnits(250_000_000n, 6)).toBe('250');
    expect(formatUnits(1n, 6)).toBe('0.000001');
    expect(formatUnits(0n, 0)).toBe('0');
    expect(formatUnits(42n, 0)).toBe('42');
    expect(() => formatUnits(-1n, 6)).toThrow(UxPrivacyError);
    expect(() => formatUnits(1n, 37)).toThrow(UxPrivacyError);
    expect(() => formatUnits(1n, 1.5)).toThrow(UxPrivacyError);
    expect(() => formatUnits(1 as unknown as bigint, 1)).toThrow(UxPrivacyError);
  });
  it('property: formatUnits round-trips', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 2n ** 128n }), fc.integer({ min: 0, max: 36 }), (a, d) => {
        const s = formatUnits(a, d);
        const [w = '', fr = ''] = s.split('.');
        expect(BigInt(w + fr.padEnd(d, '0'))).toBe(a);
      }),
    );
  });
  it('short address', () => {
    expect(shortAddress(DEST)).toBe('0x1111…1111');
  });
});

describe('validateFriendlyPolicy', () => {
  it('accepts a good policy with only the unlisted-token note', () => {
    const v = validateFriendlyPolicy(base);
    expect(v.ok).toBe(true);
    expect(v.issues.map((i) => i.code)).toEqual(['UNLISTED_TOKENS_BLOCKED']);
  });

  it('time-lock bounds', () => {
    expect(codes({ ...base, timeLockSeconds: 3599n })).toContain('error:INVALID_TIMELOCK');
    expect(codes({ ...base, timeLockSeconds: 3600n })).toContain('warning:SHORT_TIMELOCK');
    expect(codes({ ...base, timeLockSeconds: 86400n })).not.toContain('warning:SHORT_TIMELOCK');
    expect(codes({ ...base, timeLockSeconds: 30n * 86400n })).not.toContain('error:INVALID_TIMELOCK');
    expect(codes({ ...base, timeLockSeconds: 30n * 86400n + 1n })).toContain('error:INVALID_TIMELOCK');
    expect(codes({ ...base, timeLockSeconds: 7200 as unknown as bigint })).toContain('error:INVALID_TIMELOCK');
  });

  it('addresses', () => {
    expect(codes({ ...base, destination: NATIVE })).toContain('error:ZERO_ADDRESS');
    expect(codes({ ...base, destination: '0x123' })).toContain('error:INVALID_ADDRESS');
    expect(codes({ ...base, destination: 5 as unknown as string })).toContain('error:INVALID_ADDRESS');
    expect(codes({ ...base, destination: `0x${'aB'.repeat(20)}` })).toContain('warning:CHECKSUM_UNVERIFIED');
    expect(codes({ ...base, destination: `0x${'AB'.repeat(20)}` })).not.toContain('warning:CHECKSUM_UNVERIFIED');
  });

  it('no limits warns', () => {
    expect(codes({ ...base, spendLimits: [] })).toEqual(['warning:NO_LIMITS']);
  });

  it('limit rows', () => {
    const row = base.spendLimits[0]!;
    const c = (r: object) => codes({ ...base, spendLimits: [{ ...row, ...r }] });
    expect(c({ limit: 0n })).toContain('error:INVALID_LIMIT');
    expect(c({ limit: UNLIMITED_LIMIT })).toContain('error:INVALID_LIMIT');
    expect(c({ limit: 5 })).toContain('error:INVALID_LIMIT');
    expect(c({ windowSeconds: 0n })).toContain('error:INVALID_WINDOW');
    expect(c({ windowSeconds: 2n ** 64n })).toContain('error:INVALID_WINDOW');
    expect(c({ windowSeconds: 5 })).toContain('error:INVALID_WINDOW');
    expect(c({ symbol: '<script>' })).toContain('error:INVALID_SYMBOL');
    expect(c({ symbol: '' })).toContain('error:INVALID_SYMBOL');
    expect(c({ symbol: 9 })).toContain('error:INVALID_SYMBOL');
    expect(c({ decimals: 37 })).toContain('error:INVALID_DECIMALS');
    expect(c({ decimals: 1.5 })).toContain('error:INVALID_DECIMALS');
    expect(c({ token: 'nope' })).toContain('error:INVALID_ADDRESS');
    expect(c({ limit: 'unlimited', windowSeconds: 0n })).not.toContain('error:INVALID_WINDOW');
    expect(codes({ ...base, spendLimits: [row, { ...row, token: row.token.toUpperCase().replace('0X', '0x') }] })).toContain(
      'error:DUPLICATE_TOKEN',
    );
    expect(codes({ ...base, spendLimits: [null as never] })).toContain('error:INVALID_LIMITS');
    expect(codes({ ...base, spendLimits: 'x' as never })).toContain('error:INVALID_LIMITS');
    expect(codes({ ...base, spendLimits: Array<never>(51).fill(row as never) })).toContain('error:INVALID_LIMITS');
  });

  it('labels reject control and bidi characters', () => {
    expect(codes({ ...base, name: 'a‮b' })).toContain('error:INVALID_LABEL');
    expect(codes({ ...base, name: 'a\nb' })).toContain('error:INVALID_LABEL');
    expect(codes({ ...base, name: 'x'.repeat(41) })).toContain('error:INVALID_LABEL');
    expect(codes({ ...base, name: 3 as never })).toContain('error:INVALID_LABEL');
    expect(codes({ ...base, name: 'x'.repeat(40) })).not.toContain('error:INVALID_LABEL');
  });

  it('allowlist', () => {
    expect(codes({ ...base, allowlist: [DEST] })).not.toContain('warning:NOT_ENFORCED');
    expect(codes({ ...base, allowlist: [DEST, G1] })).toContain('warning:NOT_ENFORCED');
    expect(codes({ ...base, allowlist: [G1] })).toContain('error:DESTINATION_NOT_ALLOWLISTED');
    expect(codes({ ...base, allowlist: [DEST, DEST.toUpperCase().replace('0X', '0x')] })).toContain('error:DUPLICATE_ADDRESS');
    expect(codes({ ...base, allowlist: ['bad'] })).toContain('error:INVALID_ADDRESS');
    expect(codes({ ...base, allowlist: 'x' as never })).toContain('error:INVALID_ALLOWLIST');
    expect(codes({ ...base, allowlist: Array<string>(51).fill(DEST) })).toContain('error:INVALID_ALLOWLIST');
    expect(codes({ ...base, allowlist: [] })).not.toContain('error:INVALID_ALLOWLIST');
    expect(codes({ ...base, destination: 'bad', allowlist: [G1] })).toContain('warning:NOT_ENFORCED');
  });

  it('guardians', () => {
    const g = { guardians: [{ address: G1, label: 'Mum' }, { address: G2 }], guardianThreshold: 2 };
    expect(codes({ ...base, ...g })).toContain('warning:NOT_ENFORCED');
    expect(validateFriendlyPolicy({ ...base, ...g }).ok).toBe(true);
    expect(codes({ ...base, ...g, guardianThreshold: 3 })).toContain('error:INVALID_THRESHOLD');
    expect(codes({ ...base, ...g, guardianThreshold: 0 })).toContain('error:INVALID_THRESHOLD');
    const noTh: FriendlyPolicy = { ...base, guardians: g.guardians };
    expect(codes(noTh)).toContain('error:INVALID_THRESHOLD');
    expect(codes({ ...base, guardianThreshold: 1 })).toContain('error:INVALID_THRESHOLD');
    expect(codes({ ...base, guardians: [{ address: G1 }, { address: G1 }], guardianThreshold: 1 })).toContain('error:DUPLICATE_ADDRESS');
    expect(codes({ ...base, guardians: [{ address: DEST }], guardianThreshold: 1 })).toContain('warning:GUARDIAN_IS_DESTINATION');
    expect(codes({ ...base, guardians: [{ address: G1, label: '\u0000' }], guardianThreshold: 1 })).toContain('error:INVALID_LABEL');
    expect(codes({ ...base, guardians: [null as never], guardianThreshold: 1 })).toContain('error:INVALID_GUARDIANS');
    expect(codes({ ...base, guardians: 'x' as never })).toContain('error:INVALID_GUARDIANS');
    expect(
      codes({ ...base, guardians: Array.from({ length: 11 }, () => ({ address: G1 })), guardianThreshold: 1 }),
    ).toContain('error:INVALID_GUARDIANS');
    expect(codes({ ...base, guardians: [] })).not.toContain('error:INVALID_GUARDIANS');
  });

  it('malformed policy object', () => {
    expect(validateFriendlyPolicy(null as never).ok).toBe(false);
    expect(validateFriendlyPolicy(undefined as never).issues[0]?.code).toBe('INVALID_POLICY');
  });

  it('issue keys follow the i18n convention', () => {
    for (const i of validateFriendlyPolicy({ ...base, spendLimits: [] }).issues) expect(i.key).toBe(`policy.issue.${i.code}`);
  });
});

describe('describePolicy', () => {
  it('describes exactly', () => {
    const d = describePolicy(base);
    expect(d.headline).toBe('Savings: pays out to one destination after a 2 days wait, with 2 spend limit(s).');
    expect(d.lines.map((l) => l.text)).toEqual([
      'Withdrawals can only go to 0x1111…1111.',
      'Every withdrawal waits 2 days before it can complete, and can be cancelled meanwhile.',
      'Changing the destination waits 4 days (twice the time-lock).',
      'ETH (native coin): at most 1.5 ETH per day.',
      'USDC (0x4444…4444): at most 250 USDC per week.',
    ]);
    expect(d.lines.every((l) => l.enforcement === 'onchain')).toBe(true);
    expect(d.warnings).toEqual([]);
  });

  it('no limits, unlimited rows, custom windows, no name', () => {
    const d = describePolicy({ ...base, name: undefined as never, spendLimits: [] });
    expect(d.headline).toBe('pays out to one destination after a 2 days wait, with no spend limit.');
    expect(d.lines.map((l) => l.key)).toContain('policy.line.noLimits');
    const e = describePolicy({
      ...base,
      name: '',
      spendLimits: [
        { token: USDC, symbol: 'USDC', decimals: 6, limit: 'unlimited', windowSeconds: 0n },
        { token: NATIVE, symbol: 'ETH', decimals: 18, limit: 1n, windowSeconds: 3600n },
        { token: G1, symbol: 'DAI', decimals: 18, limit: 10n ** 18n, windowSeconds: 21600n },
      ],
    });
    expect(e.headline).toBe('pays out to one destination after a 2 days wait, with 2 spend limit(s).');
    expect(e.lines.map((l) => l.text)).toContain('USDC (0x4444…4444): no limit.');
    expect(e.lines.map((l) => l.text)).toContain('ETH (native coin): at most 0.000000000000000001 ETH per hour.');
    expect(e.lines.map((l) => l.text)).toContain('DAI (0x2222…2222): at most 1 DAI per 6 hours.');
  });

  it('marks allowlist and guardians as not enforced', () => {
    const d = describePolicy({
      ...base,
      allowlist: [DEST, G1],
      guardians: [{ address: G1 }, { address: G2 }],
      guardianThreshold: 2,
    });
    const ne = d.lines.filter((l) => l.enforcement === 'notEnforced');
    expect(ne.map((l) => l.feature)).toEqual(['allowlist', 'guardians']);
    expect(ne[1]?.text).toBe('2 of 2 guardians would need to approve, but this is not enforced on-chain.');
    expect(d.warnings.filter((w) => w.code === 'NOT_ENFORCED')).toHaveLength(2);
  });

  it('refuses invalid policies', () => {
    expect(() => describePolicy({ ...base, timeLockSeconds: 1n })).toThrow(UxPrivacyError);
  });

  it('lowercases addresses and cannot inject via symbol', () => {
    const d = describePolicy({ ...base, destination: DEST.toUpperCase().replace('0X', '0x') });
    expect(d.lines[0]?.text).toContain('0x1111');
    expect(() =>
      describePolicy({ ...base, spendLimits: [{ ...base.spendLimits[0]!, symbol: '<img src=x>' }] }),
    ).toThrow(UxPrivacyError);
  });
});

describe('toSchemePolicyInput', () => {
  it('maps to policy-scheme inputs', () => {
    const r = toSchemePolicyInput({
      ...base,
      spendLimits: [...base.spendLimits, { token: G1, symbol: 'DAI', decimals: 18, limit: 'unlimited', windowSeconds: 9n }],
      allowlist: [DEST],
    });
    expect(r.destination).toBe(DEST);
    expect(r.delaySeconds).toBe(172800n);
    expect(r.limits).toEqual([
      { token: NATIVE, limit: 1_500_000_000_000_000_000n, windowSeconds: 86400n },
      { token: USDC, limit: 250_000_000n, windowSeconds: 604800n },
      { token: G1, limit: UNLIMITED_LIMIT, windowSeconds: 0n },
    ]);
  });
  it('refuses invalid policies', () => {
    expect(() => toSchemePolicyInput({ ...base, destination: 'x' })).toThrow(UxPrivacyError);
  });
});
