// node --test scripts/pages/pages-hosting.test.mjs
// Static checks of the Pages build script and workflow that a unit test of a module cannot reach.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkHtml } from './verify-pages-site.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

// SEC-40 / E-12: the mirror banner's "how to verify" link must not navigate away from loaded, unsaved keys.
test('the mirror banner link opens a new tab without an opener or referrer', () => {
  const script = read('scripts/pages/build-pages.sh');
  const banner = /const banner = `(<p class="gp-pages-mirror"[^`]*<\/p>)`;/.exec(script)?.[1];
  assert.ok(banner !== undefined, 'banner template not found in build-pages.sh');
  const anchors = [...banner.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(anchors.length > 0);
  for (const a of anchors) {
    assert.match(a, /\btarget="_blank"/, a);
    const rel = /\brel="([^"]*)"/.exec(a)?.[1]?.split(/\s+/) ?? [];
    assert.ok(rel.includes('noopener') && rel.includes('noreferrer'), a);
  }
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'" />`;
  const html = `<!doctype html><html><head>${csp}</head><body>${banner.replace(/\$\{[^}]*\}/g, '')}</body></html>`;
  assert.deepEqual(checkHtml('index.html', html), []);
});
