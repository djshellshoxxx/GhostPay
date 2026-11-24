import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Local acceptance of the actual built module in a native browser realm.
// Run after `npm run build -w @ghostpay/ux-presets`.
const root = new URL('../../../', import.meta.url);
const dist = new URL('packages/ux-presets/dist/', root);
const modules = new Map(await Promise.all(['seal.js', 'types.js'].map(async (name) => [
  `/${name}`, await readFile(new URL(name, dist)),
])));
const executablePath = process.env.GHOSTPAY_CHROMIUM;
assert.ok(executablePath, 'GHOSTPAY_CHROMIUM must name the installed browser executable');
const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Local CryptoKey acceptance</title>');
    return;
  }
  const body = modules.get(path);
  if (body === undefined) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
  response.end(body);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-background-networking'],
  });
  const page = await browser.newPage();
  await page.route('**/*', (route) => (
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
  ));
  await page.goto(origin);
  const checks = await page.evaluate(async () => {
    const results = [];
    const check = (name, condition) => {
      if (!condition) throw new Error(`Acceptance failed: ${name}`);
      results.push(name);
    };
    check('secure browser context and native WebCrypto', isSecureContext && typeof CryptoKey === 'function' && !!crypto.subtle);
    const { resolveKey, seal, open } = await import('/seal.js');
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const native = await resolveKey(key, crypto);
    check('native nonextractable key retains identity', native.ok && native.value === key && !key.extractable);
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const imported = await resolveKey(raw, crypto);
    check('raw 32-byte key imports as nonextractable', imported.ok && imported.value instanceof CryptoKey && !imported.value.extractable);
    raw.fill(0);
    const text = 'GhostPay local synthetic browser acceptance';
    const payload = new TextEncoder().encode(text);
    for (const [label, current] of [['native', key], ['imported', imported.value]]) {
      const first = await seal(current, crypto, 'synthetic-slot', payload);
      const second = await seal(current, crypto, 'synthetic-slot', payload);
      check(`${label} seal uses a fresh IV`, first !== second);
      const opened = await open(current, crypto, 'synthetic-slot', first);
      check(`${label} encryption round trip`, opened.ok && new TextDecoder().decode(opened.value) === text);
      const wrongSlot = await open(current, crypto, 'different-slot', first);
      check(`${label} slot-bound authentication`, !wrongSlot.ok && wrongSlot.error.code === 'decrypt-failed');
    }
    const wrongSize = await resolveKey(new Uint8Array(31), crypto);
    check('invalid raw key length retains typed error', !wrongSize.ok && wrongSize.error.code === 'bad-key');
    const copiedMetadata = { type: 'secret', algorithm: { name: 'AES-GCM', length: 256 }, usages: ['encrypt', 'decrypt'] };
    const metadataResult = await resolveKey(copiedMetadata, crypto);
    check('ordinary metadata object is rejected', !metadataResult.ok && metadataResult.error.code === 'bad-key');
    return results;
  });
  process.stdout.write(`${JSON.stringify({
    outcome: 'passed',
    browser: await browser.version(),
    executablePath,
    moduleDirectory: fileURLToPath(dist),
    moduleSha256: Object.fromEntries([...modules].map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')])),
    checks,
  }, null, 2)}\n`);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
