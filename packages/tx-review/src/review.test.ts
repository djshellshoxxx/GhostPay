import { describe, expect, it } from 'vitest';
import {
  ANNOUNCER, CHAIN, DEST, EVIL_TOKEN, FEE_RECIPIENT, NOW, RELAYER, ROUTER, USDC,
  approve, buildTx, directSweep, permitSig, policy, relayedSweep, routerPayment,
} from './build.testutil.js';
import { decodeTx } from './decode.js';
import { ReviewRefusedError, TxReviewError } from './errors.js';
import { assertReviewed, review } from './review.js';
import type { Intent, ReasonCode, ReviewContext, ReviewPolicy } from './types.js';

const P = policy();
const ctx: ReviewContext = { paymentGross: 1_000_000_000n };
const run = (i: Intent, e: Intent = i, p: ReviewPolicy = P, c: ReviewContext = ctx) => review(i, e, p, NOW, c);
const reasons = (i: Intent, e: Intent = i, p: ReviewPolicy = P, c: ReviewContext = ctx): readonly ReasonCode[] => {
  const r = run(i, e, p, c);
  return r.ok ? [] : r.reasons;
};

const SAMPLES: Intent[] = [
  routerPayment(),
  routerPayment({ method: 'payERC20WithPermit' }),
  routerPayment({ token: 'native', gross: 10n ** 18n }),
  approve(),
  directSweep(),
  directSweep({ token: 'native', amount: 10n ** 18n }),
  relayedSweep(),
  permitSig(),
];

const FIELD_CODE: Record<string, ReasonCode> = {
  chainId: 'CHAIN_MISMATCH', method: 'MISMATCH_METHOD', router: 'MISMATCH_ROUTER', token: 'MISMATCH_TOKEN', stealth: 'MISMATCH_STEALTH',
  gross: 'MISMATCH_GROSS', minNet: 'MISMATCH_MIN_NET', fee: 'MISMATCH_FEE', deadline: 'MISMATCH_DEADLINE', metadata: 'MISMATCH_METADATA',
  ephemeralKey: 'MISMATCH_EPHEMERAL_KEY', spender: 'MISMATCH_SPENDER', amount: 'MISMATCH_AMOUNT', from: 'MISMATCH_FROM', to: 'MISMATCH_TO',
  maxFeePerGas: 'MISMATCH_MAX_FEE_PER_GAS', maxPriorityFeePerGas: 'MISMATCH_MAX_PRIORITY_FEE_PER_GAS', gasLimit: 'MISMATCH_GAS_LIMIT',
  verifyingContract: 'MISMATCH_VERIFYING_CONTRACT', owner: 'MISMATCH_OWNER', destination: 'MISMATCH_DESTINATION', feeTo: 'MISMATCH_FEE_TO',
  value: 'MISMATCH_VALUE', nonce: 'MISMATCH_NONCE',
};

function mutate(v: unknown): unknown {
  if (typeof v === 'bigint') return v + 1n;
  if (typeof v === 'number') return v + 1;
  const s = v as string;
  return s.slice(0, -1) + (s.endsWith('1') ? '2' : '1');
}

describe('review: identical intent passes', () => {
  it.each(SAMPLES.map((s, n) => [`${s.kind} #${n}`, s] as const))('%s', (_n, s) => {
    expect(run(s)).toEqual({ ok: true });
  });
});

describe('review: one-field mutation of `expected` yields exactly that field reason', () => {
  for (const [n, s] of SAMPLES.entries()) {
    for (const f of Object.keys(s).filter((k) => k !== 'kind')) {
      it(`${s.kind} #${n}: ${f}`, () => {
        const e = { ...s, [f]: mutate((s as unknown as Record<string, unknown>)[f]) };
        expect(reasons(s, e)).toEqual([FIELD_CODE[f]]);
      });
    }
  }
  it('different kind', () => {
    expect(reasons(approve(), permitSig())).toEqual(['MISMATCH_KIND']);
  });
  it('case differences in addresses are not mismatches', () => {
    expect(reasons(approve(), approve({ token: USDC.toLowerCase() as typeof USDC }))).toEqual([]);
  });
});

describe('review: unknown intents are refused with their decode reason', () => {
  it('unknown selector', () => {
    const r = review(decodeTx({ ...buildTx(approve()), data: '0xdeadbeef' }), approve(), P, NOW, ctx);
    expect(r).toEqual({ ok: false, reasons: ['UNKNOWN_SELECTOR'] });
  });
});

describe('review: policy rules', () => {
  it('unknown to: router payment to a router that is not the manifest router', () => {
    const other = '0x0000000000000000000000000000000000000999' as typeof ROUTER;
    const i = routerPayment({ router: other });
    expect(reasons(i, i)).toEqual(['UNKNOWN_TO']);
    const s = relayedSweep({ verifyingContract: other });
    expect(reasons(s, s)).toEqual(['UNKNOWN_TO']);
  });
  it('token not allowlisted: router, approve, sweep sig, permit, direct sweep (S3-09a)', () => {
    for (const i of [routerPayment({ token: EVIL_TOKEN, metadata: routerPayment().metadata }), approve({ token: EVIL_TOKEN }), relayedSweep({ token: EVIL_TOKEN }), permitSig({ token: EVIL_TOKEN }), directSweep({ token: EVIL_TOKEN })]) {
      expect(reasons(i, i)).toEqual(['TOKEN_NOT_ALLOWLISTED']);
    }
  });
  it('token on a chain without an allowlist is refused; native is judged by shape', () => {
    const empty = policy({ tokens: new Map() });
    expect(reasons(approve(), approve(), empty)).toEqual(['TOKEN_NOT_ALLOWLISTED']);
    const n = directSweep({ token: 'native', amount: 10n ** 18n });
    expect(reasons(n, n, empty)).toEqual([]);
  });
  it('allowlist match is case-insensitive', () => {
    const p = policy({ tokens: new Map([[CHAIN, new Set([USDC.toUpperCase().replace('0X', '0x')])]]) });
    expect(reasons(approve(), approve(), p)).toEqual([]);
  });
  it('spender not the manifest router (approve) / not router or relayer (permit)', () => {
    const a = approve({ spender: DEST });
    expect(reasons(a, a)).toEqual(['SPENDER_NOT_ROUTER']);
    const p = permitSig({ spender: DEST });
    expect(reasons(p, p)).toEqual(['SPENDER_NOT_MANIFEST']);
    expect(reasons(permitSig({ spender: RELAYER }))).toEqual([]);
  });
  it('S3-19: approve above the payment gross, and approve without a payment', () => {
    const a = approve({ amount: 1_000_000_001n });
    expect(reasons(a, a)).toEqual(['APPROVE_EXCEEDS_GROSS']);
    const max = approve({ amount: (1n << 256n) - 1n });
    expect(reasons(max, max)).toEqual(['APPROVE_EXCEEDS_GROSS']);
    expect(reasons(approve(), approve(), P, {})).toEqual(['APPROVE_WITHOUT_PAYMENT']);
    expect(reasons(approve())).toEqual([]);
  });
  it('S3-09b: maxFeePerGas above cap, gas limit above cap, fee share above cap', () => {
    const f = directSweep({ maxFeePerGas: 100n * 10n ** 9n + 1n });
    expect(reasons(f, f)).toEqual(['FEE_PER_GAS_ABOVE_CAP']);
    const g = directSweep({ gasLimit: 100_001n });
    expect(reasons(g, g)).toEqual(['GAS_LIMIT_ABOVE_CAP']);
    // PoC-07 shape: 90 % of a 1 ETH balance burned by a lying gas price (21000 gas x 2 x gasPrice).
    const balance = 10n ** 18n;
    const gasPrice = (balance * 90n) / 100n / (21_000n * 2n);
    const wide = policy({ feeCaps: { maxFeePerGasWei: 10n ** 15n, maxGasLimit: 100_000n, maxFeeShareBps: 300 } });
    const s = directSweep({ token: 'native', amount: balance, maxFeePerGas: gasPrice * 2n, gasLimit: 21_000n });
    expect(reasons(s, s, wide)).toEqual(['FEE_SHARE_ABOVE_CAP']);
    const ok = directSweep({ token: 'native', amount: balance, maxFeePerGas: 2n * 10n ** 9n, gasLimit: 21_000n });
    expect(reasons(ok, ok)).toEqual([]);
  });
  it('fee share above cap for relayed sweeps and router payments', () => {
    const s = relayedSweep({ fee: 30_001n, amount: 1_000_000n });
    expect(reasons(s, s)).toEqual(['FEE_SHARE_ABOVE_CAP']);
    expect(reasons(relayedSweep({ fee: 30_000n }))).toEqual([]);
    const tight = policy({ feeCaps: { maxFeePerGasWei: 10n ** 12n, maxGasLimit: 10n ** 6n, maxFeeShareBps: 10 } });
    const r = routerPayment();
    expect(reasons(r, r, tight)).toEqual(['FEE_SHARE_ABOVE_CAP']);
  });
  it('deadline beyond policy and expired', () => {
    for (const mk of [(d: bigint) => routerPayment({ deadline: d }), (d: bigint) => relayedSweep({ deadline: d }), (d: bigint) => permitSig({ deadline: d })]) {
      const far = mk(BigInt(NOW + 3601));
      expect(reasons(far, far)).toEqual(['DEADLINE_BEYOND_POLICY']);
      const edge = mk(BigInt(NOW + 3600));
      expect(reasons(edge, edge)).toEqual([]);
      const past = mk(BigInt(NOW));
      expect(reasons(past, past)).toEqual(['DEADLINE_EXPIRED']);
    }
  });
  it('relayed sweep feeTo must be the policy fee recipient (haiku M1/M2)', () => {
    const s = relayedSweep({ feeTo: DEST });
    expect(reasons(s, s)).toEqual(['FEE_RECIPIENT_MISMATCH']);
    expect(FEE_RECIPIENT).not.toBe(DEST);
  });
  it('direct sweep to a protocol contract', () => {
    for (const c of [ROUTER, RELAYER, ANNOUNCER]) {
      const s = directSweep({ to: c });
      expect(reasons(s, s)).toEqual(['DESTINATION_IS_PROTOCOL_CONTRACT']);
    }
  });
  it('reasons accumulate and are de-duplicated', () => {
    const bad = routerPayment({ token: EVIL_TOKEN, deadline: BigInt(NOW + 99_999), router: DEST });
    expect(reasons(bad, routerPayment())).toEqual(
      expect.arrayContaining(['UNKNOWN_TO', 'TOKEN_NOT_ALLOWLISTED', 'DEADLINE_BEYOND_POLICY', 'MISMATCH_ROUTER', 'MISMATCH_TOKEN', 'MISMATCH_DEADLINE']),
    );
    expect(new Set(reasons(bad, routerPayment())).size).toBe(reasons(bad, routerPayment()).length);
  });
});

describe('review: end-to-end through decodeTx', () => {
  it('S3-09: direct sweep to a forged token is refused', () => {
    const forged = directSweep({ token: EVIL_TOKEN });
    expect(reasons(decodeTx(buildTx(forged)) as Intent, directSweep())).toEqual(['TOKEN_NOT_ALLOWLISTED', 'MISMATCH_TOKEN']);
  });
  it('L-04: payERC20WithBuffer calldata is refused', () => {
    expect(() => assertReviewed({ kind: 'unknown', reason: 'BUFFER_PAYMENT_UNSUPPORTED' }, routerPayment(), P, NOW)).toThrow(ReviewRefusedError);
  });
});

describe('assertReviewed', () => {
  it('returns normally on ok', () => {
    expect(() => { assertReviewed(approve(), approve(), P, NOW, ctx); }).not.toThrow();
  });
  it('throws ReviewRefusedError with all reasons', () => {
    try {
      assertReviewed(approve({ amount: 2_000_000_000n }), approve(), P, NOW, ctx);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ReviewRefusedError);
      const err = e as ReviewRefusedError;
      expect(err.code).toBe('REVIEW_REFUSED');
      expect(err.reasons).toEqual(['APPROVE_EXCEEDS_GROSS', 'MISMATCH_AMOUNT']);
      expect(err.message).toContain('APPROVE_EXCEEDS_GROSS');
    }
  });
  it('default context is empty', () => {
    expect(() => { assertReviewed(approve(), approve(), P, NOW); }).toThrow(/APPROVE_WITHOUT_PAYMENT/);
  });
});

describe('policy and clock validation', () => {
  const bad = (p: ReviewPolicy): void => {
    expect(() => review(approve(), approve(), p, NOW, ctx)).toThrow(TxReviewError);
    try { review(approve(), approve(), p, NOW, ctx); } catch (e) { expect((e as TxReviewError).code).toBe('INVALID_POLICY'); }
  };
  it('rejects malformed policies', () => {
    const caps = P.feeCaps;
    bad(policy({ contracts: { ...P.contracts, router: 'nope' as typeof ROUTER } }));
    bad(policy({ contracts: { ...P.contracts, sweepRelayer: 'nope' as typeof ROUTER } }));
    bad(policy({ contracts: { ...P.contracts, announcer: 'nope' as typeof ROUTER } }));
    bad(policy({ feeRecipient: 'nope' as typeof ROUTER }));
    bad(policy({ feeCaps: { ...caps, maxFeePerGasWei: 0n } }));
    bad(policy({ feeCaps: { ...caps, maxGasLimit: 0n } }));
    bad(policy({ feeCaps: { ...caps, maxFeeShareBps: 10_001 } }));
    bad(policy({ feeCaps: { ...caps, maxFeeShareBps: -1 } }));
    bad(policy({ feeCaps: { ...caps, maxFeeShareBps: 1.5 } }));
    bad(policy({ maxDeadlineSeconds: 0 }));
    bad(policy({ maxDeadlineSeconds: 1.5 }));
  });
  it('rejects a bad clock', () => {
    for (const now of [-1, 1.5, Number.NaN]) {
      expect(() => review(approve(), approve(), P, now, ctx)).toThrow(/now/);
    }
  });
});
