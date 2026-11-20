// node --test scripts/pages/smoke-url.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestWithinPublishedSite } from './smoke-url.mjs';

const site = new URL('https://djshellshoxxx.github.io/GhostPay/');

test('permits a document and assets within the published project base', () => {
  for (const url of [
    'https://djshellshoxxx.github.io/GhostPay/',
    'https://djshellshoxxx.github.io/GhostPay/assets/index.js?v=1',
    'https://djshellshoxxx.github.io/GhostPay/build-info.json',
  ]) assert.equal(requestWithinPublishedSite(url, site), true, url);
});

test('rejects same-origin requests that escape the Pages project base', () => {
  for (const url of [
    'https://djshellshoxxx.github.io/',
    'https://djshellshoxxx.github.io/other-project/asset.js',
    'https://djshellshoxxx.github.io/GhostPayX/asset.js',
    'https://djshellshoxxx.github.io/GhostPay/../other-project/asset.js',
    'https://djshellshoxxx.github.io/GhostPay/%2e%2e/other-project/asset.js',
  ]) assert.equal(requestWithinPublishedSite(url, site), false, url);
});

test('rejects requests on other origins including sibling subdomains', () => {
  for (const url of ['https://example.com/GhostPay/', 'https://ghostpay.github.io/GhostPay/']) {
    assert.equal(requestWithinPublishedSite(url, site), false, url);
  }
});

test('retains the existing data and blob URL exemptions', () => {
  for (const url of ['data:text/plain,hello', 'blob:https://djshellshoxxx.github.io/00000000-0000-4000-8000-000000000000']) {
    assert.equal(requestWithinPublishedSite(url, site), true, url);
  }
});

// SEC-09 / E-03: the deployed page_url origin must equal the declared serving origin.
test('deployedOriginProblem accepts only the exact declared origin', async () => {
  const { deployedOriginProblem } = await import('./smoke-url.mjs');
  assert.equal(deployedOriginProblem('https://djshellshoxxx.github.io/GhostPay/', 'https://djshellshoxxx.github.io'), undefined);
  assert.equal(deployedOriginProblem('https://pay.example/', 'https://PAY.example'), undefined);
  assert.match(deployedOriginProblem('https://djshellshoxxx.github.io/GhostPay/', 'https://pay.example') ?? '', /deployed origin https:\/\/djshellshoxxx\.github\.io != declared https:\/\/pay\.example/);
  assert.match(deployedOriginProblem('http://pay.example/', 'https://pay.example') ?? '', /!= declared/);
  assert.match(deployedOriginProblem('https://pay.example:8443/', 'https://pay.example') ?? '', /!= declared/);
  for (const bad of ['', 'pay.example', 'https://pay.example/path', 'https://u@pay.example']) {
    assert.match(deployedOriginProblem('https://pay.example/', bad) ?? '', /declared origin/, bad);
  }
  assert.match(deployedOriginProblem('not a url', 'https://pay.example') ?? '', /page_url/);
});

test('smoke.mjs --expect-origin fails before any request when the origins differ', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const smoke = fileURLToPath(new URL('./smoke.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [smoke, 'https://djshellshoxxx.github.io/GhostPay/', '--expect-origin', 'https://pay.example', '--timeout-s', '0'], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /SMOKE FAIL: deployed origin https:\/\/djshellshoxxx\.github\.io != declared https:\/\/pay\.example/);
});
