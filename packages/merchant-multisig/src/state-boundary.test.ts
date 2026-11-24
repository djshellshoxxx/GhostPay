import { describe, expect, it } from 'vitest';
import { createAccountState, executeProposal, queueProposal } from './account.js';
import { signProposal } from './approvals.js';
import { HOUR, K1, K2, T0, payout, policy2of3 } from './fixtures.testutil.js';

describe('persisted runtime state boundary', () => {
  it.each([NaN, -Infinity, -1, null, '0'])('rejects corrupt queue time %s before execution', (queuedAt) => {
    const pol = policy2of3();
    const p = payout(pol);
    const q = queueProposal(createAccountState(pol), p, [signProposal(p, K1), signProposal(p, K2)], T0);
    const corrupt = { ...q.state, queued: [{ ...q.queued!, queuedAt, executableAt: queuedAt }] };
    expect(() => executeProposal(corrupt as never, q.queued!.digest, T0 + 1)).toThrow();
  });
  it('rejects a queued nonce that was not consumed', () => {
    const pol = policy2of3();
    const p = payout(pol);
    const q = queueProposal(createAccountState(pol), p, [signProposal(p, K1), signProposal(p, K2)], T0);
    expect(() => executeProposal({ ...q.state, nextNonce: '0' }, q.queued!.digest, T0 + HOUR)).toThrow();
  });
});
