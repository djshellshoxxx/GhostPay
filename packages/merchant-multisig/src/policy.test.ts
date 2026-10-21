import { describe, expect, it } from 'vitest';
import { TlvEncoder } from './encoding.js';
import { MultisigError } from './errors.js';
import { K1, K2, K3, fakeKey, policy2of3, pub } from './fixtures.testutil.js';
import { MAX_SIGNERS, MAX_TIMELOCK_SECONDS, policyHash, validatePolicy } from './policy.js';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof MultisigError) return `${e.code}:${e.path ?? ''}`;
    throw e;
  }
  return undefined;
}

describe('validatePolicy', () => {
  it('accepts a 2-of-3 policy, freezes it and sorts signers by public key', () => {
    const p = validatePolicy(policy2of3());
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.signers)).toBe(true);
    const keys = p.signers.map((s) => s.publicKey);
    expect(keys).toEqual([...keys].sort());
    expect(p.threshold).toBe(2);
  });

  it('policy hash is independent of signer input order and is 32-byte hex', () => {
    const a = policy2of3();
    const b = policy2of3({ signers: [...a.signers].reverse() });
    expect(policyHash(a)).toBe(policyHash(b));
    expect(policyHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('policy hash changes with every field', () => {
    const base = policyHash(policy2of3());
    const variants = [
      policy2of3({ accountId: 'acme-shop2' }),
      policy2of3({ chainId: '1' }),
      policy2of3({ version: 1 }),
      policy2of3({ threshold: 3 }),
      policy2of3({ timelocks: { payout: 3601, refund: 0, config: 86_400 } }),
      policy2of3({ timelocks: { payout: 3600, refund: 1, config: 86_400 } }),
      policy2of3({ timelocks: { payout: 3600, refund: 0, config: 86_401 } }),
      policy2of3({
        signers: [
          { publicKey: pub(K1), controller: 'alice2' },
          { publicKey: pub(K2), controller: 'bob' },
          { publicKey: pub(K3), controller: 'carol-hsm' },
        ],
      }),
    ];
    const hashes = new Set(variants.map((v) => policyHash(v)));
    expect(hashes.size).toBe(variants.length);
    expect(hashes.has(base)).toBe(false);
  });

  it('rejects an exact duplicate signer key', () => {
    const p = policy2of3({
      signers: [
        { publicKey: pub(K1), controller: 'alice' },
        { publicKey: pub(K1), controller: 'bob' },
      ],
    });
    expect(code(() => validatePolicy(p))).toBe('POLICY:signers[1].publicKey');
  });

  it('rejects the negated key (same x, flipped parity): one secret controls both', () => {
    const k = pub(K1);
    const neg = (k.startsWith('02') ? '03' : '02') + k.slice(2);
    const p = policy2of3({
      signers: [
        { publicKey: k, controller: 'alice' },
        { publicKey: neg, controller: 'mallory' },
      ],
      threshold: 2,
    });
    expect(code(() => validatePolicy(p))).toBe('POLICY:signers[1].publicKey');
  });

  it('rejects two signers with the same controller (case-insensitive)', () => {
    const p = policy2of3({
      signers: [
        { publicKey: pub(K1), controller: 'Alice' },
        { publicKey: pub(K2), controller: 'alice' },
      ],
    });
    expect(code(() => validatePolicy(p))).toBe('POLICY:signers[1].controller');
  });

  it('rejects malformed and off-curve keys', () => {
    const offCurve = '02' + '00'.repeat(32);
    const upper = pub(K1).toUpperCase();
    const uncompressed = '04' + 'ab'.repeat(64);
    for (const publicKey of [offCurve, upper, uncompressed, '', 42]) {
      const p = policy2of3({ signers: [{ publicKey: publicKey as string, controller: 'x' }], threshold: 1 });
      expect(code(() => validatePolicy(p))).toBe('POLICY:signers[0].publicKey');
    }
  });

  it('enforces 1 <= threshold <= n', () => {
    for (const threshold of [0, 4, -1, 1.5, Number.NaN]) {
      expect(code(() => validatePolicy(policy2of3({ threshold })))).toBe('POLICY:threshold');
    }
    expect(validatePolicy(policy2of3({ threshold: 3 })).threshold).toBe(3);
    expect(validatePolicy(policy2of3({ threshold: 1 })).threshold).toBe(1);
  });

  it('bounds signer count', () => {
    const many = Array.from({ length: MAX_SIGNERS + 1 }, (_, i) => ({
      publicKey: pub(fakeKey(i + 1)),
      controller: `c${i}`,
    }));
    expect(code(() => validatePolicy(policy2of3({ signers: many })))).toBe('POLICY:signers');
    expect(code(() => validatePolicy(policy2of3({ signers: [] })))).toBe('POLICY:signers');
    expect(code(() => validatePolicy(policy2of3({ signers: 'x' as never })))).toBe('POLICY:signers');
    const ok = validatePolicy(policy2of3({ signers: many.slice(0, MAX_SIGNERS), threshold: 11 }));
    expect(ok.signers).toHaveLength(MAX_SIGNERS);
  });

  it('requires config timelock >= max(payout, refund) and bounds all timelocks', () => {
    expect(
      code(() => validatePolicy(policy2of3({ timelocks: { payout: 100, refund: 0, config: 99 } }))),
    ).toBe('POLICY:timelocks.config');
    expect(
      code(() => validatePolicy(policy2of3({ timelocks: { payout: 0, refund: 100, config: 99 } }))),
    ).toBe('POLICY:timelocks.config');
    expect(
      code(() =>
        validatePolicy(policy2of3({ timelocks: { payout: 0, refund: 0, config: MAX_TIMELOCK_SECONDS + 1 } })),
      ),
    ).toBe('POLICY:timelocks.config');
    expect(code(() => validatePolicy(policy2of3({ timelocks: { payout: -1, refund: 0, config: 0 } })))).toBe(
      'POLICY:timelocks.payout',
    );
  });

  it('rejects bad ids, chain ids and versions', () => {
    expect(code(() => validatePolicy(policy2of3({ accountId: 'Acme' })))).toBe('POLICY:accountId');
    expect(code(() => validatePolicy(policy2of3({ chainId: '0' })))).toBe('POLICY:chainId');
    expect(code(() => validatePolicy(policy2of3({ chainId: '08453' })))).toBe('POLICY:chainId');
    expect(code(() => validatePolicy(policy2of3({ chainId: 8453 as never })))).toBe('POLICY:chainId');
    expect(code(() => validatePolicy(policy2of3({ chainId: '18446744073709551616' })))).toBe(
      'POLICY:chainId',
    );
    expect(code(() => validatePolicy(policy2of3({ version: -1 })))).toBe('POLICY:version');
  });

  it('rejects unknown keys, missing keys, accessors and non-plain objects', () => {
    expect(code(() => validatePolicy({ ...policy2of3(), extra: 1 }))).toBe('POLICY:');
    const { threshold: _t, ...missing } = policy2of3();
    void _t;
    expect(code(() => validatePolicy(missing))).toBe('POLICY:');
    const withGetter = { ...policy2of3() } as Record<string, unknown>;
    delete withGetter.threshold;
    Object.defineProperty(withGetter, 'threshold', { get: () => 2, enumerable: true });
    expect(code(() => validatePolicy(withGetter))).toBe('POLICY:threshold');
    class P {}
    expect(code(() => validatePolicy(Object.assign(new P(), policy2of3())))).toBe('POLICY:');
    expect(code(() => validatePolicy(null))).toBe('POLICY:');
    expect(code(() => validatePolicy([]))).toBe('POLICY:');
    expect(validatePolicy(Object.assign(Object.create(null) as object, policy2of3())).accountId).toBe(
      'acme-shop',
    );
  });
});

describe('TlvEncoder', () => {
  it('range-checks integers', () => {
    expect(() => new TlvEncoder().u64(1, -1n)).toThrow(RangeError);
    expect(() => new TlvEncoder().u64(1, 1n << 64n)).toThrow(RangeError);
    expect(() => new TlvEncoder().u256(1, 1n << 256n)).toThrow(RangeError);
    expect(() => new TlvEncoder().u256(1, -1n)).toThrow(RangeError);
    expect(new TlvEncoder().u64(7, 258n).finish()).toEqual(
      new Uint8Array([7, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 1, 2]),
    );
  });
});
