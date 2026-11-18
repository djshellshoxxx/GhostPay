import { describe, expect, it } from 'vitest';
import { createAccountState, executeProposal, queueProposal, validateAccountState, pruneExpired, type AccountState } from './account.js';
import { evaluateApprovals, signProposal, validateApproval } from './approvals.js';
import { MAX_PROPOSAL_EXCHANGE_BYTES, MAX_STATE_EXCHANGE_BYTES, parseAccountState, parseProposalExchange, serializeAccountState, serializeProposalExchange } from './exchange.js';
import { DAY, HOUR, K1, K2, K3, T0, cancel, config, payout, policy2of3, fakeKey, pub } from './fixtures.testutil.js';
import { MAX_TIMESTAMP, proposalDigestHex, validateProposal } from './proposal.js';
import { validatePolicy } from './policy.js';

const policy = policy2of3();
const proposal = payout(policy);
const approvals = [signProposal(proposal, K1), signProposal(proposal, K2)];
const queued = queueProposal(createAccountState(policy), proposal, approvals, T0);
const json = serializeAccountState(queued.state);
const exchange = serializeProposalExchange(policy, { proposal, approvals });
type Mutable<T> = T extends readonly (infer E)[] ? Mutable<E>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
type MutableState = Mutable<AccountState>;
const mutate = (fn: (value: MutableState) => void): unknown => { const value = JSON.parse(JSON.stringify(queued.state)) as MutableState; fn(value); return value; };

describe('canonical account exchange', () => {
  it('restarts a queued account and executes at the same timelock', () => {
    const restored = parseAccountState(json);
    expect(Object.isFrozen(restored.queued[0]?.approvals)).toBe(true);
    expect(executeProposal(restored, queued.queued!.digest, T0 + HOUR).state.queued).toEqual([]);
    expect(() => executeProposal(restored, queued.queued!.digest, T0 + 1)).toThrow();
  });
  it.each(['', '{', 'null', '[]', '1', '{"format":"ghostpay-merchant-account","version":2,"state":{}}'])('rejects invalid envelope %s', text => {
    expect(() => parseAccountState(text)).toThrow();
  });
  it('rejects duplicate keys, whitespace, noncanonical order and oversize input', () => {
    expect(() => parseAccountState(json.replace('"version":1', '"version":0,"version":1'))).toThrow();
    expect(() => parseAccountState(` ${json}`)).toThrow();
    expect(() => parseAccountState(JSON.stringify({ version: 1, format: 'ghostpay-merchant-account', state: queued.state }))).toThrow();
    expect(() => parseAccountState(' '.repeat(MAX_STATE_EXCHANGE_BYTES + 1))).toThrow();
    expect(() => parseAccountState('é'.repeat(MAX_STATE_EXCHANGE_BYTES))).toThrow();
    expect(() => parseAccountState(null as never)).toThrow();
  });
  it.each([
    (s: MutableState) => { s.nextNonce = '-1'; },
    (s: MutableState) => { s.nextNonce = '0'; },
    (s: MutableState) => { s.nextNonce = '01'; },
    (s: MutableState) => { s.queued.push(s.queued[0]!); },
    (s: MutableState) => { s.queued = Array.from({ length: 65 }, () => s.queued[0]!); },
    (s: MutableState) => { s.queued[0]!.queuedAt = T0 - 301; },
    (s: MutableState) => { s.queued[0]!.queuedAt = proposal.expiresAt; },
    (s: MutableState) => { s.queued[0]!.executableAt = proposal.expiresAt; },
    (s: MutableState) => { s.queued[0]!.digest = 'X'; },
    (s: MutableState) => { s.queued[0]!.proposal = cancel(policy, queued.queued!.digest, { nonce: '0' }); },
    (s: MutableState) => { s.queued[0]!.approvals.push(s.queued[0]!.approvals[0]!); },
    (s: MutableState) => { s.queued[0]!.approvals[0]!.signature = '00'.repeat(64); },
    (s: MutableState) => { s.queued[0]!.approvals = []; },
    (s: MutableState) => { s.policy.version = 1; },
    (s: MutableState) => { s.queued[0]!.proposal = { ...proposal, amount: '1' }; },
    (s: MutableState) => { s.queued[0]!.proposal = { ...proposal, asset: 'native' }; },
    (s: MutableState) => { s.queued[0]!.proposal = { ...proposal, to: 'other' }; },
  ])('refuses inconsistent persisted state %#', fn => {
    const invalid = mutate(fn);
    expect(() => validateAccountState(invalid)).toThrow();
    expect(() => pruneExpired(invalid as never, T0)).toThrow();
  });
  it('restarts cancellation and rotation without stale queue authority', () => {
    const c = cancel(policy, queued.queued!.digest);
    const result = queueProposal(parseAccountState(json), c, [signProposal(c, K1), signProposal(c, K2)], T0);
    expect(parseAccountState(serializeAccountState(result.state)).queued).toEqual([]);
    const cfg = config(policy);
    const q = queueProposal(createAccountState(policy), cfg, [signProposal(cfg, K1), signProposal(cfg, K3)], T0);
    const rotated = executeProposal(parseAccountState(serializeAccountState(q.state)), q.queued!.digest, T0 + DAY);
    expect(() => parseProposalExchange(exchange, rotated.state.policy)).toThrow();
  });
});

describe('proposal and approval exchange', () => {
  it('roundtrips verified partial approvals without requiring threshold or execution', () => {
    const partial = serializeProposalExchange(policy, { proposal, approvals: [approvals[0]!] });
    const imported = parseProposalExchange(partial, policy);
    expect(evaluateApprovals(policy, imported.proposal, imported.approvals).thresholdMet).toBe(false);
    expect(parseProposalExchange(exchange, policy).approvals).toHaveLength(2);
    expect(serializeProposalExchange(policy, { proposal, approvals: [...approvals].reverse() })).toBe(exchange);
  });
  it('refuses invalid, duplicated, altered and cross-policy approvals', () => {
    expect(() => serializeProposalExchange(policy, { proposal, approvals: [approvals[0]!, approvals[0]!] })).toThrow();
    expect(() => serializeProposalExchange(policy, { proposal, approvals: [{ ...approvals[0]!, signature: '00'.repeat(64) }] })).toThrow();
    expect(() => parseProposalExchange(exchange.replace('250000000', '250000001'), policy)).toThrow();
    expect(() => parseProposalExchange(exchange, policy2of3({ accountId: 'other' }))).toThrow();
    expect(() => parseProposalExchange(exchange, policy2of3({ chainId: '1' }))).toThrow();
    expect(() => parseProposalExchange(` ${exchange}`, policy)).toThrow();
    expect(() => parseProposalExchange(' '.repeat(MAX_PROPOSAL_EXCHANGE_BYTES + 1), policy)).toThrow();
  });
  it('never invokes object or array accessors', () => {
    let calls = 0;
    const getter = () => { calls++; throw new Error('must not run'); };
    const p = { ...proposal, get kind() { return getter(); } };
    const a = { ...approvals[0], get signer() { return getter(); } };
    expect(() => validateProposal(p)).toThrow();
    expect(() => validateApproval(a)).toThrow();
    expect(evaluateApprovals(policy, proposal, [a as never]).rejected[0]?.reason).toBe('MALFORMED');
    const aList = [...approvals]; Object.defineProperty(aList, '0', { get: getter });
    expect(() => evaluateApprovals(policy, proposal, aList)).toThrow();
    const signers = [...policy.signers]; Object.defineProperty(signers, '0', { get: getter });
    expect(() => validatePolicy({ ...policy, signers })).toThrow();
    expect(calls).toBe(0);
    expect(() => validateApproval({ ...approvals[0], [Symbol('hidden')]: 1 })).toThrow();
    expect(() => evaluateApprovals(policy, proposal, Array(2))).toThrow();
  });
});


it('roundtrips the maximum queue with maximum signer counts and field lengths within the bounded format', () => {
  const keys = Array.from({ length: 20 }, (_, index) => fakeKey(index + 1));
  const policy = validatePolicy({
    accountId: 'a'.repeat(64), chainId: '18446744073709551615', version: 0xffff_ffff,
    signers: keys.map((key, index) => ({ publicKey: pub(key), controller: `c${String(index).padStart(2, '0')}`.padEnd(64, 'x') })),
    threshold: 20, timelocks: { payout: 30 * DAY, refund: 30 * DAY, config: 30 * DAY },
  });
  const now = MAX_TIMESTAMP - 60 * DAY;
  const queued = Array.from({ length: 64 }, (_, index) => {
    const proposal = config(policy, {
      nonce: (18446744073709551615n - 64n + BigInt(index)).toString(),
      createdAt: now, expiresAt: MAX_TIMESTAMP,
      newPolicy: { signers: policy.signers, threshold: policy.threshold, timelocks: policy.timelocks },
    });
    return { digest: proposalDigestHex(proposal), proposal, approvals: keys.map(key => signProposal(proposal, key)), queuedAt: now, executableAt: now + 30 * DAY };
  });
  const account = { policy, nextNonce: '18446744073709551615', queued };
  const serialized = serializeAccountState(account);
  expect(Buffer.byteLength(serialized)).toBeLessThan(MAX_STATE_EXCHANGE_BYTES);
  const restored = parseAccountState(serialized);
  expect(restored.queued).toHaveLength(64);
  expect(restored.queued[63]?.approvals).toHaveLength(20);
  const last = queued[63]!;
  const proposalText = serializeProposalExchange(policy, last);
  expect(Buffer.byteLength(proposalText)).toBeLessThan(MAX_PROPOSAL_EXCHANGE_BYTES);
  expect(parseProposalExchange(proposalText, policy).approvals).toHaveLength(20);
});
