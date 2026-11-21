import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/ghostpay-parallel-agents.yml', import.meta.url),
  'utf8',
);

test('four independently scoped QA lanes are present', () => {
  for (const [lane, prefix] of [
    ['invoice-qa', 'packages/invoice-schema/'],
    ['recovery-qa', 'apps/web/e2e/'],
    ['tooling-qa', 'scripts/tests/'],
    ['locale-qa', 'apps/web/src/i18n/'],
  ]) {
    assert.match(workflow, new RegExp(`lane: ${lane}`));
    assert.ok(workflow.includes(`owned_prefix: ${prefix}`));
  }
  assert.match(workflow, /max-parallel: 4/);
  assert.match(workflow, /fail-fast: false/);
});

test('schedule makes two daily batches and PR validation cannot run paid agents', () => {
  assert.ok(workflow.includes("cron: '17 9,21 * * *'"));
  assert.match(workflow, /github.event_name != 'pull_request'/);
  assert.match(workflow, /node --test scripts\/tests\/ghostpay-parallel-workflow\.test\.mjs/);
});

test('paid agents are single-attempt, sandboxed and cannot publish directly', () => {
  assert.match(workflow, /permission-profile: ':workspace'/);
  assert.match(workflow, /safety-strategy: drop-sudo/);
  assert.match(workflow, /timeout-minutes: 45/);
  assert.match(workflow, /Never alter anything outside your assigned prefix/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /steps.codex.outcome == 'success'/);
});

test('publishing compares changed paths with active PR ownership twice', () => {
  assert.match(workflow, /fresh-owned-paths\.txt/);
  assert.match(workflow, /published-paths\.txt/);
  assert.match(workflow, /gh api --paginate/);
  assert.match(workflow, /git apply --check --binary/);
  assert.match(workflow, /Out-of-lane file/);
  assert.match(workflow, /Out-of-lane change/);
});

test('merge requires human exact-head review and required checks', () => {
  assert.match(workflow, /\.state=="APPROVED" and \.user\.type=="User"/);
  assert.match(workflow, /awk -v sha="\$head"/);
  assert.match(workflow, /for required in typescript contracts e2e secrets-and-egress/);
  assert.match(workflow, /--match-head-commit/);
  assert.match(workflow, /draft: true/);
});

test('cost report is honest about usage and does not assert a dollar cap', () => {
  assert.match(workflow, /"target_api_usd":10/);
  assert.match(workflow, /"actual_api_usd":None/);
  assert.match(workflow, /"billing_cap_enforced":False/);
});
