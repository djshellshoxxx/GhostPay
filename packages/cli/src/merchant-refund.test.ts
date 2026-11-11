import { createAccountState, queueProposal, serializeAccountState, serializeProposalExchange, signProposal, type AccountState, type Proposal } from '@ghostpay/merchant-multisig';
import { describe, expect, it } from 'vitest';
import { HOUR, K1, K2, payout, policy2of3, refund, T0 } from '../../merchant-multisig/src/fixtures.testutil.js';
import { makeIo, stdoutJson } from './fixtures.testutil.js';
import { run } from './run.js';

function fixture(state: AccountState, proposal: Proposal = refund(state.policy), count = 2) {
  const approvals = [signProposal(proposal, K1), signProposal(proposal, K2)].slice(0, count);
  const io = makeIo({ state: serializeAccountState(state), request: serializeProposalExchange(state.policy, { proposal, approvals }) });
  io.now = T0; return { io, approvals };
}
const args = ['merchant', 'refunds', 'status', '--in', 'request', '--state', 'state'];

describe('off-chain refund request inspection', () => {
  it('verifies supplied-policy signatures while refusing to imply refund execution authority', async () => {
    const policy = policy2of3(); const proposal = refund(policy);
    const io = makeIo({ state: serializeAccountState(createAccountState(policy)),
      request: serializeProposalExchange(policy, { proposal, approvals: [signProposal(proposal, K1), signProposal(proposal, K2)] }) });
    io.now = T0;
    expect(await run(['merchant', 'refunds', 'inspect', '--in', 'request', '--state', 'state', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ offChainQuorum: true, authorityVerified: false, paymentVerified: false, executed: false, expired: false });
    io.now = proposal.expiresAt;
    io.out.length = 0;
    expect(await run(['merchant', 'refunds', 'status', '--in', 'request', '--state', 'state', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ expired: true, status: 'expired', executed: false });
  });
  it('refuses execution with an explicit unsupported-operation error', async () => {
    const io = makeIo();
    expect(await run(['merchant', 'refunds', 'execute', '--json'], io)).toBe(5);
    expect(io.err.join('')).toContain('REFUND_EXECUTION_UNSUPPORTED');
  });
  it('reports missing quorum, future requests, consumed nonce and insufficient validity separately', async () => {
    const policy = policy2of3({ timelocks: { payout: HOUR, refund: HOUR, config: HOUR } });
    const initial = createAccountState(policy);
    const cases = [
      { state: initial, proposal: refund(policy), count: 1, status: 'awaiting-approvals' },
      { state: initial, proposal: refund(policy, { createdAt: T0 + 301 }), count: 2, status: 'future-request' },
      { state: { ...initial, nextNonce: '1' }, proposal: refund(policy), count: 2, status: 'nonce-consumed' },
      { state: initial, proposal: refund(policy, { expiresAt: T0 + HOUR }), count: 2, status: 'expires-before-timelock' },
    ];
    for (const row of cases) {
      const { io } = fixture(row.state, row.proposal, row.count);
      expect(await run([...args, '--json'], io)).toBe(0);
      expect(stdoutJson(io)).toMatchObject({ status: row.status, executed: false, stateFreshnessVerified: false });
    }
  });
  it('uses the validated queued timelock and publishes a report without executing or replacing state', async () => {
    const policy = policy2of3({ timelocks: { payout: HOUR, refund: HOUR, config: HOUR } });
    const p = refund(policy); const initial = createAccountState(policy);
    const approvals = [signProposal(p, K1), signProposal(p, K2)];
    const state = queueProposal(initial, p, approvals, T0).state;
    const { io } = fixture(state, p);
    expect(await run([...args, '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ status: 'timelocked', executableAt: T0 + HOUR, executed: false });
    io.now += HOUR; io.out.length = 0;
    expect(await run([...args, '--out', 'report'], io)).toBe(0);
    expect(io.out.join('')).toContain('No funds were moved');
    expect(JSON.parse(io.files.get('report')!) as unknown).toMatchObject({ status: 'off-chain-ready', executed: false });
    expect(io.files.get('state')).toBe(serializeAccountState(state));
    expect(await run([...args, '--out', 'report', '--json'], io)).toBe(3);
    expect(await run([...args, '--out', 'report', '--force', '--json'], io)).toBe(0);
  });
  it.each([-1, Number.NaN, Number.MAX_SAFE_INTEGER])('rejects an invalid operator clock %s', async now => {
    const { io } = fixture(createAccountState(policy2of3())); io.now = now;
    expect(await run([...args, '--json'], io)).toBe(1);
    expect(io.err.join('')).toContain('CLOCK_INVALID');
  });
  it('rejects non-refund proposals and malformed account or approval data without echoing them', async () => {
    const state = createAccountState(policy2of3()); const { io } = fixture(state, payout(state.policy));
    expect(await run([...args, '--json'], io)).toBe(1);
    expect(io.err.join('')).toContain('NOT_REFUND');
    io.files.set('request', '{"private":"NEVER_ECHO"}'); io.err.length = 0;
    expect(await run([...args, '--json'], io)).toBe(1);
    expect(io.err.join('')).toContain('REFUND_REQUEST_INVALID');
    expect(io.err.join('')).not.toContain('NEVER_ECHO');
    io.files.set('state', '{}');
    expect(await run([...args, '--json'], io)).toBe(1);
  });
});
