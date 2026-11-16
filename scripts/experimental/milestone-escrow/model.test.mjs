import assert from 'node:assert/strict';
import test from 'node:test';
import { assertConservation, createStage, replay, snapshotHash, statement, transition } from './model.mjs';

const MAX = (1n << 256n) - 1n;
const config = {
  chainId: 1n, escrow: 'escrow-A', token: 'token-A', termsCommitment: 'terms-A',
  buyer: 'buyer-A', seller: 'seller-A', buyerDestination: 'buyer-exit', sellerDestination: 'seller-exit',
  amount: 1_000_000_000_000_000_001n, disputeWindow: 3n,
  releaseMode: 'mutual', disputeMode: 'mutual', arbiter: null,
};
const fresh = (options = {}) => createStage({ ...config, ...options });
const verify = (_signer, _expected, authorization) => {
  if (authorization.result === 'REVERT') throw new Error('ERC1271 reverted');
  return authorization.result;
};
function command(state, kind, now, args = {}, signers) {
  const action = { kind, now, stageNonce: state.stageNonce, deadline: now + 100n, ...args };
  const defaults = kind === 'fund' ? [state.terms.buyer]
    : kind === 'submit' ? [state.terms.seller]
    : kind === 'dispute' ? [action.initiator]
    : kind === 'resolve' && action.route === 'arbiter' ? [state.terms.arbiter]
    : [state.terms.buyer, state.terms.seller];
  action.authorizations = (signers ?? defaults).map((signer) => ({
    signer, result: 'VALID', statement: statement(state, action),
  }));
  return action;
}
const run = (state, kind, now, args, signers) => transition(state, command(state, kind, now, args, signers), verify);
const funded = (options) => run(fresh(options), 'fund', 1n, { amount: config.amount });
const submitted = (options) => run(funded(options), 'submit', 2n, { evidenceCommitment: 'work-A' });
const disputed = (options) => run(submitted(options), 'dispute', 3n, { initiator: config.buyer });
function rejected(state, action, pattern) {
  const before = structuredClone(state);
  assert.throws(() => transition(state, action, verify), pattern);
  assert.deepEqual(state, before, 'Rejection must be atomic');
}

test('creation requires explicit authority variants and bounded exact terms', () => {
  for (const bad of [
    { releaseMode: undefined }, { releaseMode: 'buyer-only' }, { disputeMode: undefined },
    { disputeMode: 'administrator' }, { disputeMode: 'mutual', arbiter: 'arbiter-A' },
    { disputeMode: 'fixed-arbiter', arbiter: config.buyer },
    { disputeMode: 'fixed-arbiter', arbiter: config.seller },
    { disputeMode: 'fixed-arbiter', arbiter: config.escrow },
    { disputeMode: 'fixed-arbiter', arbiter: '' }, { buyer: config.seller },
    { buyer: config.escrow }, { seller: config.escrow },
    { buyerDestination: config.escrow }, { sellerDestination: config.escrow },
    { chainId: 0n }, { amount: 0n }, { disputeWindow: 0n },
    { amount: -1n }, { amount: MAX + 1n }, { amount: 1 }, { chainId: NaN },
    { token: 'zero' }, { termsCommitment: 'x'.repeat(129) },
  ]) assert.throws(() => fresh(bad));
  assertConservation(fresh());
  assert.equal(fresh({ disputeMode: 'fixed-arbiter', arbiter: 'arbiter-A' }).terms.arbiter, 'arbiter-A');
});

test('exact funding is accepted once and does not lose bigint precision', () => {
  const state = fresh();
  for (const amount of [0n, config.amount - 1n, config.amount + 1n, -1n, Number(config.amount)]) {
    rejected(state, command(state, 'fund', 1n, { amount }), /WRONG_AMOUNT|INVALID_UINT256/);
  }
  const next = funded();
  assert.equal(next.balance, config.amount);
  assert.equal(next.funded, config.amount);
  assert.equal(next.stageNonce, 1n);
  assert.equal(state.balance, 0n);
  rejected(next, command(next, 'fund', 2n, { amount: config.amount }), /WRONG_STATE/);
});

test('all state/action pairs follow the explicit transition table', () => {
  const states = {
    Created: fresh(), Funded: funded(), WorkSubmitted: submitted(), Disputed: disputed(),
    Released: run(submitted(), 'release', 5n), Refunded: run(funded(), 'refund', 2n),
    Resolved: run(disputed(), 'resolve', 5n, { route: 'mutual', outcome: 'release' }),
  };
  const allowed = { Created: ['fund'], Funded: ['submit', 'refund'],
    WorkSubmitted: ['dispute', 'release', 'refund'], Disputed: ['resolve'],
    Released: [], Refunded: [], Resolved: [] };
  const args = { fund: { amount: config.amount }, submit: { evidenceCommitment: 'work-B' },
    dispute: { initiator: config.buyer }, release: {}, refund: {},
    resolve: { route: 'mutual', outcome: 'release' } };
  let checked = 0;
  for (const [status, state] of Object.entries(states)) {
    for (const [kind, payload] of Object.entries(args)) {
      const now = kind === 'dispute' && status === 'WorkSubmitted' ? 3n : 5n;
      const action = command(state, kind, now, payload);
      if (allowed[status].includes(kind)) {
        const next = transition(state, action, verify);
        assert.equal(next.stageNonce, state.stageNonce + 1n);
        assertConservation(next);
      } else rejected(state, action, /WRONG_STATE|TERMINAL_STATE/);
      checked += 1;
    }
  }
  assert.equal(checked, 42);
});

test('submission fixes the release clock; another submission cannot extend it', () => {
  const state = submitted();
  assert.equal(state.submittedAt, 2n);
  assert.equal(state.releaseAt, 5n);
  rejected(state, command(state, 'submit', 4n, { evidenceCommitment: 'replacement' }), /WRONG_STATE/);
  rejected(funded(), command(funded(), 'submit', 2n, { evidenceCommitment: '' }), /INVALID_IDENTITY/);
});

test('dispute closes exactly when release becomes eligible, for both release variants', () => {
  for (const releaseMode of ['mutual', 'timeout']) {
    const state = submitted({ releaseMode });
    rejected(state, command(state, 'release', 4n), /TOO_EARLY/);
    assert.equal(run(state, 'dispute', 4n, { initiator: config.seller }).status, 'Disputed');
    rejected(state, command(state, 'dispute', 5n, { initiator: config.buyer }), /DISPUTE_WINDOW_CLOSED/);
    assert.equal(run(state, 'release', 5n).status, 'Released');
  }
});

test('timeout is explicitly permissionless; mutual release needs both current authorizations', () => {
  const mutual = submitted();
  rejected(mutual, command(mutual, 'release', 5n, {}, []), /WRONG_AUTHORIZATION_COUNT/);
  rejected(mutual, command(mutual, 'release', 5n, {}, [config.buyer]), /WRONG_AUTHORIZATION_COUNT/);
  const timeout = submitted({ releaseMode: 'timeout' });
  const done = transition(timeout, { kind: 'release', now: 5n, stageNonce: timeout.stageNonce }, () => {
    assert.fail('Timeout release must not require a revocable signature after admission');
  });
  assert.equal(done.outcome, 'release');
  assert.deepEqual(done.transfers, [{ amount: config.amount, destination: config.sellerDestination, outcome: 'release' }]);
});

test('mutual refunds work before or after submission; unilateral refund never works', () => {
  for (const state of [funded(), submitted()]) {
    rejected(state, command(state, 'refund', 3n, {}, [config.buyer]), /WRONG_AUTHORIZATION_COUNT/);
    const done = run(state, 'refund', 3n);
    assert.equal(done.refunded, config.amount);
    assert.equal(done.balance, 0n);
    assert.deepEqual(done.transfers, [{ amount: config.amount, destination: config.buyerDestination, outcome: 'refund' }]);
  }
});

test('only a party can dispute and a dispute prevents the normal release and refund paths', () => {
  const state = submitted({ releaseMode: 'timeout' });
  rejected(state, command(state, 'dispute', 3n, { initiator: 'outsider' }), /INVALID_INITIATOR/);
  const next = run(state, 'dispute', 3n, { initiator: config.buyer });
  rejected(next, command(next, 'release', 5n), /WRONG_STATE/);
  rejected(next, command(next, 'refund', 5n), /WRONG_STATE/);
  rejected(next, command(next, 'dispute', 4n, { initiator: config.seller }), /WRONG_STATE/);
});

test('arbiter is optional and fixed; it may choose only the two committed destinations', () => {
  const mutual = disputed();
  rejected(mutual, command(mutual, 'resolve', 5n, { route: 'arbiter', outcome: 'release' }), /INVALID_RESOLUTION_ROUTE/);
  const arbitration = disputed({ disputeMode: 'fixed-arbiter', arbiter: 'arbiter-A' });
  for (const outcome of ['release', 'refund']) {
    const done = run(arbitration, 'resolve', 5n, { route: 'arbiter', outcome });
    assert.equal(done.status, 'Resolved');
    assert.equal(done.outcome, outcome);
    assert.equal(done.transfers[0].destination,
      outcome === 'release' ? config.sellerDestination : config.buyerDestination);
  }
  rejected(arbitration, command(arbitration, 'resolve', 5n,
    { route: 'arbiter', outcome: 'split' }), /INVALID_OUTCOME/);
  rejected(arbitration, command(arbitration, 'resolve', 5n,
    { route: 'administrator', outcome: 'refund' }), /INVALID_RESOLUTION_ROUTE/);
  rejected(arbitration, command(arbitration, 'resolve', 5n,
    { route: 'arbiter', outcome: 'refund' }, ['replacement-arbiter']), /MISSING_OR_DUPLICATE_SIGNER/);
  assert.equal(run(arbitration, 'resolve', 5n, { route: 'mutual', outcome: 'refund' }).outcome, 'refund');
});

test('a favorable dispute decision preserves the release lock, while refund can settle earlier', () => {
  for (const route of ['mutual', 'arbiter']) {
    const state = disputed({ disputeMode: 'fixed-arbiter', arbiter: 'arbiter-A' });
    rejected(state, command(state, 'resolve', 4n, { route, outcome: 'release' }), /TOO_EARLY/);
    assert.equal(run(state, 'resolve', 4n, { route, outcome: 'refund' }).outcome, 'refund');
    assert.equal(run(state, 'resolve', 5n, { route, outcome: 'release' }).outcome, 'release');
  }
});

test('every authority-affecting term and exact action payload is bound to the authorization', () => {
  const state = submitted();
  const good = command(state, 'release', 5n);
  for (const [field, value] of Object.entries(config)) {
    const bad = structuredClone(good);
    bad.authorizations[0].statement.domain.terms[field] = typeof value === 'bigint' ? value + 1n : 'changed';
    rejected(state, bad, /WRONG_STATEMENT/);
  }
  for (const field of ['name', 'version']) {
    const bad = structuredClone(good);
    bad.authorizations[0].statement.domain[field] = 'changed';
    rejected(state, bad, /WRONG_STATEMENT/);
  }
  for (const [field, value] of Object.entries({ action: 'refund', deadline: 999n, stageNonce: 999n, stateHash: 'changed' })) {
    const bad = structuredClone(good);
    bad.authorizations[0].statement[field] = value;
    rejected(state, bad, /WRONG_STATEMENT/);
  }
  for (const [field, value] of Object.entries({ amount: 1n, destination: 'attacker' })) {
    const bad = structuredClone(good);
    bad.authorizations[0].statement.args[field] = value;
    rejected(state, bad, /WRONG_STATEMENT/);
  }
  const submit = command(funded(), 'submit', 2n, { evidenceCommitment: 'work-A' });
  rejected(funded(), { ...submit, evidenceCommitment: 'work-B' }, /WRONG_STATEMENT/);
  const resolve = command(disputed(), 'resolve', 5n, { route: 'mutual', outcome: 'refund' });
  rejected(disputed(), { ...resolve, outcome: 'release' }, /WRONG_STATEMENT/);
});

test('cross-chain, cross-stage, token and terms replay fail even at the same stage nonce', () => {
  const state = fresh();
  const action = command(state, 'fund', 1n, { amount: config.amount });
  for (const options of [{ chainId: 2n }, { escrow: 'escrow-B' }, { token: 'token-B' },
    { termsCommitment: 'terms-B' }, { buyerDestination: 'buyer-exit-B' }, { sellerDestination: 'seller-exit-B' }]) {
    rejected(fresh(options), action, /WRONG_STATEMENT/);
  }
  const next = transition(state, action, verify);
  rejected(next, action, /STALE_STAGE_NONCE/);
  rejected(state, command(state, 'fund', 1n,
    { amount: config.amount, stageNonce: state.stageNonce + 1n }), /STALE_STAGE_NONCE/);
});

test('malformed, failed, expired and duplicate authorizations consume no state or nonce', () => {
  const state = submitted();
  const good = command(state, 'release', 5n);
  for (const result of ['INVALID', 'WRONG_MAGIC', 'REVERT', true, 1, undefined, Promise.resolve('VALID')]) {
    const bad = structuredClone(good);
    bad.authorizations[0].result = result;
    // Promise is intentionally not cloneable; admission must still fail closed.
    rejected(state, bad, /INVALID_SIGNATURE/);
  }
  for (const authorizations of [undefined, [], good.authorizations.slice(0, 1),
    [...good.authorizations, good.authorizations[0]]]) {
    rejected(state, { ...good, authorizations }, /WRONG_AUTHORIZATION_COUNT/);
  }
  const duplicate = structuredClone(good);
  duplicate.authorizations[1] = duplicate.authorizations[0];
  rejected(state, duplicate, /MISSING_OR_DUPLICATE_SIGNER/);
  const expired = command(state, 'release', 5n, { deadline: 4n });
  rejected(state, expired, /SIGNATURE_EXPIRED/);
  assert.equal(run(state, 'release', 5n, { deadline: 5n }).status, 'Released');
  assert.throws(() => transition(state, good), /INVALID_SIGNATURE/);
});

test('all terminal outcomes forbid any further payout, refund or funding', () => {
  const ends = [run(submitted(), 'release', 5n), run(funded(), 'refund', 2n),
    run(disputed(), 'resolve', 5n, { route: 'mutual', outcome: 'release' }),
    run(disputed(), 'resolve', 5n, { route: 'mutual', outcome: 'refund' })];
  for (const state of ends) {
    for (let index = 0; index < 50; index += 1) {
      rejected(state, { kind: ['release', 'refund', 'fund'][index % 3],
        now: state.now + BigInt(index), stageNonce: state.stageNonce }, /TERMINAL_STATE/);
    }
    assertConservation(state);
    assert.equal(state.transfers.length, 1);
  }
});

test('bounded integer arithmetic, monotone inclusion time and nonce overflow fail atomically', () => {
  const state = funded();
  for (const now of [-1n, MAX + 1n, 1, NaN, Infinity]) {
    rejected(state, { kind: 'submit', now, stageNonce: state.stageNonce }, /INVALID_UINT256/);
  }
  rejected(state, command(state, 'submit', 0n, { evidenceCommitment: 'work' }), /TIME_WENT_BACKWARDS/);
  rejected(state, command(state, 'submit', MAX, { deadline: MAX, evidenceCommitment: 'work' }), /INVALID_UINT256/);
  // Synthetic boundary fixture: no practical execution traverses 2^256 transitions.
  const lastNonce = { ...state, stageNonce: MAX };
  rejected(lastNonce, command(lastNonce, 'refund', 1n), /INVALID_UINT256/);
  rejected(state, { kind: 'unknown', now: 1n, stageNonce: state.stageNonce }, /UNKNOWN_COMMAND/);
  assert.throws(() => statement(state, { kind: 'unknown', deadline: 1n, stageNonce: 1n }), /UNKNOWN_COMMAND/);
});

test('canonical replay recovers exact state and discards an orphaned payment outcome', () => {
  let state = fresh();
  const history = [];
  const advance = (kind, now, args) => {
    const action = command(state, kind, now, args);
    history.push(action);
    state = transition(state, action, verify);
  };
  advance('fund', 1n, { amount: config.amount });
  advance('submit', 2n, { evidenceCommitment: 'work-A' });
  const checkpoint = structuredClone(state);
  advance('release', 5n);
  assert.deepEqual(replay(config, history, verify), state);
  assert.deepEqual(transition(checkpoint, history[2], verify), state);
  const canonical = replay(config, history.slice(0, 1), verify);
  assert.equal(canonical.status, 'Funded');
  assert.equal(canonical.released, 0n);
  rejected(canonical, history[2], /STALE_STAGE_NONCE/);
  const resubmitted = run(canonical, 'submit', 7n, { evidenceCommitment: 'work-A' });
  assert.equal(resubmitted.releaseAt, 10n);
  rejected(resubmitted, { ...history[2], now: 10n }, /WRONG_STATEMENT/);
});

test('mutual-only dispute resolution can remain locked indefinitely: no liveness overclaim', () => {
  const state = disputed({ releaseMode: 'timeout' });
  for (const now of [5n, 1000n, MAX - 100n]) {
    rejected(state, command(state, 'release', now), /WRONG_STATE/);
    rejected(state, command(state, 'resolve', now, { route: 'mutual', outcome: 'refund' }, [config.buyer]),
      /WRONG_AUTHORIZATION_COUNT/);
  }
  assert.equal(state.balance, config.amount);
});

test('a compromised fixed arbiter can choose either party: authority cost stays explicit', () => {
  const state = disputed({ disputeMode: 'fixed-arbiter', arbiter: 'compromised-arbiter' });
  assert.equal(run(state, 'resolve', 5n, { route: 'arbiter', outcome: 'release' }).released, config.amount);
  assert.equal(run(state, 'resolve', 5n, { route: 'arbiter', outcome: 'refund' }).refunded, config.amount);
  // Neither result proves delivery or fairness. The model intentionally has no evidence oracle.
});

test('finite adversarial exploration preserves value, destinations and terminal finality', (context) => {
  let examined = 0;
  let reachable = 0;
  for (const releaseMode of ['mutual', 'timeout']) {
    for (const disputeMode of ['mutual', 'fixed-arbiter']) {
      let states = [fresh({ releaseMode, disputeMode, arbiter: disputeMode === 'mutual' ? null : 'arbiter-A' })];
      const seen = new Set(states.map(snapshotHash));
      for (let depth = 0; depth < 5; depth += 1) {
        const successors = [];
        for (const state of states) {
          const now = state.now + 1n;
          const candidates = [
            command(state, 'fund', now, { amount: config.amount }),
            command(state, 'fund', now, { amount: config.amount - 1n }),
            command(state, 'submit', now, { evidenceCommitment: 'work-A' }),
            command(state, 'dispute', now, { initiator: config.buyer }),
            command(state, 'dispute', now, { initiator: config.seller }),
            command(state, 'release', now), command(state, 'release', now + 3n),
            command(state, 'refund', now), command(state, 'refund', now, {}, [config.buyer]),
            command(state, 'resolve', now, { route: 'mutual', outcome: 'refund' }),
            command(state, 'resolve', now + 3n, { route: 'mutual', outcome: 'release' }),
            command(state, 'resolve', now + 3n, { route: 'arbiter', outcome: 'release' }),
            command(state, 'resolve', now, { route: 'arbiter', outcome: 'refund' }),
          ].flatMap((action) => [action, { ...action, now: action.now + 1n },
            { ...action, now: action.now + 2n }]);
          for (const action of candidates) {
            const before = structuredClone(state);
            let next;
            try { next = transition(state, action, verify); } catch { next = state; }
            examined += 1;
            assert.deepEqual(state, before);
            assertConservation(next);
            assert.equal(next.funded, next.balance + next.released + next.refunded);
            assert.ok(next.balance === 0n || next.balance === config.amount);
            assert.ok(next.transfers.length <= 1);
            for (const payment of next.transfers) assert.ok([
              config.buyerDestination, config.sellerDestination,
            ].includes(payment.destination));
            const id = snapshotHash(next);
            if (!seen.has(id)) { seen.add(id); successors.push(next); }
          }
        }
        states = successors;
      }
      reachable += seen.size;
    }
  }
  assert.ok(examined > 500);
  assert.ok(reachable > 40);
  context.diagnostic(`${examined} attempted transitions; ${reachable} reachable states across four explicit variants`);
});
