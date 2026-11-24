// node --test scripts/pages/smoke-walk.test.mjs
// SEC-46 / E-23: the post-deployment smoke visits every lean view and opens a fixture invoice. These tests pin the view
// list to the app's own lean order and labels, and check the committed fixture; the browser walk itself runs in
// smoke.mjs (and, locally, against a Pages build served by serve-pages.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LEAN_VIEW_LABELS, readFixtureFragment, unvisitedViews } from './smoke-walk.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

test('the walk covers exactly the lean views, in navigation order, with their English labels', () => {
  const shell = read('apps/web/src/AppShell.tsx');
  const order = /export const CORE_ORDER[^\n]*?\(\[([^\]]*)\]\)/.exec(shell)?.[1]?.match(/'([a-z]+)'/g)?.map((s) => s.slice(1, -1));
  assert.ok(order !== undefined && order.length >= 9, 'CORE_ORDER not found');
  const en = JSON.parse(read('apps/web/locales/en.json')).messages;
  assert.deepEqual([...LEAN_VIEW_LABELS], order.map((id) => en[`app.nav.${id}`]));
});

test('unvisitedViews reports every lean view the walk could not reach', () => {
  assert.deepEqual(unvisitedViews([...LEAN_VIEW_LABELS]), []);
  assert.deepEqual(unvisitedViews(['Home', 'Pay']), LEAN_VIEW_LABELS.filter((l) => l !== 'Home' && l !== 'Pay'));
});

test('the fixture invoice is a GhostPay fragment with no secret material', () => {
  const fragment = readFixtureFragment();
  assert.match(fragment, /^#gpi=v1\.[A-Za-z0-9_.-]+$/);
  assert.ok(fragment.length < 4096);
  const payload = Buffer.from(fragment.slice('#gpi=v1.'.length).split('.')[0] ?? '', 'base64url').toString('utf8');
  assert.match(payload, /smoke fixture \(synthetic keys, never pay\)/);
  assert.doesNotMatch(payload, /(?:11|22|33){32}/, 'no synthetic private key in the fixture');
});

test('readFixtureFragment refuses anything that is not an invoice fragment', () => {
  for (const bad of ['', 'https://evil.example/#gpi=v1.x', '#gpi=v1.x y', '#other=1']) {
    assert.throws(() => readFixtureFragment(bad), /fixture invoice/, bad);
  }
});

test('the fixture invoice carries a valid signature over a testnet invoice (parsed by the app\'s own schema package)', async () => {
  const { parseFragment } = await import('@ghostpay/invoice-schema');
  const parsed = await parseFragment(readFixtureFragment());
  assert.equal(parsed.verification.signatureValid, true);
  assert.notEqual(parsed.trust, 'invalid-signature');
  assert.equal(parsed.invoice.chainId, 84532, 'testnet chain only');
});

test('smoke.mjs walks every lean view and opens the fixture invoice, failing on any request outside the site', () => {
  const smoke = read('scripts/pages/smoke.mjs');
  assert.match(smoke, /import \{[^}]*\bwalkLeanViews\b[^}]*\} from '\.\/smoke-walk\.mjs'/);
  const walk = smoke.indexOf('await walkLeanViews(page)');
  const invoice = smoke.indexOf('await openFixtureInvoice(page, url)');
  const pass = smoke.indexOf("console.log('SMOKE PASS')");
  assert.ok(walk > 0 && invoice > walk && pass > invoice, 'walk, then invoice, then PASS');
  assert.match(smoke.slice(walk, invoice), /unvisitedViews\(visited\)[\s\S]*if \(foreign\.length > 0\) fail\(/);
  assert.match(smoke.slice(invoice, pass), /if \(errors\.length > 0\) fail\([\s\S]*if \(foreign\.length > 0\) fail\(/);
});

test('the review text the walk waits for is the Pay review title and the fixture memo', async () => {
  const { FIXTURE_REVIEW_TEXT } = await import('./smoke-walk.mjs');
  const en = JSON.parse(read('apps/web/locales/en.json')).messages;
  assert.equal(FIXTURE_REVIEW_TEXT[0], en['pay.title.review']);
  const { parseFragment } = await import('@ghostpay/invoice-schema');
  assert.equal((await parseFragment(readFixtureFragment())).invoice.memo, FIXTURE_REVIEW_TEXT[1]);
});
