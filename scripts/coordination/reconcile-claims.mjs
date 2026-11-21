#!/usr/bin/env node
/**
 * Read-only, exact-object branch/PR evidence. No fetch, ref update or CI action.
 * Run: node scripts/coordination/reconcile-claims.mjs --repo . --snapshot input.json --output report.json
 * Input is an explicitly captured GitHub inventory, not the local remote-ref list.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLAIM_PATH = 'docs/ai/ACTIVE_WORK.md';
const SHA = /^[0-9a-f]{40}$/;
const MAX_BUFFER = 64 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const text = (value, name) => requireThat(typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value), `Invalid ${name}`);
const sha = (value, name) => requireThat(typeof value === 'string' && SHA.test(value), `${name} must be a full lowercase 40-hex commit SHA`);

export function validateSnapshot(snapshot) {
  requireThat(isObject(snapshot), 'Snapshot must be an object');
  text(snapshot.repository, 'repository');
  requireThat(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(snapshot.repository), 'repository must be owner/name');
  text(snapshot.observation_completed_utc, 'observation_completed_utc');
  requireThat(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(snapshot.observation_completed_utc)
    && Number.isFinite(Date.parse(snapshot.observation_completed_utc)), 'Invalid UTC observation timestamp');
  requireThat(new Date(snapshot.observation_completed_utc).toISOString().slice(0, 19) === snapshot.observation_completed_utc.slice(0, 19), 'Invalid UTC calendar date');
  sha(snapshot.main_sha, 'main_sha'); sha(snapshot.integration_sha, 'integration_sha');
  requireThat(Number.isSafeInteger(snapshot.integration_pr) && snapshot.integration_pr > 0, 'Invalid integration_pr');
  requireThat(Array.isArray(snapshot.branches) && snapshot.branches.length > 0, 'branches must be a nonempty array');
  requireThat(Array.isArray(snapshot.pull_requests), 'pull_requests must be an array');
  requireThat(isObject(snapshot.counts), 'Missing counts');
  requireThat(snapshot.counts.branches === snapshot.branches.length, 'Branch count mismatch');
  requireThat(snapshot.counts.open_prs === snapshot.pull_requests.length, 'PR count mismatch');
  const names = new Set(); const numbers = new Set();
  for (const branch of snapshot.branches) {
    requireThat(isObject(branch), 'Invalid branch row');
    text(branch.name, 'branch name'); sha(branch.sha, `branch ${branch.name}`);
    requireThat(!names.has(branch.name), `Duplicate branch ${branch.name}`); names.add(branch.name);
  }
  for (const pr of snapshot.pull_requests) {
    requireThat(isObject(pr) && Number.isSafeInteger(pr.number) && pr.number > 0, 'Invalid PR number');
    requireThat(!numbers.has(pr.number), `Duplicate PR ${pr.number}`); numbers.add(pr.number);
    for (const field of ['title', 'base_ref', 'head_ref', 'url']) text(pr[field], `PR ${pr.number} ${field}`);
    for (const field of ['base_sha', 'head_sha']) sha(pr[field], `PR ${pr.number} ${field}`);
    requireThat(pr.state === 'open', `PR ${pr.number} is not open in this open-PR snapshot`);
    requireThat(typeof pr.draft === 'boolean', `PR ${pr.number} draft must be Boolean`);
    requireThat(pr.url === `https://github.com/${snapshot.repository}/pull/${pr.number}`, `PR ${pr.number} URL/repository mismatch`);
  }
  const main = snapshot.branches.find(branch => branch.name === 'main');
  requireThat(main?.sha === snapshot.main_sha, 'main_sha must identify the main branch in this snapshot');
  const integration = snapshot.pull_requests.find(pr => pr.number === snapshot.integration_pr);
  requireThat(integration?.head_sha === snapshot.integration_sha, 'integration_pr and integration_sha must identify an open PR head in this snapshot');
  return snapshot;
}

class Git {
  constructor(repo) {
    this.repo = resolve(repo);
    this.relations = new Map(); this.deltas = new Map(); this.claims = new Map();
    this.repo = this.run(['rev-parse', '--show-toplevel']).replace(/\n$/, '');
    requireThat(this.run(['rev-parse', '--is-shallow-repository']).trim() === 'false', 'Shallow history cannot establish complete ancestry');
    const grafts = this.run(['rev-parse', '--git-path', 'info/grafts']).trim();
    const graftPath = resolve(this.repo, grafts);
    requireThat(!existsSync(graftPath) || readFileSync(graftPath).length === 0, 'Local grafts can change ancestry; use an unmodified repository');
  }
  run(args, { allowed = [0], input } = {}) {
    const result = spawnSync('git', ['--no-replace-objects', ...args], {
      cwd: this.repo, input, maxBuffer: MAX_BUFFER,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', LC_ALL: 'C' },
    });
    if (result.error) throw new Error(`Git ${args[0]} failed: ${result.error.message}`);
    if (!allowed.includes(result.status)) throw new Error(`Git ${args[0]} failed (${result.status}): ${decoder.decode(result.stderr).trim()}`);
    // Fail explicitly on unsupported non-UTF-8 paths instead of silently merging identities.
    return decoder.decode(result.stdout);
  }
  validateObjects(snapshot) {
    const ids = [...new Set([snapshot.main_sha, snapshot.integration_sha,
      ...snapshot.branches.map(x => x.sha), ...snapshot.pull_requests.flatMap(x => [x.head_sha, x.base_sha])])].sort(compare);
    const lines = this.run(['cat-file', '--batch-check=%(objectname) %(objecttype)'], { input: `${ids.join('\n')}\n` }).trim().split('\n');
    requireThat(lines.length === ids.length, 'Incomplete Git object validation');
    for (let i = 0; i < ids.length; i++) requireThat(lines[i] === `${ids[i]} commit`, `Missing or noncommit snapshot object ${ids[i]}: ${lines[i]}`);
  }
  relationship(target, head) {
    const key = `${target}:${head}`;
    if (this.relations.has(key)) return this.relations.get(key);
    const mergeBases = this.run(['merge-base', '--all', target, head], { allowed: [0, 1] }).trim().split('\n').filter(Boolean).sort(compare);
    const counts = this.run(['rev-list', '--left-right', '--count', `${target}...${head}`, '--']).trim().split(/\s+/).map(Number);
    requireThat(counts.length === 2 && counts.every(Number.isSafeInteger), 'Invalid Git ancestry counts');
    const relation = { target_sha: target, head_sha: head, merge_bases: mergeBases,
      behind: counts[0], ahead: counts[1], head_is_ancestor: counts[1] === 0,
      target_is_ancestor: counts[0] === 0,
      history: mergeBases.length === 0 ? 'unrelated' : mergeBases.length > 1 ? 'multiple_merge_bases' : 'related' };
    this.relations.set(key, relation); return relation;
  }
  tree(id) {
    const entries = new Map();
    const rows = this.run(['ls-tree', '-r', '-t', '-z', '--full-tree', id]).split('\0').filter(Boolean);
    for (const row of rows) {
      const index = row.indexOf('\t');
      requireThat(index > 0, 'Malformed Git tree record');
      const [mode, type, object] = row.slice(0, index).split(' ');
      requireThat(/^[0-7]{6}$/.test(mode) && SHA.test(object) && ['blob', 'commit', 'tree'].includes(type), 'Malformed Git tree identity');
      entries.set(row.slice(index + 1), { mode, type, sha: object });
    }
    return entries;
  }
  delta(base, head) {
    const key = `${base}:${head}`;
    if (this.deltas.has(key)) return this.deltas.get(key);
    const relation = this.relationship(base, head);
    const mergeBase = relation.merge_bases.length === 1 ? relation.merge_bases[0] : null;
    if (mergeBase === null) {
      const delta = { comparison_base_sha: base, head_sha: head, merge_bases: relation.merge_bases,
        status: relation.merge_bases.length === 0 ? 'unrelated_history' : 'multiple_merge_bases',
        changes: [], non_documentation_paths: [] };
      this.deltas.set(key, delta); return delta;
    }
    const chunks = this.run(['diff', '--no-ext-diff', '--no-textconv', '--no-relative', '--ignore-submodules=none', '--raw', '-z', '--no-renames', '--full-index', '--abbrev=40', mergeBase, head, '--']).split('\0');
    requireThat(chunks.pop() === '', 'Unterminated Git diff');
    const changes = [];
    requireThat(chunks.length % 2 === 0, 'Incomplete Git diff records');
    for (let i = 0; i < chunks.length; i += 2) {
      const match = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([AMDT])$/.exec(chunks[i]);
      requireThat(match !== null, `Unsupported Git raw diff record ${chunks[i]}`);
      const [, beforeMode, afterMode, beforeSha, afterSha, status] = match;
      const entry = (mode, object) => mode === '000000' ? null : { mode, type: mode === '160000' ? 'commit' : 'blob', sha: object };
      changes.push({ path: chunks[i + 1], status, before: entry(beforeMode, beforeSha), after: entry(afterMode, afterSha) });
    }
    changes.sort((a, b) => compare(a.path, b.path));
    const delta = { comparison_base_sha: base, head_sha: head, merge_bases: [mergeBase],
      status: 'complete', changes, non_documentation_paths: changes.map(x => x.path).filter(x => !isDocumentationPath(x)) };
    this.deltas.set(key, delta); return delta;
  }
  claim(head, documents) {
    if (!this.claims.has(head)) {
      const row = this.run(['ls-tree', '-z', '--full-tree', head, '--', CLAIM_PATH]).split('\0')[0];
      if (!row) this.claims.set(head, null);
      else {
        const [header, path] = row.split('\t');
        const [mode, type, id] = header.split(' ');
        requireThat(path === CLAIM_PATH && type === 'blob' && ['100644', '100755'].includes(mode) && SHA.test(id), 'Ownership document is not a regular text blob');
        this.claims.set(head, id);
        if (!documents[id]) documents[id] = { path: CLAIM_PATH, blob_sha: id,
          text: this.run(['cat-file', 'blob', id]), interpretation: 'uninterpreted' };
      }
    }
    return { path: CLAIM_PATH, source_sha: head, blob_sha: this.claims.get(head), interpretation: 'uninterpreted' };
  }
}

export function isDocumentationPath(path) {
  // Deliberately conservative: JSON, scripts, assets, MDX and configs under docs still count.
  return /^docs\/.*\.(md|rst|adoc|txt)$/i.test(path)
    || /^(README(?:\.(md|rst|txt))?|LICENSE(?:\.txt)?|NOTICE(?:\.txt)?)$/i.test(path);
}
function sameEntry(a, b) { return a === null ? b === null : b !== null && a.mode === b.mode && a.type === b.type && a.sha === b.sha; }
function comparePostimages(delta, tree) {
  if (delta.status !== 'complete') return { status: 'not_comparable', matching_paths: [], differences: [] };
  const matching = []; const differences = [];
  for (const change of delta.changes) {
    const actual = tree.get(change.path) ?? null;
    if (sameEntry(change.after, actual)) matching.push(change.path);
    else differences.push({ path: change.path, target_entry: actual });
  }
  return { status: delta.changes.length === 0 ? 'no_delta' : differences.length === 0 ? 'all_match' : matching.length === 0 ? 'no_match' : 'partial_match',
    matching_paths: matching, differences };
}
function refObservation(branches, name, expected) {
  const observed = branches.get(name) ?? null;
  return { ref: name, expected_sha: expected, observed_sha: observed,
    status: observed === null ? 'not_in_branch_snapshot' : observed === expected ? 'matches' : 'sha_mismatch' };
}

export function reconcileSnapshot({ repo, snapshot, snapshotSha256 }) {
  validateSnapshot(snapshot);
  requireThat(/^[0-9a-f]{64}$/.test(snapshotSha256), 'Missing exact snapshot SHA256');
  const git = new Git(repo); git.validateObjects(snapshot);
  const targets = { main: snapshot.main_sha, integration: snapshot.integration_sha };
  const trees = Object.fromEntries(Object.entries(targets).map(([name, id]) => [name, git.tree(id)]));
  const branchMap = new Map(snapshot.branches.map(x => [x.name, x.sha]));
  const documents = {}; const overlaps = new Map();
  const relations = head => Object.fromEntries(Object.entries(targets).map(([name, id]) => [name, git.relationship(id, head)]));
  const postimages = delta => Object.fromEntries(Object.entries(trees).map(([name, tree]) => [name, comparePostimages(delta, tree)]));
  const branches = [...snapshot.branches].sort((a, b) => compare(a.name, b.name)).map(branch => {
    const delta = git.delta(snapshot.main_sha, branch.sha);
    return { ...branch, open_prs: snapshot.pull_requests.filter(p => p.head_ref === branch.name).map(p => p.number).sort((a, b) => a - b),
      relationships: relations(branch.sha), delta, postimages: postimages(delta), ownership: git.claim(branch.sha, documents) };
  });
  const prs = [...snapshot.pull_requests].sort((a, b) => a.number - b.number).map(pr => {
    const delta = git.delta(pr.base_sha, pr.head_sha);
    for (const path of delta.non_documentation_paths) {
      if (!overlaps.has(path)) overlaps.set(path, []);
      overlaps.get(path).push(pr.number);
    }
    return { number: pr.number, title: pr.title, url: pr.url, state: pr.state, draft: pr.draft,
      base_ref: pr.base_ref, base_sha: pr.base_sha, head_ref: pr.head_ref, head_sha: pr.head_sha,
      snapshot_refs: { base: refObservation(branchMap, pr.base_ref, pr.base_sha), head: refObservation(branchMap, pr.head_ref, pr.head_sha) },
      dependencies: snapshot.pull_requests.filter(parent => parent.number !== pr.number && parent.head_ref === pr.base_ref)
        .sort((a, b) => a.number - b.number).map(parent => ({ pr: parent.number, head_sha: parent.head_sha,
          base_sha_matches_head: parent.head_sha === pr.base_sha, evidence: 'snapshot_branch_name_match' })),
      relationships: relations(pr.head_sha), delta, postimages: postimages(delta), ownership: git.claim(pr.head_sha, documents) };
  });
  const counts = { branches: branches.length, open_prs: prs.length, ownership_documents: Object.keys(documents).length,
    branches_unrelated_to_main: branches.filter(b => b.relationships.main.history === 'unrelated').length,
    branch_heads_in_main_history: branches.filter(b => b.relationships.main.head_is_ancestor).length,
    branch_heads_in_integration_history: branches.filter(b => b.relationships.integration.head_is_ancestor).length,
    pr_head_ref_mismatches: prs.filter(p => p.snapshot_refs.head.status !== 'matches').length,
    pr_base_ref_mismatches: prs.filter(p => p.snapshot_refs.base.status !== 'matches').length };
  return { schema_version: 1, repository: snapshot.repository,
    snapshot: { sha256: snapshotSha256, observation_completed_utc: snapshot.observation_completed_utc,
      observation_notes: snapshot.observation_notes ?? [], sources: snapshot.sources ?? [] },
    targets: { main: { sha: snapshot.main_sha, tree_sha: git.run(['rev-parse', `${snapshot.main_sha}^{tree}`]).trim() },
      integration: { pr: snapshot.integration_pr, sha: snapshot.integration_sha, tree_sha: git.run(['rev-parse', `${snapshot.integration_sha}^{tree}`]).trim() } },
    qualification: { status: 'not_assessed', note: 'No tests, CI, review, semantic equivalence, readiness or ownership release is inferred by this inventory.' },
    interpretation: {
      branch_delta: 'Changes from the unique merge base of pinned main and the branch head to that head. No delta is inferred for unrelated or multiple-merge-base histories.',
      pr_delta: 'Changes from the unique merge base of the pinned PR base and head to that head; no mutable ref is used.',
      postimages: 'Every changed path must have the same final blob, mode and type, including absence for deletions. Matching postimages do not establish patch provenance or semantic completeness.',
      history: 'Ancestry proves historical inclusion, not preservation of behavior after later changes or reversions.',
      ownership: 'Full raw claim documents are indexed by blob SHA and source commit. Their text and status remain uninterpreted; changed paths and overlaps do not establish ownership.',
      documentation: 'Only narrative .md/.rst/.adoc/.txt under docs and root README/LICENSE/NOTICE are excluded from the non-documentation overlap list. Code, JSON, MDX and assets under docs remain included.',
      snapshots: 'An inventory can span different endpoint times. Base/head SHA mismatches remain visible; this tool does not substitute later branch tips.',
    },
    counts, lock_observation: snapshot.lock ?? null, branches, pull_requests: prs,
    overlaps: [...overlaps].filter(([, numbers]) => numbers.length > 1).sort(([a], [b]) => compare(a, b))
      .map(([path, numbers]) => ({ path, pull_requests: numbers, evidence: 'changed_path_overlap_only' })),
    claim_documents: Object.fromEntries(Object.entries(documents).sort(([a], [b]) => compare(a, b))),
  };
}

function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    requireThat(['--repo', '--snapshot', '--output'].includes(args[i]) && args[i + 1] && !options[args[i]], 'Usage: --repo PATH --snapshot PATH --output PATH');
    options[args[i]] = args[i + 1];
  }
  for (const name of ['--repo', '--snapshot', '--output']) requireThat(options[name], `Missing ${name}`);
  const input = resolve(options['--snapshot']); const output = resolve(options['--output']);
  requireThat(input !== output, 'Output must not replace the input snapshot');
  const bytes = readFileSync(input);
  const report = reconcileSnapshot({ repo: options['--repo'], snapshot: JSON.parse(decoder.decode(bytes)), snapshotSha256: hash(bytes) });
  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  const digest = createHash('sha256');
  let fd;
  try {
    fd = openSync(temporary, 'wx');
    const write = chunk => { writeFileSync(fd, chunk); digest.update(chunk); };
    // Serialize top-level arrays one row at a time. A complete corpus can be large;
    // constructing a second full JSON string needlessly doubles peak memory.
    write('{\n');
    const entries = Object.entries(report);
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      write(`${JSON.stringify(key)}:`);
      if (Array.isArray(value)) {
        write('[\n');
        for (let j = 0; j < value.length; j++) write(`${JSON.stringify(value[j])}${j + 1 === value.length ? '' : ','}\n`);
        write(']');
      } else if (key === 'claim_documents') {
        write('{\n');
        const claims = Object.entries(value);
        for (let j = 0; j < claims.length; j++) write(`${JSON.stringify(claims[j][0])}:${JSON.stringify(claims[j][1])}${j + 1 === claims.length ? '' : ','}\n`);
        write('}');
      } else write(JSON.stringify(value));
      write(i + 1 === entries.length ? '\n' : ',\n');
    }
    write('}\n');
    closeSync(fd); fd = undefined;
    renameSync(temporary, output);
  }
  finally { if (fd !== undefined) closeSync(fd); if (existsSync(temporary)) rmSync(temporary); }
  process.stdout.write(`${JSON.stringify({ output, sha256: digest.digest('hex'), counts: report.counts })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
