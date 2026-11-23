import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateLedger, validateLedgerTransition } from '../consolidation/validate-ledger.mjs';

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

test('new-branch provenance must point to exactly the inventoried branch and immutable head', () => {
  const bad = fixture();
  bad.summary.newBranches = [{ branch: 'work', sha: c }];
  assert.throws(() => validateLedger(bad), /new branch provenance/);
  const absent = fixture();
  absent.summary.newBranches = [{ branch: 'not-in-census', sha: b }];
  assert.throws(() => validateLedger(absent), /new branch provenance/);
  const duplicate = fixture();
  duplicate.summary.newBranches = [{ branch: 'work', sha: b }, { branch: 'work', sha: b }];
  assert.throws(() => validateLedger(duplicate), /duplicate new branch provenance/);
  const valid = fixture();
  valid.summary.newBranches = [{ branch: 'work', sha: b }];
  assert.equal(validateLedger(valid).unresolved, 1);
});

test('advanced-head provenance cannot refer to stale, absent, or unchanged branch heads', () => {
  const stale = fixture();
  stale.summary.advancedHeads = [{ branch: 'work', old: a, new: c }];
  assert.throws(() => validateLedger(stale), /advanced head provenance/);
  const missing = fixture();
  missing.summary.advancedHeads = [{ branch: 'not-in-census', old: a, new: b }];
  assert.throws(() => validateLedger(missing), /advanced head provenance/);
  const unchanged = fixture();
  unchanged.summary.advancedHeads = [{ branch: 'work', old: b, new: b }];
  assert.throws(() => validateLedger(unchanged), /advanced head provenance/);
  const valid = fixture();
  valid.summary.advancedHeads = [{ branch: 'work', old: a, new: b }];
  assert.equal(validateLedger(valid).unresolved, 1);
});

test('standalone finalized counts are internally consistent; transitions verify historical truth', () => {
  const s = fixture();
  s.summary.priorFinalized = 0;
  s.summary.newlyFinalized = 1;
  // Internally plausible; only validateLedgerTransition(s, previous) can
  // distinguish an invented prior count from a real previous snapshot.
  assert.equal(validateLedger(s).finalized, 1);
  const t = fixture();
  t.summary.priorFinalized = 1;
  t.summary.newlyFinalized = 2;
  assert.throws(() => validateLedger(t), /finalization accounting/);
  const valid = fixture();
  valid.summary.priorFinalized = 1;
  valid.summary.newlyFinalized = 0;
  assert.equal(validateLedger(valid).finalized, 1);
});


test('transition checks require complete, accurate new-ref provenance', () => {
  const previous = fixture();
  const next = structuredClone(previous);
  next.records.push({ branch: 'added', sha: c, finalized: false,
    disposition: 'newly-discovered-review-required', prHeads: [], sameShaOtherBranchPrHeads: [] });
  next.provenance.branchPages = [3, 0];
  next.summary.total = 3; next.summary.unresolved = 2;
  next.summary.priorFinalized = 1; next.summary.newlyFinalized = 0;
  next.summary.newBranches = [{ branch: 'added', sha: c }];
  next.summary.advancedHeads = [];
  assert.equal(validateLedgerTransition(next, previous).newBranches, 1);

  const omitted = structuredClone(next); omitted.summary.newBranches = [];
  assert.throws(() => validateLedgerTransition(omitted, previous), /new branch provenance differs/);
  const fabricated = structuredClone(next);
  fabricated.summary.newBranches = [{ branch: 'work', sha: b }];
  assert.throws(() => validateLedgerTransition(fabricated, previous), /new branch provenance differs/);
  const disappeared = structuredClone(previous);
  disappeared.records = disappeared.records.filter(row => row.branch !== 'work');
  disappeared.provenance.branchPages = [1, 0];
  disappeared.openPrs = []; disappeared.provenance.prPages = [0];
  disappeared.summary = { total: 1, finalized: 1, unresolved: 0, openPRs: 0, stackedPRs: 0, newBranches: [], advancedHeads: [] };
  assert.throws(() => validateLedgerTransition(disappeared, previous), /historical branch disappeared/);
});

test('transition checks require every advanced SHA and matching old-source evidence', () => {
  const previous = fixture();
  const next = structuredClone(previous);
  next.records[1].sha = c;
  next.records[1].prHeads[0].headSha = c;
  next.openPrs[0].headSha = c;
  next.summary.newBranches = [];
  next.summary.advancedHeads = [{ branch: 'work', old: b, new: c }];
  next.summary.priorFinalized = 1; next.summary.newlyFinalized = 0;
  assert.equal(validateLedgerTransition(next, previous).advancedHeads, 1);
  const missing = structuredClone(next); missing.summary.advancedHeads = [];
  assert.throws(() => validateLedgerTransition(missing, previous), /advanced head provenance differs/);
  const falseOld = structuredClone(next); falseOld.summary.advancedHeads[0].old = a;
  assert.throws(() => validateLedgerTransition(falseOld, previous), /advanced head provenance differs/);
});

test('transition checks prohibit fabricated finalization and retroactive status changes', () => {
  const previous = fixture();
  const next = structuredClone(previous);
  next.summary.newBranches = [];
  next.summary.advancedHeads = [];
  next.summary.priorFinalized = 1;
  next.summary.newlyFinalized = 0;
  assert.equal(validateLedgerTransition(next, previous).newlyFinalized, 0);
  const miscount = structuredClone(next);
  miscount.summary.priorFinalized = 0; miscount.summary.newlyFinalized = 1;
  assert.throws(() => validateLedgerTransition(miscount, previous), /prior finalization count/);
  const regressed = structuredClone(next);
  regressed.records[0].finalized = false;
  regressed.records[0].disposition = 'unresolved-review-required';
  regressed.summary.finalized = 0; regressed.summary.unresolved = 2;
  regressed.summary.priorFinalized = 0;
  assert.throws(() => validateLedgerTransition(regressed, previous), /finalized classification regressed/);
  const newly = structuredClone(next);
  newly.records[1].finalized = true;
  newly.records[1].disposition = 'already-represented-in-unmerged-PR10';
  newly.summary.finalized = 2; newly.summary.unresolved = 0;
  newly.summary.newlyFinalized = 1;
  const withoutProof = structuredClone(newly);
  assert.throws(() => validateLedgerTransition(withoutProof, previous), /new finalization needs source proof/);
  newly.records[1].evidence = {
    checkedDonorSha: b, comparedWithSha: a, sourceProof: 'docs/consolidation/provenance.md#work',
    assessment: 'source reviewed: no new code in this retained branch'
  };
  assert.equal(validateLedgerTransition(newly, previous).newlyFinalized, 1);
});
