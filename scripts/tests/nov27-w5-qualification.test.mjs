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
  HARNESS: 'c'.repeat(40), HARNESS_TREE: 'd'.repeat(40), OBSERVER: 'f'.repeat(40), W5_PORT: '4173' };
const identities = [
  { digest: `0x${'1'.repeat(64)}`, units: '498750000000000000' },
  { digest: `0x${'2'.repeat(64)}`, units: '299250000000000000' },
];
const cards = identities.map(({ digest, units }) => `Invoice ${digest} ${units} base units of native; valid until 2027-01-01T00:00:00Z`);
const good = { cards, ledgerPresent: true, ledgerVisible: true, ledgerLocked: false };
const ready = { ledger: 'unlocked', readback: { ledgerPresent: true, ledgerVisible: true, ledgerLocked: false, identities } };
const expectedIdentities = identities.map((identity, i) => ({ intent: i === 0 ? 'X' : 'C', ...identity }));
const compared = { i: 0, step: { op: 'compareTabs' }, result: { compared: true, expectedIdentities, tabs: { S1: ready, S2: ready } }, obs: { S1: good, S2: good } };
const cardsFor = rows => rows.map(({ digest, units }) => `Invoice ${digest} ${units} base units of native; valid until 2027-01-01T00:00:00Z`);
const comparisonWith = (rows, expected = expectedIdentities) => {
  const tabReady = { ...ready, readback: { ...ready.readback, identities: rows } };
  const view = { ...good, cards: cardsFor(rows) };
  return { ...compared, result: { ...compared.result, expectedIdentities: expected, tabs: { S1: tabReady, S2: tabReady } }, obs: { S1: view, S2: view } };
};

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

test('successful reload with both present ledgers and both expected identities qualifies', () => {
  const output = exercise([compared]);
  assert.equal(output.status, 0);
  assert.deepEqual(output.row.incompleteTabComparisons, []);
});

for (const [reason, trace] of [
  ['both observations absent', [{ ...compared, obs: { S1: null, S2: null } }]],
  ['missing comparison step', []],
  ['reload never completed', [{ ...compared, result: undefined }]],
  ['second ledger locked', [{ ...compared, obs: { S1: good, S2: { ...good, ledgerLocked: true } } }]],
  ['both absent ledgers represented as unlocked empty arrays', [{ ...compared,
    result: { compared: true, tabs: { S1: { ...ready, readback: { ledgerPresent: false, ledgerVisible: false, ledgerLocked: false, identities: [] } }, S2: { ...ready, readback: { ledgerPresent: false, ledgerVisible: false, ledgerLocked: false, identities: [] } } } },
    obs: { S1: { cards: [], ledgerPresent: false, ledgerVisible: false, ledgerLocked: false }, S2: { cards: [], ledgerPresent: false, ledgerVisible: false, ledgerLocked: false } } }]],
  ['one absent ledger and one present empty ledger', [{ ...compared,
    result: { compared: true, tabs: { S1: { ...ready, ledger: 'no-ledger', readback: { ledgerPresent: false, ledgerVisible: false, ledgerLocked: false, identities: [] } }, S2: { ...ready, readback: { ...ready.readback, identities: [] } } } },
    obs: { S1: { cards: [], ledgerPresent: false, ledgerVisible: false, ledgerLocked: false }, S2: { ...good, cards: [] } } }]],
  ['present unlocked ledgers with missing visible identities', [{ ...compared,
    obs: { S1: { ...good, cards: [] }, S2: { ...good, cards: [] } } }]],
  ['hidden second ledger', [{ ...compared, obs: { S1: good, S2: { ...good, ledgerVisible: false } } }]],
  ['second invoice identity lost', [{ ...compared,
    result: { ...compared.result, tabs: { S1: ready, S2: { ...ready, readback: { ...ready.readback, identities: identities.slice(0, 1) } } } } }]],
  ['tabs disagree on an invoice identity', [{ ...compared,
    result: { ...compared.result, tabs: { S1: ready, S2: { ...ready, readback: { ...ready.readback, identities: [identities[0], { ...identities[1], digest: `0x${'3'.repeat(64)}` }] } } } } }]],
  ['both tabs substitute two unrelated invoice digests', [comparisonWith(identities.map((id, i) => ({ ...id, digest: `0x${String(i + 3).repeat(64)}` })))]],
  ['both amounts use the same digest', [comparisonWith(identities.map(id => ({ ...id, digest: identities[0].digest })))]],
  ['an extra registered card is visible and read back', [comparisonWith([...identities, { digest: `0x${'5'.repeat(64)}`, units: '123456789' }])]],
  ['registered expectation itself contains a duplicate digest', [comparisonWith(identities,
    expectedIdentities.map(id => ({ ...id, digest: identities[0].digest })))]],
  ['registered expectations swap X and C amounts', [comparisonWith(identities,
    [{ ...expectedIdentities[0], units: expectedIdentities[1].units }, { ...expectedIdentities[1], units: expectedIdentities[0].units }])]],
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
