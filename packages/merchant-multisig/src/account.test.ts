import { describe, expect, it } from 'vitest';
import {
  MAX_CLOCK_SKEW_SECONDS,
  MAX_QUEUED,
  createAccountState,
  executeProposal,
  pruneExpired,
  queueProposal,
  type AccountState,
} from './account.js';
import { signProposal } from './approvals.js';
import { MultisigError } from './errors.js';
import {
  DAY,
  HOUR,
  K1,
  K2,
  K3,
  K4,
  T0,
  cancel,
  config,
  payout,
  policy2of3,
  refund,
} from './fixtures.testutil.js';
import { MAX_POLICY_VERSION, policyHash } from './policy.js';
import type { Proposal } from './proposal.js';

const POL = policy2of3();

function errCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof MultisigError) return e.code;
    throw e;
  }
  return undefined;
}

function approve(p: Proposal, ...keys: Uint8Array[]) {
  return keys.map((k) => signProposal(p, k));
}

describe('queue + execute', () => {
  it('runs a 2-of-3 payout through its 1h timelock', () => {
    const s0 = createAccountState(POL);
    const p = payout(POL);
    const q = queueProposal(s0, p, approve(p, K1, K2), T0 + 60);
    expect(q.queued?.executableAt).toBe(T0 + 60 + HOUR);
    expect(q.state.nextNonce).toBe('1');
    expect(errCode(() => executeProposal(q.state, q.queued!.digest, T0 + 60 + HOUR - 1))).toBe('TIMELOCK');
    const ex = executeProposal(q.state, q.queued!.digest, T0 + 60 + HOUR);
    expect(ex.executed).toEqual(p);
    expect(ex.state.queued).toEqual([]);
    expect(ex.invalidated).toEqual([]);
    // Executing again: no longer queued.
    expect(errCode(() => executeProposal(ex.state, q.queued!.digest, T0 + 2 * HOUR))).toBe('STATE');
  });

  it('refund with zero timelock executes immediately', () => {
    const p = refund(POL);
    const q = queueProposal(createAccountState(POL), p, approve(p, K2, K3), T0);
    expect(executeProposal(q.state, q.queued!.digest, T0).executed.kind).toBe('refund');
  });

  it('stores only counted approvals (junk dropped)', () => {
    const p = payout(POL);
    const q = queueProposal(
      createAccountState(POL),
      p,
      [...approve(p, K1, K4), null as never, ...approve(p, K2)],
      T0,
    );
    expect(q.queued?.approvals.map((a) => a.signer).sort()).toEqual(
      approve(p, K1, K2)
        .map((a) => a.signer)
        .sort(),
    );
  });

  it('refuses below threshold', () => {
    const p = payout(POL);
    expect(errCode(() => queueProposal(createAccountState(POL), p, approve(p, K1), T0))).toBe('THRESHOLD');
  });
});

describe('replay protection', () => {
  it('a nonce can only be used once', () => {
    const p = payout(POL);
    const sigs = approve(p, K1, K2);
    const q = queueProposal(createAccountState(POL), p, sigs, T0);
    expect(errCode(() => queueProposal(q.state, p, sigs, T0))).toBe('REPLAY');
    const ex = executeProposal(q.state, q.queued!.digest, T0 + HOUR);
    expect(errCode(() => queueProposal(ex.state, p, sigs, T0 + HOUR))).toBe('REPLAY');
  });

  it('nonces cannot be skipped', () => {
    const p = payout(POL, { nonce: '5' });
    expect(errCode(() => queueProposal(createAccountState(POL), p, approve(p, K1, K2), T0))).toBe('REPLAY');
  });

  it('rejects proposals for another account or chain', () => {
    const other = policy2of3({ chainId: '1' });
    const p = payout(other);
    expect(errCode(() => queueProposal(createAccountState(POL), p, approve(p, K1, K2), T0))).toBe('BINDING');
  });

  it('refuses at nonce 2^64-1 rather than wrapping', () => {
    const p = payout(POL, { nonce: '18446744073709551615' });
    const s: AccountState = { ...createAccountState(POL), nextNonce: '18446744073709551615' };
    expect(errCode(() => queueProposal(s, p, approve(p, K1, K2), T0))).toBe('LIMIT');
  });
});

describe('expiry and timelock', () => {
  it('rejects expired and far-future proposals', () => {
    const p = payout(POL);
    const sigs = approve(p, K1, K2);
    const s = createAccountState(POL);
    expect(errCode(() => queueProposal(s, p, sigs, p.expiresAt))).toBe('EXPIRED');
    expect(errCode(() => queueProposal(s, p, sigs, T0 - MAX_CLOCK_SKEW_SECONDS - 1))).toBe('EXPIRED');
    expect(queueProposal(s, p, sigs, T0 - MAX_CLOCK_SKEW_SECONDS).queued).toBeDefined();
  });

  it('refuses to queue when the timelock cannot elapse before expiry', () => {
    const p = payout(POL, { expiresAt: T0 + HOUR });
    expect(errCode(() => queueProposal(createAccountState(POL), p, approve(p, K1, K2), T0))).toBe('TIMELOCK');
  });

  it('a queued proposal cannot execute after expiry', () => {
    const p = payout(POL, { expiresAt: T0 + 2 * HOUR });
    const q = queueProposal(createAccountState(POL), p, approve(p, K1, K2), T0);
    expect(errCode(() => executeProposal(q.state, q.queued!.digest, T0 + 2 * HOUR))).toBe('EXPIRED');
  });

  it('ignores a tampered (lowered) executableAt in persisted state', () => {
    const p = payout(POL);
    const q = queueProposal(createAccountState(POL), p, approve(p, K1, K2), T0);
    const tampered: AccountState = { ...q.state, queued: [{ ...q.queued!, executableAt: T0 }] };
    expect(errCode(() => executeProposal(tampered, q.queued!.digest, T0 + 1))).toBe('TIMELOCK');
  });

  it('re-verifies approvals at execution (tampered persisted approvals)', () => {
    const p = payout(POL);
    const q = queueProposal(createAccountState(POL), p, approve(p, K1, K2), T0);
    const tampered: AccountState = { ...q.state, queued: [{ ...q.queued!, approvals: approve(p, K1) }] };
    expect(errCode(() => executeProposal(tampered, q.queued!.digest, T0 + HOUR))).toBe('THRESHOLD');
    const swapped: AccountState = {
      ...q.state,
      queued: [{ ...q.queued!, proposal: payout(POL, { amount: '999999999999' }) }],
    };
    expect(errCode(() => executeProposal(swapped, q.queued!.digest, T0 + HOUR))).toBe('THRESHOLD');
  });

  it('pruneExpired drops expired entries; queueing also prunes', () => {
    const p = payout(POL, { expiresAt: T0 + 2 * HOUR });
    const q = queueProposal(createAccountState(POL), p, approve(p, K1, K2), T0);
    expect(pruneExpired(q.state, T0 + HOUR).dropped).toEqual([]);
    const pr = pruneExpired(q.state, T0 + 2 * HOUR);
    expect(pr.dropped).toEqual([q.queued!.digest]);
    expect(pr.state.queued).toEqual([]);
    const p2 = payout(POL, { nonce: '1', createdAt: T0 + 3 * HOUR, expiresAt: T0 + 3 * DAY });
    const q2 = queueProposal(q.state, p2, approve(p2, K1, K2), T0 + 3 * HOUR);
    expect(q2.state.queued.map((e) => e.digest)).toEqual([q2.queued!.digest]);
  });

  it('rejects invalid clocks', () => {
    const s = createAccountState(POL);
    expect(errCode(() => pruneExpired(s, -1))).toBe('STATE');
    expect(errCode(() => executeProposal(s, 'x', 1.5))).toBe('STATE');
  });
});

describe('cancel', () => {
  it('threshold can cancel a queued payout during its timelock', () => {
    const p = payout(POL);
    const q = queueProposal(createAccountState(POL), p, approve(p, K1, K2), T0);
    const c = cancel(POL, q.queued!.digest);
    const qc = queueProposal(q.state, c, approve(c, K2, K3), T0 + 60);
    expect(qc.cancelled).toEqual([q.queued!.digest]);
    expect(qc.queued).toBeUndefined();
    expect(qc.state.nextNonce).toBe('2');
    expect(errCode(() => executeProposal(qc.state, q.queued!.digest, T0 + HOUR))).toBe('STATE');
  });

  it('a single signer cannot cancel; unknown targets are rejected', () => {
    const p = payout(POL);
    const q = queueProposal(createAccountState(POL), p, approve(p, K1, K2), T0);
    const c = cancel(POL, q.queued!.digest);
    expect(errCode(() => queueProposal(q.state, c, approve(c, K3), T0))).toBe('THRESHOLD');
    const c2 = cancel(POL, '00'.repeat(32));
    expect(errCode(() => queueProposal(q.state, c2, approve(c2, K1, K2), T0))).toBe('STATE');
  });
});

describe('signer rotation (config)', () => {
  it('requires threshold, waits the config timelock, bumps version, invalidates old queue', () => {
    const s0 = createAccountState(POL);
    const cfg = config(POL);
    expect(errCode(() => queueProposal(s0, cfg, approve(cfg, K1), T0))).toBe('THRESHOLD');
    const q1 = queueProposal(s0, cfg, approve(cfg, K1, K3), T0);
    const pay = payout(POL, { nonce: '1' });
    const q2 = queueProposal(q1.state, pay, approve(pay, K1, K2), T0);
    expect(errCode(() => executeProposal(q2.state, q1.queued!.digest, T0 + DAY - 1))).toBe('TIMELOCK');
    const ex = executeProposal(q2.state, q1.queued!.digest, T0 + DAY);
    expect(ex.state.policy.version).toBe(1);
    expect(ex.state.policy.signers.map((s) => s.controller).sort()).toEqual(['alice', 'bob', 'dave']);
    expect(ex.invalidated).toEqual([q2.queued!.digest]);
    expect(ex.state.queued).toEqual([]);
    expect(ex.state.nextNonce).toBe('2');

    // Old-policy proposals no longer bind.
    const stale = payout(POL, { nonce: '2', createdAt: T0 + DAY, expiresAt: T0 + 5 * DAY });
    expect(errCode(() => queueProposal(ex.state, stale, approve(stale, K1, K2), T0 + DAY))).toBe('BINDING');

    // Removed signer (K3) no longer counts; new signer (K4) does.
    const fresh = payout(ex.state.policy, { nonce: '2', createdAt: T0 + DAY, expiresAt: T0 + 5 * DAY });
    expect(policyHash(ex.state.policy)).toBe(fresh.policyHash);
    expect(errCode(() => queueProposal(ex.state, fresh, approve(fresh, K1, K3), T0 + DAY))).toBe('THRESHOLD');
    expect(queueProposal(ex.state, fresh, approve(fresh, K1, K4), T0 + DAY).queued).toBeDefined();
  });

  it('rejects a rotation whose new set contains related signers', () => {
    const base = config(POL);
    const bad = config(POL, {
      newPolicy: {
        ...base.newPolicy,
        signers: [
          ...base.newPolicy.signers,
          { publicKey: base.newPolicy.signers[0]!.publicKey, controller: 'zed' },
        ],
      },
    });
    expect(errCode(() => queueProposal(createAccountState(POL), bad, [], T0))).toBe('POLICY');
  });

  it('refuses to rotate past the max version', () => {
    const top = policy2of3({ version: MAX_POLICY_VERSION });
    const cfg = config(top, { expiresAt: T0 + 14 * DAY });
    const q = queueProposal(createAccountState(top), cfg, approve(cfg, K1, K2), T0);
    expect(errCode(() => executeProposal(q.state, q.queued!.digest, T0 + DAY))).toBe('LIMIT');
  });
});

describe('limits', () => {
  it(`caps the queue at ${MAX_QUEUED}`, () => {
    let s = createAccountState(POL);
    for (let i = 0; i < MAX_QUEUED; i++) {
      const p = refund(POL, { nonce: String(i) });
      s = queueProposal(s, p, approve(p, K1, K2), T0).state;
    }
    const over = refund(POL, { nonce: String(MAX_QUEUED) });
    expect(errCode(() => queueProposal(s, over, approve(over, K1, K2), T0))).toBe('LIMIT');
  });
});
