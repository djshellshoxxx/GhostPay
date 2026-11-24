import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
function check(ok, why) {
  if (!ok) throw new Error(`Invalid consolidation ledger: ${why}`);
}
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validSha(value) {
  return typeof value === 'string' && SHA.test(value);
}
function sameSet(got, want) {
  return got.length === want.length && got.every((x, i) => x === want[i]);
}
function uniqueSorted(items) {
  return [...new Set(items)].sort();
}
// Historical source proof is append-only. An advanced donor may add a new
// qualification and archive the old proof in evidence.history, but must not
// quietly remove or rewrite the source/identity evidence from earlier cycles.
function proofContains(current, prior) {
  if (Array.isArray(prior)) return Array.isArray(current) &&
    current.length >= prior.length && prior.every((value, i) => proofContains(current[i], value));
  if (object(prior)) return object(current) &&
    Object.keys(prior).every(key => Object.prototype.hasOwnProperty.call(current, key) &&
      proofContains(current[key], prior[key]));
  return Object.is(current, prior);
}
function retainsHistoricalEvidence(current, prior) {
  if (proofContains(current, prior)) return true;
  return object(current) && Array.isArray(current.history) &&
    current.history.some(entry => proofContains(entry, prior));
}

function validPageSequence(pages) {
  // An empty result needs just one terminal page. Every earlier page must be
  // full; a short nonterminal page or a second terminal page means the census
  // was not a coherent page-by-page snapshot.
  if (pages.length === 1) return pages[0] === 0;
  return pages.length > 1 && pages.at(-1) === 0 &&
    pages.slice(0, -1).every((n, i) => n > 0 && (i === pages.length - 2 || n === 100));
}

const NONFINAL_DISPOSITION = /^(?:unresolved|newly-discovered|new-owned|owned-tooling|advanced-head|pending-|unsafe(?:-|$)|blocked(?:-|$)|unique(?:-|$)|needs-)|review-required|needs-semantic-review/i;
// A previously flagged high-risk history must not shed its visible warning
// merely by changing an unresolved disposition to a generic queue label.
// Explicit, source-pinned requalification is required even without a SHA change.
const HIGH_RISK_DISPOSITION = /(?:^|[-_])(?:unsafe|blocked|p0)(?:[-_]|$)/i;

// Offline checkpoint invariant checks. This utility never reads or writes live GitHub refs.
export function validateLedger(data) {
  check(object(data), 'checkpoint must be an object');
  check(typeof data.schema === 'string' && /^ghostpay-r\d+-source-pinned-branch-disposition-ledger\/1$/.test(data.schema), 'unknown schema');
  check(typeof data.repository === 'string' && data.repository.includes('/'), 'repository identity missing');
  check(object(data.summary), 'summary missing');
  check(object(data.provenance) && validSha(data.provenance.mainSha), 'main SHA provenance missing');
  check(Array.isArray(data.records) && Array.isArray(data.openPrs), 'inventories missing');
  check(Array.isArray(data.provenance.branchPages) && data.provenance.branchPages.at(-1) === 0, 'branch pagination not exhausted');
  check(Array.isArray(data.provenance.prPages) && data.provenance.prPages.at(-1) === 0, 'PR pagination not exhausted');
  check(data.provenance.branchPages.every(x => Number.isSafeInteger(x) && x >= 0 && x <= 100), 'invalid branch pagination');
  check(data.provenance.prPages.every(x => Number.isSafeInteger(x) && x >= 0 && x <= 100), 'invalid PR pagination');
  check(validPageSequence(data.provenance.branchPages), 'invalid branch pagination sequence');
  check(validPageSequence(data.provenance.prPages), 'invalid PR pagination sequence');
  check(data.provenance.branchPages.reduce((s, x) => s + x, 0) === data.records.length, 'branch page count inconsistent');
  check(data.provenance.prPages.reduce((s, x) => s + x, 0) === data.openPrs.length, 'PR page count inconsistent');
  check(Array.isArray(data.provenance.branchIdentityMismatches) && data.provenance.branchIdentityMismatches.length === 0,
    'Git refs not independently reconciled');

  const branches = new Map();
  for (const [i, row] of data.records.entries()) {
    check(object(row) && typeof row.branch === 'string' && row.branch.length > 0, `branch[${i}] invalid name`);
    check(!branches.has(row.branch), `duplicate branch ${row.branch}`);
    check(validSha(row.sha), `branch ${row.branch} invalid SHA`);
    check(typeof row.finalized === 'boolean', `branch ${row.branch} missing finalized flag`);
    check(typeof row.disposition === 'string' && row.disposition.length > 0, `branch ${row.branch} missing disposition`);
    if (row.finalized) check(!NONFINAL_DISPOSITION.test(row.disposition),
      `branch ${row.branch} cannot be finalized with unresolved disposition`);
    if (row.finalized && row.disposition.includes('in-unmerged-recovery')) {
      check(object(row.evidence) && row.evidence.mainIntegrated === false && validSha(row.evidence.parentHead),
        `branch ${row.branch} claims pending recovery without explicit evidence`);
      check(row.evidence.behavioralEquivalenceNotClaimed === true, `branch ${row.branch} falsely implies functional equivalence`);
    }
    branches.set(row.branch, row);
  }
  check(branches.get('main')?.sha === data.provenance.mainSha,
    'main ref SHA inconsistent with provenance');
  const prs = new Map();
  for (const [i, pr] of data.openPrs.entries()) {
    check(object(pr) && Number.isSafeInteger(pr.number) && pr.number > 0, `PR[${i}] invalid number`);
    check(!prs.has(pr.number), `duplicate PR #${pr.number}`);
    check(validSha(pr.headSha) && validSha(pr.baseSha), `PR #${pr.number} invalid SHA`);
    check(typeof pr.headRepo === 'string' && /^[^/\s]+\/[^/\s]+$/.test(pr.headRepo), `PR #${pr.number} missing or invalid head repository`);
    check(typeof pr.headRef === 'string' && typeof pr.base === 'string', `PR #${pr.number} missing ref`);
    if (pr.headRepo === data.repository) {
      const match = branches.get(pr.headRef);
      check(match, `PR #${pr.number} head branch absent from census (${pr.headRef})`);
      check(match.sha === pr.headSha, `PR #${pr.number} head SHA inconsistent with branch census`);
    }
    prs.set(pr.number, pr);
  }


  // A historical donor may be closed as structurally represented by an unmerged
  // recovery PR, but only while that exact parent SHA is still open and pinned.
  // Rebase, force-update or merge invalidates the old source/evidence relationship.
  for (const row of data.records) {
    if (!row.finalized || !row.disposition.includes('in-unmerged-recovery')) continue;
    const parentNumber = row.evidence.parentPR ?? row.evidence.parentPr;
    check(Number.isSafeInteger(parentNumber) && parentNumber > 0,
      `branch ${row.branch} missing recovery parent PR number`);
    const parent = prs.get(parentNumber);
    check(parent && parent.headSha === row.evidence.parentHead,
      `branch ${row.branch} recovery parent PR head changed or is absent`);
  }

  for (const branch of data.records) {
    const own = data.openPrs.filter(pr => pr.headRepo === data.repository && pr.headRef === branch.branch);
    const aliases = data.openPrs.filter(pr => pr.headRepo === data.repository && pr.headSha === branch.sha && pr.headRef !== branch.branch);
    check(Array.isArray(branch.prHeads) && Array.isArray(branch.sameShaOtherBranchPrHeads), `branch ${branch.branch} lacks PR ownership overlay`);
    const wantOwn = uniqueSorted(own.map(pr => `${pr.number}:${pr.headSha}:${pr.base}`));
    const gotOwn = uniqueSorted(branch.prHeads.map(pr => `${pr.number}:${pr.headSha}:${pr.base}`));
    check(wantOwn.length === branch.prHeads.length && sameSet(wantOwn, gotOwn), `branch ${branch.branch} PR owners stale`);
    const wantAliases = uniqueSorted(aliases.map(pr => `${pr.number}:${pr.headRef}:${pr.base}`));
    const gotAliases = uniqueSorted(branch.sameShaOtherBranchPrHeads.map(pr => `${pr.number}:${pr.headRef}:${pr.base}`));
    check(wantAliases.length === branch.sameShaOtherBranchPrHeads.length && sameSet(wantAliases, gotAliases), `branch ${branch.branch} SHA-alias overlay stale`);
  }

  // Preserve historical classification accounting and prevent newly discovered
  // refs or advanced heads from being invented independently of the exact census.
  if (data.summary.newBranches !== undefined) {
    check(Array.isArray(data.summary.newBranches), 'new branch provenance malformed');
    const seen = new Set();
    for (const item of data.summary.newBranches) {
      check(object(item) && typeof item.branch === 'string' &&
        validSha(item.sha) && branches.get(item.branch)?.sha === item.sha,
        'new branch provenance does not match census');
      check(!seen.has(item.branch), 'duplicate new branch provenance');
      seen.add(item.branch);
    }
  }
  if (data.summary.advancedHeads !== undefined) {
    check(Array.isArray(data.summary.advancedHeads), 'advanced head provenance malformed');
    const seen = new Set();
    for (const item of data.summary.advancedHeads) {
      check(object(item) && typeof item.branch === 'string' &&
        validSha(item.old) && validSha(item.new) && item.old !== item.new &&
        branches.get(item.branch)?.sha === item.new,
        'advanced head provenance does not match census');
      check(!seen.has(item.branch), 'duplicate advanced head provenance');
      seen.add(item.branch);
    }
  }

  // Deleted GitHub refs do not erase historical obligations. A retirement
  // records the last observed immutable SHA and independent 404 evidence.
  const retiredHistories = data.retiredHistories ?? [];
  check(Array.isArray(retiredHistories), 'retired history inventory malformed');
  const retiredKeys = new Set();
  for (const row of retiredHistories) {
    check(object(row) && typeof row.branch === 'string' && validSha(row.sha) &&
      typeof row.finalized === 'boolean' && typeof row.disposition === 'string',
      'retired history identity malformed');
    const key = `${row.branch}:${row.sha}`;
    check(!retiredKeys.has(key), 'duplicate retired history');
    retiredKeys.add(key);
    // A ref can be re-created at a different SHA after its historical deletion,
    // but it cannot be simultaneously live and retired at the *same* SHA.
    check(branches.get(row.branch)?.sha !== row.sha,
      `retired history ${row.branch} still live at the recorded SHA`);
    // Deleting a ref never qualifies missing or dangerous functionality.
    if (row.finalized) check(!NONFINAL_DISPOSITION.test(row.disposition),
      'retired history cannot be finalized with unresolved disposition');
    check(object(row.proof) && row.proof.status === 404 &&
      row.proof.absentInIndependentRefs === true &&
      typeof row.proof.checkedAtUtc === 'string' && !Number.isNaN(Date.parse(row.proof.checkedAtUtc)) &&
      typeof row.proof.refUrl === 'string' &&
      row.proof.refUrl.endsWith(`/git/ref/heads/${row.branch}`),
      'retired history requires explicit 404 and independent-ref verification');
  }

  const finalized = data.records.filter(row => row.finalized).length;
  const stacked = data.openPrs.filter(pr => pr.base !== 'main').length;
  check(data.summary.total === data.records.length, 'total branch count wrong');
  check(data.summary.finalized === finalized, 'finalized count wrong');
  if (data.summary.priorFinalized !== undefined || data.summary.newlyFinalized !== undefined) {
    check(Number.isSafeInteger(data.summary.priorFinalized) && data.summary.priorFinalized >= 0 &&
      Number.isSafeInteger(data.summary.newlyFinalized) && data.summary.newlyFinalized >= 0 &&
      data.summary.priorFinalized + data.summary.newlyFinalized === finalized,
      'finalization accounting inconsistent');
  }
  check(data.summary.unresolved === data.records.length - finalized, 'unresolved count wrong');
  if (data.summary.globalUnresolved !== undefined) {
    check(data.summary.globalUnresolved === data.summary.unresolved +
      retiredHistories.filter(row => !row.finalized).length,
      'global unresolved count wrong including retired histories');
  }
  check(data.summary.openPRs === data.openPrs.length, 'open PR count wrong');
  check(data.summary.stackedPRs === stacked, 'stacked PR count wrong');
  return { total: data.records.length, finalized, unresolved: data.records.length - finalized,
    openPRs: data.openPrs.length, stackedPRs: stacked, mainSha: data.provenance.mainSha,
    ...(data.summary.globalUnresolved === undefined ? {} : { globalUnresolved: data.summary.globalUnresolved }) };
}


// Cross-check two fully validated, immutable checkpoint inventories. A single
// checkpoint can be internally consistent while omitting new branch names,
// inventing "new" refs, or hiding head changes relative to its predecessor.
export function validateLedgerTransition(current, previous) {
  const now = validateLedger(current);
  const before = validateLedger(previous);
  check(current.repository === previous.repository, 'repository changed across checkpoints');

  const old = new Map(previous.records.map(row => [row.branch, row]));
  const next = new Map(current.records.map(row => [row.branch, row]));
  const retired = new Map((current.retiredHistories ?? []).map(row => [`${row.branch}:${row.sha}`, row]));
  const priorRetired = previous.retiredHistories ?? [];
  const newlyFinalizedRetired = [];
  for (const row of priorRetired) {
    const successor = retired.get(`${row.branch}:${row.sha}`);
    // Identity and deletion evidence are immutable even when source review
    // later proves an unresolved, deleted history is safe to finalize.
    check(successor && JSON.stringify(successor.proof) === JSON.stringify(row.proof),
      `previously retired history was altered or dropped: ${row.branch}`);
    // Unresolved and unsafe findings are also durable evidence. Retirement or
    // subsequent finalization must not erase the original security assessment.
    if (Object.prototype.hasOwnProperty.call(row, 'evidence')) {
      check(retainsHistoricalEvidence(successor.evidence, row.evidence),
        `retired history historical source evidence was erased: ${row.branch}`);
    }
    if (row.finalized || !successor.finalized) {
      check(successor.finalized === row.finalized &&
        successor.disposition === row.disposition,
        `previously retired history was altered or dropped: ${row.branch}`);
      continue;
    }
    const proof = successor.evidence;
    check(object(proof) &&
      proof.checkedDonorSha === row.sha &&
      proof.previousDisposition === row.disposition &&
      proof.newDisposition === successor.disposition &&
      validSha(proof.comparedWithSha) &&
      typeof proof.sourceProof === 'string' && proof.sourceProof.trim().length > 0 &&
      typeof proof.assessment === 'string' && proof.assessment.trim().length > 0,
      `retired history finalization needs source proof: ${row.branch}`);
    newlyFinalizedRetired.push(row.branch);
  }
  const disappeared = [];
  for (const [name, row] of old) {
    const successor = next.get(name);
    if (!successor) {
      const tombstone = retired.get(`${name}:${row.sha}`);
      check(tombstone && tombstone.finalized === row.finalized &&
        tombstone.disposition === row.disposition,
        `retired history prior state mismatch or historical branch disappeared: ${name}`);
      if (Object.prototype.hasOwnProperty.call(row, 'evidence')) {
        check(retainsHistoricalEvidence(tombstone.evidence, row.evidence),
          `retired history historical source evidence was erased: ${name}`);
      }
      disappeared.push(row);
      continue;
    }
    if (name !== 'main' && Object.prototype.hasOwnProperty.call(row, 'evidence')) {
      check(retainsHistoricalEvidence(successor.evidence, row.evidence),
        `branch historical source evidence was erased: ${name}`);
    }
    if (row.finalized && !successor.finalized)
      check(false, `finalized classification regressed: ${name}`);
    if (name !== 'main' && !row.finalized && !successor.finalized &&
        row.disposition !== successor.disposition &&
        HIGH_RISK_DISPOSITION.test(row.disposition)) {
      const proof = successor.evidence?.riskDispositionReview;
      check(object(proof) &&
        proof.previousDisposition === row.disposition &&
        proof.newDisposition === successor.disposition &&
        proof.checkedDonorSha === successor.sha &&
        validSha(proof.comparedWithSha) &&
        typeof proof.sourceProof === 'string' && proof.sourceProof.trim().length > 0 &&
        typeof proof.assessment === 'string' && proof.assessment.trim().length > 0,
        `unresolved high-risk disposition changed without requalification: ${name}`);
    }
    // An already-finalized donor may not silently change what "finalized"
    // means. Correcting a prior classification is allowed only with renewed,
    // source-pinned evidence covering both dispositions and the examined SHA.
    if (name !== 'main' && row.finalized && successor.finalized &&
        row.disposition !== successor.disposition) {
      const proof = successor.evidence;
      check(object(proof) && proof.checkedDonorSha === successor.sha &&
        proof.previousDisposition === row.disposition &&
        proof.newDisposition === successor.disposition &&
        validSha(proof.comparedWithSha) &&
        typeof proof.sourceProof === 'string' && proof.sourceProof.trim().length > 0 &&
        typeof proof.assessment === 'string' && proof.assessment.trim().length > 0,
        `finalized disposition changed without requalification: ${name}`);
    }
    // A finalized donor classification applies only to its examined commit.
    // If its head changes, prior proof cannot silently cover the new code.
    // The main branch is a live integration reference, not a donor.
    if (name !== 'main' && row.finalized && row.sha !== successor.sha) {
      const proof = successor.evidence;
      check(object(proof) &&
        proof.checkedDonorSha === successor.sha &&
        proof.previousFinalizedSha === row.sha &&
        validSha(proof.comparedWithSha) &&
        typeof proof.sourceProof === 'string' && proof.sourceProof.trim().length > 0 &&
        typeof proof.assessment === 'string' && proof.assessment.trim().length > 0,
        `finalized branch advanced without requalification: ${name}`);
    }
  }

  check(retired.size === priorRetired.length + disappeared.length,
    'unexpected retired history not present in prior checkpoint');
  const expectedNew = uniqueSorted(current.records.filter(row => !old.has(row.branch))
    .map(row => `${row.branch}:${row.sha}`));
  check(Array.isArray(current.summary.newBranches), 'new branch provenance differs from previous census');
  const actualNew = uniqueSorted(current.summary.newBranches.map(row => `${row.branch}:${row.sha}`));
  check(actualNew.length === current.summary.newBranches.length &&
    sameSet(actualNew, expectedNew), 'new branch provenance differs from previous census');

  const expectedAdvanced = uniqueSorted(current.records.filter(row =>
    old.has(row.branch) && old.get(row.branch).sha !== row.sha)
    .map(row => `${row.branch}:${old.get(row.branch).sha}:${row.sha}`));
  check(Array.isArray(current.summary.advancedHeads), 'advanced head provenance differs from previous census');
  const actualAdvanced = uniqueSorted(current.summary.advancedHeads.map(row =>
    `${row.branch}:${row.old}:${row.new}`));
  check(actualAdvanced.length === current.summary.advancedHeads.length &&
    sameSet(actualAdvanced, expectedAdvanced),
    'advanced head provenance differs from previous census');

  check(current.summary.priorFinalized === before.finalized -
    disappeared.filter(row => row.finalized).length,
    'prior finalization count disagrees with previous checkpoint');
  // A branch first seen in this census can legitimately be finalized as
  // audit-only or redundant, but only with the same immutable source proof
  // required for historical unresolved-to-final transitions.
  const newlyFinalized = current.records.filter(row =>
    row.finalized && (!old.has(row.branch) || !old.get(row.branch).finalized));
  for (const row of newlyFinalized) {
    check(object(row.evidence) && row.evidence.checkedDonorSha === row.sha &&
      validSha(row.evidence.comparedWithSha) &&
      typeof row.evidence.sourceProof === 'string' && row.evidence.sourceProof.length > 0 &&
      typeof row.evidence.assessment === 'string' && row.evidence.assessment.length > 0,
      `new finalization needs source proof: ${row.branch}`);
  }
  check(current.summary.newlyFinalized === newlyFinalized.length,
    'new finalization count disagrees with previous checkpoint');
  if (current.summary.newlyFinalizedRetired !== undefined) {
    check(current.summary.newlyFinalizedRetired === newlyFinalizedRetired.length,
      'retired finalization count disagrees with previous checkpoint');
  }
  return { ...now, newBranches: expectedNew.length, advancedHeads: expectedAdvanced.length,
    newlyFinalized: newlyFinalized.length, newlyFinalizedRetired: newlyFinalizedRetired.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length === 3 || process.argv.length === 4, 'usage: node validate-ledger.mjs CURRENT.json [PREVIOUS.json]');
    const snapshot = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
    const prior = process.argv[3] ? JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8')) : null;
    console.log(JSON.stringify(prior ? validateLedgerTransition(snapshot, prior) : validateLedger(snapshot)));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
