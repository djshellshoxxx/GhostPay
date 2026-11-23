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
function validPageSequence(pages) {
  // An empty result needs just one terminal page. Every earlier page must be
  // full; a short nonterminal page or a second terminal page means the census
  // was not a coherent page-by-page snapshot.
  if (pages.length === 1) return pages[0] === 0;
  return pages.length > 1 && pages.at(-1) === 0 &&
    pages.slice(0, -1).every((n, i) => n > 0 && (i === pages.length - 2 || n === 100));
}

const NONFINAL_DISPOSITION = /^(?:unresolved|newly-discovered|new-owned|owned-tooling|advanced-head|pending-|unsafe(?:-|$)|blocked(?:-|$)|unique(?:-|$)|needs-)|review-required|needs-semantic-review/i;

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

  const finalized = data.records.filter(row => row.finalized).length;
  const stacked = data.openPrs.filter(pr => pr.base !== 'main').length;
  check(data.summary.total === data.records.length, 'total branch count wrong');
  check(data.summary.finalized === finalized, 'finalized count wrong');
  check(data.summary.unresolved === data.records.length - finalized, 'unresolved count wrong');
  check(data.summary.openPRs === data.openPrs.length, 'open PR count wrong');
  check(data.summary.stackedPRs === stacked, 'stacked PR count wrong');
  return { total: data.records.length, finalized, unresolved: data.records.length - finalized,
    openPRs: data.openPrs.length, stackedPRs: stacked, mainSha: data.provenance.mainSha };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length === 3, 'usage: node validate-ledger.mjs PATH_TO_LEDGER.json');
    const snapshot = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
    console.log(JSON.stringify(validateLedger(snapshot)));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
