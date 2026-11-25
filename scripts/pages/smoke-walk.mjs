// Browser walk of the post-deployment smoke test (SEC-46 / E-23): every lean view, then a fixture invoice in Pay.
// Read-only: it clicks the navigation only, never a control inside a view, so no key is created and no RPC contacted.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** English navigation labels of the lean views, in CORE_ORDER (apps/web/src/AppShell.tsx); pinned by smoke-walk.test.mjs. */
export const LEAN_VIEW_LABELS = Object.freeze([
  'Home', 'Seller keys', 'Create invoice', 'Pay', 'Scan and receive', 'Merchant dashboard', 'Sweep', 'Public registry', 'Settings',
  'About and privacy',
]);

const FIXTURE = fileURLToPath(new URL('./fixtures/smoke-invoice.txt', import.meta.url));

/**
 * The committed fixture invoice: a signed GhostPay fragment made with synthetic keys (seller hex 0x11/0x22/0x33 * 32,
 * memo "never pay"). It may be expired; opening it still exercises parsing, verification and the Pay review.
 */
export function readFixtureFragment(text = readFileSync(FIXTURE, 'utf8').trim()) {
  if (!/^#gpi=v1\.[A-Za-z0-9_.-]+$/.test(text) || text.length > 8192) throw new Error('fixture invoice is not a #gpi=v1. fragment');
  return text;
}

/** Lean views the walk did not reach. */
export function unvisitedViews(visited) {
  return LEAN_VIEW_LABELS.filter((label) => !visited.includes(label));
}

/**
 * Clicks every lean view in the main navigation and waits `settleMs` on each; returns the labels it reached (the view
 * became the current page). The caller records requests and page errors around it.
 */
export async function walkLeanViews(page, { settleMs = 750, timeoutMs = 10_000 } = {}) {
  const nav = page.getByRole('navigation', { name: 'Main' });
  const visited = [];
  for (const label of LEAN_VIEW_LABELS) {
    const button = nav.getByRole('button', { name: label, exact: true });
    if ((await button.count()) !== 1) continue;
    await button.click({ timeout: timeoutMs });
    await page.waitForFunction(
      (l) => [...document.querySelectorAll('nav button[aria-current="page"]')].some((b) => b.textContent?.trim() === l),
      label,
      { timeout: timeoutMs },
    );
    await page.waitForTimeout(settleMs);
    visited.push(label);
  }
  return visited;
}

/** Text the Pay review shows for the fixture (also once it has expired: the review then blocks it). */
export const FIXTURE_REVIEW_TEXT = Object.freeze(['Review payment', 'GhostPay Pages smoke fixture (synthetic keys, never pay)']);

/**
 * Opens the fixture invoice like a visitor following its link, waits until Pay is the current view and shows the
 * fixture's review (parsed and signature-checked in the page), then settles so late requests are recorded.
 */
export async function openFixtureInvoice(page, siteUrl, { fragment = readFixtureFragment(), settleMs = 2000, timeoutMs = 20_000 } = {}) {
  await page.goto(`${siteUrl}${fragment}`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(
    (texts) => [...document.querySelectorAll('nav button[aria-current="page"]')].some((b) => b.textContent?.trim() === 'Pay')
      && texts.every((t) => document.querySelector('main')?.textContent?.includes(t) === true),
    [...FIXTURE_REVIEW_TEXT],
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(settleMs);
}
