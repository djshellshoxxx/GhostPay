// Exercise the actual ERC-20 workflow collector against disposable, committed source and synthetic evidence.
// No browser, chain, network, credentials, application state, or real key material is used.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../..', import.meta.url));
const workflowPath = '.github/workflows/erc20-browser-qualification.yml';
const helperPath = 'scripts/beta/erc20-report-membership.mjs';
const testPath = 'scripts/tests/erc20-report-membership.test.mjs';
const workflow = readFileSync(join(sourceRoot, workflowPath), 'utf8');
const playwrightVersion = JSON.parse(readFileSync(join(sourceRoot, 'package-lock.json'), 'utf8'))
  .packages['node_modules/@playwright/test'].version;
const primaryFile = 'erc20-pages-devnet.spec.ts';
const boundaryFile = 'erc20-pages-boundaries.spec.ts';
const boundaryTitles = [
  'cancel at the payment disclosure preserves an exact approval without claiming payment',
  'pending payment survives reload and blocks the same invoice in a second tab before another wallet send',
  'a lost wallet response retains an unknown outcome without inventing a hash or sending twice',
  'account change closes an open payment disclosure and invalidates its prepared authority',
  'network change closes an open payment disclosure and invalidates its prepared authority',
  'RPC outage blocks review before any wallet authorization and recovers after the endpoint returns',
  'rejected initial authorization creates no payment and does not consume token funds',
];
const primaryTitle = (mode) => `ERC-20 ${mode}: approved payment, final scan and receipt, then recovered original funds in a fresh browser`;
const hash = (value) => createHash('sha256').update(value).digest('hex');

/** Extract the named workflow step itself, so an unwired validator cannot make these regressions green. */
function stepScript(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  assert.ok(start >= 0, `Workflow step not found: ${name}`);
  const stepIndent = lines[start].indexOf('-');
  let index = start + 1;
  while (index < lines.length && !/^\s*run: \|\s*$/.test(lines[index])) {
    assert.ok(lines[index].trim() === '' || lines[index].search(/\S/) > stepIndent, `No run block for ${name}`);
    index++;
  }
  assert.ok(index < lines.length, `No run block for ${name}`);
  const runIndent = lines[index].search(/\S/);
  const body = [];
  for (index++; index < lines.length && (lines[index].trim() === '' || lines[index].search(/\S/) > runIndent); index++) {
    body.push(lines[index]);
  }
  const indent = Math.min(...body.filter((line) => line.trim() !== '').map((line) => line.search(/\S/)));
  return `${body.map((line) => line.slice(indent)).join('\n')}\n`;
}

const collector = stepScript(workflow, 'Record source, build identity and sanitized test outcomes');

function successfulSpec(file, title, browser, attachments = []) {
  return {
    title, file, line: 1, column: 1, id: hash(`${file}:${title}`), ok: true, tags: [],
    tests: [{
      timeout: 240000, annotations: [], expectedStatus: 'passed', projectId: `erc20-${browser}`,
      projectName: `erc20-${browser}`, status: 'expected',
      results: [{ workerIndex: 0, parallelIndex: 0, status: 'passed', duration: 1, retry: 0,
        startTime: '2026-01-01T00:00:00.000Z', stdout: [], stderr: [], attachments }],
    }],
  };
}

/** Run the unchanged workflow collector with a real clean Git checkout and internally consistent synthetic artifacts. */
function collectFixture({ mode = 'plain', browser = 'chromium', mutate = () => {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'gp-erc20-membership-'));
  try {
    const repository = join(directory, 'repository');
    const runnerTemp = join(directory, 'runner');
    const runRoot = join(runnerTemp, `ghostpay-erc20-${mode}-${browser}`);
    const evidence = join(runnerTemp, `ghostpay-erc20-evidence-${mode}-${browser}`);
    const run = join(runRoot, 'ghostpay-browser-devnet.Abc123');
    const buildDirectory = join(run, 'pages/evidence');
    const reportDirectory = join(run, 'pages-results');
    const siteDirectory = join(run, 'pages/site');
    for (const path of [repository, buildDirectory, reportDirectory, siteDirectory]) mkdirSync(path, { recursive: true });
    const lockfile = JSON.stringify({ packages: { 'node_modules/@playwright/test': { version: playwrightVersion } } });
    writeFileSync(join(repository, 'package-lock.json'), lockfile);
    writeFileSync(join(repository, 'package.json'), '{"type":"module"}\n');
    writeFileSync(join(repository, 'collector.sh'), collector);
    // On the unfixed revision the helper does not exist. This keeps the actual old collector executable for red evidence.
    if (existsSync(join(sourceRoot, helperPath))) {
      mkdirSync(dirname(join(repository, helperPath)), { recursive: true });
      copyFileSync(join(sourceRoot, helperPath), join(repository, helperPath));
    }
    const environment = {
      PATH: process.env.PATH, LANG: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Synthetic fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Synthetic fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
      RUNNER_TEMP: runnerTemp, ERC20_RUN_ROOT: runRoot, ERC20_EVIDENCE: evidence,
      GHOSTPAY_PAGES_ERC20: mode, GHOSTPAY_PAGES_BROWSER: browser,
    };
    const git = (...args) => {
      const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {
        cwd: repository, env: environment, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      return result.stdout.trim();
    };
    git('init', '--quiet');
    git('add', '.');
    git('commit', '--quiet', '-m', 'Synthetic collector fixture');
    const commit = git('rev-parse', 'HEAD');
    environment.GITHUB_SHA = commit;
    environment.PR_HEAD = commit;
    const publicJourney = {
      commit, mode, chainId: 84532, token: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
      gross: '100000000', fee: '250000', net: '99750000',
      paymentHash: `0x${'1'.repeat(64)}`, fundingHash: `0x${'2'.repeat(64)}`, sweepHash: `0x${'3'.repeat(64)}`,
      walletMethods: mode === 'plain'
        ? ['eth_requestAccounts', 'eth_sendTransaction', 'eth_sendTransaction']
        : ['eth_requestAccounts', 'eth_signTypedData_v4', 'eth_sendTransaction'],
      recoveredOriginalPayment: true, browserName: browser, browserVersion: '123.0.1', playwrightVersion,
    };
    const attachment = { name: 'erc20-public-evidence', contentType: 'application/json',
      body: Buffer.from(JSON.stringify(publicJourney)).toString('base64') };
    const primary = successfulSpec(primaryFile, primaryTitle(mode), browser, [attachment]);
    const boundaries = boundaryTitles.map((title) => successfulSpec(boundaryFile, title, browser));
    const report = {
      config: { version: playwrightVersion, rootDir: join(repository, 'apps/web/e2e') },
      errors: [], stats: { startTime: '2026-01-01T00:00:00.000Z', duration: 8, expected: 8, skipped: 0, unexpected: 0, flaky: 0 },
      suites: [
        { title: primaryFile, file: primaryFile, line: 0, column: 0, specs: [primary], suites: [] },
        { title: boundaryFile, file: boundaryFile, line: 0, column: 0, specs: boundaries, suites: [] },
      ],
    };
    const site = '<!doctype html><title>Synthetic collector fixture</title>\n';
    const sums = `${hash(site)}  ./index.html\n`;
    const build = { commit, profile: 'lean', release: false, paymentsEnabledChainIds: [84532],
      lockfileSha256: hash(lockfile), sha256sumsSha256: hash(sums), manifestsSha256: 'a'.repeat(64), files: 1 };
    const fixture = { mode, browser, report, primary, boundaries, attachment, publicJourney, build,
      environment, repository, siteDirectory, runnerExit: '0\n' };
    writeFileSync(join(siteDirectory, 'index.html'), site);
    mutate(fixture);
    writeFileSync(join(buildDirectory, 'SHA256SUMS'), sums);
    writeFileSync(join(buildDirectory, 'pages-evidence.json'), JSON.stringify(build));
    writeFileSync(join(reportDirectory, 'erc20-report.json'), JSON.stringify(report));
    writeFileSync(join(runRoot, 'runner-exit.txt'), fixture.runnerExit);
    writeFileSync(join(runRoot, 'runner.log'), '== anvil on loopback\n== playwright synthetic fixture\n');
    const result = spawnSync('bash', ['collector.sh'], {
      cwd: repository, env: environment, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.error, undefined, 'The collector must terminate without a fixture execution error');
    const output = join(evidence, 'qualification.json');
    assert.ok(existsSync(output), `The real collector must emit sanitized evidence: ${result.stderr}`);
    const raw = readFileSync(output, 'utf8');
    return { status: result.status, record: JSON.parse(raw), raw, stdout: result.stdout, stderr: result.stderr, commit };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectRejected(result) {
  assert.notEqual(result.status, 0, 'Incomplete or invalid evidence must fail the actual collector process');
  assert.equal(result.record.passed, false, 'Incomplete or invalid evidence must never receive passed: true');
  assert.ok(Array.isArray(result.record.failures) && result.record.failures.length > 0, 'Failure evidence must explain refusal');
}

for (const mode of ['plain', 'permit']) {
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    test(`ERC-20 collector accepts all eight exact ${mode}/${browser} cases and retains public build facts`, () => {
      const result = collectFixture({ mode, browser });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(result.record.passed, true);
      assert.deepEqual(result.record.failures, []);
      assert.equal(result.record.cases.length, 8);
      assert.ok(result.record.cases.every((entry) => entry.passed));
      assert.equal(result.record.checkoutCommit, result.commit);
      assert.equal(result.record.publicJourney.commit, result.commit);
      assert.equal(result.record.publicJourney.mode, mode);
      assert.equal(result.record.publicJourney.browserName, browser);
      assert.equal(result.record.publicJourney.recoveredOriginalPayment, true);
      assert.deepEqual(result.record.build.files.map((file) => file.path), ['index.html']);
    });
  }
}

test('ERC-20 collector rejects an absent primary journey', () => {
  expectRejected(collectFixture({ mutate: ({ report }) => { report.suites[0].specs = []; } }));
});
for (let index = 0; index < boundaryTitles.length; index++) {
  test(`ERC-20 collector rejects omitted boundary: ${boundaryTitles[index]}`, () => {
    expectRejected(collectFixture({ mutate: ({ boundaries }) => { boundaries.splice(index, 1); } }));
  });
}

const invalidMembership = [
  ['only one boundary remains', ({ boundaries }) => { boundaries.splice(1); }],
  ['a boundary is substituted without changing the count', ({ boundaries }) => { boundaries[0].title = 'unrelated passing case'; }],
  ['a duplicate boundary substitutes for another', ({ boundaries }) => { boundaries[0] = structuredClone(boundaries[1]); }],
  ['an extra duplicate is added', ({ boundaries }) => { boundaries.push(structuredClone(boundaries[0])); }],
  ['a second test entry duplicates an expected case', ({ boundaries }) => { boundaries[0].tests.push(structuredClone(boundaries[0].tests[0])); }],
  ['the primary title names the other token mode', ({ primary }) => { primary.title = primaryTitle('permit'); }],
  ['the primary title is arbitrary even with valid public evidence', ({ primary }) => { primary.title = 'unrelated passing journey'; }],
  ['the browser project differs', ({ boundaries }) => { boundaries[0].tests[0].projectName = 'erc20-firefox'; }],
  ['a spec is assigned to the other expected file', ({ boundaries }) => { boundaries[0].file = primaryFile; }],
  ['an absolute unrelated path has the expected basename', ({ boundaries }) => { boundaries[0].file = `/unrelated/${boundaryFile}`; }],
  ['a relative unrelated path has the expected basename', ({ boundaries }) => { boundaries[0].file = `other/${boundaryFile}`; }],
  ['a traversal path has the expected basename', ({ boundaries }) => { boundaries[0].file = `../${boundaryFile}`; }],
  ['an expected spec has no test entries', ({ boundaries }) => { boundaries[0].tests = []; }],
  ['a spec title is missing', ({ boundaries }) => { delete boundaries[0].title; }],
  ['a spec title is not a string', ({ boundaries }) => { boundaries[0].title = { title: boundaryTitles[0] }; }],
];
for (const [description, mutate] of invalidMembership) {
  test(`ERC-20 collector rejects ${description}`, () => { expectRejected(collectFixture({ mutate })); });
}

test('ERC-20 collector accepts a nested suite with the same complete case identities', () => {
  const result = collectFixture({ mutate: ({ report, boundaries }) => {
    report.suites[1].specs = [];
    report.suites[1].suites = [{ title: 'Boundary group', file: boundaryFile, specs: boundaries, suites: [] }];
  } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.record.passed, true);
  assert.equal(result.record.cases.length, 8);
});

for (const status of ['failed', 'timedOut', 'skipped', 'interrupted', 'invalid']) {
  test(`ERC-20 collector rejects a ${status} boundary result`, () => {
    expectRejected(collectFixture({ mutate: ({ boundaries }) => { boundaries[0].tests[0].results[0].status = status; } }));
  });
}
const invalidExecution = [
  ['an expected failure', ({ boundaries }) => { boundaries[0].tests[0].expectedStatus = 'failed'; }],
  ['a flaky test', ({ boundaries }) => { boundaries[0].tests[0].status = 'flaky'; }],
  ['a failed spec marker', ({ boundaries }) => { boundaries[0].ok = false; }],
  ['a retry marked as passed', ({ boundaries }) => { boundaries[0].tests[0].results[0].retry = 1; }],
  ['multiple result attempts', ({ boundaries }) => { boundaries[0].tests[0].results.push(structuredClone(boundaries[0].tests[0].results[0])); }],
  ['no result attempts', ({ boundaries }) => { boundaries[0].tests[0].results = []; }],
  ['malformed top-level suites', ({ report }) => { report.suites = {}; }],
  ['malformed nested suites', ({ report }) => { report.suites[1].suites = {}; }],
  ['malformed specs', ({ report }) => { report.suites[1].specs = {}; }],
  ['malformed tests', ({ boundaries }) => { boundaries[0].tests = {}; }],
  ['malformed results', ({ boundaries }) => { boundaries[0].tests[0].results = {}; }],
  ['a global reporter error', ({ report }) => { report.errors = [{ message: 'Synthetic reporter failure' }]; }],
];
for (const [description, mutate] of invalidExecution) {
  test(`ERC-20 collector rejects ${description}`, () => { expectRejected(collectFixture({ mutate })); });
}

test('ERC-20 collector binds the public attachment to the exact primary identity', () => {
  expectRejected(collectFixture({ mutate: ({ report, primary, attachment, browser }) => {
    primary.tests[0].results[0].attachments = [];
    report.suites[0].specs.push(successfulSpec(primaryFile, 'different case with valid public attachment', browser, [attachment]));
  } }));
});
test('ERC-20 collector refuses public evidence moved to a valid boundary case', () => {
  expectRejected(collectFixture({ mutate: ({ primary, boundaries, attachment }) => {
    primary.tests[0].results[0].attachments = [];
    boundaries[0].tests[0].results[0].attachments = [attachment];
  } }));
});
test('ERC-20 collector refuses a second public evidence attachment', () => {
  expectRejected(collectFixture({ mutate: ({ primary, attachment }) => {
    primary.tests[0].results[0].attachments.push(structuredClone(attachment));
  } }));
});

test('ERC-20 collector keeps invalid report text and rejected attachment fields out of public output', () => {
  const sentinel = 'synthetic-private-material-DO-NOT-PUBLISH';
  const result = collectFixture({ mutate: ({ boundaries, publicJourney, attachment }) => {
    boundaries[0].title = sentinel;
    boundaries[0].tests[0].results[0].error = { message: sentinel };
    attachment.body = Buffer.from(JSON.stringify({ ...publicJourney, extra: sentinel })).toString('base64');
  } });
  expectRejected(result);
  assert.ok(!`${result.raw}${result.stdout}${result.stderr}`.includes(sentinel));
  assert.equal(result.record.publicJourney, undefined);
});

const preservedGuards = [
  ['the runner fails', (fixture) => { fixture.runnerExit = '1\n'; }],
  ['the checkout identity differs', ({ environment }) => { environment.GITHUB_SHA = '0'.repeat(40); }],
  ['tracked source changes', ({ repository }) => { writeFileSync(join(repository, 'package.json'), '{"type":"commonjs"}\n'); }],
  ['the build source differs', ({ build }) => { build.commit = '0'.repeat(40); }],
  ['the served build changes', ({ siteDirectory }) => { writeFileSync(join(siteDirectory, 'index.html'), 'changed\n'); }],
  ['the public journey names another checkout', ({ publicJourney, attachment }) => {
    attachment.body = Buffer.from(JSON.stringify({ ...publicJourney, commit: '0'.repeat(40) })).toString('base64');
  }],
];
for (const [description, mutate] of preservedGuards) {
  test(`ERC-20 collector still refuses qualification when ${description}`, () => { expectRejected(collectFixture({ mutate })); });
}

test('ERC-20 workflow triggers for collector source and regression changes', () => {
  const onBlock = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
  for (const event of ['pull_request', 'push']) {
    const match = new RegExp(`\\n  ${event}:\\n(?:    branches:.*\\n)?    paths:\\n((?:      (?:- |#).*\\n)+)`).exec(onBlock + '\n');
    assert.ok(match, `${event} path filter must exist`);
    const paths = [...match[1].matchAll(/- '([^']+)'/g)].map((entry) => entry[1]);
    for (const path of [helperPath, testPath]) assert.ok(paths.includes(path), `${event} must trigger for ${path}`);
  }
});

test('ERC-20 workflow runs collector regressions before browser setup', () => {
  const command = `node --test ${testPath}`;
  const tests = workflow.indexOf(command);
  assert.ok(tests >= 0, 'The qualification workflow must execute the collector regression suite');
  assert.ok(tests > workflow.indexOf('npm ci --ignore-scripts'), 'Collector regression tests follow dependency setup');
  assert.ok(tests < workflow.indexOf('- name: Build workspace libraries from source'), 'Collector regressions fail before expensive browser qualification');
});
