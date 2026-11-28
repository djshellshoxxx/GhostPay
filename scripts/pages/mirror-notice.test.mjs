import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMirrorNotice } from './mirror-notice.mjs';

test('script-free demo keeps the mode and shared-origin key warning above the disclosure', () => {
  const html = renderMirrorNotice([], true, false);
  const [summary, details] = html.split('<details>');
  assert.match(summary, /lang="en" dir="ltr"/);
  assert.match(summary, /Payments are disabled on every chain/);
  assert.match(summary, /Never load keys that hold real funds/);
  assert.match(details, /browser storage/);
  assert.match(details, /anti-framing/);
  assert.match(details, /SHA256SUMS/);
  assert.doesNotMatch(html, /Development build|Testnet beta/);
});

test('dedicated testnet names only bundled networks and preserves its development label', () => {
  const html = renderMirrorNotice([84532, 11155111], false, true);
  assert.ok(html.includes('data-chains="Base Sepolia (84532), Ethereum Sepolia (11155111)"'));
  assert.match(html.split('<details>')[0], /Never send real funds/);
  assert.match(html, /Development build/);
  assert.doesNotMatch(html, /Other GitHub Pages projects|Payments are disabled/);
  assert.throws(() => renderMirrorNotice([1], false, false), /Unrecognized/);
});
