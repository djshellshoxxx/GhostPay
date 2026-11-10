// Hardening invariants for the API-funded agent workflows (lane W8; findings in docs/handoffs/consolidation-2026-11-04
// lanes/C6.md). The step scripts are extracted from the workflow files and run against a stub `gh` and throwaway git
// repositories, so a regression in the shipped shell fails here, not in a paid run. No network and no npm install:
// the parallel-review `validate` job runs this file on a bare checkout. Needs bash, git and jq (all on ubuntu runners).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const CLOUD = '.github/workflows/ghostpay-codex-cloud.yml';
const REVIEW = '.github/workflows/ghostpay-parallel-review.yml';
const LIBS = '.github/actions/setup-node-libs/action.yml';
const cloud = read(CLOUD);
const review = read(REVIEW);
const libs = read(LIBS);
const workflows = readdirSync(join(root, '.github/workflows'))
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ file: f, text: read(`.github/workflows/${f}`) }));

const indentOf = (line) => line.search(/\S/);

/** The dedented `run: |` script of the step whose `id:` is `id`. */
function stepScript(workflow, id) {
  const lines = workflow.split('\n');
  const at = lines.findIndex((l) => /^\s*(- )?id: /.test(l) && l.trim().replace(/^- /, '') === `id: ${id}`);
  assert.ok(at >= 0, `step id ${id} not found`);
  const keyIndent = lines[at].indexOf('id:');
  let i = at + 1;
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    assert.ok(indentOf(lines[i]) >= keyIndent, `step ${id} has no run: | block`);
    if (indentOf(lines[i]) === keyIndent && /^\s*run: \|\s*$/.test(lines[i])) break;
  }
  assert.ok(i < lines.length, `step ${id} has no run: | block`);
  const body = [];
  for (i++; i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > keyIndent); i++) body.push(lines[i]);
  const indent = Math.min(...body.filter((l) => l.trim() !== '').map(indentOf));
  return `${body.map((l) => l.slice(indent)).join('\n')}\n`;
}

/** Top-level jobs of a workflow as { name: text }. */
function jobsOf(workflow) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((l) => l === 'jobs:');
  assert.ok(start >= 0, 'no jobs: block');
  const jobs = {};
  let name = null;
  for (const line of lines.slice(start + 1)) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) { name = m[1]; jobs[name] = ''; continue; }
    if (/^\S/.test(line)) break;
    if (name) jobs[name] += `${line}\n`;
  }
  return jobs;
}

const POLICY_RE = /^# BEGIN agent path policy[^\n]*\n[\s\S]*?^# END agent path policy$/m;
const policyOf = (script) => {
  const m = POLICY_RE.exec(script);
  assert.ok(m, 'agent path policy block missing');
  return m[0];
};

function bash(script, { cwd, env = {}, args = [] } = {}) {
  return spawnSync('bash', ['-c', script, 'bash', ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, ...env },
  });
}

test('tools the step tests need are present', () => {
  for (const tool of ['bash', 'git', 'jq']) {
    assert.equal(spawnSync(tool, ['--version']).status, 0, `${tool} must be installed`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// C6-M1 CRITICAL/HIGH: integrate auto-merges fork or foreign PRs, merges an unchecked head, and claims protection.
// ---------------------------------------------------------------------------------------------------------------

const GH_STUB = `#!/usr/bin/env bash
# Stub gh: api pulls list / check-runs / pull files from $STUB_DIR fixtures (--jq applied per page with system jq);
# "pr merge" is recorded in $STUB_DIR/merges. Anything else fails.
set -euo pipefail
echo "$*" >> "$STUB_DIR/calls"
if [ "$1" = pr ] && [ "$2" = merge ]; then shift 2; echo "$*" >> "$STUB_DIR/merges"; exit 0; fi
[ "$1" = api ] || { echo "stub gh: unsupported $1" >&2; exit 64; }
shift
path=""; filter=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --paginate) ;;
    --jq|-q) filter="$2"; shift ;;
    -*) echo "stub gh: unsupported flag $1" >&2; exit 64 ;;
    *) path="$1" ;;
  esac
  shift
done
case "$path" in
  repos/*/pulls\\?*) page="$STUB_DIR/pulls.json" ;;
  repos/*/commits/*/check-runs*) sha="\${path#*/commits/}"; page="$STUB_DIR/checks-\${sha%%/*}.json" ;;
  repos/*/pulls/*/files*) n="\${path#*/pulls/}"; page="$STUB_DIR/files-\${n%%/*}.json" ;;
  repos/*/pulls/*/reviews*) n="\${path#*/pulls/}"; page="$STUB_DIR/reviews-\${n%%/*}.json" ;;
  repos/*/collaborators/*/permission*) reviewer="\${path#*/collaborators/}"; page="$STUB_DIR/permission-\${reviewer%%/*}.json" ;;
  *) echo "stub gh: unexpected path $path" >&2; exit 64 ;;
esac
if [ -n "$filter" ]; then jq -r "$filter" "$page"; else cat "$page"; fi
`;

const REPO = 'djshellshoxxx/GhostPay';
const GATES = ['typescript', 'contracts', 'e2e', 'secrets-and-egress'];

function pr(number, { ref = `codex/ghostpay-cloud-${number}`, draft = false, login = 'github-actions[bot]',
  headRepo = REPO } = {}) {
  return {
    number, draft, user: { login },
    head: { ref, sha: `${String(number).padStart(2, '0')}${'a'.repeat(38)}`, repo: headRepo && { full_name: headRepo } },
    base: { ref: 'main', repo: { full_name: REPO } },
  };
}

function approvedReview(p, {
  login = 'safe-reviewer', state = 'APPROVED', commit_id = p.head.sha,
  author_association = 'COLLABORATOR', submitted_at = '2026-11-09T10:00:00Z',
} = {}) {
  return { user: { login }, state, commit_id, author_association, submitted_at };
}

function runIntegrate(prs, { checks = {}, files = {}, reviews = {}, permissions = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'w8-integrate-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), GH_STUB);
    chmodSync(join(bin, 'gh'), 0o755);
    writeFileSync(join(dir, 'pulls.json'), JSON.stringify(prs));
    for (const p of prs) {
      const runs = checks[p.number] ?? GATES.map((name) => ({ name, conclusion: 'success' }));
      writeFileSync(join(dir, `checks-${p.head.sha}.json`), JSON.stringify({ check_runs: runs }));
      const changed = files[p.number] ?? ['apps/web/src/lib/invoice.ts'];
      writeFileSync(join(dir, `files-${p.number}.json`), JSON.stringify(changed.map((filename) => ({ filename }))));
      writeFileSync(join(dir, `reviews-${p.number}.json`),
        JSON.stringify(reviews[p.number] ?? [approvedReview(p)]));
    }
    for (const [login, permission] of Object.entries({ 'safe-reviewer': 'write', ...permissions })) {
      writeFileSync(join(dir, `permission-${login}.json`), JSON.stringify({ permission }));
    }
    writeFileSync(join(dir, 'merges'), '');
    const result = bash(stepScript(cloud, 'integrate'), {
      cwd: dir,
      env: {
        PATH: `${bin}:${process.env.PATH}`, STUB_DIR: dir, GH_TOKEN: 'stub', GH_REPO: REPO,
        GITHUB_REPOSITORY: REPO, REPO_OWNER: 'djshellshoxxx',
      },
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const merges = readFileSync(join(dir, 'merges'), 'utf8').split('\n').filter(Boolean);
    return { merges, out: result.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('integrate merges a same-repo bot PR only, pinned to the checked head commit', () => {
  const ok = pr(1);
  const { merges } = runIntegrate([ok]);
  assert.deepEqual(merges, [`1 --match-head-commit ${ok.head.sha} --squash --delete-branch`]);
});

test('integrate also accepts the repository owner (GHOSTPAY_GITHUB_TOKEN PAT identity)', () => {
  const { merges } = runIntegrate([pr(2, { login: 'djshellshoxxx' })]);
  assert.equal(merges.length, 1);
  assert.match(merges[0], /^2 --match-head-commit /);
});

test('integrate refuses unreviewed CI-green bot PRs (no human approval)', () => {
  const p = pr(21);
  const { merges, out } = runIntegrate([p], { reviews: { 21: [] } });
  assert.deepEqual(merges, []);
  assert.match(out, /independent.*approval/i);
});

test('integrate refuses stale, self, bot and revoked approvals', () => {
  const p = pr(22);
  const owner = pr(23, { login: 'djshellshoxxx' });
  const stale = approvedReview(p, { commit_id: 'b'.repeat(40) });
  const bot = approvedReview(p, { login: 'some-bot[bot]' });
  const revoked = [approvedReview(p), approvedReview(p, { state: 'CHANGES_REQUESTED', submitted_at: '2026-11-09T11:00:00Z' })];
  const result = runIntegrate([p, owner, pr(24), pr(25)], {
    reviews: {
      22: [stale, bot],
      23: [approvedReview(owner, { login: 'djshellshoxxx', author_association: 'OWNER' })],
      24: revoked.map((x) => ({ ...x, commit_id: pr(24).head.sha })),
      25: [approvedReview(pr(25), { login: 'outsider', author_association: 'NONE' })],
    },
    permissions: { 'some-bot[bot]': 'write', djshellshoxxx: 'admin', outsider: 'write' },
  });
  assert.deepEqual(result.merges, []);
});

test('integrate requires a reviewer with repository write permission', () => {
  const p = pr(26);
  const { merges } = runIntegrate([p], {
    reviews: { 26: [approvedReview(p, { login: 'reader' })] },
    permissions: { reader: 'read' },
  });
  assert.deepEqual(merges, []);
});

test('integrate accepts independent latest exact-head human approval with write access', () => {
  const p = pr(27);
  const { merges } = runIntegrate([p], {
    reviews: { 27: [approvedReview(p, { login: 'reviewer', author_association: 'COLLABORATOR' })] },
    permissions: { reviewer: 'write' },
  });
  assert.deepEqual(merges, [`27 --match-head-commit ${p.head.sha} --squash --delete-branch`]);
});

test('integrate ignores fork, deleted-fork, foreign-author, draft and off-prefix PRs', () => {
  const { merges } = runIntegrate([
    pr(3, { headRepo: 'mallory/GhostPay', login: 'djshellshoxxx' }),
    pr(4, { headRepo: null }),
    pr(5, { login: 'mallory' }),
    pr(6, { login: 'github-actions' }),
    pr(7, { draft: true }),
    pr(8, { ref: 'codex/ghostpay-research-x-1' }),
  ]);
  assert.deepEqual(merges, []);
});

test('integrate requires every required check, and every run of it, to be green', () => {
  const { merges } = runIntegrate([pr(9), pr(10), pr(11)], {
    checks: {
      9: GATES.filter((n) => n !== 'contracts').map((name) => ({ name, conclusion: 'success' })),
      // A failing run listed before a green one of the same name (e.g. a second workflow's e2e job).
      10: [{ name: 'e2e', conclusion: 'failure' }, ...GATES.map((name) => ({ name, conclusion: 'success' }))],
      11: GATES.map((name) => ({ name, conclusion: name === 'e2e' ? null : 'success' })),
    },
  });
  assert.deepEqual(merges, []);
});

test('integrate refuses a PR that touches gate scripts or workflow files even when CI is green', () => {
  const { merges, out } = runIntegrate([pr(12), pr(13), pr(14), pr(15)], {
    files: {
      12: ['apps/web/src/a.ts', 'scripts/scan-secrets.sh'],
      13: ['.github/workflows/ci.yml'],
      14: ['scripts/tests/ghostpay-automation-hardening.test.mjs'],
      15: ['packages/contracts/scripts/check-natspec.sh'],
    },
  });
  assert.deepEqual(merges, []);
  assert.match(out, /disallowed path scripts\/scan-secrets\.sh/);
});

test('no workflow claims branch protection that main does not have, and every merge pins its head', () => {
  for (const { file, text } of workflows) {
    assert.doesNotMatch(text, /GitHub still enforces additional reviews and branch protection/, file);
    for (const line of text.split('\n').filter((l) => /\bgh pr merge\b/.test(l) && !/^\s*#/.test(l))) {
      assert.match(line, /--match-head-commit "\$head"/, `${file}: ${line.trim()}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// C6-M1 HIGH: the agent may edit the gates that judge its own PR.
// ---------------------------------------------------------------------------------------------------------------

const POLICY_STEPS = ['integrate', 'scope', 'apply'];

test('the agent path policy is the same in integrate, develop scope check and publish', () => {
  const [first, ...rest] = POLICY_STEPS.map((id) => policyOf(stepScript(cloud, id)));
  for (const other of rest) assert.equal(other, first);
});

const REJECT = [
  '.github/workflows/ci.yml', '.github/actions/setup-node-libs/action.yml', 'apps/web/.github/x.yml',
  'scripts/scan-secrets.sh', 'scripts/check-actions-pinned.sh', 'scripts/lib-common.sh', 'scripts/build-workspaces.mjs',
  'scripts/verify-release.sh', 'scripts/tests/ghostpay-automation-hardening.test.mjs',
  'scripts/tests/ghostpay-parallel-review-workflow.test.mjs',
  'packages/contracts/scripts/check-natspec.sh', 'packages/pool-contracts/scripts/check-static.sh',
  'packages/pool-circuits/scripts/check-verifiers.sh', 'packages/contracts/scripts/pre-deploy-check.sh',
  'packages/payer-hiding-contracts/scripts/fetch-entrypoint.sh',
  'apps/web/scripts/scan-bundle.mjs', 'apps/web/scripts/csp.mjs', 'apps/web/scripts/embed-sri.mjs',
  'apps/web/tsconfig.json', 'packages/sdk/tsconfig.build.json', 'apps/web/eslint.config.js', 'apps/web/vitest.config.ts',
  'apps/web/playwright.config.ts', 'packages/contracts/slither.config.json', 'packages/sdk/.gitignore',
  'packages/sdk/dist/index.js', 'packages/sdk/package.json', 'package.json', 'package-lock.json', 'AGENTS.md',
  'eslint.config.js', 'packages/contracts/foundry.toml', 'apps/web/.env.local', 'README.md',
];
const ALLOW = [
  'apps/web/src/lib/invoice.ts', 'apps/relayer/test/relay.test.ts', 'packages/sdk/src/index.ts',
  'packages/contracts/src/Vault.sol', 'docs/handoffs/RESTART.md', 'test-vectors/evm/receipt.json',
  'scripts/testnet/make-manifest.mjs', 'scripts/regtest/esplora-shim.test.mjs', 'packages/sdk/scripts/emit-schema.mjs',
];

test('the agent path policy rejects gates, workflow files and high-risk paths and keeps product paths', () => {
  const policy = policyOf(stepScript(cloud, 'scope'));
  const probe = `${policy}\nfor p in "$@"; do if agent_path_allowed "$p"; then echo "allow $p"; else echo "reject $p"; fi; done`;
  const result = bash(probe, { args: [...REJECT, ...ALLOW] });
  assert.equal(result.status, 0, result.stderr);
  const verdicts = Object.fromEntries(result.stdout.trim().split('\n').map((l) => l.split(' ').reverse()));
  for (const p of REJECT) assert.equal(verdicts[p], 'reject', p);
  for (const p of ALLOW) assert.equal(verdicts[p], 'allow', p);
});

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function repoFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'w8-repo-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'w8@example.invalid');
  git(dir, 'config', 'user.name', 'w8');
  git(dir, 'config', 'commit.gpgsign', 'false');
  for (const [p, body] of [['scripts/scan-secrets.sh', 'echo scan\n'], ['apps/web/src/a.ts', 'export {};\n'],
    ['.github/workflows/ci.yml', 'name: ci\n']]) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), body);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return { dir, base: git(dir, 'rev-parse', 'HEAD') };
}

function runScope(mutate) {
  const { dir, base } = repoFixture();
  try {
    mutate(dir);
    return bash(stepScript(cloud, 'scope'), { cwd: dir, env: { BASE_SHA: base } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('develop scope check accepts product changes and the report file', () => {
  const r = runScope((dir) => {
    writeFileSync(join(dir, 'apps/web/src/a.ts'), 'export const a = 1;\n');
    writeFileSync(join(dir, 'ghostpay-codex-report.txt'), 'report\n');
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('develop scope check sees staged, unstaged, untracked and committed gate edits', () => {
  const cases = {
    unstaged: (dir) => writeFileSync(join(dir, 'scripts/scan-secrets.sh'), 'exit 0\n'),
    staged: (dir) => { writeFileSync(join(dir, 'scripts/scan-secrets.sh'), 'exit 0\n'); git(dir, 'add', '-A'); },
    stagedThenReverted: (dir) => {
      writeFileSync(join(dir, '.github/workflows/ci.yml'), 'name: pwned\n');
      git(dir, 'add', '-A');
      writeFileSync(join(dir, '.github/workflows/ci.yml'), 'name: ci\n');
    },
    untracked: (dir) => writeFileSync(join(dir, 'scripts/new-gate.sh'), 'exit 0\n'),
    committed: (dir) => {
      writeFileSync(join(dir, 'apps/web/src/a.ts'), 'export const a = 2;\n');
      git(dir, 'commit', '-qam', 'agent commit');
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const r = runScope(mutate);
    assert.notEqual(r.status, 0, `${name} must fail the scope check: ${r.stdout}`);
  }
});

function runApply(mutate) {
  const { dir } = repoFixture();
  try {
    mutate(dir);
    git(dir, 'add', '-A');
    const patch = spawnSync('git', ['diff', '--cached', '--binary'], { cwd: dir, encoding: 'utf8' }).stdout;
    git(dir, 'reset', '-q', '--hard');
    git(dir, 'clean', '-qfd');
    mkdirSync(join(dir, 'ghostpay-staging'));
    writeFileSync(join(dir, 'ghostpay-staging/ghostpay-code.patch'), patch);
    const r = bash(stepScript(cloud, 'apply'), { cwd: dir });
    const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout;
    return { ...r, staged, worktree: status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('publish re-checks the downloaded patch from trusted main before opening a PR', () => {
  const good = runApply((dir) => writeFileSync(join(dir, 'apps/web/src/a.ts'), 'export const a = 3;\n'));
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.equal(good.staged, '', 'index is left as before (create-pull-request stages add-paths itself)');
  assert.match(good.worktree, /apps\/web\/src\/a\.ts/);

  const gate = runApply((dir) => writeFileSync(join(dir, 'scripts/scan-secrets.sh'), 'exit 0\n'));
  assert.notEqual(gate.status, 0, 'a patch editing scripts/scan-secrets.sh must fail publish');
  assert.match(gate.stdout, /scripts\/scan-secrets\.sh/);

  const renamed = runApply((dir) => {
    mkdirSync(join(dir, 'scripts/devnet'));
    git(dir, 'mv','scripts/scan-secrets.sh', 'scripts/devnet/scan-secrets.sh');
  });
  assert.notEqual(renamed.status, 0, 'a rename out of a gate path must fail publish');

  const link = runApply((dir) => {
    const r = spawnSync('ln', ['-s', '../../../.github/workflows/ci.yml', join(dir, 'apps/web/src/ci.yml')]);
    assert.equal(r.status, 0);
  });
  assert.notEqual(link.status, 0, 'a symlink in the patch must fail publish');
});

// ---------------------------------------------------------------------------------------------------------------
// C6-M1 HIGH / C6-52 HIGH: a job that ran an agent saves packages/*/dist (or the npm cache) for later trusted runs.
// ---------------------------------------------------------------------------------------------------------------

test('jobs that run an agent never save a shared cache', () => {
  let agentJobs = 0;
  for (const { file, text } of workflows) {
    // The existing openai-agents.yml is a non-executable step fragment with no jobs: section.
    // Do not mistake it for a running agent job; reject any NEW invalid workflow here.
    if (!/^jobs:\s*$/m.test(text)) {
      assert.equal(file, '.github/workflows/openai-agents.yml', `unexpected workflow with no jobs: ${file}`);
      assert.doesNotMatch(text, /uses:\s*openai\/codex-action@/, `${file}: agent action outside valid jobs`);
      continue;
    }
    for (const [name, job] of Object.entries(jobsOf(text))) {
      if (!/uses: openai\/codex-action@/.test(job)) continue;
      agentJobs++;
      const where = `${file} job ${name}`;
      assert.doesNotMatch(job, /uses: actions\/cache@/, `${where}: use actions/cache/restore`);
      assert.doesNotMatch(job, /uses: actions\/cache\/save@/, where);
      assert.doesNotMatch(job, /uses: actions\/setup-node@[\s\S]*?cache: *['"]?npm/, `${where}: setup-node npm cache saves`);
      const uses = job.match(/uses: \.\/\.github\/actions\/setup-node-libs\n/g) ?? [];
      const restoreOnly = job.match(/uses: \.\/\.github\/actions\/setup-node-libs\n\s+with:\n(?:\s+#.*\n)*\s+save-cache: 'false'\n/g) ?? [];
      assert.equal(restoreOnly.length, uses.length, `${where}: setup-node-libs must pass save-cache: 'false'`);
    }
  }
  assert.ok(agentJobs >= 2, 'expected the codex-cloud develop and parallel-review research jobs');
});

test('setup-node-libs keeps saving by default and is restore-only with save-cache false', () => {
  assert.match(libs, /\n {2}save-cache:\n(?: {4}.*\n)*? {4}default: 'true'\n/);
  const save = /- id: libs\n\s+if: inputs\.save-cache == 'true'\n\s+uses: actions\/cache@([0-9a-f]{40})[^\n]*\n\s+with:\n\s+path: (.*)\n\s+key: (.*)\n/.exec(libs);
  const restore = /- id: libs-restore\n\s+if: inputs\.save-cache != 'true'\n\s+uses: actions\/cache\/restore@([0-9a-f]{40})[^\n]*\n\s+with:\n\s+path: (.*)\n\s+key: (.*)\n/.exec(libs);
  assert.ok(save, 'saving cache step is guarded by save-cache == true');
  assert.ok(restore, 'restore-only step is used otherwise');
  assert.equal(restore[1], save[1], 'same actions/cache commit');
  assert.equal(restore[2], save[2], 'same cache path');
  assert.equal(restore[3], save[3], 'same cache key');
  assert.match(libs, /if: steps\.libs\.outputs\.cache-hit != 'true' && steps\.libs-restore\.outputs\.cache-hit != 'true'\n\s+run: npm run build:libs/);
  assert.match(libs, /cache: \$\{\{ inputs\.save-cache == 'true' && 'npm' \|\| '' \}\}/);
  assert.match(libs, /package-manager-cache: \$\{\{ inputs\.save-cache == 'true' \}\}/);
});

// ---------------------------------------------------------------------------------------------------------------
// C6-52 HIGH (spoofable approval) as a standing rule, and parallel-review has no merge path at all.
// ---------------------------------------------------------------------------------------------------------------

test('any approval-gated merge trusts only OWNER/MEMBER/COLLABORATOR reviews on same-repo heads', () => {
  for (const { file, text } of workflows) {
    if (!/"APPROVED"|'APPROVED'/.test(text)) continue;
    assert.match(text, /author_association/, file);
    assert.match(text, /OWNER/, file);
    assert.match(text, /head\.repo\.full_name|isCrossRepository/, file);
  }
});

test('parallel-review only opens draft PRs and its validate job runs these invariants', () => {
  assert.doesNotMatch(review, /gh pr merge|merge_pull_request|--auto\b/);
  assert.match(review, /draft: true/);
  assert.match(review, /- run: node --test scripts\/tests\/ghostpay-automation-hardening\.test\.mjs/);
  for (const p of [CLOUD, LIBS, 'scripts/tests/ghostpay-automation-hardening.test.mjs']) {
    assert.ok(review.includes(`      - '${p}'`), `pull_request paths include ${p}`);
  }
});
