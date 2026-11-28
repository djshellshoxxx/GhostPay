// Runs the real smoke entrypoint with a synthetic Playwright transport and local fetch responses.
// This qualifies the smoke gate only: no browser is launched and no network request is made.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const smoke = fileURLToPath(new URL('./smoke.mjs', import.meta.url));
const site = 'https://pages.example/GhostPay/';
const secret = 'synthetic-smoke-passphrase-do-not-log';
let fixture;

before(() => {
  fixture = mkdtempSync(join(tmpdir(), 'ghostpay-smoke-errors-'));
  writeFileSync(join(fixture, 'loader.mjs'), `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@playwright/test') {
    return { url: new URL('./playwright.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`);
  writeFileSync(join(fixture, 'bootstrap.mjs'), `
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
globalThis.fetch = async (url) => {
  const path = new URL(url).pathname;
  const body = path.endsWith('build-info.json')
    ? JSON.stringify({ app: 'ghostpay-web', commit: 'a'.repeat(40), pagesOrigin: process.env.GP_SMOKE_TEST_BUILT_ORIGIN, manifestsSha256: 'b'.repeat(64) })
    : path.endsWith('entry.js') ? 'export {}'
    : '<meta http-equiv="Content-Security-Policy" content="script-src \\'self\\'"><p id="gp-pages-mirror">GitHub Pages mirror</p><script type="module" src="./entry.js"></script>';
  return {
    status: 200,
    headers: { get: () => path.endsWith('entry.js') ? 'text/javascript' : 'text/html' },
    text: async () => body,
  };
};
`);
  writeFileSync(join(fixture, 'playwright.mjs'), `
const listeners = new Map();
const labels = ['Home', 'Seller keys', 'Create invoice', 'Pay', 'Scan and receive', 'Sweep', 'Public registry', 'Settings', 'About and privacy'];
let emitted = false;
const emit = (stage) => {
  if (emitted || stage !== process.env.GP_SMOKE_TEST_STAGE) return;
  emitted = true;
  const event = process.env.GP_SMOKE_TEST_EVENT;
  const value = event === 'console'
    ? {
        type: () => process.env.GP_SMOKE_TEST_LEVEL,
        text: () => process.env.GP_SMOKE_TEST_TEXT,
        args: () => { throw new Error('smoke must not inspect console argument objects'); },
      }
    : event === 'pageerror' ? new Error('synthetic browser failure')
    : { url: () => event === 'requestfailed' ? '${site}assets/missing.js' : 'https://other.example/request' };
  for (const listener of listeners.get(event) ?? []) listener(value);
};
const nav = {
  waitFor: async () => undefined,
  getByRole: (_role, options) => ({
    count: async () => 1,
    allTextContents: async () => labels,
    click: async () => { if (options.name === 'Scan and receive') emit('walk'); },
  }),
};
const page = {
  on: (event, listener) => { listeners.set(event, [...(listeners.get(event) ?? []), listener]); },
  url: () => page.currentUrl,
  goto: async (url) => { page.currentUrl = url; emit(url.includes('#gpi=') ? 'invoice' : 'initial'); },
  getByRole: () => nav,
  locator: () => ({ textContent: async () => 'GitHub Pages mirror' }),
  waitForFunction: async () => undefined,
  waitForTimeout: async () => undefined,
};
export const chromium = {
  launch: async () => ({
    newContext: async () => ({ newPage: async () => page }),
    close: async () => undefined,
  }),
};
`);
});
after(() => { if (fixture !== undefined) rmSync(fixture, { recursive: true, force: true }); });

function runSmoke({ stage = 'walk', event = 'console', level = 'error', text = '', url = site, approved = 'https://pages.example', built = approved, preview = false } = {}) {
  return spawnSync(process.execPath, ['--import', join(fixture, 'bootstrap.mjs'), smoke, url, '--approved-origin', approved, ...(preview ? ['--loopback-preview'] : []), '--timeout-s', '0'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=128',
      GP_SMOKE_TEST_STAGE: stage,
      GP_SMOKE_TEST_BUILT_ORIGIN: built,
      GP_SMOKE_TEST_EVENT: event,
      GP_SMOKE_TEST_LEVEL: level,
      GP_SMOKE_TEST_TEXT: text,
    },
  });
}

for (const [kind, stage] of [['caught', 'walk'], ['uncaught', 'initial'], ['recoverable', 'invoice']]) {
  test(`a ${kind} root render error fails smoke at the ${stage} checkpoint even if navigation remains usable`, () => {
    const result = runSmoke({ stage, text: `GhostPay: ${kind} render error (TypeError)` });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /SMOKE FAIL: page errors.*GhostPay render error/);
    assert.doesNotMatch(result.stdout, /SMOKE PASS/);
  });
}

test('render-error payload text never enters smoke failure output', () => {
  const result = runSmoke({ text: `GhostPay: caught render error (${secret})` });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /GhostPay render error/);
  assert.ok(!(result.stdout + result.stderr).includes(secret));
});

test('unrelated console text is neither copied nor treated as a root render failure', () => {
  const result = runSmoke({ text: secret });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /SMOKE PASS/);
  assert.ok(!(result.stdout + result.stderr).includes(secret));
});

test('non-error console messages do not enter the root-render failure collection', () => {
  const result = runSmoke({ level: 'warn', text: `GhostPay: caught render error (${secret})` });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(!(result.stdout + result.stderr).includes(secret));
});

for (const event of ['pageerror', 'requestfailed', 'request']) {
  test(`the existing ${event} failure gate remains active`, () => {
    const result = runSmoke({ event });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /SMOKE FAIL:/);
    assert.doesNotMatch(result.stdout, /SMOKE PASS/);
  });
}

for (const url of ['http://pages.example/GhostPay/', 'https://copy.example/GhostPay/', 'https://pages.example:8443/GhostPay/']) {
  test(`deployment smoke rejects the wrong served origin at ${url}`, () => {
    const r = runSmoke({ url });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /SMOKE FAIL:.*origin/);
  });
}

test('deployment smoke also rejects the wrong origin embedded in the served artifact', () => {
  const r = runSmoke({ built: 'https://other.example' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /SMOKE FAIL:.*origin/);
});

test('only an explicit local preview permits a release artifact to be inspected on loopback', () => {
  const url = 'http://127.0.0.1:4194/GhostPay/';
  assert.equal(runSmoke({ url }).status, 1);
  assert.equal(runSmoke({ url, approved: 'http://127.0.0.1:4194' }).status, 1);
  assert.equal(runSmoke({ url, approved: 'http://127.0.0.1:4194', preview: true }).status, 0);
  assert.equal(runSmoke({ url, preview: true }).status, 0);
  assert.equal(runSmoke({ url: 'https://copy.example/GhostPay/', preview: true }).status, 1);
});
