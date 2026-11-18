#!/usr/bin/env node
// Post-deployment smoke test of a published GhostPay GitHub Pages site (or any static host serving the same files).
//
// Usage: node scripts/pages/smoke.mjs <site url ending in /> [--commit <40-hex>] [--timeout-s 600]
// Checks, in order (any failure exits 1):
//   1. build-info.json is served and names the expected commit (retried until --timeout-s: Pages propagates slowly);
//   2. index.html is text/html, carries the meta CSP with script-src 'self', and its entry script is served as JavaScript;
//   3. in Chromium: the app renders its main navigation, offers only the lean EVM views, shows no page errors, and makes
//      no request outside the site's project subpath while idle on the home view (no analytics, no default RPC).
// Read-only: it never connects a wallet, creates keys or contacts an RPC.
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { requestWithinPublishedSite } from './smoke-url.mjs';

const args = process.argv.slice(2);
const url = args[0];
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const commit = opt('--commit');
const timeoutS = Number(opt('--timeout-s') ?? '600');
if (url === undefined || !/^https?:\/\/[^/]+\/(?:[^?#]*\/)?$/.test(url)) {
  console.error('usage: smoke.mjs <site url ending in /> [--commit <sha>] [--timeout-s N]');
  process.exit(2);
}
if (commit !== undefined && !/^[0-9a-f]{40}$/.test(commit)) {
  console.error('--commit must be 40 hex characters');
  process.exit(2);
}
if (!Number.isSafeInteger(timeoutS) || timeoutS < 0 || timeoutS > 3600) {
  console.error('--timeout-s must be 0..3600');
  process.exit(2);
}
const site = new URL(url);
const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  const res = await fetch(new URL(path, site), { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() };
}

// 1. The deployed build is the expected commit.
const deadline = Date.now() + timeoutS * 1000;
for (;;) {
  let info;
  try {
    const r = await get('build-info.json');
    if (r.status === 200) info = JSON.parse(r.text);
  } catch {
    info = undefined;
  }
  if (info?.app === 'ghostpay-web' && (commit === undefined || info.commit === commit)) {
    console.log(`build-info: commit ${String(info.commit)}, manifests ${String(info.manifestsSha256).slice(0, 16)}...`);
    break;
  }
  if (Date.now() > deadline) fail(`build-info.json did not report ${commit ?? 'ghostpay-web'} within ${String(timeoutS)} s (last: ${JSON.stringify(info ?? null)})`);
  await sleep(15_000);
}

// 2. Static checks on the entry document.
const index = await get('');
if (index.status !== 200) fail(`index status ${String(index.status)}`);
if (!index.type.startsWith('text/html')) fail(`index content-type ${index.type}`);
if (!/<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*script-src 'self'/.test(index.text)) fail('index.html lacks the meta CSP with script-src \'self\'');
if (!index.text.includes('id="gp-pages-mirror"')) fail('index.html lacks the GitHub Pages mirror banner');
const entry = /<script type="module"[^>]*src="([^"]+)"/.exec(index.text)?.[1];
if (entry === undefined || /^(?:[a-z]+:)?\/\//i.test(entry)) fail(`entry script missing or not relative: ${String(entry)}`);
const js = await get(entry);
if (js.status !== 200 || !/javascript/.test(js.type)) fail(`entry script ${entry}: status ${String(js.status)}, type ${js.type}`);
console.log(`index.html ok; entry ${entry} served as ${js.type}`);

// 3. Browser render.
const candidates = [process.env['GHOSTPAY_CHROMIUM'], '/opt/pw-browsers/chromium'].filter((p) => typeof p === 'string' && existsSync(p));
const browser = await chromium.launch(candidates[0] === undefined ? {} : { executablePath: candidates[0], args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const foreign = [];
  const errors = [];
  page.on('request', (r) => {
    if (!requestWithinPublishedSite(r.url(), site)) foreign.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => {
    if (new URL(r.url()).origin === site.origin) errors.push(`request failed: ${r.url()}`);
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.waitFor({ state: 'visible', timeout: 30_000 });
  const banner = (await page.locator('#gp-pages-mirror').textContent()) ?? '';
  if (!banner.includes('GitHub Pages mirror')) fail('mirror banner not rendered');
  console.log(`banner: ${banner.trim().slice(0, 160)}`);
  const labels = (await nav.getByRole('button').allTextContents()).map((s) => s.trim());
  for (const excluded of ['Bitcoin', 'Solana', 'TRON', 'Policy']) {
    if (labels.some((l) => l.toLowerCase().includes(excluded.toLowerCase()))) fail(`navigation offers an excluded view: ${excluded} (${labels.join(', ')})`);
  }
  await page.waitForTimeout(3000);
  if (errors.length > 0) fail(`page errors: ${errors.join(' | ')}`);
  if (foreign.length > 0) fail(`requests outside the published Pages project while idle: ${foreign.join(', ')}`);
  console.log(`browser ok: navigation [${labels.join(', ')}], no page errors, no third-party requests`);
} finally {
  await browser.close();
}
console.log('SMOKE PASS');
