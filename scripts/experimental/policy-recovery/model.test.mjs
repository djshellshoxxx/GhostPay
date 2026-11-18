import assert from 'node:assert/strict';
import test from 'node:test';
import { counterfactualPlan, inactivityEligible, initialize, statement, transition } from './model.mjs';

const config = {
  chain: 'local-chain-A', account: 'clone-A', factory: 'factory-A', implementation: 'candidate-A',
  policyHash: 'policy-A', owner: 'owner-A', destination: 'destination-A',
  delay: 2, challenge: 10, objectionGrace: 3,
};
const deploy = { caller: config.factory, predictedAddress: config.account, owner: config.owner,
  destination: config.destination, policyHash: config.policyHash };
const fresh = () => initialize(counterfactualPlan(config), deploy);
const verify = (signer, expected, authorization) => {
  if (authorization.result === 'REVERT') throw new Error('ERC1271 reverted');
  return signer === authorization.signer && assert.deepEqual(expected, authorization.statement) === undefined
    ? authorization.result : 'INVALID';
};
function signed(state, kind, now, args = {}, options = {}) {
  const role = kind === 'beginRecovery' ? 'destination' : 'owner';
  const nonce = options.nonce ?? now;
  const deadline = options.deadline ?? now + 100;
  return { kind, now, ...args, nonce, deadline, authorization: {
    statement: statement(state, kind, args, nonce, deadline),
    signer: options.signer ?? state[role], result: options.result ?? 'VALID',
  } };
}
function run(state, kind, now, args, options) {
  return transition(state, signed(state, kind, now, args, options), verify);
}
function unchangedOnFailure(state, command, pattern) {
  const saved = structuredClone(state);
  assert.throws(() => transition(state, command, verify), pattern);
  assert.deepEqual(state, saved);
}

test('ADR-0023 admits an arbitrarily long continuous-owner-activity counterexample', () => {
  const inactivity = 90;
  let lastOwnerActionAt = 0;
  for (let now = 1; now <= 10_000 * inactivity; now += 1) {
    if (now - lastOwnerActionAt === inactivity - 1) lastOwnerActionAt = now;
    assert.equal(inactivityEligible(now, lastOwnerActionAt, inactivity), false);
  }
  // Increasing the finite horizon does not alter the inductive counterexample:
  // the gap is always strictly smaller than inactivity, before and after activity.
});

test('counterfactual commitments and one-time clone initialization are mandatory', () => {
  const plan = counterfactualPlan(config);
  assert.throws(() => transition(plan, { kind: 'executeRecovery', now: 0 }), /NOT_INITIALIZED/);
  for (const changed of [
    { caller: 'hostile-factory' }, { predictedAddress: 'another-clone' },
    { owner: 'hostile-owner' }, { destination: 'hostile-destination' }, { policyHash: 'other-policy' },
  ]) {
    assert.throws(() => initialize(plan, { ...deploy, ...changed }),
      /UNAUTHENTICATED_INITIALIZATION|COUNTERFACTUAL_COMMITMENT_CHANGED/);
    assert.equal(plan.initialized, false);
  }
  assert.throws(() => initialize(fresh(), deploy), /ALREADY_INITIALIZED/);
  assert.throws(() => counterfactualPlan({ ...config, account: config.implementation }), /IMPLEMENTATION_LOCKED/);
  assert.throws(() => counterfactualPlan({ ...config, destination: config.account }), /INVALID_DESTINATION/);
});

test('recovery remains possible immediately after accepted owner activity', () => {
  const active = run(fresh(), 'heartbeat', 50);
  const pending = run(active, 'beginRecovery', 50, { newOwner: 'owner-B' });
  assert.equal(pending.recovery.startedAt, 50);
  assert.equal(pending.recovery.executeAt, 60);
  const done = transition(pending, { kind: 'executeRecovery', now: 60 });
  assert.equal(done.owner, 'owner-B');
  assert.equal(done.destination, config.destination);
  assert.deepEqual(done.transfers, []);
});

test('continuous malicious owner activity and repeated cancellation have a fixed bound', () => {
  let state = run(fresh(), 'beginRecovery', 0, { newOwner: 'owner-B' });
  state = run(state, 'objectRecovery', 1, { recoveryEpoch: state.recovery.epoch });
  for (let now = 2; now <= 13; now += 1) {
    state = run(state, 'heartbeat', now);
    unchangedOnFailure(state, { kind: 'cancelRecovery', now }, /CANCELLATION_NOT_AVAILABLE/);
    unchangedOnFailure(state, signed(state, 'objectRecovery', now,
      { recoveryEpoch: state.recovery.epoch }), /OBJECTION_ALREADY_USED/);
    unchangedOnFailure(state, signed(state, 'proposeDestination', now,
      { destination: `attacker-${now}` }), /RECOVERY_PENDING/);
    assert.equal(state.recovery.executeAt, 13);
    assert.equal(state.recovery.latestExecuteAt, 13);
    assert.equal(state.recovery.startedAt, 0);
  }
  assert.equal(transition(state, { kind: 'executeRecovery', now: 13 }).owner, 'owner-B');
});

test('objection boundary is exclusive and extends from admission, not its submission time', () => {
  const pending = run(fresh(), 'beginRecovery', 20, { newOwner: 'owner-B' });
  unchangedOnFailure(pending, { kind: 'executeRecovery', now: 29 }, /TOO_EARLY/);
  const lateObjection = run(pending, 'objectRecovery', 29, { recoveryEpoch: pending.recovery.epoch });
  assert.equal(lateObjection.recovery.executeAt, 33);
  unchangedOnFailure(lateObjection, { kind: 'executeRecovery', now: 32 }, /TOO_EARLY/);
  unchangedOnFailure(pending, signed(pending, 'objectRecovery', 30,
    { recoveryEpoch: pending.recovery.epoch }), /OBJECTION_CLOSED/);
  assert.equal(transition(pending, { kind: 'executeRecovery', now: 30 }).owner, 'owner-B');
});

test('all bounded owner-action schedules preserve liveness after a recovery is admitted', (context) => {
  const small = initialize(counterfactualPlan({ ...config, challenge: 3, objectionGrace: 2 }), deploy);
  let states = [run(small, 'beginRecovery', 0, { newOwner: 'owner-B' })];
  let checked = 0;
  for (let now = 0; now <= 5; now += 1) {
    const successors = new Map();
    for (const state of states) {
      const commands = [
        signed(state, 'heartbeat', now),
        signed(state, 'objectRecovery', now, { recoveryEpoch: state.recovery.epoch }),
        signed(state, 'proposeDestination', now, { destination: 'hostile-destination' }),
        signed(state, 'requestWithdrawal', now, { id: `withdrawal-${now}` }),
        signed(state, 'beginRecovery', now, { newOwner: 'replacement-owner' }),
        { kind: 'cancelRecovery', now }, { kind: 'executeDestination', now },
      ];
      successors.set(JSON.stringify(state), state); // Adversary also may do nothing.
      for (const command of commands) {
        let next;
        try { next = transition(state, command, verify); } catch { next = state; }
        checked += 1;
        assert.equal(next.recovery.startedAt, 0);
        assert.ok(next.recovery.executeAt <= 5);
        assert.equal(next.destination, config.destination);
        assert.deepEqual(next.transfers, []);
        successors.set(JSON.stringify(next), next);
      }
    }
    states = [...successors.values()];
  }
  for (const state of states) {
    assert.equal(transition(state, { kind: 'executeRecovery', now: 5 }).owner, 'owner-B');
  }
  assert.ok(states.length > 1, 'Exploration must preserve distinct adversarial schedules');
  context.diagnostic(`${checked} adversarial transitions; ${states.length} final states`);
});

test('beginning recovery cancels a queued rotation and blocks replacement while pending', () => {
  const rotating = run(fresh(), 'proposeDestination', 1, { destination: 'destination-B' });
  const pending = run(rotating, 'beginRecovery', 4, { newOwner: 'owner-B' });
  assert.equal(pending.pendingDestination, null);
  unchangedOnFailure(pending, { kind: 'executeDestination', now: 5 }, /RECOVERY_PENDING/);
  unchangedOnFailure(pending, signed(pending, 'beginRecovery', 5,
    { newOwner: 'different-owner' }), /RECOVERY_PENDING/);
});

test('canonical transaction order selects current destination; a former destination cannot recover', () => {
  const before = fresh();
  const oldSignature = signed(before, 'beginRecovery', 6, { newOwner: 'owner-B' });
  let state = run(before, 'proposeDestination', 1, { destination: 'destination-B' });
  state = transition(state, { kind: 'executeDestination', now: 5 });
  unchangedOnFailure(state, oldSignature, /WRONG_STATEMENT/);
  unchangedOnFailure(state, signed(state, 'beginRecovery', 6, { newOwner: 'owner-B' },
    { signer: 'destination-A' }), /INVALID_SIGNATURE/);
  const pending = run(state, 'beginRecovery', 6, { newOwner: 'owner-B' });
  assert.equal(pending.recovery.destination, 'destination-B');
});

test('rotating an address away and back does not revive former authority signatures', () => {
  const before = fresh();
  const old = signed(before, 'beginRecovery', 20, { newOwner: 'owner-B' });
  let state = run(before, 'proposeDestination', 1, { destination: 'destination-B' });
  state = transition(state, { kind: 'executeDestination', now: 5 });
  state = run(state, 'proposeDestination', 6, { destination: 'destination-A' });
  state = transition(state, { kind: 'executeDestination', now: 10 });
  assert.equal(state.destination, before.destination);
  unchangedOnFailure(state, old, /WRONG_STATEMENT/);
});

test('signature domain, action, replacement owner, epochs and nonce are all bound', () => {
  const state = fresh();
  const good = signed(state, 'beginRecovery', 1, { newOwner: 'owner-B' });
  for (const field of ['name', 'version', 'chain', 'account', 'factory', 'implementation', 'policyHash']) {
    const altered = structuredClone(good);
    altered.authorization.statement.domain[field] = 'different';
    unchangedOnFailure(state, altered, /WRONG_STATEMENT/);
  }
  for (const field of ['ownerEpoch', 'destinationEpoch', 'recoveryEpoch', 'nonce', 'deadline']) {
    const altered = structuredClone(good);
    altered.authorization.statement[field] += 1;
    unchangedOnFailure(state, altered, /WRONG_STATEMENT/);
  }
  const wrongAction = structuredClone(good);
  wrongAction.authorization.statement.action = 'proposeDestination';
  unchangedOnFailure(state, wrongAction, /WRONG_STATEMENT/);
  unchangedOnFailure(state, { ...good, newOwner: 'attacker' }, /WRONG_STATEMENT/);
});

test('failed or expired authorization never consumes a nonce or changes pending operations', () => {
  const state = run(fresh(), 'requestWithdrawal', 1, { id: 'old-withdrawal' });
  for (const result of ['INVALID', 'WRONG_MAGIC', 'REVERT', true, 1, undefined]) {
    const bad = signed(state, 'beginRecovery', 2, { newOwner: 'owner-B' }, { nonce: 7 });
    bad.authorization.result = result;
    unchangedOnFailure(state, bad, /INVALID_SIGNATURE/);
  }
  unchangedOnFailure(state, signed(state, 'beginRecovery', 2, { newOwner: 'owner-B' },
    { nonce: 7, deadline: 1 }), /SIGNATURE_EXPIRED/);
  const pending = run(state, 'beginRecovery', 2, { newOwner: 'owner-B' }, { nonce: 7, deadline: 2 });
  assert.ok(pending.usedNonces.includes('destination:7'));
});

test('accepted ERC-1271 authorization cannot be revoked to stall permissionless execution', () => {
  const pending = run(fresh(), 'beginRecovery', 1, { newOwner: 'owner-B' }, { deadline: 1 });
  const done = transition(pending, { kind: 'executeRecovery', now: 11 }, () => {
    assert.fail('Execution must not call a now-reverting or mutated ERC-1271 wallet');
  });
  assert.equal(done.owner, 'owner-B');
  assert.equal(done.destination, config.destination);
});

test('nonces stay consumed after execution and old owner authorizations do not survive rotation', () => {
  const initial = fresh();
  const oldOwnerCommand = signed(initial, 'proposeDestination', 20, { destination: 'attacker' }, { nonce: 99 });
  let state = run(initial, 'beginRecovery', 0, { newOwner: 'owner-B' }, { nonce: 7 });
  state = transition(state, { kind: 'executeRecovery', now: 10 });
  unchangedOnFailure(state, signed(state, 'beginRecovery', 11, { newOwner: 'owner-C' },
    { nonce: 7 }), /NONCE_USED/);
  unchangedOnFailure(state, oldOwnerCommand, /WRONG_STATEMENT/);
  unchangedOnFailure(state, signed(state, 'heartbeat', 11, {}, { signer: 'owner-A' }), /INVALID_SIGNATURE/);
  assert.equal(run(state, 'heartbeat', 11).owner, 'owner-B');
});

test('an objection cannot target another recovery epoch, and failure consumes no nonce', () => {
  const state = run(fresh(), 'beginRecovery', 0, { newOwner: 'owner-B' });
  unchangedOnFailure(state, signed(state, 'objectRecovery', 1,
    { recoveryEpoch: state.recovery.epoch + 1 }, { nonce: 42 }), /WRONG_RECOVERY/);
  const next = run(state, 'objectRecovery', 1, { recoveryEpoch: state.recovery.epoch }, { nonce: 42 });
  assert.ok(next.usedNonces.includes('owner:42'));
});

test('pending withdrawals are frozen then invalidated without iterating attacker-grown history', () => {
  let state = fresh();
  for (let index = 0; index < 100; index += 1) {
    state = run(state, 'requestWithdrawal', 0, { id: `before-${index}` }, { nonce: index });
  }
  state = run(state, 'beginRecovery', 1, { newOwner: 'owner-B' });
  unchangedOnFailure(state, { kind: 'executeWithdrawal', now: 3, id: 'before-0' }, /RECOVERY_PENDING/);
  state = transition(state, { kind: 'executeRecovery', now: 11 });
  for (const request of state.withdrawals) {
    unchangedOnFailure(state, { kind: 'executeWithdrawal', now: 11, id: request.id }, /WITHDRAWAL_INVALIDATED/);
  }
  state = run(state, 'requestWithdrawal', 12, { id: 'after' }, { nonce: 100 });
  state = transition(state, { kind: 'executeWithdrawal', now: 14, id: 'after' });
  assert.deepEqual(state.transfers, [{ id: 'after', recipient: config.destination }]);
});

test('canonical replay after restart yields the same result, orphaned recovery never completes', () => {
  const initial = fresh();
  const begin = signed(initial, 'beginRecovery', 1, { newOwner: 'owner-B' });
  const pending = transition(initial, begin, verify);
  const objection = signed(pending, 'objectRecovery', 2, { recoveryEpoch: pending.recovery.epoch });
  const finish = { kind: 'executeRecovery', now: 14 };
  const complete = [begin, objection, finish].reduce((state, command) => transition(state, command, verify), initial);
  const restarted = JSON.parse(JSON.stringify(transition(pending, objection, verify)));
  assert.deepEqual(transition(restarted, finish), complete);
  // Reorg caller discards orphaned events and reconstructs from a canonical prefix.
  const canonical = run(initial, 'heartbeat', 14);
  unchangedOnFailure(canonical, finish, /NO_RECOVERY/);
  assert.equal(canonical.owner, config.owner);
  assert.deepEqual(canonical.usedNonces, ['owner:14']);
});

test('the model exposes the new destination-compromise authority, instead of denying it', () => {
  let state = run(fresh(), 'beginRecovery', 0, { newOwner: 'destination-attacker' });
  state = transition(state, { kind: 'executeRecovery', now: 10 });
  state = run(state, 'proposeDestination', 11, { destination: 'attacker-exit' });
  state = transition(state, { kind: 'executeDestination', now: 15 });
  assert.equal(state.destination, 'attacker-exit');
  // This is why the authority trade-off needs explicit acceptance before coding contracts.
});

test('a malicious current destination can repeatedly freeze withdrawals: an explicit trade-off', () => {
  let state = fresh();
  for (let round = 0; round < 3; round += 1) {
    const start = round * 10;
    state = run(state, 'beginRecovery', start, { newOwner: `destination-controlled-${round}` });
    unchangedOnFailure(state, signed(state, 'requestWithdrawal', start + 1,
      { id: `honest-withdrawal-${round}` }), /RECOVERY_PENDING/);
    state = transition(state, { kind: 'executeRecovery', now: start + 10 });
    assert.equal(state.destination, config.destination);
  }
  assert.deepEqual(state.transfers, []);
});

test('invalid or overflowing time inputs fail closed', () => {
  const state = fresh();
  for (const now of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    unchangedOnFailure(state, { kind: 'executeRecovery', now }, /INVALID_INTEGER/);
  }
  const late = run(state, 'heartbeat', 3);
  unchangedOnFailure(late, { kind: 'executeRecovery', now: 2 }, /TIME_WENT_BACKWARDS/);
  unchangedOnFailure(state, signed(state, 'beginRecovery', Number.MAX_SAFE_INTEGER,
    { newOwner: 'owner-B' }, { deadline: Number.MAX_SAFE_INTEGER }), /INVALID_INTEGER/);
});
