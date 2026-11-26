// W5 independent payment-state verifier: milestone 2 runner (seller-side reconciliation).
// Usage (repository root, after harness/build.mjs):
//   node verification/independent-beta/harness/seller-run.mjs [--only NAME[,NAME]] [--seeds 1-10] [--concurrency 2]
//                                                              [--candidate <sha>] [--out <dir>]
// A seller profile (tabs S1, S2) reconciles payments made by the REAL payer checkout in a separate payer profile; the
// synthetic chain executes them with the contract model. Exit: 0 no candidates, 1 candidates, 2 harness error.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { join } from 'node:path';
import { DIST, REPO, distFingerprint, sourceIdentity } from './build.mjs';
import { SyntheticChain } from './chain.mjs';
import { Rng } from './prng.mjs';
import { MockRpc, RPC2_URL } from './rpc.mjs';
import { BROWSER_SHIM, WalletController } from './wallet.mjs';
import { DISCLOSURE_SHIM, clickSend, openAndPrepare, settingsInitScript, settle } from './app.mjs';
import { routerExecutor, withDeadline } from './router-model.mjs';
import { clickLedgerAction, createRegisteredInvoice, createSellerKeys, observeSeller, openScan, runScan, unlockLedger, unlockSellerKeys } from './seller.mjs';
import { SellerOracle } from './seller-oracle.mjs';
import { SELLER_CONTROLS, SELLER_NAMED, sellerGenerated } from './seller-scenarios.mjs';
import { serveDist } from './serve.mjs';

const require = createRequire(import.meta.url);
const CHROMIUM = process.env.GHOSTPAY_CHROMIUM ?? '/opt/pw-browsers/chromium';
const PAYER = '0x5555555555555555555555555555555555555555';
// Expected router net (seller pays the 0.25 % fee): the invoice card states it in base units.
export const INTENTS = {
  X: { amount: '0.5', units: (500_000_000_000_000_000n - 1_250_000_000_000_000n).toString() },
  C: { amount: '0.3', units: (300_000_000_000_000_000n - 750_000_000_000_000n).toString() },
};

function parseArgs(argv) {
  const a = { only: null, seeds: [], concurrency: 2, out: null, candidate: null, named: false };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--only') a.only = argv[++i];
    else if (k === '--named') a.named = true;
    else if (k === '--concurrency') a.concurrency = Math.max(1, Math.min(4, Number(argv[++i])));
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--candidate') a.candidate = argv[++i];
    else if (k === '--seeds') {
      const [lo, hi] = String(argv[++i]).split('-').map(Number);
      for (let s = lo; s <= Math.min(hi ?? lo, lo + 99); s += 1) a.seeds.push(s); // hard bound: 100 sequences
    } else throw new Error(`unknown argument ${k}`);
  }
  if (a.only === null && a.seeds.length === 0) a.named = true;
  return a;
}

async function runScenario(launcher, origin, scenario) {
  const chain = new SyntheticChain();
  chain.executor = routerExecutor;
  const rng = new Rng(scenario.seed ?? 7);
  const rpc = new MockRpc(chain);
  // Optional second provider (S20). It answers from the same chain unless a scenario freezes its view.
  const rpc2 = scenario.secondaryRpc === true ? new MockRpc(chain, { url: RPC2_URL }) : null;
  const tabOfPage = new WeakMap();
  const world = {
    origin,
    chain,
    rpc,
    rpc2,
    tabs: {},
    links: {},
    // payments[intent] = [{ hash, kind: 'checkout' | 'direct' }]; actions[intent] = seller decisions the harness made
    payments: { X: [], C: [] },
    actions: { X: [], C: [] },
    captured: { X: null, C: null },
    scans: {}, // tab -> { head, outcome, at } of the last scan the harness ran there
    reorged: new Set(),
    dialogs: [],
  };
  const wallet = new WalletController({
    chain,
    rng,
    tabOf: (p) => tabOfPage.get(p) ?? '?',
    intentOf: () => world.payingIntent ?? null,
    pageIdOf: () => 0,
    docOf: () => 0,
    onDelivered: () => undefined,
  });
  world.wallet = wallet;
  const oracle = new SellerOracle(world, INTENTS);
  const dirs = [];
  const contexts = [];
  const trace = [];
  const started = Date.now();
  let harnessError = null;
  const boot = async (label, reuseDir) => {
    const dir = reuseDir ?? mkdtempSync(join(os.tmpdir(), `w5-${label}-`));
    if (reuseDir === undefined) dirs.push(dir);
    const ctx = await launcher.launch(dir);
    contexts.push(ctx);
    ctx.__w5dir = dir;
    await rpc.install(ctx, origin);
    const seller = label === 'seller';
    if (seller && rpc2 !== null) await rpc2.install(ctx, origin, { guard: false });
    await ctx.addInitScript(BROWSER_SHIM);
    await ctx.addInitScript(DISCLOSURE_SHIM);
    await ctx.addInitScript(settingsInitScript(seller && rpc2 !== null ? { secondary: RPC2_URL } : {}));
    await ctx.exposeBinding('__w5wallet', (source, payload) => wallet.handle(source.page, payload));
    return ctx;
  };
  const adopt = (ctx, label, page) => {
    tabOfPage.set(page, label);
    page.on('dialog', (d) => {
      world.dialogs.push({ tab: label, type: d.type(), message: d.message().slice(0, 160) });
      void (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => undefined);
    });
    world.tabs[label] = page;
    return page;
  };
  try {
    const sellerCtx = await boot('seller');
    const payerCtx = await boot('payer');
    world.payerCtx = payerCtx;
    const S1 = adopt(sellerCtx, 'S1', sellerCtx.pages()[0] ?? (await sellerCtx.newPage()));
    await createSellerKeys(S1, origin);
    for (const intent of ['X', 'C']) {
      const r = await createRegisteredInvoice(S1, { amount: INTENTS[intent].amount, hours: intent === 'X' ? scenario.xHours ?? 24 : 24, description: `W5 ${intent}` });
      if (!r.registered) throw new Error(`harness: invoice ${intent} was not registered`);
      world.links[intent] = r.link;
    }
    world.sellerCtx = sellerCtx;
    // Full seller browser restart (S49): same profile directory, every tab and in-memory key gone.
    world.restartSeller = async () => {
      const dir = world.sellerCtx.__w5dir;
      await world.sellerCtx.close();
      world.sellerCtx = await boot('seller', dir);
      adopt(world.sellerCtx, 'S1', world.sellerCtx.pages()[0] ?? (await world.sellerCtx.newPage()));
      adopt(world.sellerCtx, 'S2', await world.sellerCtx.newPage());
    };
    const S2 = adopt(sellerCtx, 'S2', await sellerCtx.newPage());
    if ((await unlockSellerKeys(S2, origin)) === 'unlock-failed') throw new Error('harness: second seller tab could not unlock keys');
    adopt(payerCtx, 'P', payerCtx.pages()[0] ?? (await payerCtx.newPage()));
    for (let i = 0; i < scenario.steps.length; i += 1) {
      const step = scenario.steps[i];
      const rec = { i, step, t: Date.now() - started };
      const before = await snapshot(world);
      try {
        rec.result = await execStep(world, oracle, step, i);
      } catch (e) {
        rec.error = String(e?.message ?? e).split('\n')[0];
      }
      // A named scenario step marked `must` has to take effect, or the scenario proves nothing (vacuity guard).
      if (step.must === true) {
        const r = rec.result ?? {};
        const ok = rec.error === undefined && r.clicked !== 'no-button' && r.clicked !== 'disabled' && r.outcome !== 'error' && r.outcome !== 'timeout' && r.prepared !== false && r.handoff !== false;
        if (!ok) throw new Error(`harness: step ${i} (${step.op}) did not take effect: ${JSON.stringify(rec.result ?? rec.error).slice(0, 200)}`);
      }
      const obs = await snapshot(world);
      oracle.check(i, step, before, obs, rec.result);
      rec.obs = Object.fromEntries(Object.entries(obs).map(([k, o]) => [k, o.closed ? 'closed' : { matches: o.matches, cards: o.cards.map((c) => c.text.slice(0, 400)), alerts: o.alerts, scanStatus: o.scanStatus, ledgerLocked: o.ledgerLocked }]));
      trace.push(rec);
    }
    if (Object.values(world.payments).flat().length === 0) harnessError = 'harness: vacuous run (no payment reached the chain)';
  } catch (e) {
    harnessError = String(e?.stack ?? e);
  } finally {
    for (const c of contexts) await c.close().catch(() => undefined);
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
  const found = new Set(oracle.violations.map((v) => v.inv));
  const expect = scenario.expectViolations ?? [];
  if (expect.length > 0 && harnessError === null && !expect.every((inv) => found.has(inv))) {
    harnessError = `harness: positive control did not detect expected ${expect.filter((x) => !found.has(x)).join(',')} (oracle blind)`;
  }
  return {
    name: scenario.name,
    why: scenario.why,
    seed: scenario.seed ?? null,
    steps: scenario.steps,
    expectViolations: expect,
    durationMs: Date.now() - started,
    harnessError,
    payments: world.payments,
    actions: world.actions,
    chainLog: chain.log,
    rpcUnknownMethods: [...rpc.unknownMethods],
    blockedOrigins: [...new Set([...rpc.blockedOrigins, ...(rpc2?.blockedOrigins ?? [])])],
    rpc2Calls: rpc2 === null ? null : rpc2.calls.length,
    violations: oracle.violations.map(({ key, ...v }) => v),
    ambiguities: oracle.ambiguities.map(({ key, ...v }) => v),
    notes: oracle.notes,
    dialogs: world.dialogs,
    trace,
  };
}

async function snapshot(world) {
  const out = {};
  for (const label of ['S1', 'S2']) {
    const p = world.tabs[label];
    out[label] = p === undefined ? { closed: true } : await observeSeller(p).catch(() => ({ closed: true }));
  }
  return out;
}

/** Make the seller tab ready to reconcile: keys loaded, Scan open, ledger unlocked. */
async function sellerReady(world, label) {
  const page = world.tabs[label];
  await unlockSellerKeys(page, world.origin);
  await openScan(page);
  return unlockLedger(page);
}

async function execStep(world, oracle, step, i) {
  const { chain } = world;
  switch (step.op) {
    case 'pay': {
      // The payer's real checkout in its own profile; 'capture' declines in the wallet after recording the call.
      const page = world.tabs.P;
      world.payingIntent = step.intent;
      const prep = await openAndPrepare(page, world.links[step.intent]);
      if (!prep.prepared) return { prepared: false, reason: prep.reason };
      const before = world.wallet.handoffs.length;
      world.wallet.nextSend = step.capture === true ? 'reject' : 'ok';
      const clicked = await clickSend(page);
      for (let k = 0; k < 50 && world.wallet.handoffs.length === before; k += 1) await page.waitForTimeout(100);
      const h = world.wallet.handoffs[before];
      if (h === undefined) return { prepared: true, clicked, handoff: false };
      world.captured[step.intent] = h.params;
      if (step.capture !== true && h.hash !== undefined) world.payments[step.intent].push({ hash: h.hash, kind: 'checkout' });
      if (step.capture !== true && step.mine !== false) chain.mine([h.hash]);
      await settle(page, { capMs: 8_000 });
      return { prepared: true, clicked, handoff: true, hash: h.hash ?? null, captured: step.capture === true };
    }
    case 'directPay': {
      // The payer's own tooling calls the router directly with the same payment but a later deadline (S37).
      const p = world.captured[step.intent];
      if (p === null) return { skipped: 'nothing captured' };
      const deadline = chain.clock + (step.deadlineIn ?? 86_400);
      const hash = world.wallet.rng.hash32();
      chain.submit(hash, { from: PAYER, to: p.to, value: p.value, data: withDeadline(p.data, deadline) });
      world.payments[step.intent].push({ hash, kind: 'direct' });
      if (step.mine !== false) chain.mine([hash]);
      return { hash, truth: chain.truth(hash) };
    }
    case 'mine':
      return { block: chain.mine([...chain.txs.entries()].filter(([, t]) => t.state === 'mempool').map(([h]) => h)) };
    case 'advance':
      chain.advance(step.n);
      return { head: chain.head };
    case 'warp':
      chain.warp(step.seconds);
      return { clock: chain.clock };
    case 'reorg': {
      // `hideFromRpc`: positive control only. The (single) RPC keeps serving the pre-reorg fork, i.e. a stale or lying
      // provider outside the accepted trust boundary (RS:25); the harness's truth chain still reorgs.
      if (step.hideFromRpc === true) world.rpc.chain = chain.clone();
      if (world.secondaryFrozenAt !== undefined) world.reorgSinceFreeze = true;
      const orphaned = chain.reorg(step.depth);
      for (const h of orphaned) world.reorged.add(h);
      if (step.drop === true) for (const h of orphaned) chain.drop(h);
      return { orphaned, head: chain.head };
    }
    case 'rpc':
      world.rpc.mode = step.mode;
      return { mode: step.mode };
    case 'freezeSecondary':
      // The second provider keeps answering from the current fork; later chain changes reach only the primary.
      if (world.rpc2 === null) return { skipped: 'no secondary RPC' };
      world.rpc2.chain = chain.clone();
      world.secondaryFrozenAt = i;
      return { frozenAtHead: chain.head };
    case 'thawSecondary':
      if (world.rpc2 === null) return { skipped: 'no secondary RPC' };
      world.rpc2.chain = chain;
      delete world.secondaryFrozenAt;
      world.reorgSinceFreeze = false;
      return { thawed: true };
    case 'restartSeller': {
      world.chainLogLengthAtRestart = chain.log.length;
      await world.restartSeller();
      for (const label of ['S1', 'S2']) await sellerReady(world, label);
      return { restarted: true };
    }
    case 'latePay': {
      // Compound: checkout captured (declined in wallet), chain time passes expiry, payer's tooling pays directly.
      await execStep(world, oracle, { op: 'pay', intent: step.intent, capture: true }, i);
      chain.warp(step.warp ?? 2 * 3600);
      return execStep(world, oracle, { op: 'directPay', intent: step.intent }, i);
    }
    case 'scan': {
      const page = world.tabs[step.tab];
      await sellerReady(world, step.tab);
      const r = await runScan(page, {
        fromStart: step.fromStart === true,
        onStarted: step.failAfterCalls === undefined ? undefined : async () => { world.rpc.failAfter = step.failAfterCalls; },
      });
      world.rpc.failAfter = null;
      if (step.failAfterCalls !== undefined) world.rpc.mode = 'up';
      world.scans[step.tab] = { head: chain.head, outcome: r.outcome, at: i };
      await unlockLedger(page);
      return r;
    }
    case 'confirm':
    case 'acceptLate': {
      // Act in place: proposals exist only for the live scan results of this Scan view (S3), so navigating away
      // first (as an earlier harness version did) silently discarded them (harness fix H10).
      const page = world.tabs[step.tab];
      await unlockLedger(page);
      const name = step.op === 'confirm' ? 'Confirm proposed invoice match' : 'Accept late payment for this invoice';
      const proposalFor = await page.evaluate(() => (document.body.innerText.match(/Exact local match proposed: invoice (0x[0-9a-f]{64})/i) ?? [])[1]?.toLowerCase() ?? null);
      // Attribute the decision to the invoice the proposal names (by its card's amount), not to the step's label.
      const seen = await observeSeller(page);
      const card = seen.cards?.find((c) => c.digest === proposalFor);
      const named = card === undefined ? null : Object.entries(INTENTS).find(([, v]) => v.units === card.units)?.[0] ?? null;
      const late = seen.cards?.filter((c) => /Verified late transfer — invoice decision pending/.test(c.text)).map((c) => Object.entries(INTENTS).find(([, v]) => v.units === c.units)?.[0]) ?? [];
      const intent = step.op === 'confirm' ? named ?? step.intent ?? 'X' : late[0] ?? step.intent ?? 'X';
      const r = await clickLedgerAction(page, name);
      if (r === 'clicked') world.actions[intent].push({ op: step.op, tab: step.tab, step: i, proposalFor });
      return { clicked: r, proposalFor, intent };
    }
    case 'reload': {
      const page = world.tabs[step.tab];
      await page.reload();
      await page.waitForTimeout(1_000);
      return { ready: await sellerReady(world, step.tab) };
    }
    case 'view':
      return { ready: await sellerReady(world, step.tab) };
    case 'compareTabs': {
      // Both seller tabs re-render from storage (reload, keys, Scan, ledger) before SI8 compares them.
      for (const label of ['S1', 'S2']) {
        await world.tabs[label].reload();
        await world.tabs[label].waitForTimeout(800);
        await sellerReady(world, label);
      }
      return { compared: true };
    }
    default:
      throw new Error(`harness: unknown op ${step.op}`);
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const idx = next;
      next += 1;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = sourceIdentity();
  const build = JSON.parse(readFileSync(join(DIST, '.w5-build.json'), 'utf8'));
  const dist = distFingerprint();
  if (dist === null || dist.sha256 !== build.dist.sha256) throw new Error('harness: dist changed since build.mjs recorded it; rebuild');
  const candidate = execFileSync('git', ['-C', REPO, 'rev-parse', args.candidate ?? 'origin/main'], { encoding: 'utf8' }).trim();
  const diff = execFileSync('git', ['-C', REPO, 'diff', '--name-only', candidate, 'HEAD', '--', 'apps', 'packages', 'package.json', 'package-lock.json'], { encoding: 'utf8' }).trim();
  if (diff !== '') throw new Error(`harness: production paths differ from candidate ${candidate}:\n${diff}`);
  const { chromium } = require('playwright-core');
  const launchArgs = ['--no-sandbox', '--host-resolver-rules=MAP localhost 127.0.0.1'];
  const probe = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: launchArgs });
  const chromiumVersion = probe.version();
  await probe.close();
  const launcher = { launch: (dir) => chromium.launchPersistentContext(dir, { executablePath: CHROMIUM, headless: true, args: launchArgs, serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } }) };
  const server = await serveDist(DIST);
  let list = [];
  if (args.named) list.push(...SELLER_CONTROLS, ...SELLER_NAMED);
  if (args.only !== null) list = [...SELLER_CONTROLS, ...SELLER_NAMED].filter((s) => args.only.split(',').includes(s.name));
  for (const s of args.seeds) list.push(sellerGenerated(s));
  const runId = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const out = args.out ?? join(REPO, 'verification/independent-beta/results', `m2-${runId}`);
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  let results = [];
  try {
    results = await pool(list, args.concurrency, async (s) => {
      const r = await runScenario(launcher, server.origin, s);
      const sig = [...new Set(r.violations.map((v) => v.inv))].join(',') || '-';
      process.stdout.write(`${r.harnessError ? 'HARNESS-ERROR' : r.expectViolations.length ? 'CONTROL-DETECTED' : r.violations.length ? 'VIOLATION' : 'ok'}\t${r.name}\t${(r.durationMs / 1000).toFixed(1)}s\tviol=${sig}\tamb=${[...new Set(r.ambiguities.map((a) => a.inv))].join(',') || '-'}\n`);
      return r;
    });
  } finally {
    await server.close();
  }
  const pw = require('playwright-core/package.json');
  const record = {
    runId,
    milestone: 2,
    command: `node verification/independent-beta/harness/seller-run.mjs ${process.argv.slice(2).join(' ')}`.trim(),
    pinnedMain: candidate,
    source,
    productionPathsDifferingFromPinnedMain: [],
    build,
    environment: { node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.cpus().length, playwrightCore: pw.version, chromium: chromiumVersion, chromiumPath: CHROMIUM },
    seeds: args.seeds,
    wallMs: Date.now() - t0,
    totals: {
      scenarios: results.length,
      harnessErrors: results.filter((r) => r.harnessError !== null).length,
      withViolations: results.filter((r) => r.violations.length > 0 && r.expectViolations.length === 0).length,
      positiveControls: results.filter((r) => r.expectViolations.length > 0).map((r) => ({ name: r.name, expected: r.expectViolations, detected: [...new Set(r.violations.map((v) => v.inv))] })),
      withAmbiguities: results.filter((r) => r.ambiguities.length > 0).length,
      payments: results.reduce((n, r) => n + r.payments.X.length + r.payments.C.length, 0),
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
