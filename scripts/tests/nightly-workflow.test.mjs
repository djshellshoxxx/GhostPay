// TB-09 / SEC-17: nightly.yml runs the suites PR CI does not (every examples/ test, the payer-sponsor and
// external-pools anvil suites, the reconciliation IndexedDB browser check) and a full-detector Slither report next to
// the unchanged Medium+ gate. No YAML dependency is declared, so jobs and steps are located by line shape, as in
// scripts/tests/workflows.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');

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
function steps(job) {
  const out = [];
  for (const line of job.split('\n')) {
    if (/^ {6}- /.test(line)) out.push(`${line}\n`);
    else if (out.length && (line.trim() === '' || /^ {7,}\S/.test(line))) out[out.length - 1] += `${line}\n`;
  }
  return out;
}
const step = (job, name) => {
  const found = steps(job).find((s) => s.startsWith(`      - name: ${name}\n`));
  assert.ok(found, `step "${name}" not found`);
  return found;
};
const nightly = () => jobBlocks(read('.github/workflows/nightly.yml'));
const FOUNDRY = /^ {6}- uses: (foundry-rs\/foundry-toolchain@[0-9a-f]{40} # v[\d.]+)\n {8}with:\n {10}version: (v[\d.]+)\n/m;

test('every nightly job is read-only and receives no secrets', () => {
  const wf = read('.github/workflows/nightly.yml');
  assert.match(wf, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(wf, /secrets\.|id-token|: write/);
  for (const [id, block] of Object.entries(nightly())) {
    assert.match(block, /^ {4}permissions:\n {6}contents: read\n(?! {6}\S)/m, `${id} must restate contents: read only`);
    for (const s of steps(block).filter((x) => x.includes('actions/checkout@'))) assert.match(s, /persist-credentials: false/, id);
  }
});

test('nightly runs every examples/ test file and the webhook self-test (TB-09)', () => {
  const job = nightly().examples;
  assert.ok(job, 'nightly.yml has no examples job');
  assert.match(job, /^ {6}- uses: \.\/\.github\/actions\/setup-node-libs\n/m, 'examples import the built workspace libs');
  const examples = step(job, 'Example tests (all of examples/)');
  assert.match(examples, /^ {10}shopt -s globstar$/m, 'bash must expand ** recursively, or nested tests are missed');
  const run = /^ {10}node --test (.+)$/m.exec(examples)?.[1];
  assert.ok(run, 'no node --test command');
  // Expand the step's globs exactly as bash on the runner does; they must select every *.test.mjs under examples/.
  const expanded = spawnSync('bash', ['-c', `shopt -s nullglob globstar; printf '%s\\n' ${run}`], { cwd: root, encoding: 'utf8' });
  assert.equal(expanded.status, 0, expanded.stderr);
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(join(dir, e.name))) : [join(dir, e.name)]));
  const all = walk(join(root, 'examples')).filter((f) => f.endsWith('.test.mjs')).map((f) => relative(root, f)).sort();
  assert.ok(all.length >= 8, `expected the examples tests, found ${all.length}`);
  assert.deepEqual(expanded.stdout.split('\n').filter(Boolean).sort(), all);
  assert.match(step(job, 'Webhook receiver self-test'), /run: node examples\/webhook-receiver\/selftest\.mjs\n/);
});

test('nightly runs the reconciliation IndexedDB check in Chromium (TB-06, TB-09)', () => {
  const job = nightly().examples;
  const s = step(job, 'Reconciliation vault IndexedDB two-tab check (Chromium)');
  assert.match(s, /working-directory: apps\/web\n/);
  assert.match(s, /run: node scripts\/test-reconciliation-idb\.mjs\n/);
  // The same managed Chromium install as ci.yml e2e, before the check.
  const order = steps(job).map((x) => x.split('\n')[0]);
  const install = order.findIndex((l) => l.includes('playwright install --with-deps chromium'));
  const check = order.findIndex((l) => l.includes('Reconciliation vault IndexedDB'));
  assert.ok(install >= 0 && install < check, 'Chromium must be installed before the check');
});

test('nightly runs the anvil suites PR CI skips, with the anvil pinned as in ci.yml (TB-09)', () => {
  const job = nightly()['anvil-suites'];
  assert.ok(job, 'nightly.yml has no anvil-suites job');
  const ciPin = FOUNDRY.exec(read('.github/workflows/ci.yml'));
  const pin = FOUNDRY.exec(job);
  assert.ok(ciPin && pin, 'foundry-toolchain step not found');
  assert.deepEqual(pin.slice(1), ciPin.slice(1), 'same foundry-toolchain commit and Foundry version as ci.yml');
  assert.equal(pin[2], 'v1.8.5');
  const fetch = step(job, 'Fetch test-only ERC-4337 EntryPoint v0.7.0 fixture');
  assert.match(fetch, /working-directory: packages\/payer-hiding-contracts\n {8}run: bash scripts\/fetch-entrypoint\.sh\n/);
  assert.match(step(job, 'Build the payer-hiding contracts for the sponsor e2e'), /working-directory: packages\/payer-hiding-contracts\n {8}run: forge build\n/);
  const suites = step(job, 'Anvil suites (must run, not skip)');
  assert.match(suites, /test -x "\$anvil_bin"/);
  assert.match(suites, /ANVIL_BIN="\$anvil_bin" REQUIRE_ANVIL=1 npm test -w packages\/payer-sponsor -w packages\/external-pools\n/);
  // REQUIRE_ANVIL is never set for workspaces whose fixtures are not in the repository.
  assert.doesNotMatch(job, /external-pools-railgun|external-pools-privacypools|pool-relayer|pool-circuits|REQUIRE_CIRCUITS|REQUIRE_POOL_E2E/);
  assert.doesNotMatch(job, /^ {10}REQUIRE_ANVIL:/m);
});

test('nightly Slither keeps the failing Medium+ gate and adds a non-failing all-detector report (SEC-17)', () => {
  const job = nightly().slither;
  const gate = step(job, 'Slither gate (fails on Medium or High; same command as ci.yml)');
  assert.match(gate, /slither \. --filter-paths "lib\|test\|script" --fail-medium --exclude-informational --exclude-low\n/);
  assert.doesNotMatch(gate, /continue-on-error/);
  const ciGate = /slither \. --filter-paths "lib\|test\|script" --fail-medium --exclude-informational --exclude-low/.test(read('.github/workflows/ci.yml'));
  assert.ok(ciGate, 'ci.yml gate command changed: update the nightly gate together with it');
  const full = step(job, 'Slither report with every detector, Low and Informational included (non-failing)');
  assert.match(full, /if: \$\{\{ !cancelled\(\) \}\}\n/, 'the report runs even when the gate failed');
  assert.match(full, /slither \. --filter-paths "lib\|test\|script" --fail-none --show-ignored-findings \\\n/);
  assert.match(full, /--json "\$RUNNER_TEMP\/slither\/slither-all-detectors\.json"/);
  assert.doesNotMatch(full, /--exclude|--fail-(low|medium|high|pedantic)/, 'the report excludes no detector and no severity');
  const upload = steps(job).find((s) => s.includes('actions/upload-artifact@'));
  assert.ok(upload, 'the full report is uploaded');
  assert.match(upload, /if: \$\{\{ !cancelled\(\) \}\}\n/);
  assert.match(upload, /name: slither-all-detectors-\$\{\{ github\.sha \}\}\n/);
  assert.match(upload, /path: \$\{\{ runner\.temp \}\}\/slither\/\n/);
  assert.match(upload, /if-no-files-found: error\n/);
  const order = steps(job).map((x) => x.split('\n')[0]);
  assert.ok(order.findIndex((l) => l.includes('Slither gate')) < order.findIndex((l) => l.includes('Slither report')));
});
