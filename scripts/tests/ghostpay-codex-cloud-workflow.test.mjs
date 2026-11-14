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
  assert.match(beforeMerge, /isCrossRepository/);
});

test('merge is gated on an explicit PR author allowlist (A5-1)', () => {
  assert.match(beforeMerge, /ALLOWED_AUTHORS/);
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
