import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/ghostpay-codex-cloud.yml', import.meta.url),
  'utf8',
);
const mergeAt = workflow.indexOf('gh pr merge');
const beforeMerge = workflow.slice(0, mergeAt);

test('integrate has a merge command to guard', () => {
  assert.ok(mergeAt > 0);
});

test('merge is gated on same-repository head (A5-1)', () => {
  // Integration enforces same-repo in the jq eligibility filter (head.repo == base.repo).
  assert.match(beforeMerge, /isCrossRepository|\.head\.repo\.full_name == \.base\.repo\.full_name/);
});

test('merge is gated on an explicit PR author allowlist (A5-1)', () => {
  // Integration enforces the author allowlist in the jq eligibility filter (owner or github-actions[bot]).
  assert.match(beforeMerge, /ALLOWED_AUTHORS|\.user\.login == "github-actions\[bot\]" or \.user\.login == \$owner/);
  assert.match(beforeMerge, /author/);
});

test('merge requires a current-head APPROVED review from a permitted non-bot reviewer (A5-1)', () => {
  assert.match(beforeMerge, /APPROVED/);
  assert.match(beforeMerge, /commit_id/);
  assert.match(beforeMerge, /collaborators\/\$\{?reviewer\}?\/permission/);
  assert.match(beforeMerge, /\bwrite\b.*\bmaintain\b.*\badmin\b|admin\|maintain\|write|maintain\|admin\|write/);
  assert.match(beforeMerge, /\[bot\]/);
});

test('existing check-run gate is kept before merge', () => {
  assert.match(beforeMerge, /secrets-and-egress/);
});

test('false branch-protection comment is removed (A5-1)', () => {
  assert.doesNotMatch(workflow, /GitHub still enforces/);
});
