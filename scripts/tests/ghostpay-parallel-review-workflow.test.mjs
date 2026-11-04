import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/ghostpay-parallel-review.yml', import.meta.url),
  'utf8',
);

test('four distinct funded research lanes run in parallel', () => {
  for (const name of [
    'security-review', 'acceptance-tests', 'release-qualification', 'documentation-ux',
  ]) assert.ok(workflow.includes(`lane: ${name}`));
  assert.match(workflow, /max-parallel: 4/);
  assert.match(workflow, /fail-fast: false/);
  assert.ok(workflow.includes("cron: '43 10,22 * * *'"));
});

test('pull request validation does not start paid jobs', () => {
  assert.match(workflow, /github.event_name != 'pull_request'/);
  assert.match(workflow, /node --test scripts\/tests\/ghostpay-parallel-review-workflow\.test\.mjs/);
});

test('worker may write only its evidence and not application source', () => {
  assert.match(workflow, /Do not alter application code/);
  assert.match(workflow, /test -z "\$\(git diff --name-only HEAD\)"/);
  assert.match(workflow, /research-output\.md\|research-agent-log\.txt\|active-pr-ownership\.md/);
  assert.match(workflow, /steps.verify.outcome == 'success'/);
  assert.match(workflow, /permission-profile: ':workspace'/);
});

test('reports require provenance, independent tests and conflict analysis', () => {
  for (const title of ['Question', 'Current evidence', 'Findings',
    'Proposed independent tests', 'Ownership and overlaps',
    'Remaining uncertainties', 'Sources']) {
    assert.ok(workflow.includes(`## ${title}`), title);
  }
  assert.match(workflow, /PR #47 owns the integrated client-only core/);
  assert.match(workflow, /PR #52 owns a/);
});

test('publisher rejects duplicate lane PRs and conflicting document paths', () => {
  assert.match(workflow, /Existing research PR owns \$LANE/);
  assert.match(workflow, /grep -Fxq "\$dest" owned-paths\.txt/);
  assert.match(workflow, /draft: true/);
  assert.match(workflow, /docs\/research\/parallel-reviews/);
});

test('cost accounting never asserts an enforced ten-dollar limit', () => {
  assert.match(workflow, /'target_api_usd':10/);
  assert.match(workflow, /'actual_api_usd':None/);
  assert.match(workflow, /'hard_spending_cap':False/);
  assert.match(workflow, /timeout-minutes: 45/);
});
