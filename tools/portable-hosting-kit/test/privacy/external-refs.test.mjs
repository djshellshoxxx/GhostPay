// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanExternalReferences, privacyFindings } from '../../src/privacy/external-refs.mjs';

/** @param {Record<string, string>} files */
async function scan(files) {
  const enc = new TextEncoder();
  return scanExternalReferences(Object.keys(files).map((path) => ({ path })), async (p) => enc.encode(files[p] ?? ''));
}

test('classifies scripts, fonts, telemetry, rpc, relays, wallet services and namespaces', async () => {
  const r = await scan({
    'index.html': `<html><head>
<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
<script src="https://cdn.jsdelivr.net/npm/x@1/x.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<img src="//images.example.net/a.png">
<a href="https://docs.example.org/help">help</a>
</head></html>`,
    'assets/app.js': `const rpc = "https://mainnet.infura.io/v3/";
const ws = new WebSocket("wss://relay.example.org");
const wc = "wss://relay.walletconnect.com";
const ns = "http://www.w3.org/2000/svg";
const check = u.startsWith("https://");`,
    'assets/s.css': `@font-face { src: url(https://fonts.gstatic.com/s/inter.woff2); }`,
    'img/logo.png': 'https://not-scanned.example',
  });
  /** @param {string} prefix */
  const cat = (prefix) => r.references.find((x) => x.url.startsWith(prefix))?.category;
  assert.equal(cat('https://www.googletagmanager.com'), 'telemetry');
  assert.equal(cat('https://cdn.jsdelivr.net'), 'script');
  assert.equal(cat('https://fonts.googleapis.com'), 'font');
  assert.equal(cat('https://fonts.gstatic.com'), 'font');
  assert.equal(cat('https://mainnet.infura.io'), 'rpc');
  assert.equal(cat('wss://relay.example.org'), 'relay');
  assert.equal(cat('wss://relay.walletconnect.com'), 'wallet-connection');
  assert.equal(cat('http://www.w3.org'), 'xml-namespace');
  assert.equal(cat('https://docs.example.org'), 'documentation-link');
  assert.equal(cat('//images.example.net'), 'image');
  assert.ok(!r.references.some((x) => x.url.includes('not-scanned')), 'binary extensions are not scanned');
  assert.ok(!r.references.some((x) => x.url === 'https://'), 'bare scheme literals are ignored');
  const findings = privacyFindings(r.references);
  assert.ok(findings.some((f) => f.rule === 'external-telemetry'));
  const cdn = r.references.find((x) => x.host === 'cdn.jsdelivr.net');
  assert.ok(cdn !== undefined && cdn.loadsByDefault, 'CDN script is a default-loaded subresource');
  assert.ok(findings.some((f) => f.rule === 'external-subresource' && f.message.endsWith(`from ${cdn.host}; bundle it locally where its licence allows (${cdn.files.join(', ')})`)));
  assert.ok(findings.every((f) => f.severity === 'warning'));
});

test('output is deterministic and lists each file once per URL', async () => {
  const files = { 'b.js': 'x="https://a.example/x"', 'a.js': 'y="https://a.example/x"; z="https://a.example/x"' };
  const r1 = await scan(files);
  const r2 = await scan({ 'a.js': files['a.js'] ?? '', 'b.js': files['b.js'] ?? '' });
  assert.deepEqual(r1.references, r2.references);
  assert.deepEqual(r1.references[0]?.files, ['a.js', 'b.js']);
});

test('a clean same-origin site has no references', async () => {
  const r = await scan({ 'index.html': '<script type="module" src="./assets/a.js"></script>', 'assets/a.js': 'fetch("data.json")' });
  assert.equal(r.references.length, 0);
  assert.deepEqual(r.summary, {});
});
