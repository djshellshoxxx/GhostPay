// node --test scripts/pages/verify-pages-site.test.mjs
// Negative and positive cases for the GitHub Pages site verifier. Fixtures are synthetic; no build is needed.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkHtml, checkLeanReport, checkManifestDir, checkText, sha256sums, verifySite } from './verify-pages-site.mjs';

const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https: wss:; object-src 'none'; base-uri 'none'; form-action 'none'" />`;
const INDEX = `<!doctype html><html><head>${CSP}<link rel="icon" href="./favicon.svg"><script type="module" crossorigin src="./assets/index-abc.js"></script></head><body><p class="gp-pages-mirror" role="note" id="gp-pages-mirror"><strong>GitHub Pages mirror.</strong></p><div id="root"></div></body></html>`;
const REPORT = {
  format: 'ghostpay-lean-build/1',
  profile: 'lean',
  chunks: [{ fileName: 'assets/index-abc.js', modules: [{ id: 'src/main.tsx', renderedLength: 10 }] }],
  workers: [{ chunks: [{ fileName: 'assets/scanner.worker-x.js', modules: [{ id: 'src/lib/scanner.worker.ts', renderedLength: 5 }] }] }],
};

function site(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-pages-'));
  const files = {
    '.nojekyll': '',
    'index.html': INDEX,
    'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'build-info.json': JSON.stringify({ app: 'ghostpay-web', version: '0.1.0', commit: 'a'.repeat(40), manifestsSha256: 'd'.repeat(64) }),
    'assets/index-abc.js': 'console.log(1);',
    ...extra,
  };
  for (const [rel, body] of Object.entries(files)) {
    if (body === null) continue;
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

test('a minimal lean site passes and SHA256SUMS lists every file sorted', (t) => {
  const dir = site();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { problems, files } = verifySite(dir, REPORT, { expectCommit: 'a'.repeat(40), expectManifestsSha256: 'd'.repeat(64) });
  assert.deepEqual(problems, []);
  const sums = sha256sums(dir, files).trim().split('\n');
  assert.equal(sums.length, files.length);
  assert.deepEqual(sums.map((l) => l.split('  ./')[1]), [...files].sort());
});

test('missing .nojekyll, index.html or build-info.json fails', (t) => {
  const dir = site({ '.nojekyll': null, 'index.html': null, 'build-info.json': null });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { problems } = verifySite(dir, REPORT);
  assert.ok(problems.some((p) => p.includes('.nojekyll')));
  assert.ok(problems.some((p) => p.includes('index.html missing')));
  assert.ok(problems.some((p) => p.includes('build-info.json missing')));
});

test('source maps, _headers, lean evidence, unknown extensions and symlinks are refused', (t) => {
  const dir = site({ 'assets/index-abc.js.map': '{}', '_headers': '/*\n  X-Frame-Options: DENY', 'ghostpay-lean-build.json': '{}', 'tool.exe': 'MZ' });
  symlinkSync('/etc/passwd', join(dir, 'link.txt'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { problems } = verifySite(dir, REPORT);
  for (const needle of ['source map', '_headers: must not be published', 'ghostpay-lean-build.json: must not be published', 'tool.exe: extension', 'link.txt: symlink']) {
    assert.ok(problems.some((p) => p.includes(needle)), needle);
  }
});

test('index.html without the mirror banner fails', (t) => {
  const dir = site({ 'index.html': INDEX.replace(/<p class="gp-pages-mirror"[^]*?<\/p>/, '') });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.ok(verifySite(dir, REPORT).problems.some((p) => p.includes('mirror banner missing')));
});

test('commit and manifest digest must match the approved build', (t) => {
  const dir = site();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { problems } = verifySite(dir, REPORT, { expectCommit: 'b'.repeat(40), expectManifestsSha256: 'e'.repeat(64) });
  assert.ok(problems.some((p) => p.includes('commit')));
  assert.ok(problems.some((p) => p.includes('manifest digest')));
});

test('HTML: CSP is required and script-src must be self or none', () => {
  assert.ok(checkHtml('a.html', '<html></html>').some((p) => p.includes('missing meta Content-Security-Policy')));
  const loose = INDEX.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
  assert.ok(checkHtml('a.html', loose).some((p) => p.includes('script-src')));
  const none = INDEX.replace("script-src 'self'", "script-src 'none'");
  assert.deepEqual(checkHtml('a.html', none), []);
});

test('HTML: inline scripts, handlers, <base> and absolute or external resource references are refused', () => {
  const cases = [
    [INDEX.replace('</body>', '<script>alert(1)</script></body>'), 'inline <script>'],
    [INDEX.replace('<div id="root">', '<div id="root" onclick="x()">'), 'inline event handler'],
    [INDEX.replace('<head>', '<head><base href="/">'), '<base>'],
    [INDEX.replace('./assets/index-abc.js', '/GhostPay/assets/index-abc.js'), 'non-relative reference'],
    [INDEX.replace('./favicon.svg', 'https://cdn.example/favicon.svg'), 'non-relative reference'],
    [INDEX.replace('./favicon.svg', '//cdn.example/favicon.svg'), 'non-relative reference'],
    [INDEX.replace('./favicon.svg', 'javascript:alert(1)'), 'reference with scheme'],
    [INDEX.replace('</body>', '<a href="https://example.org/" target="_blank">x</a></body>'), 'rel=noopener'],
  ];
  for (const [html, needle] of cases) assert.ok(checkHtml('x.html', html).some((p) => p.includes(needle)), needle);
  // External plain navigation links are allowed (help pages cite specifications).
  assert.deepEqual(checkHtml('x.html', INDEX.replace('</body>', '<a href="https://eips.ethereum.org/EIPS/eip-5564" rel="noopener noreferrer">EIP</a></body>')), []);
});

test('HTML: commented CSP is not an active browser policy', () => {
  const commented = INDEX.replace(CSP, `<!-- ${CSP} -->`);
  assert.ok(checkHtml('x.html', commented).some((p) => p.includes('missing meta Content-Security-Policy')));
});

test('HTML: external script and image refs are refused regardless of attribute quoting', () => {
  for (const html of [
    INDEX.replace('src="./assets/index-abc.js"', "src='https://cdn.example.org/payload.js'"),
    INDEX.replace('href="./favicon.svg"', 'href=//cdn.example.org/favicon.svg'),
    INDEX.replace('src="./assets/index-abc.js"', 'src=/OtherSite/assets/index.js'),
  ]) {
    assert.ok(checkHtml('x.html', html).some((p) => p.includes('non-relative reference')));
  }
  assert.deepEqual(checkHtml('x.html', INDEX.replace('src="./assets/index-abc.js"', "src='./assets/index-abc.js'")), []);
});

test('HTML: comments cannot introduce fake scripts and single-quoted blank targets require noopener', () => {
  assert.deepEqual(checkHtml('x.html', `${INDEX}<!-- <script>alert('comment only')</script> -->`), []);
  const bad = INDEX.replace('</body>', "<a href='https://example.org/' target='_blank'>x</a></body>");
  assert.ok(checkHtml('x.html', bad).some((p) => p.includes('rel=noopener')));
  assert.deepEqual(checkHtml('x.html', bad.replace("target='_blank'", "target='_blank' rel='noopener noreferrer'")), []);
});

test('secret-shaped strings and public anvil keys are refused; curve constants are not', () => {
  assert.ok(checkText('a.js', 'k="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"').length > 0);
  assert.ok(checkText('a.js', 'u="https://mainnet.infura.io/v3/0123456789abcdef0123456789abcdef"').length > 0);
  assert.ok(checkText('a.js', 'u="https://eth-mainnet.g.alchemy.com/v2/abcdefghijklmnopqrstuvwxyz012345"').length > 0);
  assert.ok(checkText('a.js', `t="ghp_${'A'.repeat(36)}"`).length > 0);
  assert.ok(checkText('a.js', `-----BEGIN EC PRIVATE ${'KEY'}-----`).length > 0); // split: see scripts/scan-secrets.sh
  // secp256k1 group order: a 64-hex constant that every bundle legitimately contains.
  assert.deepEqual(checkText('a.js', 'n=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n'), []);
});

test('lean report: wrong profile, missing workers and excluded modules fail', () => {
  assert.ok(checkLeanReport({ ...REPORT, profile: 'full' }).some((p) => p.includes('lean profile')));
  assert.ok(checkLeanReport({ ...REPORT, workers: [] }).some((p) => p.includes('worker evidence')));
  for (const id of ['../../apps/relayer/src/server.ts', 'src/features/btc/BtcView.tsx', 'src/features/solana/x.ts', 'src/features/tron/x.ts', 'src/features/policy/PolicyView.tsx', '../../packages/policy-scheme/dist/index.js', '../../node_modules/@ghostpay/chain-solana/dist/index.js', 'node:fs']) {
    const bad = { ...REPORT, chunks: [{ fileName: 'a.js', modules: [{ id, renderedLength: 1 }] }] };
    assert.ok(checkLeanReport(bad).some((p) => p.includes('excluded module')), id);
  }
  // A tree-shaken (zero-length) reference is not rendered code.
  assert.deepEqual(checkLeanReport({ ...REPORT, chunks: [{ fileName: 'a.js', modules: [{ id: 'src/features/btc/x.ts', renderedLength: 0 }] }] }), []);
});

test('manifests: testnets only; mainnet chain ids fail closed', () => {
  assert.deepEqual(checkManifestDir(['README.md']), { problems: [], chainIds: [] });
  assert.deepEqual(checkManifestDir(['84532.json', '11155111.json']).chainIds, [84532, 11155111].sort((a, b) => a - b));
  for (const id of [1, 8453, 10, 42161, 137, 56, 43114, 31337]) {
    assert.ok(checkManifestDir([`${String(id)}.json`]).problems.length === 1, String(id));
  }
});
