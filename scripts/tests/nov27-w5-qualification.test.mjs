// Exercise the actual inline collector with synthetic observations from the two seller tabs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/nov27-w5-qualification.yml', import.meta.url), 'utf8');
const collector = workflow.split('      - name: Verify scenario membership')[1].split("<<'JS'\n")[1].split('\n          JS')[0];
const env = { ...process.env, LANE: 'seller', CLIENT: 'a'.repeat(40), CLIENT_TREE: 'b'.repeat(40),
  HARNESS: 'c'.repeat(40), HARNESS_TREE: 'd'.repeat(40), W5_PORT: '4173' };
const good = { cards: [], ledgerLocked: false };
const compared = { i: 0, step: { op: 'compareTabs' }, result: { compared: true }, obs: { S1: good, S2: good } };

function exercise(trace, violations = []) {
  const cwd = mkdtempSync(join(tmpdir(), 'w5-collector-test-'));
  try {
    const harness = join(cwd, 'verification/independent-beta/harness');
    mkdirSync(harness, { recursive: true });
    mkdirSync(join(cwd, 'w5-private'));
    const dist = { sha256: 'e'.repeat(64), files: 3 };
    writeFileSync(join(harness, 'build.mjs'), `export const distFingerprint = () => (${JSON.stringify(dist)});`);
    writeFileSync(join(harness, 'scenarios.mjs'), 'export const NAMED=[], CONTROLS=[], generated=()=>{};');
    writeFileSync(join(harness, 'seller-scenarios.mjs'), `
      export const SELLER_CONTROLS=[{name:'control',expectViolations:['SI4'],steps:[]}];
      export const SELLER_NAMED=[{name:'comparison',steps:[{op:'compareTabs'}]}];
      export const sellerGenerated=n=>({name:'seed-'+n,steps:[]});
    `);
    const seeds = Array.from({ length: 8 }, (_, i) => i + 1);
    const row = (name, trace, violations) => ({ name, trace, violations, ambiguities: [], blockedOrigins: [], harnessError: null });
    const record = {
      pinnedMain: env.CLIENT, source: { head: env.CLIENT, productionTreeClean: true }, productionPathsDifferingFromPinnedMain: [],
      build: { head: env.CLIENT, productionTreeClean: true, profile: 'lean', dist, approvedFixtureOrigin: 'http://localhost:4173' },
      seeds, results: [row('control', [], [{ inv: 'SI4' }]), row('comparison', trace, violations),
        ...seeds.map(n => row('seed-' + n, [], []))],
    };
    writeFileSync(join(cwd, 'w5-private/run.json'), JSON.stringify(record));
    writeFileSync(join(cwd, 'w5-exit'), '0');
    const run = spawnSync(process.execPath, ['--input-type=module'], { cwd, env: { ...env, RUNNER_TEMP: cwd }, input: collector, encoding: 'utf8' });
    assert.ok(run.status === 0 || run.status === 1, run.stderr);
    const report = JSON.parse(readFileSync(join(cwd, 'w5-summary.json'), 'utf8'));
    return { status: run.status, passed: report.passed, row: report.outcomes.find(r => r.scenario === 'comparison') };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

test('successful reload and two observed, empty ledgers qualify the comparison', () => {
  const output = exercise([compared]);
  assert.equal(output.status, 0);
  assert.deepEqual(output.row.incompleteTabComparisons, []);
});

for (const [reason, trace] of [
  ['both observations absent', [{ ...compared, obs: { S1: null, S2: null } }]],
  ['missing comparison step', []],
  ['reload never completed', [{ ...compared, result: undefined }]],
  ['second ledger locked', [{ ...compared, obs: { S1: good, S2: { ...good, ledgerLocked: true } } }]],
]) {
  test(reason + ' keeps qualification red even if the original reporter returned zero', () => {
    const output = exercise(trace);
    assert.equal(output.status, 1);
    assert.equal(output.passed, false);
    assert.deepEqual(output.row.incompleteTabComparisons, [0]);
    assert.equal(output.row.ordinaryViolations, 0);
  });
}

test('a failed reload retains the raw SI8 count and marks the comparison incomplete', () => {
  const output = exercise([{ ...compared, result: undefined, error: 'page.reload: Page crashed', obs: { S1: good, S2: 'closed' } }], [{ inv: 'SI8' }]);
  assert.equal(output.status, 1);
  assert.deepEqual(output.row.incompleteTabComparisons, [0]);
  assert.equal(output.row.invariantCounts.SI8, 1);
  assert.equal(output.row.ordinaryViolations, 1);
});
