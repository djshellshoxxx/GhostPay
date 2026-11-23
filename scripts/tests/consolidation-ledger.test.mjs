import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateLedger } from '../consolidation/validate-ledger.mjs';

const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
const fixture = () => ({
  schema: 'ghostpay-r48-source-pinned-branch-disposition-ledger/1',
  repository: 'djshellshoxxx/GhostPay',
  provenance: { mainSha: a, branchPages: [2, 0], prPages: [1, 0], branchIdentityMismatches: [] },
  summary: { total: 2, finalized: 1, unresolved: 1, openPRs: 1, stackedPRs: 0 },
  records: [
    { branch: 'main', sha: a, finalized: true, disposition: 'included-in-main-by-ancestry', prHeads: [], sameShaOtherBranchPrHeads: [] },
    { branch: 'work', sha: b, finalized: false, disposition: 'pending-owner-review',
      prHeads: [{ number: 10, headSha: b, base: 'main' }], sameShaOtherBranchPrHeads: [] }
  ],
  openPrs: [{ number: 10, headRef: 'work', headSha: b, base: 'main', baseSha: a, headRepo: 'djshellshoxxx/GhostPay' }]
});

test('accepts a fully paginated, SHA-matched checkpoint with qualified local owner', () => {
  assert.deepEqual(validateLedger(fixture()), { total: 2, finalized: 1, unresolved: 1,
    openPRs: 1, stackedPRs: 0, mainSha: a });
});
test('rejects stale current PR head even when PR branch name is unchanged', () => {
  const s = fixture(); s.openPrs[0].headSha = c;
  assert.throws(() => validateLedger(s), /head SHA inconsistent/);
});
test('rejects branch names whose ownership overlays were not refreshed', () => {
  const s = fixture(); s.records[1].prHeads = [];
  assert.throws(() => validateLedger(s), /PR owners stale/);
});
test('detects SHA aliases across differently named branches', () => {
  const s = fixture();s.records.push({ branch: 'alias', sha: b, finalized: false, disposition: 'pending-owner-review',
    prHeads: [], sameShaOtherBranchPrHeads: [] });
  s.provenance.branchPages = [3, 0];s.summary.total = 3;s.summary.unresolved = 2;
  assert.throws(() => validateLedger(s), /SHA-alias overlay stale/);
  s.records[2].sameShaOtherBranchPrHeads = [{ number: 10, headRef: 'work', base: 'main' }];
  assert.deepEqual(validateLedger(s).total, 3);
});
test('does not treat same-named external fork PR as a local branch', () => {
  const s = fixture();s.openPrs[0].headRepo = 'someone/fork';s.openPrs[0].headSha = c;
  s.records[1].prHeads = [];
  assert.equal(validateLedger(s).openPRs, 1);
});
test('rejects fake counts and duplicate branch identity', () => {
  const s = fixture();s.summary.finalized++;
  assert.throws(() => validateLedger(s), /finalized count wrong/);
  const t = fixture();t.records.push(t.records[1]);t.provenance.branchPages = [3, 0];t.summary.total = 3;t.summary.unresolved = 2;
  assert.throws(() => validateLedger(t), /duplicate branch/);
});
test('rejects censuses missing their terminal page or independent Git ref confirmation', () => {
  const s = fixture();s.provenance.prPages = [1];
  assert.throws(() => validateLedger(s), /PR pagination not exhausted/);
  const t = fixture();t.provenance.branchIdentityMismatches = ['work'];
  assert.throws(() => validateLedger(t), /Git refs not independently reconciled/);
});
test('retained but unmerged recovery donors must explicitly disclaim main and behavioral qualification', () => {
  const s = fixture();s.records[1].finalized = true;s.summary.finalized = 2;s.summary.unresolved = 0;
  s.records[1].disposition = 'retained-in-unmerged-recovery-PR372-pending-gates';
  assert.throws(() => validateLedger(s), /without explicit evidence/);
  s.records[1].evidence = { parentPR: 10, parentHead: b, mainIntegrated: false, behavioralEquivalenceNotClaimed: true };
  assert.equal(validateLedger(s).finalized, 2);
});
test('rejects impossible pagination including negative and noninteger page counts', () => {
  const s = fixture();s.provenance.branchPages = [3, -1, 0];
  assert.throws(() => validateLedger(s), /invalid branch pagination/);
  const t = fixture();t.provenance.prPages = [1.5, -0.5, 0];
  assert.throws(() => validateLedger(t), /invalid PR pagination/);
});

test('never finalizes unresolved branch work merely because summary totals agree', () => {
  const s = fixture();
  s.records[1].finalized = true;
  s.summary.finalized = 2;
  s.summary.unresolved = 0;
  assert.throws(() => validateLedger(s), /cannot be finalized/);
  s.records[1].disposition = 'newly-discovered-review-required';
  assert.throws(() => validateLedger(s), /cannot be finalized/);
});

test('rejects internal pagination holes, repeated terminators, and intermediate partial pages', () => {
  const duplicated = fixture();
  duplicated.provenance.branchPages = [2, 0, 0];
  assert.throws(() => validateLedger(duplicated), /invalid branch pagination sequence/);
  const hole = fixture();
  hole.provenance.prPages = [0, 1, 0];
  assert.throws(() => validateLedger(hole), /invalid PR pagination sequence/);
  const partial = fixture();
  partial.provenance.branchPages = [1, 1, 0];
  assert.throws(() => validateLedger(partial), /invalid branch pagination sequence/);
});

test('requires explicit local or fork repository identity for each PR head', () => {
  const s = fixture();
  delete s.openPrs[0].headRepo;
  s.records[1].prHeads = [];
  assert.throws(() => validateLedger(s), /head repository/);
  const blank = fixture();
  blank.openPrs[0].headRepo = 'other';
  blank.records[1].prHeads = [];
  assert.throws(() => validateLedger(blank), /head repository/);
});
test('cannot finalize security-blocked, unsafe or unintegrated unique histories', () => {
  for (const disposition of ['unsafe-payment-history', 'blocked-security-review',
    'unique-eligible', 'unique-but-incomplete', 'needs-semantic-review']) {
    const s = fixture();
    s.records[1].finalized = true;
    s.records[1].disposition = disposition;
    s.summary.finalized = 2;
    s.summary.unresolved = 0;
    assert.throws(() => validateLedger(s), /cannot be finalized/, disposition);
  }
});


test('finalized recovery donors must follow the actual current open PR parent head', () => {
  const s = fixture();
  s.records[1].finalized = true;
  s.records[1].disposition = 'retained-in-unmerged-recovery-PR10-pending-gates';
  s.records[1].evidence = {
    parentPR: 10, parentHead: b, mainIntegrated: false, behavioralEquivalenceNotClaimed: true
  };
  s.summary.finalized = 2;
  s.summary.unresolved = 0;
  assert.equal(validateLedger(s).finalized, 2);

  const advanced = structuredClone(s);
  advanced.records[1].evidence.parentHead = c;
  assert.throws(() => validateLedger(advanced), /recovery parent PR head changed or is absent/);

  const missing = structuredClone(s);
  missing.records[1].evidence.parentPR = 999;
  assert.throws(() => validateLedger(missing), /recovery parent PR head changed or is absent/);

  const unpinned = structuredClone(s);
  delete unpinned.records[1].evidence.parentPR;
  assert.throws(() => validateLedger(unpinned), /missing recovery parent PR number/);
});
