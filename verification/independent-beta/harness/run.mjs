// W5 independent payment-state verifier: scenario runner.
// Usage (from the repository root, after `node verification/independent-beta/harness/build.mjs`):
//   node verification/independent-beta/harness/run.mjs [--named] [--seeds 1-20] [--only NAME] [--concurrency 3]
//                                                       [--minimize] [--out verification/independent-beta/results/<id>]
// Exit status: 0 = no product-defect candidates, 1 = candidates found, 2 = harness error.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { join } from 'node:path';
import { DIST, REPO, distFingerprint, sourceIdentity } from './build.mjs';
import { SyntheticChain } from './chain.mjs';
import { Rng } from './prng.mjs';
import { MockRpc } from './rpc.mjs';
import { BROWSER_SHIM, WalletController } from './wallet.mjs';
import { DISCLOSURE_SHIM, checkRow, clearRow, clickSend, observe, openAndPrepare, sellerSetup, settingsInitScript, settle } from './app.mjs';
import { Oracle } from './oracle.mjs';
import { CONTROLS, NAMED, SUFFIX, generated } from './scenarios.mjs';
import { serveDist } from './serve.mjs';

const require = createRequire(import.meta.url);
const CHROMIUM = process.env.GHOSTPAY_CHROMIUM ?? '/opt/pw-browsers/chromium';

function parseArgs(argv) {
  const a = { named: false, seeds: [], only: null, concurrency: 3, minimize: false, out: null, candidate: null };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--named') a.named = true;
    else if (k === '--minimize') a.minimize = true;
    else if (k === '--only') a.only = argv[++i];
    else if (k === '--concurrency') a.concurrency = Math.max(1, Math.min(6, Number(argv[++i])));
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--candidate') a.candidate = argv[++i];
    else if (k === '--seeds') {
      const [lo, hi] = String(argv[++i]).split('-').map(Number);
      const top = Math.min(hi ?? lo, lo + 199); // hard bound: at most 200 generated sequences per run
      for (let s = lo; s <= top; s += 1) a.seeds.push(s);
    } else throw new Error(`unknown argument ${k}`);
  }
  if (!a.named && a.seeds.length === 0 && a.only === null) a.named = true;
  return a;
}

/**
 * One scenario in one fresh persistent browser profile (its own Chromium process) with two payer tabs. The profile
 * directory survives a `restart` step, so a restart is a genuine browser relaunch over the same site data.
 */
async function runScenario(launcher, origin, scenario, { withSuffix = true } = {}) {
  const chain = new SyntheticChain();
  const rng = new Rng(scenario.seed ?? hashName(scenario.name));
  const rpc = new MockRpc(chain);
  const pageIds = new WeakMap();
  const docs = new WeakMap(); // page -> number of documents loaded (DOMContentLoaded; hash changes do not count)
  const tabOfPage = new WeakMap();
  let pageCounter = 0;
  const world = {
    origin,
    chain,
    rpc,
    tabs: {},
    intentOfTab: { A: null, B: null },
    links: null,
    clears: { X: 0, C: 0 },
    lastClearSeq: { X: 0, C: 0 },
    clearedHashes: new Set(),
    hashes: { X: new Set(), C: new Set() },
    docEndedAt: new Map(), // `${pageId}:${doc}` -> ms
    deliveredToOpenPage: new Set(),
    reorged: new Set(),
    dialogs: [],
  };
  const wallet = new WalletController({
    chain,
    rng,
    tabOf: (p) => tabOfPage.get(p) ?? '?',
    intentOf: (tab) => world.intentOfTab[tab] ?? null,
    pageIdOf: (p) => pageIds.get(p),
    docOf: (p) => docs.get(p) ?? 0,
    onDelivered: (h) => world.deliveredToOpenPage.add(h),
  });
  world.wallet = wallet;
  const oracle = new Oracle(world);
  let userDataDir = mkdtempSync(join(os.tmpdir(), 'w5-profile-'));
  const profileDirs = [userDataDir];
  let context = null;
  const boot = async () => {
    context = await launcher.launch(userDataDir);
    await rpc.install(context, origin);
    await context.addInitScript(BROWSER_SHIM);
    await context.addInitScript(DISCLOSURE_SHIM);
    await context.addInitScript(settingsInitScript());
    await context.exposeBinding('__w5wallet', (source, payload) => wallet.handle(source.page, payload));
  };
  const trace = [];
  const started = Date.now();
  let harnessError = null;
  try {
    await boot();
    const newTab = async (label, existing) => {
      const p = existing ?? (await context.newPage());
      pageIds.set(p, (pageCounter += 1));
      docs.set(p, 0);
      // A document ends when the page loads the next one or closes; I4's record window is measured to that end.
      // (Measured at the next DOMContentLoaded, so slightly late: lenient towards the app, never stricter.)
      p.on('domcontentloaded', () => {
        world.docEndedAt.set(`${pageIds.get(p)}:${docs.get(p) ?? 0}`, Date.now());
        docs.set(p, (docs.get(p) ?? 0) + 1);
      });
      tabOfPage.set(p, label);
      p.on('close', () => world.docEndedAt.set(`${pageIds.get(p)}:${docs.get(p) ?? 0}`, Date.now()));
      p.on('dialog', (d) => {
        world.dialogs.push({ tab: label, type: d.type(), message: d.message().slice(0, 200) });
        // A reload/close/navigation step is a deliberate leave, so a leave-page warning is accepted. Any other dialog
        // not owned by an explicit clear step (e.g. a receipt download confirm) is dismissed.
        if (d.type() === 'beforeunload') void d.accept().catch(() => undefined);
        else if (p.listenerCount('dialog') <= 1) void d.dismiss().catch(() => undefined);
      });
      world.tabs[label] = p;
      return p;
    };
    // Seller role in its own tab: fresh keys + two invoices, then the tab is closed (no beforeunload), so the two
    // payer tabs A and B start as ordinary checkout tabs of the same browser profile.
    const seller = context.pages()[0] ?? (await context.newPage());
    world.links = await sellerSetup(seller, origin);
    await newTab('A');
    await newTab('B');
    await seller.close({ runBeforeUnload: false });
    // Browser restart: every tab and in-flight wallet reply of the old process is gone; site data persists.
    // `fresh` = relaunch on an EMPTY profile: a different browser profile, outside the accepted guarantee (R26).
    // Used only by positive-control scenarios, which must produce the violations they declare.
    world.restart = async (fresh = false) => {
      await context.close();
      if (fresh) {
        userDataDir = mkdtempSync(join(os.tmpdir(), 'w5-profile-'));
        profileDirs.push(userDataDir);
      }
      await boot();
      await newTab('A', context.pages()[0]);
      await newTab('B');
    };
    const steps = withSuffix ? [...scenario.steps, ...SUFFIX] : scenario.steps;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const rec = { i, step, t: Date.now() - started };
      try {
        rec.result = await execStep(world, wallet, oracle, newTab, step, i);
      } catch (e) {
        rec.error = String(e?.message ?? e).split('\n')[0];
      }
      // Only hashes that actually reached an open page can be shown by the app (harness fix H3).
      for (const h of wallet.handoffs) if (h.hash !== undefined && h.intent !== null && h.deliveredToOpenPage === true) world.hashes[h.intent].add(h.hash);
      const obs = {};
      for (const [label, p] of Object.entries(world.tabs)) obs[label] = await observe(p).catch(() => ({ closed: true }));
      oracle.checkHandoffs(i);
      oracle.checkObservations(i, step, obs);
      rec.obs = Object.fromEntries(
        Object.entries(obs).map(([k, o]) => [k, o.closed ? 'closed' : { headings: o.headings.slice(0, 4), statuses: o.statuses, alerts: o.alerts, journal: o.journal, sendButton: o.sendButton, disclosures: (o.disclosures ?? []).length, cancelledDisclosures: (o.disclosures ?? []).filter((d) => d.action === 'cancel').length }]),
      );
      rec.handoffs = wallet.handoffs.length;
      trace.push(rec);
    }
    // Vacuity guard: every scenario starts with a payment of X, and its suffix pays C, so a run in which nothing ever
    // reached the wallet means the harness failed to drive the app, not that the app is safe.
    if (wallet.handoffs.length === 0) harnessError = 'harness: vacuous run (no wallet handoff at all)';
  } catch (e) {
    harnessError = String(e?.stack ?? e);
  } finally {
    await context?.close().catch(() => undefined);
    for (const d of profileDirs) rmSync(d, { recursive: true, force: true });
  }
  const found = new Set(oracle.violations.map((v) => v.inv));
  const expect = scenario.expectViolations ?? [];
  if (expect.length > 0 && harnessError === null && !expect.every((inv) => found.has(inv))) {
    harnessError = `harness: positive control did not detect expected ${expect.filter((i) => !found.has(i)).join(',')} (oracle blind)`;
  }
  return {
    name: scenario.name,
    why: scenario.why,
    expectViolations: expect,
    seed: scenario.seed ?? null,
    steps: scenario.steps,
    suffix: withSuffix,
    durationMs: Date.now() - started,
    harnessError,
    handoffs: wallet.handoffs.map(({ seq, tab, intent, behaviour, hash, broadcastHash, account, chainId, params, deliveredToOpenPage }) => ({
      seq, tab, intent, behaviour, hash: hash ?? null, broadcastHash: broadcastHash ?? null, account, chainId,
      from: params?.from ?? null, to: params?.to ?? null, value: params?.value ?? null, delivered: deliveredToOpenPage ?? null,
    })),
    clears: world.clears,
    dialogs: world.dialogs,
    chainLog: chain.log,
    rpcUnknownMethods: [...rpc.unknownMethods],
    blockedOrigins: [...new Set(rpc.blockedOrigins)],
    walletMethods: countBy(wallet.requests.map((r) => r.method)),
    violations: oracle.violations.map(({ key, ...v }) => v),
    ambiguities: oracle.ambiguities.map(({ key, ...v }) => v),
    notes: oracle.notes,
    // Explicit classification (review gap G2): pay action enabled while this intent's own record is visible (R20).
    payEnabledWithRecord: oracle.payEnabledWithRecord ?? 0,
    // I3 records satisfied only by a hash-less unknown row (presence, not proof of identity; review gap G5).
    i3UnqualifiedMatches: oracle.i3UnqualifiedMatches ?? 0,
    trace,
  };
}

async function execStep(world, wallet, oracle, newTab, step, i) {
  const page = step.tab === undefined ? null : world.tabs[step.tab];
  switch (step.op) {
    case 'open':
    case 'switchInPage': {
      world.intentOfTab[step.tab] = step.intent;
      const r = await openAndPrepare(page, world.links[step.intent], { inPage: step.op === 'switchInPage' });
      world.prepared = { ...(world.prepared ?? {}), [step.tab]: r.prepared };
      return r;
    }
    case 'send': {
      const intent = world.intentOfTab[step.tab];
      const beforeC = oracle.handoffsFor('C').length;
      const before = wallet.handoffs.length;
      wallet.nextSend = step.behaviour;
      if (step.disclosure === 'cancel') await page.evaluate(() => { window.__w5cancelNextSend = true; });
      const clicked = await clickSend(page);
      if (clicked !== 'clicked') wallet.nextSend = 'ok';
      if (step.mineOnSubmit === true) {
        for (let k = 0; k < 40 && wallet.handoffs.length === before; k += 1) await page.waitForTimeout(100);
        const h = wallet.handoffs[before];
        if (h?.broadcastHash !== undefined) world.chain.mine([h.broadcastHash]);
      }
      await settle(page, { capMs: step.behaviour.startsWith('hang') ? 4_000 : 55_000 });
      if (wallet.handoffs.length === before) wallet.nextSend = 'ok'; // no request reached the wallet
      if (intent === 'C') oracle.checkControlReached(i, beforeC, clicked, world.prepared?.[step.tab] === true && wallet.chainId === '0x14a34');
      return { clicked, newHandoffs: wallet.handoffs.length - before };
    }
    case 'mine': {
      const pending = [...world.chain.txs.entries()].filter(([, t]) => t.state === 'mempool').map(([h]) => h);
      return { block: world.chain.mine(pending), included: pending.length };
    }
    case 'advance':
      world.chain.advance(step.n);
      return { head: world.chain.head };
    case 'reorg': {
      const orphaned = world.chain.reorg(step.depth);
      for (const h of orphaned) world.reorged.add(h);
      return { orphaned };
    }
    case 'drop': {
      const pending = [...world.chain.txs.entries()].filter(([, t]) => t.state === 'mempool').map(([h]) => h);
      for (const h of pending) world.chain.drop(h);
      return { dropped: pending.length };
    }
    case 'rpc':
      world.rpc.mode = step.mode;
      return { mode: step.mode };
    case 'reload':
      await page.reload();
      await settle(page, { capMs: 15_000 });
      world.intentOfTab[step.tab] = null; // the app strips the invoice fragment; a reload lands on the input screen
      return {};
    case 'closeReopen': {
      await page.close();
      const p = await newTab(step.tab);
      await p.goto(`${world.origin}/`);
      world.intentOfTab[step.tab] = null;
      return {};
    }
    case 'account':
      await wallet.switchAccount(Object.values(world.tabs));
      return { account: wallet.account };
    case 'chain': {
      const want = step.to === 'other' ? '0xaa36a7' : '0x14a34';
      if (wallet.chainId !== want) await wallet.switchChain(Object.values(world.tabs));
      return { chainId: wallet.chainId };
    }
    case 'release': {
      const released = wallet.releaseHeld();
      for (const p of Object.values(world.tabs)) if (!p.isClosed()) await settle(p, { capMs: 50_000 });
      return { released: released.length };
    }
    case 'clear': {
      const others = [...world.hashes[step.intent === 'X' ? 'C' : 'X']];
      const known = [...world.hashes[step.intent]].filter((h) => !world.clearedHashes.has(h));
      const sel = known.length > 0 ? { hash: known[known.length - 1] } : { excludeHashes: others };
      const r = await clearRow(page, sel, step.accept);
      if (r.cleared) {
        world.clears[step.intent] += 1;
        world.lastClearSeq[step.intent] = wallet.seq;
        for (const h of world.hashes[step.intent]) world.clearedHashes.add(h);
      }
      return r;
    }
    case 'check': {
      const known = [...world.hashes[step.intent]].filter((h) => !world.clearedHashes.has(h));
      if (known.length === 0) return { checked: false, reason: 'no-known-hash' };
      const hash = known[known.length - 1];
      const r = await checkRow(page, { hash });
      oracle.checkStatusResult(i, step.intent, hash, r);
      return { ...r, hash };
    }
    case 'restart':
    case 'freshProfile':
      await world.restart(step.op === 'freshProfile');
      world.intentOfTab = { A: null, B: null };
      return { restarted: true };
    case 'wait':
      await new Promise((ok) => setTimeout(ok, Math.min(step.ms, 10_000)));
      return {};
    default:
      throw new Error(`harness: unknown op ${step.op}`);
  }
}

function countBy(xs) {
  const m = {};
  for (const x of xs) m[x] = (m[x] ?? 0) + 1;
  return m;
}

function hashName(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Same failure set (invariant ids) means "still failing" for minimization. */
const sig = (r) => [...new Set(r.violations.map((v) => v.inv))].sort().join(',');

/** ddmin over the scenario's own steps (suffix kept); bounded to 24 replays. */
async function minimize(browser, origin, failing) {
  const target = sig(failing);
  let steps = failing.steps.slice();
  let n = 2;
  let budget = 24;
  while (steps.length >= 2 && budget > 0) {
    const size = Math.ceil(steps.length / n);
    let reduced = false;
    for (let start = 0; start < steps.length && budget > 0; start += size) {
      const candidate = [...steps.slice(0, start), ...steps.slice(start + size)];
      if (candidate.length === 0) continue;
      budget -= 1;
      const r = await runScenario(browser, origin, { ...failing, steps: candidate, name: `${failing.name}-min` });
      if (r.harnessError === null && sig(r).includes(target.split(',')[0])) {
        steps = candidate;
        n = Math.max(n - 1, 2);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (n >= steps.length) break;
      n = Math.min(steps.length, n * 2);
    }
  }
  const confirm = await runScenario(browser, origin, { ...failing, steps, name: `${failing.name}-min-confirm` });
  return { steps, reproduced: sig(confirm).includes(target.split(',')[0]), confirmViolations: confirm.violations, replaysUsed: 24 - budget };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const idx = next;
        next += 1;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

function environment(browser) {
  const pw = require('playwright-core/package.json');
  return {
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpus: os.cpus().length,
    playwrightCore: pw.version,
    chromium: browser.version(),
    chromiumPath: CHROMIUM,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = sourceIdentity();
  const build = JSON.parse(readFileSync(join(DIST, '.w5-build.json'), 'utf8'));
  const dist = distFingerprint();
  if (dist === null || dist.sha256 !== build.dist.sha256) throw new Error('harness: dist changed since build.mjs recorded it; rebuild');
  // The candidate under test (default: origin/main). The run refuses if any production path differs from it, so a
  // record always describes the unmodified candidate, never a locally edited app.
  const candidate = execFileSync('git', ['-C', REPO, 'rev-parse', args.candidate ?? 'origin/main'], { encoding: 'utf8' }).trim();
  const productionDiff = execFileSync('git', ['-C', REPO, 'diff', '--name-only', candidate, 'HEAD', '--', 'apps', 'packages', 'package.json', 'package-lock.json'], { encoding: 'utf8' }).trim();
  if (productionDiff !== '') throw new Error(`harness: production paths differ from candidate ${candidate}:\n${productionDiff}`);
  const { chromium } = require('playwright-core');
  const launchArgs = ['--no-sandbox', '--host-resolver-rules=MAP localhost 127.0.0.1'];
  const probe = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: launchArgs });
  const chromiumVersion = probe.version();
  await probe.close();
  // `browser` is a launcher: each scenario gets its own persistent profile and Chromium process.
  const browser = {
    version: () => chromiumVersion,
    launch: (dir) =>
      chromium.launchPersistentContext(dir, {
        executablePath: CHROMIUM,
        headless: true,
        args: launchArgs,
        serviceWorkers: 'block',
        viewport: { width: 1280, height: 900 },
      }),
  };
  const server = await serveDist(DIST);
  let list = [];
  if (args.named) list.push(...CONTROLS, ...NAMED);
  if (args.only !== null) list = [...CONTROLS, ...NAMED].filter((s) => args.only.split(',').includes(s.name));
  for (const s of args.seeds) list.push(generated(s));
  const runId = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const out = args.out ?? join(REPO, 'verification/independent-beta/results', runId);
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  let results = [];
  try {
    results = await pool(list, args.concurrency, async (s) => {
      const r = await runScenario(browser, server.origin, s);
      process.stdout.write(`${r.harnessError ? 'HARNESS-ERROR' : r.expectViolations.length ? 'CONTROL-DETECTED' : r.violations.length ? 'VIOLATION' : 'ok'}\t${r.name}\t${(r.durationMs / 1000).toFixed(1)}s\tviol=${sig(r) || '-'}\tamb=${[...new Set(r.ambiguities.map((a) => a.inv))].join(',') || '-'}\n`);
      return r;
    });
    if (args.minimize) {
      for (const r of results) if (r.violations.length > 0 && r.harnessError === null && r.expectViolations.length === 0) r.minimized = await minimize(browser, server.origin, r);
    }
  } finally {
    await server.close();
  }
  const record = {
    runId,
    command: `node verification/independent-beta/harness/run.mjs ${process.argv.slice(2).join(' ')}`.trim(),
    pinnedMain: candidate,
    source,
    productionPathsDifferingFromPinnedMain: productionDiff === '' ? [] : productionDiff.split('\n'),
    build,
    environment: environment(browser),
    seeds: args.seeds,
    wallMs: Date.now() - t0,
    totals: {
      scenarios: results.length,
      harnessErrors: results.filter((r) => r.harnessError !== null).length,
      withViolations: results.filter((r) => r.violations.length > 0 && r.expectViolations.length === 0).length,
      positiveControls: results.filter((r) => r.expectViolations.length > 0).map((r) => ({ name: r.name, expected: r.expectViolations, detected: [...new Set(r.violations.map((v) => v.inv))] })),
      withAmbiguities: results.filter((r) => r.ambiguities.length > 0).length,
      handoffs: results.reduce((n, r) => n + r.handoffs.length, 0),
      blockedOffOrigin: [...new Set(results.flatMap((r) => r.blockedOrigins))],
    },
    results,
  };
  writeFileSync(join(out, 'run.json'), `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`\nrecord: ${out}/run.json\n${JSON.stringify(record.totals)}\n`);
  process.exitCode = record.totals.harnessErrors > 0 ? 2 : record.totals.withViolations > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(2);
});
