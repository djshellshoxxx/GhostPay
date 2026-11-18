// TB-01: the release `verify` job must run every workspace's tests under the same anvil policy as PR CI (ci.yml
// `ts-test` and `ts-test-relayer`). A monolithic `REQUIRE_ANVIL=1 npm test` fails closed in workspaces whose anvil suites
// need artifacts that are not in the repository (payer-sponsor, external-pools-railgun, external-pools-privacypools),
// so a release could never pass while PR CI is green.
//
// No network and no real test run: the `Unit tests` scripts of both workflows run against stub `npm`, `anvil` and
// `forge` binaries, the stub records each `npm test` call with the anvil environment it saw, and the two records are
// compared workspace by workspace. No YAML dependency is declared, so steps are located by line shape, as in
// scripts/tests/workflows.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const noJq = spawnSync('jq', ['--version']).status === 0 ? false : 'jq not installed';

/** Top-level job blocks of a workflow, keyed by job id (comment lines dropped). */
function jobBlocks(workflow) {
  const blocks = {};
  let current;
  for (const line of workflow.slice(workflow.indexOf('\njobs:\n') + 7).split('\n')) {
    if (/^\S/.test(line)) break;
    if (/^\s*#/.test(line)) continue;
    const id = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)?.[1];
    if (id) { current = id; blocks[id] = ''; } else if (current) blocks[current] += `${line}\n`;
  }
  return blocks;
}

/** The steps of a job block, each as its own text (from its `- ` line to the next step at the same indent). */
function steps(job) {
  const out = [];
  for (const line of job.split('\n')) {
    if (/^ {6}- /.test(line)) out.push(`${line}\n`);
    else if (out.length && (line.trim() === '' || /^ {7,}\S/.test(line))) out[out.length - 1] += `${line}\n`;
  }
  return out;
}

/** The dedented `run: |` script of the step named `name` in a job block. */
function stepScript(job, name) {
  const step = steps(job).find((s) => s.startsWith(`      - name: ${name}\n`));
  assert.ok(step, `step "${name}" not found`);
  const lines = step.split('\n');
  const start = lines.findIndex((l) => /^ {8}run: \|\s*$/.test(l));
  assert.ok(start >= 0, `step "${name}" has no run: | block`);
  const body = [];
  for (let i = start + 1; i < lines.length && (lines[i].trim() === '' || /^ {10}/.test(lines[i])); i++) body.push(lines[i]);
  return `${body.map((l) => l.slice(10)).join('\n')}\n`;
}

const workspaces = () => {
  const r = spawnSync('npm', ['query', '.workspace'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).map((w) => w.location).sort();
};

/**
 * Run `script` with stub binaries and return { workspace: 'REQUIRE_ANVIL=… ANVIL_BIN=… SOLC_BIN=…' } for every
 * workspace an `npm test -w` call named. A workspace tested twice, or a bare `npm test` (all workspaces), fails.
 */
function record(script, extraEnv, wsJson) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-anvil-parity-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    mkdirSync(join(dir, 'packages/contracts'), { recursive: true });
    writeFileSync(join(dir, 'workspaces.json'), wsJson);
    writeFileSync(join(bin, 'anvil'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    // ci.yml shard 0 also runs the script tests with node; this file is one of them, so node is a no-op stub here.
    writeFileSync(join(bin, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(bin, 'forge'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    // The pinned compiler is in the (redirected) svm cache: both workflows run `forge build` in an earlier step.
    mkdirSync(join(dir, '.svm/0.8.28'), { recursive: true });
    writeFileSync(join(dir, '.svm/0.8.28/solc-0.8.28'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(bin, 'npm'), `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  query) cat "$STUB_ROOT/workspaces.json"; exit 0 ;;
  test) ;;
  *) exit 0 ;;
esac
printf '%s|%s|%s|%s\\n' "$*" "\${REQUIRE_ANVIL:-}" "\${ANVIL_BIN:+set}" "\${SOLC_BIN:+set}" >> "$STUB_ROOT/calls"
`, { mode: 0o755 });
    const file = join(dir, 'run.sh');
    writeFileSync(file, script.replaceAll('$HOME/.svm', '$STUB_ROOT/.svm'));
    // A clean environment: nothing from the developer's shell (REQUIRE_ANVIL, ANVIL_BIN) may leak into the record.
    const env = { PATH: `${bin}:/usr/bin:/bin`, STUB_ROOT: dir, ...extraEnv };
    const result = spawnSync('bash', [file], { cwd: dir, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const out = {};
    let calls = '';
    try { calls = readFileSync(join(dir, 'calls'), 'utf8'); } catch { /* no npm test call */ }
    for (const line of calls.split('\n').filter(Boolean)) {
      const [args, require, anvil, solc] = line.split('|');
      const names = [...args.matchAll(/-w (\S+)/g)].map((m) => m[1]);
      assert.ok(names.length > 0, `bare "npm ${args}" runs every workspace under one policy`);
      for (const w of names) {
        assert.ok(!(w in out), `${w} is tested twice`);
        out[w] = `REQUIRE_ANVIL=${require || '-'} ANVIL_BIN=${anvil || '-'} SOLC_BIN=${solc || '-'}`;
      }
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** ci.yml: the `ts-test` matrix groups plus the dedicated relayer job. */
function ciPolicy(wsJson) {
  const ci = jobBlocks(read('.github/workflows/ci.yml'));
  const groups = /^ {8}group: \[([^\]]+)\]$/m.exec(ci['ts-test'])?.[1].split(',').map((g) => g.trim());
  assert.ok(groups && groups.length > 0, 'ts-test matrix groups not found');
  const script = stepScript(ci['ts-test'], 'Unit tests');
  const policy = {};
  for (const GROUP of groups) {
    for (const [w, env] of Object.entries(record(script, { GROUP }, wsJson))) {
      assert.ok(!(w in policy), `ci.yml tests ${w} in two groups`);
      policy[w] = env;
    }
  }
  // ts-test-relayer: ANVIL_BIN from the "Locate anvil" step (GITHUB_ENV), REQUIRE_ANVIL from the step env, no SOLC_BIN.
  const relayer = ci['ts-test-relayer'];
  assert.match(relayer, /run: echo "ANVIL_BIN=\$\(command -v anvil\)" >> "\$GITHUB_ENV"/);
  const relayerStep = steps(relayer).find((s) => s.includes('run: npm test -w apps/relayer'));
  assert.ok(relayerStep, 'relayer test step not found');
  assert.match(relayerStep, /^ {10}REQUIRE_ANVIL: '1'$/m);
  assert.doesNotMatch(relayer, /SOLC_BIN/);
  assert.ok(!('apps/relayer' in policy), 'ci.yml tests apps/relayer twice');
  policy['apps/relayer'] = 'REQUIRE_ANVIL=1 ANVIL_BIN=set SOLC_BIN=-';
  return policy;
}

test('release verify does not run a monolithic REQUIRE_ANVIL=1 npm test over every workspace (TB-01)', () => {
  const verify = jobBlocks(read('.github/workflows/release.yml')).verify;
  assert.ok(verify, 'release.yml has no verify job');
  for (const s of steps(verify)) {
    assert.doesNotMatch(s, /^ {6}- run: npm test\s*$/m, 'release verify runs a bare `npm test` (all workspaces under one anvil policy)');
  }
  // The anvil environment is set per workspace inside the step, never job-wide (GITHUB_ENV or a job/step env block).
  assert.doesNotMatch(verify, />> "\$GITHUB_ENV"[^\n]*|ANVIL_BIN=\$\(command -v anvil\)" >>/, 'ANVIL_BIN must not be exported job-wide');
  assert.doesNotMatch(verify, /^ {10}REQUIRE_ANVIL:/m, 'REQUIRE_ANVIL must not be set for a whole step');
});

test('release verify tests every workspace exactly once with the same anvil policy as ci.yml (TB-01)', { skip: noJq }, () => {
  const wsJson = JSON.stringify(workspaces().map((location) => ({ location })));
  const ci = ciPolicy(wsJson);
  const verify = jobBlocks(read('.github/workflows/release.yml')).verify;
  const release = record(stepScript(verify, 'Unit tests (per-workspace anvil policy of ci.yml)'), {}, wsJson);
  assert.deepEqual(Object.keys(ci).sort(), workspaces(), 'ci.yml must test every workspace exactly once');
  assert.deepEqual(release, ci);
  // Spot checks that keep the comparison honest: strict where artifacts exist in the checkout, never where they do not.
  assert.equal(release['apps/web'], 'REQUIRE_ANVIL=1 ANVIL_BIN=set SOLC_BIN=set');
  assert.equal(release['packages/chain-adapters'], 'REQUIRE_ANVIL=1 ANVIL_BIN=set SOLC_BIN=set');
  assert.equal(release['apps/relayer'], 'REQUIRE_ANVIL=1 ANVIL_BIN=set SOLC_BIN=-');
  for (const w of ['packages/payer-sponsor', 'packages/external-pools-railgun', 'packages/external-pools-privacypools']) {
    assert.equal(release[w], 'REQUIRE_ANVIL=- ANVIL_BIN=- SOLC_BIN=-', w);
  }
});

test('release unit tests fail before running any suite when anvil or the pinned compiler is missing (TB-01)', { skip: noJq }, () => {
  const verify = jobBlocks(read('.github/workflows/release.yml')).verify;
  const script = stepScript(verify, 'Unit tests (per-workspace anvil policy of ci.yml)');
  const dir = mkdtempSync(join(tmpdir(), 'gp-anvil-missing-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\n[ "$1" = test ] && echo called >> "$STUB_ROOT/calls"\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(dir, 'run.sh'), script.replaceAll('$HOME/.svm', '$STUB_ROOT/.svm'));
    const r = spawnSync('bash', [join(dir, 'run.sh')], { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, STUB_ROOT: dir }, encoding: 'utf8' });
    assert.notEqual(r.status, 0, 'no anvil and no compiler must fail the step');
    assert.throws(() => readFileSync(join(dir, 'calls')), { code: 'ENOENT' }, 'no suite may run without anvil');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
