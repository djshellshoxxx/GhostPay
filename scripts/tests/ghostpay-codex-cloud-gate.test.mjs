// Finding R14-1: the codex-cloud `integrate` merge gate must require the check-run names real CI emits, and must count
// only check runs created by GitHub Actions itself. ci.yml's `e2e` job is a matrix job without `name:`, so GitHub
// names its check runs 'e2e (full)' and 'e2e (lean)', never 'e2e'; a gate on 'e2e' could only be met by a check run
// that some other workflow or app chose to call 'e2e'. Names are derived from ci.yml here, so renaming a CI job or
// adding a matrix value fails this test. No dependencies: the workflows are read as text, like the sibling
// ghostpay-automation-hardening.test.mjs. Needs bash and jq (both on ubuntu runners).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const cloud = read('.github/workflows/ghostpay-codex-cloud.yml');
const ci = read('.github/workflows/ci.yml');

const indentOf = (line) => line.search(/\S/);

/** Top-level jobs of a workflow as { id: text } (job keys at two spaces under `jobs:`). */
function jobsOf(workflow) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((l) => l === 'jobs:');
  assert.ok(start >= 0, 'no jobs: block');
  const jobs = {};
  let id = null;
  for (const line of lines.slice(start + 1)) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) { id = m[1]; jobs[id] = ''; continue; }
    if (/^\S/.test(line)) break;
    if (id) jobs[id] += `${line}\n`;
  }
  return jobs;
}

const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');

/**
 * Check-run names GitHub emits for one ci.yml job: its `name:` or its id; a job without `name:` whose matrix has a
 * single dimension written as a flow list (`key: [a, b]`) emits '<id> (<value>)' per value. Any other matrix shape
 * yields no names, so a gate that relies on it fails closed here instead of being guessed.
 */
function emittedCheckNames(id, body) {
  const name = /^ {4}name:\s*(.+)$/m.exec(body);
  if (name) return [unquote(name[1])];
  const lines = body.split('\n');
  const at = lines.findIndex((l) => /^ {6}matrix:\s*$/.test(l));
  if (at < 0) return [id];
  const dims = [];
  for (let i = at + 1; i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > 6); i++) {
    if (indentOf(lines[i]) === 8) dims.push(lines[i]);
  }
  const flow = dims.length === 1 && /^ {8}([A-Za-z0-9_-]+):\s*\[([^\]]*)\]\s*$/.exec(dims[0]);
  if (!flow || flow[1] === 'include' || flow[1] === 'exclude') return [];
  return flow[2].split(',').map(unquote).filter(Boolean).map((v) => `${id} (${v})`);
}

const ciJobs = jobsOf(ci);
const emittedByJob = Object.fromEntries(Object.entries(ciJobs).map(([id, body]) => [id, emittedCheckNames(id, body)]));
const emitted = new Set(Object.values(emittedByJob).flat());

/** The dedented `run: |` script of the step whose `id:` is `id`. */
function stepScript(workflow, id) {
  const lines = workflow.split('\n');
  const at = lines.findIndex((l) => l.trim().replace(/^- /, '') === `id: ${id}`);
  assert.ok(at >= 0, `step id ${id} not found`);
  const keyIndent = lines[at].indexOf('id:');
  let i = at + 1;
  for (; i < lines.length; i++) if (indentOf(lines[i]) === keyIndent && /^\s*run: \|\s*$/.test(lines[i])) break;
  assert.ok(i < lines.length, `step ${id} has no run: | block`);
  const body = [];
  for (i++; i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > keyIndent); i++) body.push(lines[i]);
  const indent = Math.min(...body.filter((l) => l.trim() !== '').map(indentOf));
  return `${body.map((l) => l.slice(indent)).join('\n')}\n`;
}

const integrate = stepScript(cloud, 'integrate');
const gateLine = /^\s*for name in ([^;]+); do$/m.exec(integrate);
assert.ok(gateLine, 'integrate has no `for name in ...; do` gate list');
const gates = [...gateLine[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

// The ci.yml jobs whose results gate an automated merge. Every check run each of them emits must be required.
const GATE_JOBS = ['typescript', 'contracts', 'e2e', 'secrets-and-egress'];

test('the ci.yml job parser sees the jobs the gate depends on', () => {
  for (const id of GATE_JOBS) {
    assert.ok(id in ciJobs, `ci.yml has no job ${id}`);
    assert.ok(emittedByJob[id].length > 0, `cannot derive the check-run names of ci.yml job ${id}`);
  }
});

test('every integrate gate name is a check-run name that ci.yml actually emits', () => {
  const never = gates.filter((n) => !emitted.has(n));
  assert.deepEqual(never, [], `gate names ci.yml never emits: ${never.join(', ')}`);
});

test('integrate requires every check run that the gating ci.yml jobs emit (each matrix leg)', () => {
  const required = GATE_JOBS.flatMap((id) => emittedByJob[id]);
  const absent = required.filter((n) => !gates.includes(n));
  assert.deepEqual(absent, [], `check runs not required by integrate: ${absent.join(', ')}`);
});

test('integrate counts only check runs created by the github-actions app', () => {
  assert.match(integrate, /select\(\.name == \$name and \.app\.slug == "github-actions"\)/);
});

test('integrate excludes cross-repository heads', () => {
  assert.match(integrate, /select\(\.head\.repo\.full_name != null and \.head\.repo\.full_name == \.base\.repo\.full_name\)/);
});

// ----- the shipped integrate script, run against a stub gh --------------------------------------------------------

const GH_STUB = `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = pr ] && [ "$2" = merge ]; then shift 2; echo "$*" >> "$STUB_DIR/merges"; exit 0; fi
[ "$1" = api ] || exit 64
shift
path=""; filter=""
while [ "$#" -gt 0 ]; do
  case "$1" in --paginate) ;; --jq) filter="$2"; shift ;; -*) exit 64 ;; *) path="$1" ;; esac
  shift
done
case "$path" in
  repos/*/pulls\\?*) page="$STUB_DIR/pulls.json" ;;
  repos/*/commits/*/check-runs*) sha="\${path#*/commits/}"; page="$STUB_DIR/checks-\${sha%%/*}.json" ;;
  repos/*/pulls/*/files*) page="$STUB_DIR/files.json" ;;
  repos/*/pulls/*/reviews*) n="\${path#*/pulls/}"; page="$STUB_DIR/reviews-\${n%%/*}.json" ;;
  repos/*/collaborators/*/permission*) page="$STUB_DIR/permission.json" ;;
  *) exit 64 ;;
esac
if [ -n "$filter" ]; then jq -r "$filter" "$page"; else cat "$page"; fi
`;

const REPO = 'djshellshoxxx/GhostPay';

function pr(number, headRepo = REPO) {
  const sha = `${String(number).padStart(2, '0')}${'c'.repeat(38)}`;
  return {
    number, draft: false, user: { login: 'github-actions[bot]' },
    head: { ref: `codex/ghostpay-cloud-${number}`, sha, repo: { full_name: headRepo } },
    base: { ref: 'main', repo: { full_name: REPO } },
  };
}

const runsFor = (names, slug = 'github-actions') => names.map((name) => ({ name, conclusion: 'success', app: { slug } }));

function runIntegrate(prs, checks) {
  const dir = mkdtempSync(join(tmpdir(), 'r14-integrate-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), GH_STUB);
    chmodSync(join(bin, 'gh'), 0o755);
    writeFileSync(join(dir, 'pulls.json'), JSON.stringify(prs));
    writeFileSync(join(dir, 'files.json'), JSON.stringify([{ filename: 'apps/web/src/lib/invoice.ts' }]));
    writeFileSync(join(dir, 'permission.json'), JSON.stringify({ permission: 'write' }));
    writeFileSync(join(dir, 'merges'), '');
    for (const p of prs) {
      writeFileSync(join(dir, `checks-${p.head.sha}.json`), JSON.stringify({ check_runs: checks[p.number] }));
      writeFileSync(join(dir, `reviews-${p.number}.json`), JSON.stringify([{
        user: { login: 'safe-reviewer' }, state: 'APPROVED', commit_id: p.head.sha,
        author_association: 'COLLABORATOR', submitted_at: '2026-11-10T10:00:00Z',
      }]));
    }
    const result = spawnSync('bash', ['-c', integrate], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_DIR: dir, GH_TOKEN: 'stub', GH_REPO: REPO, REPO_OWNER: 'djshellshoxxx' },
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return { merges: readFileSync(join(dir, 'merges'), 'utf8').split('\n').filter(Boolean), out: result.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const REAL = GATE_JOBS.flatMap((id) => emittedByJob[id]);

test('integrate merges a same-repo PR whose real CI check runs (by github-actions) are all green', () => {
  const p = pr(1);
  const { merges } = runIntegrate([p], { 1: runsFor(REAL) });
  assert.deepEqual(merges, [`1 --match-head-commit ${p.head.sha} --squash --delete-branch`]);
});

test('integrate ignores same-named check runs from any other app, and runs without an app', () => {
  const { merges, out } = runIntegrate([pr(2), pr(3), pr(4)], {
    2: runsFor(REAL, 'some-other-app'),
    3: REAL.map((name) => ({ name, conclusion: 'success' })),
    // Every genuine run is green except one leg; a forged green copy of that leg from another app must not count.
    4: [...runsFor(REAL.filter((n) => n !== 'e2e (lean)')), ...runsFor(['e2e (lean)'], 'forger')],
  });
  assert.deepEqual(merges, []);
  assert.match(out, /PR #4 awaiting e2e \(lean\) \(missing\)/);
});

test('integrate does not merge a cross-repository head even with all real checks green', () => {
  const { merges } = runIntegrate([pr(5, 'mallory/GhostPay')], { 5: runsFor(REAL) });
  assert.deepEqual(merges, []);
});

test('a check run named plain e2e (what no ci.yml job emits) does not satisfy the gate', () => {
  const names = REAL.filter((n) => !n.startsWith('e2e (')).concat('e2e');
  const { merges } = runIntegrate([pr(6)], { 6: runsFor(names) });
  assert.deepEqual(merges, []);
});
