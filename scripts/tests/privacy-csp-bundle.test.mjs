// TM5 integration: configured connect-src is policy data, never a bundle-wide host allowlist.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { applyCspToDist } from '../../apps/web/scripts/apply-csp.mjs';
import { BROAD, connectSrc } from '../../apps/web/scripts/csp.mjs';
import { scanBundle } from '../../apps/web/scripts/scan-bundle.mjs';

const origins = ['https://rpc.example.invalid', 'wss://rpc.example.invalid'];
const configured = connectSrc(origins);
const policy = (connect = BROAD) => `default-src 'self'; script-src 'self'; style-src 'self'; ${connect}; object-src 'none'; frame-ancestors 'none'`;
const meta = (connect = BROAD) => `<meta http-equiv="Content-Security-Policy" content="${policy(connect)}">`;
const html = (connect = BROAD) => `<!doctype html><html><head>${meta(connect)}<meta name="referrer" content="no-referrer"><script type="module" src="./assets/app.js"></script></head><body></body></html>`;
const dirs = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(connect = BROAD) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-tm5-bundle-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), html(connect));
  writeFileSync(join(dir, '_headers'), `/*\n  Content-Security-Policy: ${policy(connect)}\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=()\n`);
  writeFileSync(join(dir, 'assets/app.js'), 'console.log(1);');
  return dir;
}

const scan = (dir, options = {}) => scanBundle(dir, undefined, undefined, { connectOrigins: origins, requireTight: true, ...options });
function editHtml(dir, edit) {
  const path = join(dir, 'index.html');
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
}

for (const profile of ['full', 'lean']) {
  test(`TM5 ${profile} build accepts configured origins only as enforcing connect-src data`, () => {
    const dir = fixture();
    if (profile === 'lean') writeFileSync(join(dir, 'ghostpay-lean-build.json'), JSON.stringify({ chunks: [], workers: [] }));
    applyCspToDist(dir, ['HTTPS://RPC.Example.invalid:443/', 'wss://rpc.example.invalid:443', origins[0]]);
    assert.deepEqual(scan(dir), []);
  });
}

test('TM5 scanner uses the same strict environment configuration as apply-csp', () => {
  const dir = fixture(configured);
  const savedOrigins = process.env['GHOSTPAY_CONNECT_ORIGINS'];
  const savedTight = process.env['GHOSTPAY_REQUIRE_TIGHT_CSP'];
  try {
    process.env['GHOSTPAY_CONNECT_ORIGINS'] = 'HTTPS://RPC.Example.invalid:443,wss://rpc.example.invalid';
    process.env['GHOSTPAY_REQUIRE_TIGHT_CSP'] = '1';
    assert.deepEqual(scanBundle(dir), []);
    process.env['GHOSTPAY_REQUIRE_TIGHT_CSP'] = 'true';
    assert.match(scanBundle(dir).join('\n'), /GHOSTPAY_REQUIRE_TIGHT_CSP/);
  } finally {
    if (savedOrigins === undefined) delete process.env['GHOSTPAY_CONNECT_ORIGINS'];
    else process.env['GHOSTPAY_CONNECT_ORIGINS'] = savedOrigins;
    if (savedTight === undefined) delete process.env['GHOSTPAY_REQUIRE_TIGHT_CSP'];
    else process.env['GHOSTPAY_REQUIRE_TIGHT_CSP'] = savedTight;
  }
});

test('TM5 scanner never infers an origin allowlist from artifact contents', () => {
  assert.match(scan(fixture(configured), { connectOrigins: [], requireTight: false }).join('\n'), /unexpected origin/);
  assert.deepEqual(scan(fixture(), { connectOrigins: [], requireTight: false }), []);
  assert.match(scan(fixture(), { connectOrigins: [] }).join('\n'), /empty.*tight/i);
});

test('TM5 scanner rejects null caller configuration instead of treating it as the environment default', () => {
  assert.match(scan(fixture(), { connectOrigins: null, requireTight: false }).join('\n'), /GHOSTPAY_CONNECT_ORIGINS/);
});

test('TM5 existing no-config scanner callers retain their ownOrigin behavior', () => {
  const dir = fixture('');
  writeFileSync(join(dir, 'assets/app.js'), 'const own="https://owner.example.invalid";');
  assert.deepEqual(scan(dir, { connectOrigins: [], requireTight: false, ownOrigin: 'https://owner.example.invalid' }), []);
});

test('TM5 configured scanner rejects a stale header even when the meta matches', () => {
  const dir = fixture(configured);
  const path = join(dir, '_headers');
  writeFileSync(path, readFileSync(path, 'utf8').replace(configured, BROAD));
  assert.match(scan(dir).join('\n'), /_headers:.*broad connect-src/);
});

for (const origin of ['https://*.example.invalid', 'https://rpc.example.invalid/v2/tm5_fixture_token',
  'https://user:tm5_fixture_token@rpc.example.invalid', 'https://rpc.example.invalid; script-src *']) {
  test('TM5 direct scanner configuration rejects unsafe origins without echoing credentials', () => {
    const result = scan(fixture(configured), { connectOrigins: [origin] }).join('\n');
    assert.match(result, /GHOSTPAY_CONNECT_ORIGINS/);
    assert.ok(!result.includes('tm5_fixture_token'));
  });
}

test('TM5 scanner preserves ownOrigin compatibility without treating it as a CSP host allowance', () => {
  const dir = fixture(configured);
  writeFileSync(join(dir, 'assets/app.js'), 'const own="https://owner.example.invalid";');
  assert.deepEqual(scan(dir, { ownOrigin: 'https://owner.example.invalid' }), []);
  assert.match(scan(dir).join('\n'), /assets\/app.js: unexpected origin/);
  writeFileSync(join(dir, 'assets/app.js'), 'const own="https://owner.example.invalid/path";');
  assert.match(scan(dir, { ownOrigin: 'https://owner.example.invalid' }).join('\n'), /assets\/app.js: unexpected origin/);
});

for (const [name, connect] of [
  ['missing directive', ''],
  ['broad default', BROAD],
  ['wildcard', "connect-src 'self' *"],
  ['stale origin', "connect-src 'self' https://old.example.invalid"],
  ['duplicate directive', `${configured}; ${configured}`],
  ['encoded unexpected origin', "connect-src 'self' https&#58;//evil.example.invalid"],
  ['encoded expected origins', configured.replaceAll('://', '&#58;//')],
  ['non-ASCII source separator', configured.replace(' wss:', '\u00a0wss:')],
]) {
  test(`TM5 configured scanner rejects ${name} in the actual policy`, () => {
    const dir = fixture(configured);
    writeFileSync(join(dir, 'index.html'), html(connect));
    assert.notDeepEqual(scan(dir), []);
  });
}

for (const [name, transform] of [
  ['comment', (tag) => `<!-- ${tag} -->`],
  ['template', (tag) => `<template>${tag}</template>`],
  ['noscript', (tag) => `<noscript>${tag}</noscript>`],
  ['text script', (tag) => `<script type="text/plain">${tag}</script>`],
  ['misleading attribute', (tag) => `<div data-policy='${tag}'></div>`],
  ['late head policy', (tag) => `<script src="./early.js"></script>${tag}`],
  ['body policy', (tag) => `</head><body>${tag}`],
  ['duplicate policies', (tag) => `${tag}${tag}`],
  ['late duplicate policy', (tag) => `${tag}<script src="./early.js"></script>${meta(BROAD)}`],
  // Add a duplicate attribute to the single fixture meta tag, whose final character is its closing bracket.
  ['duplicate content after valid policy', (tag) => `${tag.slice(0, -1)} content="connect-src *">`],
  ['duplicate content before valid policy', (tag) => tag.replace(' content=', ' content="connect-src *" content=')],
  ['duplicate http-equiv', (tag) => tag.replace(' http-equiv=', ' http-equiv="x" http-equiv=')],
]) {
  test(`TM5 ${name} cannot gain a configured-origin exemption`, () => {
    const dir = fixture(configured);
    editHtml(dir, (source) => source.replace(meta(configured), transform(meta(configured))));
    assert.notDeepEqual(scan(dir), []);
  });
}

for (const [name, transform] of [
  ['report-uri directive', (source) => source.replace("object-src 'none'", `report-uri ${origins[0]}; object-src 'none'`)],
  ['img-src directive', (source) => source.replace("object-src 'none'", `img-src ${origins[0]}; object-src 'none'`)],
  ['another meta attribute', (source) => source.replace('http-equiv=', `data-endpoint="${origins[0]}" http-equiv=`)],
  ['body text', (source) => source.replace('</body>', `${origins[0]}</body>`)],
  ['another element attribute', (source) => source.replace('</body>', `<div data-endpoint="${origins[0]}"></div></body>`)],
  ['HTML comment', (source) => source.replace('</body>', `<!-- ${origins[0]} --></body>`)],
  ['image resource', (source) => source.replace('</body>', `<img src="${origins[0]}"></body>`)],
  ['script resource', (source) => source.replace('./assets/app.js', `${origins[0]}/app.js`)],
  ['stylesheet resource', (source) => source.replace('</head>', `<link rel="stylesheet" href="${origins[0]}/app.css"></head>`)],
]) {
  test(`TM5 configured hosts remain forbidden in ${name}`, () => {
    const dir = fixture(configured);
    editHtml(dir, transform);
    assert.match(scan(dir).join('\n'), /index.html: unexpected origin/);
  });
}

for (const [name, text] of [
  ['assets/app.js', `const endpoint="${origins[0]}";`],
  ['assets/app.css', `body{background:url(${origins[0]}/image.png)}`],
  ['assets/scanner.worker.js', `fetch("${origins[0]}");`],
  ['help.html', html("connect-src 'none'").replace('</body>', `<p>${origins[0]}</p></body>`)],
]) {
  test(`TM5 configured origins do not become allowed hosts in ${name}`, () => {
    const dir = fixture(configured);
    writeFileSync(join(dir, name), text);
    assert.match(scan(dir).join('\n'), /unexpected origin/);
  });
}

for (const [markup, diagnostic] of [
  ['<script>alert(1)</script>', /inline <script>/],
  ['<style>body{color:red}</style>', /inline <style>/],
  ['<div onload="alert(1)"></div>', /inline event handler/],
]) {
  test('TM5 connect-src exemption leaves inline-code gates active', () => {
    const dir = fixture(configured);
    editHtml(dir, (source) => source.replace('</body>', `${markup}</body>`));
    assert.match(scan(dir).join('\n'), diagnostic);
  });
}

test('TM5 configured application policy does not replace static help-page CSP rules', () => {
  const dir = fixture(configured);
  writeFileSync(join(dir, 'help.html'), html("connect-src 'none'").replace('</body>', '<a href="https://docs.example.invalid/guide">Documentation</a></body>'));
  assert.deepEqual(scan(dir), []);
});
