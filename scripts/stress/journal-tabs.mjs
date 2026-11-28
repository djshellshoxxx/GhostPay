import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = resolve(process.argv[2] ?? '.');
const project = createRequire(resolve(root, 'package.json'));
const { build } = await import(pathToFileURL(project.resolve('vite')));
const browsers = project('playwright');
const bundle = await build({
  root, configFile: false, logLevel: 'error',
  build: {
    write: false,
    lib: { entry: resolve(root, 'apps/web/src/lib/duplicateAttemptJournal.ts'), formats: ['es'] },
  },
});
const assets = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(result => result.output);
assert.equal(assets.length, 1);
const server = createServer((req, res) => {
  if (req.url === '/journal.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    return res.end(assets[0].code);
  }
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return res.end('<!doctype html><title>GhostPay journal stress fixture</title>');
  }
  res.writeHead(404); res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const account = '0x' + '1'.repeat(40);
const field = n => '0x' + n.toString(16).padStart(64, '0');

async function openTab(context) {
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(async () => { window.journal = await import('/journal.js'); });
  return page;
}
async function submit(tab, index) {
  return tab.evaluate(async ({ account, key, hash }) => {
    const { beginAttempt, finishReturnedAttempt, withAttemptJournal } = window.journal;
    let record;
    try {
      record = await withAttemptJournal(storage => beginAttempt({ account, key, kind: 'payment', chainId: 84532 }, storage));
    } catch (error) {
      return { refused: error.translation?.key ?? String(error) };
    }
    await finishReturnedAttempt(record, hash);
    return { accepted: record.id };
  }, { account, key: field(index), hash: field(1000 + index) });
}
async function trial(context) {
  const tabs = await Promise.all(Array.from({ length: 6 }, () => openTab(context)));
  const start = performance.now();
  const race = await Promise.all(tabs.map(tab => submit(tab, 0)));
  const duplicate = 'error.duplicateAttemptJournal.aPreviousWalletAttemptForThisActionAlreadyExistsIn';
  assert.equal(race.filter(x => x.accepted).length, 1, JSON.stringify(race));
  assert.equal(race.filter(x => x.refused === duplicate).length, 5, JSON.stringify(race));
  const ids = new Set(race.filter(x => x.accepted).map(x => x.accepted));
  await Promise.all(tabs.map(async (page, slot) => {
    for (let i = slot + 1; i < 128; i += tabs.length) {
      const result = await submit(page, i);
      assert.ok(result.accepted, JSON.stringify(result));
      ids.add(result.accepted);
    }
  }));
  assert.equal(ids.size, 128);
  const overflow = await Promise.all(tabs.map((tab, i) => submit(tab, 128 + i)));
  const atLimit = 'error.duplicateAttemptJournal.theWalletAttemptJournalReachedItsSafetyLimitReviewAnd';
  assert.ok(overflow.every(x => x.refused === atLimit), JSON.stringify(overflow));
  // Keep the context alive, then read from a new document after all writer tabs have closed.
  await Promise.all(tabs.map(tab => tab.close()));
  const fresh = await openTab(context);
  const rows = await fresh.evaluate(async () => {
    await window.journal.migrateBrowserAttempts();
    return window.journal.readAttempts();
  });
  assert.equal(rows.length, 128);
  assert.deepEqual(new Set(rows.map(row => row.id)), ids);
  const byKey = new Map(rows.map(row => [row.key, row]));
  for (let i = 0; i < 128; i++) {
    const row = byKey.get(field(i));
    assert.ok(row); assert.equal(row.hash, field(1000 + i)); assert.equal(row.status, 'submitted');
    assert.equal(row.chainId, 84532); assert.equal(row.account, account);
  }
  return { tabs: 6, sameKeyAccepted: 1, duplicatesRefused: 5, atCapacityRefused: 6, recovered: rows.length, durationMs: Math.round(performance.now() - start) };
}

try {
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const executablePath = process.env['GHOSTPAY_' + name.toUpperCase()];
    const launchOptions = { ...(executablePath ? { executablePath } : {}), ...(name === 'chromium' ? { args: ['--disable-gpu'] } : {}) };
    const browser = await browsers[name].launch(launchOptions);
    try {
      for (let round = 1; round <= 3; round++) {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        try {
          const result = await trial(context);
          console.log(JSON.stringify({ browser: name, version: browser.version(), round, ...result }));
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
