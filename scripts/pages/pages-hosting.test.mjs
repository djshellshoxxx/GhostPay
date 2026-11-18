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

// SEC-09 / TB-03 / E-03: the build trusts the declared GHOSTPAY_PAGES_ORIGIN; the deployed page_url must match it.
test('build-pages hands the declared origin to the Vite build for the runtime origin guard', () => {
  const script = read('scripts/pages/build-pages.sh');
  const envBlock = /env -i ([\s\S]*?)bash -c /.exec(script)?.[1] ?? '';
  assert.match(envBlock, /VITE_GHOSTPAY_PAGES_ORIGIN="\$origin"/);
});

test('the publishing workflow fails when the deployed page_url origin differs from the declared origin', async () => {
  const { load } = await import('js-yaml');
  const wf = load(read('.github/workflows/pages.yml'));
  const declaredExpr = wf.jobs.site.steps.find((s) => s.env?.GHOSTPAY_PAGES_ORIGIN !== undefined)?.env.GHOSTPAY_PAGES_ORIGIN;
  assert.ok(typeof declaredExpr === 'string' && declaredExpr.includes('vars.GHOSTPAY_PAGES_ORIGIN'));
  const smoke = wf.jobs.smoke;
  assert.deepEqual([smoke.needs].flat(), ['deploy']);
  const step = smoke.steps.find((s) => typeof s.run === 'string' && s.run.includes('scripts/pages/smoke.mjs'));
  assert.ok(step !== undefined, 'smoke step');
  assert.equal(step.env.PAGE_URL, '${{ needs.deploy.outputs.page_url }}');
  // The same expression the build used, so a custom-domain variable and the deployed URL are compared.
  assert.equal(step.env.DECLARED_ORIGIN, declaredExpr);
  assert.match(step.run, /--expect-origin "\$DECLARED_ORIGIN"/);
  assert.match(step.run, /set -euo pipefail/);
  // No step of the smoke job may swallow the failure.
  for (const s of smoke.steps) assert.notEqual(s['continue-on-error'], true);
  assert.notEqual(smoke['continue-on-error'], true);
});
