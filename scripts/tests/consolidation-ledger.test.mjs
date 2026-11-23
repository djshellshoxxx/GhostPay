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

test('advanced finalized donor heads require renewed evidence pinned to both SHAs', () => {
  const previous = fixture();
  previous.records.push({ branch: 'historical-donor', sha: c, finalized: true,
    disposition: 'superseded-by-qualified-source', prHeads: [], sameShaOtherBranchPrHeads: [] });
  previous.provenance.branchPages = [3, 0];
  previous.summary.total = 3; previous.summary.finalized = 2; previous.summary.unresolved = 1;
  const next = structuredClone(previous);
  const d = 'd'.repeat(40);
  next.records[2].sha = d;
  next.summary.newBranches = [];
  next.summary.advancedHeads = [{ branch: 'historical-donor', old: c, new: d }];
  next.summary.priorFinalized = 2; next.summary.newlyFinalized = 0;
  assert.throws(() => validateLedgerTransition(next, previous), /finalized branch advanced without requalification/);

  next.records[2].evidence = {
    checkedDonorSha: d, previousFinalizedSha: c, comparedWithSha: a,
    sourceProof: 'docs/consolidation/provenance.md#historical-donor',
    assessment: 'full changed-tree source review against qualified implementation'
  };
  assert.equal(validateLedgerTransition(next, previous).advancedHeads, 1);

  for (const changes of [
    { checkedDonorSha: c },
    { previousFinalizedSha: b },
    { comparedWithSha: 'bad' },
    { sourceProof: ' ' },
    { assessment: ' ' }
  ]) {
    const bad = structuredClone(next);
    Object.assign(bad.records[2].evidence, changes);
    assert.throws(() => validateLedgerTransition(bad, previous), /finalized branch advanced without requalification/);
  }
});

test('main census SHA must equal main provenance and may advance without donor requalification', () => {
  const previous = fixture();
  const inconsistent = structuredClone(previous);
  inconsistent.provenance.mainSha = c;
  assert.throws(() => validateLedger(inconsistent), /main ref SHA inconsistent with provenance/);

  const current = structuredClone(previous);
  current.records[0].sha = c;
  current.provenance.mainSha = c;
  current.summary.newBranches = [];
  current.summary.advancedHeads = [{ branch: 'main', old: a, new: c }];
  current.summary.priorFinalized = 1;
  current.summary.newlyFinalized = 0;
  assert.equal(validateLedgerTransition(current, previous).mainSha, c);
});

test('newly inventoried docs-only branch needs source proof before immediate finalization', () => {
  const previous = fixture();
  const next = structuredClone(previous);
  next.records.push({ branch: 'audit/new-donor', sha: c, finalized: true,
    disposition: 'audit-or-documentation-only', prHeads: [], sameShaOtherBranchPrHeads: [] });
  next.provenance.branchPages = [3, 0];
  next.summary.total = 3; next.summary.finalized = 2; next.summary.unresolved = 1;
  next.summary.priorFinalized = 1; next.summary.newlyFinalized = 1;
  next.summary.newBranches = [{ branch: 'audit/new-donor', sha: c }];
  next.summary.advancedHeads = [];
  assert.throws(() => validateLedgerTransition(next, previous), /new finalization needs source proof/);
  next.records[2].evidence = {
    checkedDonorSha: c, comparedWithSha: a,
    sourceProof: 'docs/consolidation/triage.md#new-donor',
    assessment: 'Full donor tree contained only historical audit notes'
  };
  assert.equal(validateLedgerTransition(next, previous).newlyFinalized, 1);
});

test('deleted live refs remain explicit unresolved historical obligations with 404 and census evidence', () => {
  const previous = fixture();
  const next = structuredClone(previous);
  next.records = [next.records[0]];
  next.openPrs = [];
  next.provenance.branchPages = [1, 0]; next.provenance.prPages = [0];
  next.summary = { total: 1, finalized: 1, unresolved: 0, openPRs: 0,
    stackedPRs: 0, priorFinalized: 1, newlyFinalized: 0, newBranches: [], advancedHeads: [],
    globalUnresolved: 1 };
  next.retiredHistories = [{ branch: 'work', sha: b, finalized: false,
    disposition: 'pending-owner-review',
    proof: { status: 404, absentInIndependentRefs: true,
      checkedAtUtc: '2026-11-23T04:11:17Z',
      refUrl: 'https://api.github.com/repos/djshellshoxxx/GhostPay/git/ref/heads/work' } }];
  assert.equal(validateLedgerTransition(next, previous).globalUnresolved, 1);

  const omitted = structuredClone(next); delete omitted.retiredHistories;
  assert.throws(() => validateLedgerTransition(omitted, previous), /retired|historical branch disappeared/);
  const noProof = structuredClone(next);
  noProof.retiredHistories[0].proof.status = 200;
  assert.throws(() => validateLedgerTransition(noProof, previous), /retired history.*verification/);
  const falselyFinalized = structuredClone(next);
  falselyFinalized.retiredHistories[0].finalized = true;
  // Supply a semantically finalized-looking status so this exercises the
  // cross-checkpoint history guard, not the standalone fail-closed guard.
  falselyFinalized.retiredHistories[0].disposition = 'included-in-main-by-ancestry';
  // Keep the standalone census internally coherent so the transition check,
  // not the global unresolved-count guard, catches the falsified tombstone.
  falselyFinalized.summary.globalUnresolved = 0;
  assert.throws(() => validateLedgerTransition(falselyFinalized, previous), /retired history.*prior state/);
});

test('retired records cannot double-count a live identical ref or fabricate finalized unsafe history', () => {
  const live = fixture();
  const retired = {
    branch: 'work', sha: b, finalized: false, disposition: 'pending-owner-review',
    proof: {
      status: 404, absentInIndependentRefs: true,
      checkedAtUtc: '2026-11-23T04:11:17Z',
      refUrl: 'https://api.github.com/repos/djshellshoxxx/GhostPay/git/ref/heads/work'
    }
  };
  live.retiredHistories = [retired];
  live.summary.globalUnresolved = 2;
  // Same name+SHA cannot simultaneously be a live branch and retired history.
  assert.throws(() => validateLedger(live), /retired history.*still live/);

  const recreated = structuredClone(live);
  recreated.retiredHistories[0].sha = c; // Old SHA differs from re-created live branch.
  assert.equal(validateLedger(recreated).globalUnresolved, 2);

  const falselyFinalized = structuredClone(recreated);
  falselyFinalized.retiredHistories[0].finalized = true;
  falselyFinalized.retiredHistories[0].disposition = 'unique-but-incomplete';
  falselyFinalized.summary.globalUnresolved = 1;
  assert.throws(() => validateLedger(falselyFinalized), /retired history cannot be finalized/);
});

test('finalized donor disposition changes require renewed immutable source evidence', () => {
  const previous = fixture();
  previous.records.push({ branch: 'audit/final-donor', sha: c, finalized: true,
    disposition: 'included-in-main-by-ancestry', prHeads: [], sameShaOtherBranchPrHeads: [] });
  previous.provenance.branchPages = [3, 0];
  previous.summary.total = 3; previous.summary.finalized = 2; previous.summary.unresolved = 1;

  const next = structuredClone(previous);
  next.records[2].disposition = 'audit-or-documentation-only';
  next.summary.newBranches = []; next.summary.advancedHeads = [];
  next.summary.priorFinalized = 2; next.summary.newlyFinalized = 0;
  // Earlier classifications must not be silently rewritten in a new ledger
  // even if the branch SHA and all count totals remain unchanged.
  assert.throws(() => validateLedgerTransition(next, previous),
    /finalized disposition changed without requalification/);

  next.records[2].evidence = {
    checkedDonorSha: c, previousDisposition: 'included-in-main-by-ancestry',
    newDisposition: 'audit-or-documentation-only', comparedWithSha: a, sourceProof: 'docs/consolidation/new-independent-proof.md',
    assessment: 'Re-examined original donor tree and corrected earlier ancestry evidence'
  };
  assert.equal(validateLedgerTransition(next, previous).finalized, 2);
  const missingNext = structuredClone(next);
  delete missingNext.records[2].evidence.newDisposition;
  assert.throws(() => validateLedgerTransition(missingNext, previous), /finalized disposition changed without requalification/);

  for (const invalid of [
    { checkedDonorSha: b }, { previousDisposition: 'superseded-by-other-code' }, { newDisposition: 'included-in-main-by-ancestry' },
    { comparedWithSha: 'not-a-sha' }, { sourceProof: '   ' }, { assessment: '  ' }
  ]) {
    const bad = structuredClone(next);
    Object.assign(bad.records[2].evidence, invalid);
    assert.throws(() => validateLedgerTransition(bad, previous),
      /finalized disposition changed without requalification/);
  }
});


test('previously retired unresolved history can be source-proven finalized without erasing 404 provenance', () => {
  const previous = fixture();
  previous.summary.newBranches = []; previous.summary.advancedHeads = [];
  previous.summary.priorFinalized = 1; previous.summary.newlyFinalized = 0;
  previous.retiredHistories = [{
    branch: 'gone', sha: c, finalized: false, disposition: 'unresolved-review-required',
    proof: { status: 404, absentInIndependentRefs: true,
      checkedAtUtc: '2026-11-23T04:12:40Z',
      refUrl: 'https://api.github.com/repos/djshellshoxxx/GhostPay/git/ref/heads/gone' }
  }];
  previous.summary.globalUnresolved = 2;

  const next = structuredClone(previous);
  next.retiredHistories[0].finalized = true;
  next.retiredHistories[0].disposition = 'historical-dependency-update-superseded';
  next.retiredHistories[0].evidence = {
    checkedDonorSha: c, previousDisposition: 'unresolved-review-required',
    newDisposition: 'historical-dependency-update-superseded', comparedWithSha: a, sourceProof: 'docs/consolidation/retired-donor-review.md#gone',
    assessment: 'Full historical tree reviewed; current dependencies supersede its patch'
  };
  next.summary.globalUnresolved = 1;
  next.summary.newlyFinalizedRetired = 1;
  assert.equal(validateLedgerTransition(next, previous).globalUnresolved, 1);
  assert.equal(validateLedgerTransition(next, previous).newlyFinalizedRetired, 1);
  const missingNext = structuredClone(next);
  delete missingNext.retiredHistories[0].evidence.newDisposition;
  assert.throws(() => validateLedgerTransition(missingNext, previous), /retired history finalization needs source proof/);

  for (const mutation of [
    { checkedDonorSha: b }, { previousDisposition: 'included-in-main' }, { newDisposition: 'included-in-main' },
    { comparedWithSha: 'bad' }, { sourceProof: '   ' }, { assessment: ' ' }
  ]) {
    const tampered = structuredClone(next);
    Object.assign(tampered.retiredHistories[0].evidence, mutation);
    assert.throws(() => validateLedgerTransition(tampered, previous),
      /retired history finalization needs source proof/);
  }
  const uncounted = structuredClone(next);
  uncounted.summary.newlyFinalizedRetired = 0;
  assert.throws(() => validateLedgerTransition(uncounted, previous),
    /retired finalization count/);
  const alteredProof = structuredClone(next);
  alteredProof.retiredHistories[0].proof.checkedAtUtc = '2026-11-23T05:12:40Z';
  assert.throws(() => validateLedgerTransition(alteredProof, previous),
    /previously retired history was altered/);
});

test('already-finalized retired histories cannot regress or change disposition without new proof', () => {
  const previous = fixture();
  previous.summary.newBranches = []; previous.summary.advancedHeads = [];
  previous.summary.priorFinalized = 1; previous.summary.newlyFinalized = 0;
  previous.retiredHistories = [{
    branch: 'gone', sha: c, finalized: true, disposition: 'audit-or-documentation-only',
    proof: { status: 404, absentInIndependentRefs: true,
      checkedAtUtc: '2026-11-23T04:12:40Z',
      refUrl: 'https://api.github.com/repos/djshellshoxxx/GhostPay/git/ref/heads/gone' }
  }];
  const regressed = structuredClone(previous);
  regressed.summary.newlyFinalizedRetired = 0;
  regressed.retiredHistories[0].finalized = false;
  regressed.retiredHistories[0].disposition = 'unresolved-review-required';
  regressed.summary.globalUnresolved = 2;
  assert.throws(() => validateLedgerTransition(regressed, previous),
    /previously retired history was altered/);
  const rewritten = structuredClone(previous);
  rewritten.summary.newlyFinalizedRetired = 0;
  rewritten.retiredHistories[0].disposition = 'included-in-main-by-ancestry';
  assert.throws(() => validateLedgerTransition(rewritten, previous),
    /previously retired history was altered/);
});


test('finalized donor source evidence survives later checkpoint rewrites', () => {
  const previous = fixture();
  previous.records[1].finalized = true;
  previous.records[1].disposition = 'audit-or-documentation-only';
  previous.records[1].evidence = {
    checkedDonorSha: b, comparedWithSha: a,
    sourceProof: 'docs/consolidation/immutable-audit.md',
    assessment: 'All historical executable blobs accounted for',
    immutableBlobs: { paths: ['src/one.ts', 'src/two.ts'], sha: c }
  };
  previous.summary.finalized = 2; previous.summary.unresolved = 0;
  const next = structuredClone(previous);
  next.summary.newBranches = []; next.summary.advancedHeads = [];
  next.summary.priorFinalized = 2; next.summary.newlyFinalized = 0;
  assert.equal(validateLedgerTransition(next, previous).finalized, 2);

  const deleted = structuredClone(next);
  delete deleted.records[1].evidence;
  assert.throws(() => validateLedgerTransition(deleted, previous), /historical source evidence/);

  const mutated = structuredClone(next);
  mutated.records[1].evidence.immutableBlobs.paths[0] = 'src/different.ts';
  assert.throws(() => validateLedgerTransition(mutated, previous), /historical source evidence/);

  const additive = structuredClone(next);
  additive.records[1].evidence.reviewNote = 'Reviewed again without replacing the old proof';
  assert.equal(validateLedgerTransition(additive, previous).finalized, 2);
});

test('previously finalized retired-history source evidence is not erasable', () => {
  const previous = fixture();
  previous.retiredHistories = [{
    branch: 'historical', sha: c, finalized: true, disposition: 'audit-or-documentation-only',
    proof: { status: 404, absentInIndependentRefs: true, checkedAtUtc: '2026-11-23T04:12:40Z',
      refUrl: 'https://api.github.com/repos/djshellshoxxx/GhostPay/git/ref/heads/historical' },
    evidence: { sourceProof: 'docs/consolidation/retired-proof.md', checkedDonorSha: c }
  }];
  const next = structuredClone(previous);
  next.summary.newBranches = []; next.summary.advancedHeads = [];
  next.summary.priorFinalized = 1; next.summary.newlyFinalized = 0;
  assert.equal(validateLedgerTransition(next, previous).finalized, 1);
  delete next.retiredHistories[0].evidence;
  assert.throws(() => validateLedgerTransition(next, previous), /historical source evidence/);
});


test('unresolved donor source and P0 security findings remain immutable across checkpoints', () => {
  const old = fixture();
  old.records[1].evidence = {
    sourceProof: 'docs/security/refund-finality-review.md',
    risk: { severity: 'P0', finding: 'Untrusted absence proof' }
  };
  const next = structuredClone(old);
  next.summary.newBranches = []; next.summary.advancedHeads = [];
  next.summary.priorFinalized = 1; next.summary.newlyFinalized = 0;
  assert.equal(validateLedgerTransition(next, old).unresolved, 1);

  const erased = structuredClone(next);
  delete erased.records[1].evidence;
  assert.throws(() => validateLedgerTransition(erased, old), /historical source evidence/);

  const rewritten = structuredClone(next);
  rewritten.records[1].evidence.risk.severity = 'low';
  assert.throws(() => validateLedgerTransition(rewritten, old), /historical source evidence/);

  const additive = structuredClone(next);
  additive.records[1].evidence.reviewNote = 'Further security tests requested';
  assert.equal(validateLedgerTransition(additive, old).unresolved, 1);

  const archived = structuredClone(next);
  archived.records[1].evidence = { history: [old.records[1].evidence],
    sourceProof: 'docs/security/new-review.md', assessment: 'Requalification pending' };
  assert.equal(validateLedgerTransition(archived, old).unresolved, 1);
});

test('unresolved retired donor evidence and disappearance tombstones retain prior findings', () => {
  const old = fixture();
  old.records[1].evidence = { sourceProof: 'docs/security/donor-review.md', risk: 'missing refund finality' };
  old.retiredHistories = [{
    branch: 'gone', sha: c, finalized: false, disposition: 'unresolved-review-required',
    proof: { status: 404, absentInIndependentRefs: true, checkedAtUtc: '2026-11-23T04:12:40Z',
      refUrl: 'https://api.github.com/repos/djshellshoxxx/GhostPay/git/ref/heads/gone' },
    evidence: { sourceProof: 'docs/security/retired-review.md', risk: 'P0' }
  }];
  const same = structuredClone(old);
  same.summary.newBranches = []; same.summary.advancedHeads = [];
  same.summary.priorFinalized = 1; same.summary.newlyFinalized = 0;
  delete same.retiredHistories[0].evidence;
  assert.throws(() => validateLedgerTransition(same, old), /historical source evidence/);

  const gone = structuredClone(old);
  gone.records.pop(); gone.openPrs = [];
  gone.provenance.branchPages = [1, 0]; gone.provenance.prPages = [0];
  gone.summary.total = 1; gone.summary.unresolved = 0; gone.summary.openPRs = 0;
  gone.summary.newBranches = []; gone.summary.advancedHeads = [];
  gone.summary.priorFinalized = 1; gone.summary.newlyFinalized = 0;
  gone.retiredHistories.push({
    branch: 'work', sha: b, finalized: false, disposition: 'pending-owner-review',
    proof: { status: 404, absentInIndependentRefs: true, checkedAtUtc: '2026-11-23T13:04:40Z',
      refUrl: 'https://api.github.com/repos/djshellshoxxx/GhostPay/git/ref/heads/work' }
  });
  assert.throws(() => validateLedgerTransition(gone, old), /historical source evidence/);
});

test('unresolved P0 or unsafe dispositions cannot be downgraded by label-only rewrites', () => {
  const before = fixture();
  before.records[1].disposition = 'unsafe-p0-refund-absence-proof';
  before.records[1].evidence = {
    sourceProof: 'docs/security/chain-absence-review.md',
    risk: { severity: 'P0', status: 'unresolved' }
  };
  const after = structuredClone(before);
  after.summary.newBranches = []; after.summary.advancedHeads = [];
  after.summary.priorFinalized = 1; after.summary.newlyFinalized = 0;
  // Counts, SHA, old evidence and open PR membership all stay identical.
  after.records[1].disposition = 'unresolved-review-required';
  assert.throws(() => validateLedgerTransition(after, before),
    /high-risk disposition changed without requalification/);

  after.records[1].evidence.riskDispositionReview = {
    previousDisposition: before.records[1].disposition,
    newDisposition: after.records[1].disposition,
    checkedDonorSha: b, comparedWithSha: a,
    sourceProof: 'docs/security/chain-absence-followup.md',
    assessment: 'Risk remains unresolved; classification is clarified, not waived'
  };
  assert.equal(validateLedgerTransition(after, before).unresolved, 1);
  for (const patch of [
    { previousDisposition: 'unsafe-other' },
    { newDisposition: 'audit-or-documentation-only' },
    { checkedDonorSha: c },
    { comparedWithSha: 'invalid' },
    { sourceProof: '  ' },
    { assessment: '  ' }
  ]) {
    const bad = structuredClone(after);
    Object.assign(bad.records[1].evidence.riskDispositionReview, patch);
    assert.throws(() => validateLedgerTransition(bad, before),
      /high-risk disposition changed without requalification/);
  }

  const blocked = structuredClone(before);
  blocked.records[1].disposition = 'blocked-payment-safety-ownership';
  const downgraded = structuredClone(blocked);
  downgraded.records[1].disposition = 'newly-discovered-review-required';
  downgraded.summary.newBranches = []; downgraded.summary.advancedHeads = [];
  downgraded.summary.priorFinalized = 1; downgraded.summary.newlyFinalized = 0;
  assert.throws(() => validateLedgerTransition(downgraded, blocked),
    /high-risk disposition changed without requalification/);

  // Ordinary pending -> qualified-awaiting-review progress does not need the
  // special security-risk reclassification proof.
  const ordinary = fixture();
  const progress = structuredClone(ordinary);
  progress.records[1].disposition = 'unique-eligible-awaiting-review';
  progress.summary.newBranches = []; progress.summary.advancedHeads = [];
  progress.summary.priorFinalized = 1; progress.summary.newlyFinalized = 0;
  assert.equal(validateLedgerTransition(progress, ordinary).unresolved, 1);
});
