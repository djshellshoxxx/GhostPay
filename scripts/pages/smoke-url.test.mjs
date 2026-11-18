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
