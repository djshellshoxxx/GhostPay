// @ts-check
// Ordinary-browser smoke test (opt-in: HK_BROWSER_TESTS=1). Loads the preview of the demo archive (root and subpath)
// and of the real GhostPay build in headless Chromium and checks that pages render under their CSP with no
// violations or console errors. This is NOT a Tor Browser / I2P / wallet test: it only shows the packaged bytes and
// headers work in a normal browser on a loopback (secure-context) origin.
// Page-side checks are passed as expression strings: they run in the browser, not in Node.
// playwright-core comes from the repository root devDependencies; the kit itself has no dependency on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, runPreview } from '../../src/cli.mjs';
import { writeDemoSite } from '../../src/demo/demo-site.mjs';

const require = createRequire(import.meta.url);
/** @returns {any} */
function loadPlaywright() {
  try {
    return require('playwright-core');
  } catch {
    return null;
  }
}
const pw = loadPlaywright();
const skip = process.env['HK_BROWSER_TESTS'] !== '1' ? 'set HK_BROWSER_TESTS=1 (needs a Playwright Chromium build)' : pw === null ? 'playwright-core not installed at the repository root' : false;

/**
 * Open url, return console errors, CSP violations and failed same-origin requests.
 * @param {any} browser
 * @param {string} url
 * @param {(page: any) => Promise<void>} check
 */
async function visit(browser, url, check) {
  const page = await browser.newPage();
  /** @type {string[]} */
  const problems = [];
  page.on('console', (/** @type {any} */ m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (/** @type {any} */ e) => problems.push(`pageerror: ${String(e)}`));
  page.on('requestfailed', (/** @type {any} */ r) => problems.push(`requestfailed: ${r.url()}`));
  page.on('response', (/** @type {any} */ r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await check(page);
  await page.close();
  return problems;
}

test('demo and GhostPay render in Chromium under their CSP (preview, root and subpath)', { skip }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hk-browser-'));
  const browser = await pw.chromium.launch();
  try {
    await writeDemoSite(join(dir, 'site'));
    const r = await main(['package', join(dir, 'site'), '--out', join(dir, 'demo.zip')], { out: () => {}, err: () => {}, cwd: dir, env: {} });
    assert.equal(r, 0);
    for (const basePath of ['/', '/mirror/demo/']) {
      const h = await runPreview(join(dir, 'demo.zip'), { port: '0', 'base-path': basePath });
      try {
        const base = new URL(basePath, h.url).href;
        const home = await visit(browser, base, async (page) => {
          await page.waitForFunction("(document.getElementById('facts')?.textContent ?? '').includes('Same-origin fetch: served')");
          assert.match(await page.textContent('#view'), /Home view/);
          assert.match(await page.textContent('#facts'), /Secure context: true/);
          assert.equal(await page.evaluate('getComputedStyle(document.body).maxWidth'), '672px', 'stylesheet applied');
        });
        assert.deepEqual(home, [], `home ${basePath}`);
        const deep = await visit(browser, new URL('settings', base).href, async (page) => {
          await page.waitForFunction("(document.getElementById('view')?.textContent ?? '').includes('Deep link')");
        });
        assert.deepEqual(deep, [], `deep link ${basePath}`);
        const about = await visit(browser, new URL('about/', base).href, async (page) => {
          assert.match(await page.textContent('h1'), /About/);
        });
        assert.deepEqual(about, [], `about ${basePath}`);
      } finally {
        await h.close();
      }
    }

    // HK_WEB_DIST qualifies another GhostPay build (e.g. a recovered tree built in an isolated worktree).
    const webDist = process.env['HK_WEB_DIST'] ?? fileURLToPath(new URL('../../../../apps/web/dist/', import.meta.url));
    if (existsSync(join(webDist, 'index.html'))) {
      const out = join(dir, 'gp.zip');
      assert.equal(await main(['package', webDist, '--out', out], { out: () => {}, err: () => {}, cwd: dir, env: {} }), 0);
      const h = await runPreview(out, { port: '0' });
      try {
        const problems = await visit(browser, h.url, async (page) => {
          await page.waitForFunction("(document.getElementById('root')?.childElementCount ?? 0) > 0", null, { timeout: 15000 });
        });
        assert.deepEqual(problems, [], 'GhostPay app');
      } finally {
        await h.close();
      }
    }
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});
