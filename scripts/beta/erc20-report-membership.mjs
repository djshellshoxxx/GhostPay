// The qualification contract is independent of the report being validated. Changing a browser
// case requires reviewing this list too; a passing subset must never qualify the whole journey.
const PRIMARY_FILE = 'erc20-pages-devnet.spec.ts';
const BOUNDARY_FILE = 'erc20-pages-boundaries.spec.ts';
const BOUNDARY_TITLES = [
  'cancel at the payment disclosure preserves an exact approval without claiming payment',
  'pending payment survives reload and blocks the same invoice in a second tab before another wallet send',
  'a lost wallet response retains an unknown outcome without inventing a hash or sending twice',
  'account change closes an open payment disclosure and invalidates its prepared authority',
  'network change closes an open payment disclosure and invalidates its prepared authority',
  'RPC outage blocks review before any wallet authorization and recovers after the endpoint returns',
  'rejected initial authorization creates no payment and does not consume token funds',
];
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = (file, title, project) => JSON.stringify([file, title, project]);

/**
 * Validate the eight required Playwright case identities and their executions in one matrix lane.
 * Paths are relative to this config's e2e testDir, as emitted by the pinned JSON reporter. Never
 * normalize an arbitrary path to a trusted basename. Failure codes contain no report content.
 * primaryTest is the exact original test object, for binding its sanitized public attachment.
 */
export function validateErc20ReportMembership(report, { mode, browser } = {}) {
  if (!['plain', 'permit'].includes(mode) || !['chromium', 'firefox', 'webkit'].includes(browser)) {
    return { failures: ['invalid-test-lane'], primaryTest: undefined };
  }
  const project = `erc20-${browser}`;
  const primaryTitle = `ERC-20 ${mode}: approved payment, final scan and receipt, then recovered original funds in a fresh browser`;
  const primaryIdentity = identity(PRIMARY_FILE, primaryTitle, project);
  const expected = new Map([
    [primaryIdentity, 0],
    ...BOUNDARY_TITLES.map((title) => [identity(BOUNDARY_FILE, title, project), 0]),
  ]);
  const failures = new Set();
  let primaryTest;
  let suitesSeen = 0;
  let specsSeen = 0;
  const requireShape = (condition) => { if (!condition) throw new Error('Invalid test report shape.'); };

  function visit(suites, depth = 0) {
    requireShape(Array.isArray(suites) && depth <= 16 && suites.length <= 64);
    for (const suite of suites) {
      requireShape(isRecord(suite) && ++suitesSeen <= 64 && Array.isArray(suite.specs));
      requireShape(suite.file === PRIMARY_FILE || suite.file === BOUNDARY_FILE);
      requireShape(suite.specs.length <= 32);
      for (const spec of suite.specs) {
        requireShape(isRecord(spec) && ++specsSeen <= 32 && typeof spec.title === 'string');
        requireShape(typeof spec.file === 'string' && spec.file === suite.file);
        requireShape(Array.isArray(spec.tests) && spec.tests.length === 1);
        const test = spec.tests[0];
        requireShape(isRecord(test) && Array.isArray(test.results) && test.results.length <= 32);
        requireShape(test.results.every(isRecord));
        const key = identity(spec.file, spec.title, test.projectName);
        if (!expected.has(key)) {
          failures.add('unexpected-test-identity');
        } else {
          const count = expected.get(key) + 1;
          expected.set(key, count);
          if (count > 1) failures.add('duplicate-test-identity');
          if (key === primaryIdentity) primaryTest = test;
        }
        const result = test.results[0];
        if (spec.ok !== true || test.expectedStatus !== 'passed' || test.status !== 'expected'
          || test.results.length !== 1 || result?.status !== 'passed' || result.retry !== 0) {
          failures.add('test-failed-skipped-or-retried');
        }
      }
      if (suite.suites !== undefined) visit(suite.suites, depth + 1);
    }
  }

  try {
    requireShape(isRecord(report));
    visit(report.suites);
  } catch {
    failures.add('invalid-test-report');
  }
  if ([...expected.values()].some((count) => count === 0)) failures.add('required-test-not-executed');
  return { failures: [...failures], primaryTest: failures.size === 0 ? primaryTest : undefined };
}
