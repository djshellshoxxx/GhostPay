// TM5: exercise the enforced artifact policy, including the Pages build path.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';
import { BROAD, connectSrc, parseOrigins } from '../../apps/web/scripts/csp.mjs';
import { applyCspToDist, checkCspDist } from '../../apps/web/scripts/apply-csp.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dirs = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const policy = (connect = BROAD) => `default-src 'self'; script-src 'self'; ${connect}; object-src 'none'`;
const html = (connect = BROAD) => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy(connect)}"></head><body></body></html>`;
function fixture(connect = BROAD) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-tm5-'));
  dirs.push(dir);
  writeFileSync(join(dir, '_headers'), `/*\n  Content-Security-Policy: ${policy(connect)}\n`);
  writeFileSync(join(dir, 'index.html'), html(connect));
  return dir;
}
const origins = ['https://rpc.example.org'];

test('TM5 normalizes and deduplicates HTTPS/WSS origins without widening them', () => {
  assert.deepEqual(parseOrigins('HTTPS://RPC.Example.org:443/,wss://WS.example.org:443,https://rpc.example.org,https://[::1]:8545'),
    ['https://rpc.example.org', 'wss://ws.example.org', 'https://[::1]:8545']);
});

for (const input of ['https://*.example.org', 'https://rpc.example.org;data:', 'https://rpc.example.org\'x',
  'https://rpc.example.org"x', 'https:rpc.example.org', 'https://rpc.exa\nmple.org', 'https://rpc.example.org\\',
  'https://rpc.example.org/?api_key=tm5_fixture_token', 'https://user:tm5_fixture_token@rpc.example.org',
  'https://rpc.example.org/v2/tm5_fixture_token']) {
  test(`TM5 refuses unsafe or non-origin configuration case ${JSON.stringify(input).replace(/tm5_fixture_token/g, 'fixture')}`, () => {
    assert.throws(() => parseOrigins(input), (error) => {
      assert.match(error.message, /GHOSTPAY_CONNECT_ORIGINS/);
      assert.ok(!error.message.includes('tm5_fixture_token'), 'diagnostics must not echo endpoint credentials');
      return true;
    });
  });
}

test('TM5 direct helper input cannot inject CSP or HTML syntax', () => {
  assert.throws(() => connectSrc(['https://rpc.example.org; script-src *']));
});

test('TM5 requires the Pages HTML artifact even when _headers is present', () => {
  const dir = fixture(connectSrc(origins));
  rmSync(join(dir, 'index.html'));
  assert.match(checkCspDist(dir, origins).join('\n'), /index.html.*missing/);
});

test('TM5 validates the broad development profile too', () => {
  const dir = fixture("connect-src *");
  assert.notDeepEqual(checkCspDist(dir, []), []);
});

for (const page of [
  `<!doctype html><html><head><!-- <meta http-equiv="Content-Security-Policy" content="${policy(connectSrc(origins))}"> --></head><body></body></html>`,
  `<!doctype html><html><head><meta content="${policy(connectSrc(origins))}"></head><body></body></html>`,
  `<!doctype html><html><head></head><body><meta http-equiv="Content-Security-Policy" content="${policy(connectSrc(origins))}"></body></html>`,
  `<!doctype html><html><head><script type="text/plain"><meta http-equiv="Content-Security-Policy" content="${policy(connectSrc(origins))}"></script></head><body></body></html>`,
  `<!doctype html><html><head><meta http-equiv=x http-equiv="Content-Security-Policy" content="${policy(connectSrc(origins))}"></head><body></body></html>`,
  `<!doctype html><html><head><div>bad head content</div><meta http-equiv="Content-Security-Policy" content="${policy(connectSrc(origins))}"></head><body></body></html>`,
  `<html><body><head><meta http-equiv="Content-Security-Policy" content="${policy(connectSrc(origins))}"></head></body></html>`,
  `<html><body><div data-example='<head><meta http-equiv="Content-Security-Policy" content="${policy(connectSrc(origins))}"></head>'></div></body></html>`,
  `<html><head><noscript><meta http-equiv="Content-Security-Policy" content="${policy(connectSrc(origins))}"></noscript></head><body></body></html>`,
  `<html><head><template><meta http-equiv="Content-Security-Policy" content="${policy(connectSrc(origins))}"></template></head><body></body></html>`,
]) {
  test('TM5 inert or mislabeled markup cannot substitute for an enforced head meta policy', () => {
    const dir = fixture(connectSrc(origins));
    writeFileSync(join(dir, 'index.html'), page);
    assert.notDeepEqual(checkCspDist(dir, origins), []);
  });
}

test('TM5 duplicate connect-src directives fail artifact qualification', () => {
  const dir = fixture(connectSrc(origins));
  writeFileSync(join(dir, 'index.html'), html(`${connectSrc(origins)}; ${connectSrc(origins)}`));
  assert.notDeepEqual(checkCspDist(dir, origins), []);
});

test('TM5 report-only headers cannot substitute for an enforced header profile', () => {
  const dir = fixture(connectSrc(origins));
  writeFileSync(join(dir, '_headers'), `/*\n  Content-Security-Policy-Report-Only: ${policy(connectSrc(origins))}\n`);
  assert.notDeepEqual(checkCspDist(dir, origins), []);
});

test('TM5 rewrites and validates real shipped HTML/header templates, idempotently', () => {
  const dir = fixture();
  writeFileSync(join(dir, '_headers'), readFileSync(join(root, 'apps/web/public/_headers'), 'utf8'));
  writeFileSync(join(dir, 'index.html'), readFileSync(join(root, 'apps/web/index.html'), 'utf8'));
  assert.equal(applyCspToDist(dir, origins).length, 2);
  assert.deepEqual(checkCspDist(dir, origins, { requireTight: true }), []);
  assert.deepEqual(applyCspToDist(dir, origins), []);
});

test('TM5 Pages builder preserves CSP configuration and runs it before bundle scanning', () => {
  const script = readFileSync(join(root, 'scripts/pages/build-pages.sh'), 'utf8');
  const envBlock = /env -i ([\s\S]*?)bash -c /.exec(script)?.[1] ?? '';
  assert.match(envBlock, /GHOSTPAY_CONNECT_ORIGINS=/);
  assert.match(envBlock, /GHOSTPAY_REQUIRE_TIGHT_CSP=/);
  assert.match(script, /node scripts\/apply-csp\.mjs "\$0" && node e2e\/devnet\/scan-dist\.mjs "\$0"/);
});

test('TM5 nginx generation preserves standard and embedding header boundaries', async () => {
  const { renderSecurityHeaders } = await import('../../deploy/nginx/render-security-headers.mjs');
  const output = fixture();
  renderSecurityHeaders(output, origins);
  const standard = readFileSync(join(output, 'security-headers.conf'), 'utf8');
  const embed = readFileSync(join(output, 'security-headers-embed.conf'), 'utf8');
  for (const artifact of [standard, embed]) {
    assert.ok(artifact.includes(`${connectSrc(origins)};`));
    assert.ok(!artifact.includes(BROAD));
    assert.ok(artifact.includes('Referrer-Policy "no-referrer"'));
  }
  assert.match(standard, /frame-ancestors 'none'/);
  assert.match(standard, /X-Frame-Options "DENY"/);
  assert.match(embed, /frame-ancestors \$gp_frame_ancestors/);
  assert.doesNotMatch(embed, /^add_header X-Frame-Options/m);
  assert.throws(() => renderSecurityHeaders(output, ['https://*.example.org']));
});

test('TM5 meta CSP must precede resource or script execution in generated HTML', () => {
  const dir = fixture(connectSrc(origins));
  writeFileSync(join(dir, 'index.html'), html(connectSrc(origins)).replace('<head>', '<head><script src="./early.js"></script>'));
  assert.notDeepEqual(checkCspDist(dir, origins), []);
});
