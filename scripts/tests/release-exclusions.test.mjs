// Regression tests for the emitted-artifact release-exclusion check (owner stop-work directive, AGENTS.md 2026-11-25).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { STOPPED_PRODUCTS, stoppedProductForModule } from '../../apps/web/scripts/stoppedProducts.mjs';
import { checkReportExclusions, checkSiteExclusions, verifyReleaseExclusions } from '../release/verify-release-exclusions.mjs';

const CLI = fileURLToPath(new URL('../release/verify-release-exclusions.mjs', import.meta.url));

/** One rendered module path per stopped product, in the layouts the archived product branches actually use. */
const STOPPED_SAMPLES = {
  F01: ['../../packages/ux-links/src/tip.ts', '../../node_modules/@ghostpay/ux-links/dist/tip.js', 'src/features/ghosttips/TipJar.tsx'],
  F02: ['src/features/future/ghoststore/catalog.ts', 'src/features/ghost-store/Cart.tsx'],
  F04: ['src/features/future/merchant-dashboard/projection.ts', 'src/views/MerchantDashboard.tsx'],
  F08: ['src/features/future/ghostid/OfflineProfileReview.tsx'],
  F09: ['../../examples/pos-terminal/pos-session.js', '../../packages/merchant-hooks/dist/pos.js', 'src/features/ghostpos/Terminal.tsx'],
  F11: ['src/features/ghostteams/membership.ts', 'src/features/future/ghost-teams/invite.ts'],
  F12: ['src/features/ghostbridge/handoff.ts', '../../packages/p2p-offramp/src/index.ts'],
  F13: ['src/features/fiat-conversion/quoteTerms.ts', '../../packages/ux-fiat/dist/index.js', 'src/lib/offramp/provider.ts'],
  F14: ['src/features/future/multichain-routing/route.ts', '../../packages/multi-chain-router/src/index.ts'],
  P07: ['src/features/device-sync/pair.ts', 'src/lib/encrypted-device-sync.ts'],
  FUTURE: ['src/features/future/ghostproof/review.ts'],
};

/** Core modules the owner retained as shared privacy, payment and recovery functionality: never flagged. */
const CORE_SAMPLES = [
  'src/AppLean.tsx', 'src/AppShell.tsx', 'src/views/Pay.tsx', 'src/views/Scan.tsx', 'src/views/CreateInvoice.tsx',
  'src/views/SellerKeys.tsx', 'src/views/Sweep.tsx', 'src/views/Settings.tsx', 'src/components/MerchantProfilePanel.tsx',
  'src/lib/qrKinds.ts', 'src/lib/scanClient.ts', 'src/lib/clipboard.ts', 'src/i18n/message.ts', 'src/lib/scanner.worker.ts',
  '../../packages/ux-links/dist/uri.js', '../../packages/ux-vault/dist/keystore-portable.js', '../../packages/payment-uri/dist/invoice-link.js',
  '../../packages/core-crypto/dist/index.js', '../../packages/merchant-ledger/dist/index.js', '../../packages/chain-adapters/dist/quote.js',
  '/home/user/GhostPay/apps/web/src/views/Pay.tsx', 'virtual:vite/modulepreload-polyfill', '\0commonjsHelpers.js',
];

function report(modules, extra = {}) {
  return {
    format: 'ghostpay-lean-build/1', profile: 'lean',
    chunks: [{ fileName: 'assets/index.js', modules: modules.map((id) => ({ id, renderedLength: 10, renderedExports: [] })) }],
    workers: [{ chunks: [{ fileName: 'assets/scanner.worker.js', modules: [{ id: 'src/lib/scanner.worker.ts', renderedLength: 4, renderedExports: [] }] }] }],
    publicCopied: ['help.css', 'appearance.css'],
    ...extra,
  };
}

test('every stopped or deferred product named by the owner directive has a guard entry', () => {
  const ids = STOPPED_PRODUCTS.map((p) => p.id);
  for (const id of ['F01', 'F02', 'F04', 'F08', 'F09', 'F11', 'F12', 'F13', 'F14', 'P07']) assert.ok(ids.includes(id), id);
  assert.deepEqual(Object.keys(STOPPED_SAMPLES).sort(), [...ids].sort());
  assert.ok(Object.isFrozen(STOPPED_PRODUCTS) && STOPPED_PRODUCTS.every((p) => Object.isFrozen(p) && Object.isFrozen(p.modules)));
});

test('each stopped product module is attributed to that product', () => {
  for (const [id, samples] of Object.entries(STOPPED_SAMPLES)) {
    for (const sample of samples) assert.equal(stoppedProductForModule(sample)?.id, id, sample);
  }
  assert.equal(stoppedProductForModule('C:\\repo\\apps\\web\\src\\features\\future\\ghostid\\x.tsx')?.id, 'F08');
  assert.equal(stoppedProductForModule('/abs/apps/web/src/views/MerchantDashboard.tsx?v=1')?.id, 'F04');
});

test('camelCase, compound and directory spellings of stopped products are caught (review findings)', () => {
  const cases = {
    F01: ['src/components/GhostTipPanel.tsx', 'src/features/tips/index.ts'],
    F02: ['src/features/store/cart.ts', 'src/features/storefront/Shelf.tsx', 'src/lib/ghost_store.ts'],
    F04: ['src/features/merchantDashboard/Totals.tsx', 'src/features/MerchantDashboard/x.ts', 'src/features/dashboard/x.ts'],
    F08: ['src/components/GhostIdBadge.tsx', 'src/lib/ghostId.ts', 'src/lib/ghost-id.ts'],
    F09: ['src/lib/posTerminal.ts', 'src/features/pos/Keypad.tsx'],
    F11: ['src/features/teams/roster.ts', 'src/lib/GhostTeam.ts'],
    F12: ['src/lib/ghostBridge.ts', 'src/lib/p2p_offramp/client.ts'],
    F13: ['src/features/fiatConversion/terms.ts', 'src/features/FiatConversion/x.ts', 'src/features/fiat/rate.ts', 'src/lib/offRamp.ts'],
    F14: ['src/lib/multiChainRouter.ts', 'src/features/crossChain/route.ts'],
    P07: ['src/lib/encryptedDeviceSync.ts', 'src/lib/device_sync.ts'],
  };
  for (const [id, samples] of Object.entries(cases)) {
    for (const sample of samples) assert.equal(stoppedProductForModule(sample)?.id, id, sample);
  }
});

test('patterns are anchored at path segments, not substrings of core names', () => {
  for (const sample of ['src/lib/idbStore.ts', 'src/i18n/catalog.ts', 'src/lib/positions.ts', 'src/lib/tooltip.ts',
    'src/lib/offset.ts', '../../node_modules/viem/_esm/errors/chain.js', '../../packages/chain-adapters/dist/config/chains.js',
    'src/lib/multipart.ts', 'src/views/Settings.tsx']) {
    assert.equal(stoppedProductForModule(sample), undefined, sample);
  }
});

test('retained shared-core modules are never attributed to a stopped product', () => {
  for (const sample of CORE_SAMPLES) assert.equal(stoppedProductForModule(sample), undefined, sample);
  for (const bad of [undefined, null, '', 42, {}]) assert.equal(stoppedProductForModule(bad), undefined);
});

test('a clean lean report passes and counts rendered application and Worker modules', () => {
  const { problems, modules } = checkReportExclusions(report(CORE_SAMPLES));
  assert.deepEqual(problems, []);
  assert.equal(modules, CORE_SAMPLES.length + 1);
});

test('a stopped-product module rendered into a chunk or Worker fails', () => {
  for (const [id, samples] of Object.entries(STOPPED_SAMPLES)) {
    const inChunk = checkReportExclusions(report(['src/AppLean.tsx', samples[0]]));
    assert.equal(inChunk.problems.length, 1, id);
    assert.match(inChunk.problems[0], new RegExp(`stopped product ${id} `));
    const r = report(['src/AppLean.tsx']);
    r.workers[0].chunks[0].modules.push({ id: samples[0], renderedLength: 1 });
    assert.match(checkReportExclusions(r).problems.join('\n'), new RegExp(id), `${id} worker`);
  }
});

test('tree-shaken (zero-length) stopped modules are not rendered and do not fail', () => {
  const r = report(['src/AppLean.tsx']);
  r.chunks[0].modules.push({ id: 'src/features/future/ghostid/OfflineProfileReview.tsx', renderedLength: 0 });
  assert.deepEqual(checkReportExclusions(r).problems, []);
});

test('a report that cannot prove what it rendered is a failure, not a pass', () => {
  assert.deepEqual(checkReportExclusions(null).problems, ['lean report is not an object']);
  assert.deepEqual(checkReportExclusions([]).problems, ['lean report is not an object']);
  assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { profile: 'full' })).problems.join(), /lean profile/);
  assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { format: 'other' })).problems.join(), /format/);
  assert.match(checkReportExclusions(report([], { chunks: [], workers: [] })).problems.join(), /no application chunks/);
  assert.match(checkReportExclusions(report([], { chunks: [{ fileName: 'a.js' }] })).problems.join(), /no module list/);
  assert.match(checkReportExclusions(report([], { chunks: [{ fileName: 'a.js', modules: [{ renderedLength: 1 }] }] })).problems.join(), /without id/);
  for (const bad of [undefined, null, -1, Number.NaN, '5', Number.POSITIVE_INFINITY]) {
    const r = report(['src/AppLean.tsx']);
    r.chunks[0].modules[0] = { id: 'src/features/future/ghostid/x.ts', ...(bad === undefined ? {} : { renderedLength: bad }) };
    assert.match(checkReportExclusions(r).problems.join(), /missing or malformed renderedLength/, String(bad));
  }
  assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { publicCopied: 'x' })).problems.join(), /not a list/);
  assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { publicCopied: [7] })).problems.join(), /non-string/);
  assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { publicCopied: [''] })).problems.join(), /non-string or empty/);
});

test('report containers must have the writer\'s exact shapes; only an empty public-copy list is legal', () => {
  const missing = (key) => { const r = report(['src/AppLean.tsx']); delete r[key]; return checkReportExclusions(r).problems.join('\n'); };
  assert.match(missing('chunks'), /chunks is missing or not a list/);
  assert.match(missing('workers'), /workers is missing or not a list/);
  assert.match(missing('publicCopied'), /publicCopied is missing or not a list/);
  for (const bad of [{}, 'x', 3, null]) {
    assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { workers: bad })).problems.join(), /workers is missing or not a list/, String(bad));
    assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { chunks: bad })).problems.join(), /chunks is missing or not a list/, String(bad));
  }
  // A valid application chunk with malformed Worker metadata must not pass without Worker evidence.
  for (const worker of [null, {}, { chunks: 'x' }, { chunks: [{ fileName: 'w.js' }] }, { chunks: [{ modules: [] }] }, { chunks: [7] }]) {
    const { problems } = checkReportExclusions(report(['src/AppLean.tsx'], { workers: [worker] }));
    assert.ok(problems.length > 0, JSON.stringify(worker));
  }
  assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { chunks: [{ fileName: '', modules: [] }] })).problems.join(), /no fileName/);
  // The writer always records Worker evidence and per-chunk module provenance (localBuildProfile.mjs).
  assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { workers: [] })).problems.join(), /no Worker build evidence/);
  assert.match(checkReportExclusions(report(['src/AppLean.tsx'], { workers: [{ chunks: [] }] })).problems.join(), /worker 0 has an empty chunk list/);
  assert.deepEqual(checkReportExclusions(report(['src/AppLean.tsx'], { publicCopied: [] })).problems, []);
});

test('a report with no rendered application module is not evidence', () => {
  assert.match(checkReportExclusions(report([])).problems.join(), /no rendered application module evidence/);
  const r = report(['src/AppLean.tsx']);
  r.chunks[0].modules[0].renderedLength = 0;
  assert.match(checkReportExclusions(r).problems.join(), /no rendered application module evidence/);
  // Worker modules alone do not count as application evidence.
  assert.match(checkReportExclusions(report([])).problems.join(), /application/);
});

test('stopped-product public files copied into the site fail', () => {
  assert.deepEqual(checkReportExclusions(report(['src/AppLean.tsx'], { publicCopied: ['help.css', 'privacy.css', 'icons/qr.svg'] })).problems, []);
  const bad = checkReportExclusions(report(['src/AppLean.tsx'], { publicCopied: ['help.css', 'pos-terminal/index.html', 'ghostpos/terminal.html', 'device-sync/pair.js'] }));
  assert.equal(bad.problems.length, 3);
  assert.match(bad.problems[0], /F09/);
  assert.match(bad.problems[1], /F09/);
  assert.match(bad.problems[2], /P07/);
});

test('emitted site files are checked by name and symlinks are refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gp-release-excl-'));
  try {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, 'assets', 'index-abc.js'), '');
    assert.deepEqual(checkSiteExclusions(dir), { problems: [], files: 2 });
    mkdirSync(join(dir, 'ghostteams'));
    writeFileSync(join(dir, 'ghostteams', 'invite.html'), '');
    symlinkSync(join(dir, 'index.html'), join(dir, 'link.html'));
    const { problems } = checkSiteExclusions(dir);
    assert.equal(problems.length, 2);
    assert.match(problems.join('\n'), /F11 GhostTeams/);
    assert.match(problems.join('\n'), /symlink/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A site with one application chunk and one Worker chunk, plus a matching report. */
function siteWithReport() {
  const dir = mkdtempSync(join(tmpdir(), 'gp-release-prov-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html>');
  writeFileSync(join(dir, 'pages-mirror.css'), '');
  writeFileSync(join(dir, 'assets', 'index-abc.js'), '');
  writeFileSync(join(dir, 'assets', 'scanner.worker-def.js'), '');
  const r = report(['src/AppLean.tsx']);
  r.chunks[0].fileName = 'assets/index-abc.js';
  r.workers[0].chunks[0].fileName = 'assets/scanner.worker-def.js';
  return { dir, r };
}

test('site provenance: report chunks and emitted executables must match exactly', () => {
  const { dir, r } = siteWithReport();
  try {
    assert.deepEqual(checkSiteExclusions(dir, r), { problems: [], files: 4 });
    // An emitted executable the report does not prove (script, module or wasm) fails.
    for (const stray of ['assets/extra.js', 'assets/x.mjs', 'assets/y.cjs', 'assets/z.wasm', 'tips.js']) {
      writeFileSync(join(dir, stray), '');
      assert.match(checkSiteExclusions(dir, r).problems.join('\n'), /emitted executable has no lean report module proof/, stray);
      rmSync(join(dir, stray));
    }
    // A report chunk that was not emitted fails.
    rmSync(join(dir, 'assets', 'scanner.worker-def.js'));
    assert.match(checkSiteExclusions(dir, r).problems.join('\n'), /was not emitted into the site: assets\/scanner\.worker-def\.js/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a chunk with matching emitted file name but no module provenance fails (app and Worker)', () => {
  const { dir, r } = siteWithReport();
  try {
    // App: add a second chunk whose file exists in the site but whose module list is empty.
    writeFileSync(join(dir, 'assets', 'vendor-123.js'), '');
    const app = structuredClone(r);
    app.chunks.push({ fileName: 'assets/vendor-123.js', modules: [] });
    const appProblems = [...checkReportExclusions(app).problems, ...checkSiteExclusions(dir, app).problems].join('\n');
    assert.match(appProblems, /assets\/vendor-123\.js has an empty module list/);
    // Worker: the Worker chunk file exists but its module list is empty.
    const worker = structuredClone(r);
    worker.workers[0].chunks[0].modules = [];
    assert.match(checkReportExclusions(worker).problems.join('\n'), /worker 0 chunk 0 assets\/scanner\.worker-def\.js has an empty module list/);
    // Through the full verifier the same reports fail although every emitted executable is named.
    const reportDir = mkdtempSync(join(tmpdir(), 'gp-release-rep-'));
    try {
      for (const bad of [app, worker]) {
        const path = join(reportDir, 'r.json');
        writeFileSync(path, JSON.stringify(bad));
        assert.match(verifyReleaseExclusions(path, dir).problems.join('\n'), /empty module list/);
      }
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('site provenance: chunk names must be unique safe relative paths', () => {
  const { dir, r } = siteWithReport();
  try {
    for (const bad of ['../outside.js', '/abs/index.js', 'assets\\index-abc.js', 'assets/../index.js', './assets/index-abc.js', 'assets//a.js']) {
      const copy = structuredClone(r);
      copy.chunks[0].fileName = bad;
      assert.match(checkSiteExclusions(dir, copy).problems.join('\n'), /not a safe relative path/, bad);
    }
    const dup = structuredClone(r);
    dup.workers[0].chunks[0].fileName = 'assets/index-abc.js';
    assert.match(checkSiteExclusions(dir, dup).problems.join('\n'), /listed twice/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the full verifier applies site provenance when a site directory is given', () => {
  const { dir, r } = siteWithReport();
  const reportDir = mkdtempSync(join(tmpdir(), 'gp-release-rep-'));
  try {
    const path = join(reportDir, 'report.json');
    writeFileSync(path, JSON.stringify(r));
    assert.deepEqual(verifyReleaseExclusions(path, dir).problems, []);
    writeFileSync(join(dir, 'assets', 'unlisted.js'), '');
    assert.match(verifyReleaseExclusions(path, dir).problems.join('\n'), /no lean report module proof: assets\/unlisted\.js/);
    const cli = spawnSync(process.execPath, [CLI, path, dir], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(reportDir, { recursive: true, force: true });
  }
});

test('CLI exits 0 on a clean report and 1 listing every stopped module', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gp-release-excl-cli-'));
  try {
    const clean = join(dir, 'clean.json');
    writeFileSync(clean, JSON.stringify(report(CORE_SAMPLES)));
    const ok = spawnSync(process.execPath, [CLI, clean], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Release exclusions verified: \d+ rendered modules contain no F01, F02/);
    const dirty = join(dir, 'dirty.json');
    writeFileSync(dirty, JSON.stringify(report(['src/AppLean.tsx', ...Object.values(STOPPED_SAMPLES).map((s) => s[0])])));
    const bad = spawnSync(process.execPath, [CLI, dirty], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.equal(bad.stderr.split('\n').filter((l) => l.startsWith(' - ')).length, Object.keys(STOPPED_SAMPLES).length);
    assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
    // A symlinked or wrapped invocation must still run the gate, never silently exit 0.
    const link = join(dir, 'verify-link.mjs');
    symlinkSync(CLI, link);
    const viaLink = spawnSync(process.execPath, [link, dirty], { encoding: 'utf8' });
    assert.equal(viaLink.status, 1, viaLink.stdout);
    const missing = verifyReleaseExclusions(join(dir, 'absent.json'));
    assert.match(missing.problems.join(), /cannot read lean report/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('build-pages.sh runs the verifier on the final site: after every site mutation, before checksums and publish', () => {
  const lines = readFileSync(fileURLToPath(new URL('../pages/build-pages.sh', import.meta.url)), 'utf8').split('\n');
  const at = (pred, what) => {
    const i = lines.findIndex(pred);
    assert.ok(i >= 0, `${what} not found`);
    return i;
  };
  const verify = at((l) => l.startsWith('node scripts/release/verify-release-exclusions.mjs "$evidence/ghostpay-lean-build.json" "$site" || die'), 'verifier');
  assert.equal(lines.filter((l) => l.includes('verify-release-exclusions.mjs')).length, 1, 'exactly one verifier invocation');
  // Every shell line that creates, copies, moves or rewrites something under "$site" must come before the verifier.
  const mutations = lines.map((l, i) => [l, i]).filter(([l]) => /(?:^|\s)(?:cp|mv|rm|mkdir|touch|ln|tee|sed)\b.*"\$site|>\s*"\$site|node --input-type=module - "\$site\//.test(l));
  assert.ok(mutations.length >= 3, `expected site mutations, saw ${String(mutations.length)}`);
  const publish = at((l) => l.startsWith('mv "$site" "$out/site"'), 'publish');
  for (const [l, i] of mutations) {
    if (i === publish) continue;
    assert.ok(i < verify, `site mutation after the exclusion check (line ${String(i + 1)}): ${l}`);
  }
  // The block that writes SHA256SUMS and pages-evidence.json (and calls verifySite) starts after the verifier.
  const checksums = at((l) => l.includes("writeFileSync(join(evidence, 'SHA256SUMS')"), 'SHA256SUMS');
  const finalBlock = at((l) => l.startsWith('node --input-type=module - "$site" "$evidence"'), 'final verification block');
  assert.ok(verify < finalBlock && finalBlock < checksums && checksums < publish, `verify ${String(verify)} block ${String(finalBlock)} sums ${String(checksums)} publish ${String(publish)}`);
  assert.ok(lines.includes('set -euo pipefail'));
});
