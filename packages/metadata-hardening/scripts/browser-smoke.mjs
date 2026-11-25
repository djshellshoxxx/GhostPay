#!/usr/bin/env node
/**
 * Real-browser smoke test for @ghostpay/metadata-hardening (manual, not part of CI).
 *
 * Bundles `dist/index.js` for the browser, loads it in headless Chromium and checks that
 *   A. deterministic results are byte-identical to Node's,
 *   B. `findUnsafeAnchors` agrees with the browser's own HTML parser (DOMParser),
 *   C. `verifySri` is never MORE permissive than Chromium's Subresource Integrity enforcement,
 *   D. a `buildCsp` string is accepted by Chromium without parse warnings and enforced,
 *   E. none of this makes a network request.
 *
 * Needs: `npm run build` first; `vite` and Playwright with Chromium resolvable (true in the dev
 * container and next to apps/web). No dependency is added to this package.
 * Exit code: 0 pass, 1 failure, 2 prerequisites missing (a skip is NOT a pass).
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = join(pkgDir, 'dist/index.js');
const ORIGIN = 'https://app.test';

if (!existsSync(distEntry)) {
  console.error('SKIP: run `npm run build` in packages/metadata-hardening first');
  process.exit(2);
}
let chromium;
let build;
try {
  ({ chromium } = require('playwright'));
  ({ build } = await import(pathToFileURL(require.resolve('vite', { paths: [pkgDir] })).href));
} catch (e) {
  console.error(`SKIP: playwright and vite must be resolvable (${e instanceof Error ? e.message.split('\n')[0] : e})`);
  process.exit(2);
}

const mh = await import(pathToFileURL(distEntry).href);
const built = await build({
  root: pkgDir,
  configFile: false,
  logLevel: 'error',
  build: { write: false, minify: false, lib: { entry: distEntry, name: 'MH', formats: ['iife'], fileName: 'mh' } },
});
const bundle = (Array.isArray(built) ? built[0] : built).output[0].code;

const failures = [];
const notes = [];
const ok = (cond, msg) => {
  if (!cond) failures.push(msg);
};

/**
 * The shared deterministic scenario. A real, self-contained function: Node calls it directly and
 * the page receives `String(scenario)`. No outer variable may be referenced.
 */
function scenario(MH) {
  const rng = (seed) => {
    let s = seed >>> 0 || 1;
    return {
      getRandomValues(a) {
        const v = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        for (let i = 0; i < v.length; i++) {
          s ^= s << 13; s >>>= 0;
          s ^= s >>> 17;
          s ^= s << 5; s >>>= 0;
          v[i] = s & 255;
        }
        return a;
      },
    };
  };
  const seed = new Uint8Array(32).map((_, i) => i + 1);
  const bytes = new TextEncoder().encode('window.__sri = 1;');
  const keys = MH.deriveInvoiceKeys(seed, 3, { chainId: 31337 });
  return {
    endpoint: [MH.parseEndpoint('https://b\u00fccher.example//'), MH.parseEndpoint('HTTPS://RPC.Example:443/Path/')],
    csp: MH.buildCsp(['https://b.example', 'wss://c.example:8443', 'http://127.0.0.1:8545', 'https://b\u00fccher.example']),
    sri: ['sha256', 'sha384', 'sha512'].map((a) => MH.sriDigest(bytes, a)),
    round: String(MH.roundGross(123456789012345678n, { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 100 }).amount),
    noise: String(MH.addAmountNoise(10n ** 18n, { chainId: 31337, maxBps: 50 }, rng(5)).amount),
    gas: String(MH.bucketGasLimit(21000n, { chainId: 31337, headroomBps: 2000 })),
    pad: MH.padBody({ memo: '\u65e5\u672c\u8a9e \ud83d\ude00 \u00fcn\u00efc\u00f6d\u00e9', n: 1 }, undefined, rng(9)),
    meta: keys.metaAddress,
    signer: MH.publicKeyHex(keys.signer.publicKey),
    release: MH.planRelease(
      [{ id: 'a', deadlineSec: 1e9 }, { id: 'b', deadlineSec: 1e9 }, { id: 'c', deadlineSec: 1e9 }],
      { chainId: 31337, nowMs: 0, windowSec: 60 },
      rng(11),
    ),
    time: [MH.coarsenExpiry(1700000001, { chainId: 31337 }), MH.coarsenQuoteTimestamp(1700000001, 1700000009, { chainId: 31337 })],
    order: MH.orderInputs('regtest', [{ txid: 'bb'.repeat(32), vout: 1 }, { txid: 'aa'.repeat(32), vout: 7 }, { txid: 'aa'.repeat(32), vout: 2 }], 'bip69').order,
    settings: MH.parseHardeningJson(JSON.stringify(MH.hardenedSettings())),
    scan: MH.alignedScanRange({ chainId: 31337, wantedFrom: 12345, head: 15000 }, rng(13)),
    typed: (() => {
      try {
        MH.roundGross('5', { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 1 });
        return 'no throw';
      } catch (e) {
        return `${e.name}:${e.code}`;
      }
    })(),
  };
}
const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));

const ANCHOR_CORPUS = [
  '<a title="x>y" target="_blank">z</a>',
  '<a href="/a" target="_blank" rel="noopener" rel="noopener noreferrer">dup rel</a>',
  '<a target="_self" target="_blank">dup target</a>',
  '<a target="_blank" rel="noopener noreferrer">nbsp</a>',
  '<A HREF="/" TARGET="_BLANK" REL="NOREFERRER NOOPENER">upper</A>',
  '<a target="_blank"rel="noopener noreferrer">no space</a>',
  '<a/target=_blank>slash</a>',
  '<a-foo target="_blank">custom</a-foo><abbr target="_blank">abbr</abbr>',
  '<a data-target="_blank" data-rel="noopener noreferrer" href="/">decoys</a><a href="/2" target="_blank" data-rel="noopener noreferrer">x</a>',
  '<a href=/x target=_blank rel=noopener noreferrer>unquoted</a>',
  '<a\nhref="/n"\n\ttarget="_blank"\r\nrel="noreferrer\tnoopener"\n>ws</a>',
  '<a target="_blank2">prefix</a><a target="_blank " rel="">trailing space</a>',
  '<a href="https://bücher.example/日本?q=😀" title="Ünïcödé > ok" target="_blank">unicode</a>',
  '<p>text</p><a href="/1">1</a><a href="/2" target="_blank">2</a><a href="/3" target="_blank" rel="noreferrer noopener">3</a>',
  '<a target="_blank" rel="noopener noreferrer"',
  '<!-- <a href="x --><a target="_blank" href="y">l</a>',
  '<script>x="<a y=\'";</script><a target="_blank" href="/">z</a>',
  '<style>a::after{content:"<a target=_blank>"}</style><a target="_blank">',
  '<textarea><a target="_blank"></textarea><a target="_blank">',
  '<title><a target="_blank"></title><a target="_blank">',
  '<SCRIPT><a target=_blank></ScRiPt ><a target=_blank>',
  '<div title="<a target=_blank>"></div><a target="_blank">',
  '<!DOCTYPE html><a target=_blank>',
  '<?xml version="1.0"?><a target=_blank>',
  '<!--><a target=_blank>',
  '<!---><a target=_blank>',
  '<!-- x --!><a target=_blank>',
  '</a title=">"><a target="_blank">',
  '</ x><a target="_blank">',
  '<!-- <a target="_blank">',
  '<a target="&#95;blank">',
  '<a target="&#x5f;blank" rel="noopener noreferrer">',
  'a < b <a target="_blank"> 1<2',
];
const SRI_SCRIPT = 'window.__sri = (window.__sri || 0) + 1;';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const context = await browser.newContext();
  const routed = [];
  const html = (extraHead = '') => `<!doctype html><html><head><meta charset="utf-8">${extraHead}<title>mh</title></head><body></body></html>`;
  await context.route('**/*', (route) => {
    const url = route.request().url();
    routed.push(url);
    if (url === `${ORIGIN}/` || url === `${ORIGIN}/csp`) {
      const meta = url.endsWith('/csp') ? `<meta http-equiv="Content-Security-Policy" content="${mh.buildCsp(['https://allowed.example'])}">` : '';
      return route.fulfill({ status: 200, contentType: 'text/html', body: html(meta) });
    }
    if (url.startsWith(`${ORIGIN}/sri.js`)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: SRI_SCRIPT });
    return route.abort();
  });
  await context.addInitScript({ content: `${bundle}\nwindow.__MH = MH;` });
  const consoleProblems = [];

  // ---- A. parity with Node, E. no network
  const page = await context.newPage();
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && consoleProblems.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${e.message}`));
  await page.goto(`${ORIGIN}/`);
  const baseline = routed.length;
  const inPage = await page.evaluate(`(${String(scenario)})(window.__MH)`);
  const inNode = scenario(mh);
  ok(json(inPage) === json(inNode), `A: browser and Node results differ:\n  browser ${json(inPage).slice(0, 400)}\n  node    ${json(inNode).slice(0, 400)}`);
  ok(inPage.typed === 'MetadataHardeningError:INVALID_INPUT', `A: wrong-type input did not give a typed error in the browser (${inPage.typed})`);
  const padBytes = new TextEncoder().encode(inPage.pad).length;
  ok([1024, 2048, 4096].includes(padBytes), `A: padded body is ${padBytes} bytes, not a bucket`);
  const real = await page.evaluate(`(() => { const MH = window.__MH; const wire = MH.padBody({ a: 1 }); const u = new Uint8Array(32); crypto.getRandomValues(u); return { len: new TextEncoder().encode(wire).length, rb: String(MH.randomBelow(1000n)), tag: MH.encodeViewTagByte(7, MH.parseTagMode('mask:3')) }; })()`);
  ok([1024, 2048, 4096].includes(real.len) && Number(real.rb) < 1000 && real.tag >= 0 && real.tag < 256, 'A: real browser CSPRNG path failed');
  ok(routed.length === baseline, `E: library calls caused ${routed.length - baseline} network request(s): ${routed.slice(baseline).join(', ')}`);

  // ---- B. anchor lint vs the browser's HTML parser
  const rows = await page.evaluate(`((corpus) => corpus.map((html) => {
    const ascii = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const oracle = [];
    [...doc.querySelectorAll('a')].forEach((a, index) => {
      const target = a.getAttribute('target');
      if (target === null || ascii(target) !== '_blank') return;
      const rel = a.getAttribute('rel');
      if (rel === null) return oracle.push({ index, reason: 'MISSING_REL' });
      const tokens = ascii(rel).split(/[ \\t\\n\\f\\r]+/);
      if (!tokens.includes('noreferrer')) oracle.push({ index, reason: 'MISSING_NOREFERRER' });
      else if (!tokens.includes('noopener')) oracle.push({ index, reason: 'MISSING_NOOPENER' });
    });
    return { html, oracle, ours: window.__MH.findUnsafeAnchors(html) };
  }))(${json(ANCHOR_CORPUS)})`);
  for (const r of rows) {
    const nodeResult = mh.findUnsafeAnchors(r.html);
    ok(json(r.oracle) === json(r.ours), `B: anchor lint disagrees with the HTML parser for ${JSON.stringify(r.html)}: parser ${json(r.oracle)} vs lint ${json(r.ours)}`);
    ok(json(nodeResult) === json(r.ours), `B: Node and browser anchor results differ for ${JSON.stringify(r.html)}`);
  }

  // ---- C. SRI: never more permissive than Chromium
  // Chromium logs its own warnings for the deliberately malformed integrity values below.
  const problemsBeforeSri = consoleProblems.length;
  page.removeAllListeners('console');
  const sriRows = await page.evaluate(`(async () => {
    const MH = window.__MH;
    const good = new TextEncoder().encode(${JSON.stringify(SRI_SCRIPT)});
    const other = new TextEncoder().encode('window.__sri = 2;');
    const g256 = MH.sriDigest(good, 'sha256'), g384 = MH.sriDigest(good, 'sha384'), g512 = MH.sriDigest(good, 'sha512');
    const b256 = MH.sriDigest(other, 'sha256'), b384 = MH.sriDigest(other, 'sha384'), b512 = MH.sriDigest(other, 'sha512');
    const cases = {
      'sha384 match': g384, 'sha256 match': g256, 'sha512 match': g512, 'sha384 mismatch': b384,
      'strongest wrong, weaker right': b512 + ' ' + g384, 'strongest right, weaker wrong': g512 + ' ' + b384,
      'two hashes one right': b384 + ' ' + g384, 'malformed strongest + valid weaker': 'sha512-!!! ' + g384,
      'bare algorithm + valid weaker': 'sha512 ' + g384, 'uppercase algorithm': g384.replace('sha384', 'SHA384'),
      'unknown algorithm + valid': 'md5-AAAA ' + g384, 'unknown algorithm only': 'md5-AAAA', 'empty': '',
      'options after ?': g384 + '?ct=text/javascript', 'tab separated': b256 + '\\t' + g256,
      'lowercased hash': g384.toLowerCase(), 'nbsp separated': 'sha384-AAAA\\u00a0' + g384,
    };
    const out = [];
    let n = 0;
    for (const [name, integrity] of Object.entries(cases)) {
      const loaded = await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = '${ORIGIN}/sri.js?n=' + n++;
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      });
      out.push({ name, integrity: integrity.slice(0, 40), chromium: loaded, ours: MH.verifySri(good, integrity) });
    }
    return out;
  })()`);
  for (const r of sriRows) {
    if (r.ours && !r.chromium) failures.push(`C: verifySri accepted but Chromium blocked: ${r.name}`);
    else if (r.ours !== r.chromium) notes.push(`C: stricter than Chromium (fail closed): "${r.name}" chromium=${r.chromium} ours=${r.ours}`);
  }

  // ---- D. CSP accepted and enforced
  const cspPage = await context.newPage();
  const cspConsole = [];
  cspPage.on('console', (m) => cspConsole.push(`${m.type()}: ${m.text()}`));
  await cspPage.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.violatedDirective}|${e.blockedURI}`));
  });
  await cspPage.goto(`${ORIGIN}/csp`);
  const before = routed.length;
  const cspResult = await cspPage.evaluate(async () => {
    const tryFetch = (u) => fetch(u).then(() => 'ok', (e) => `rejected:${e.name}`);
    const allowed = await tryFetch('https://allowed.example/x');
    const blocked = await tryFetch('https://blocked.example/x');
    const s = document.createElement('script');
    s.textContent = 'window.__inline = true';
    document.body.appendChild(s);
    await new Promise((r) => setTimeout(r, 200)); // violation events are queued tasks
    return { allowed, blocked, inline: window.__inline === true, violations: window.__violations };
  });
  const reached = routed.slice(before);
  ok(reached.some((u) => u.startsWith('https://allowed.example')), 'D: a listed connect origin never reached the network layer');
  ok(!reached.some((u) => u.startsWith('https://blocked.example')), 'D: CSP did not stop a request to an unlisted origin');
  ok(cspResult.violations.some((v) => v.startsWith('connect-src') && v.includes('blocked.example')), `D: no connect-src violation recorded (${cspResult.violations.join(', ')})`);
  ok(cspResult.inline === false, 'D: inline script ran despite script-src self');
  ok(!cspConsole.some((m) => /ignored|unrecognized|invalid|directive.*not/i.test(m) && !/Refused to/i.test(m)), `D: Chromium reported CSP parse problems: ${cspConsole.join(' | ')}`);

  ok(problemsBeforeSri === 0, `console problems before the SRI cases: ${consoleProblems.slice(0, problemsBeforeSri).join(' | ')}`);
  const version = browser.version();
  console.log(JSON.stringify({ browser: `chromium ${version}`, A: 'parity', B: rows.length, C: sriRows.length, D: cspResult, notes, failures }, null, 2));
} finally {
  await browser.close();
}
process.exit(failures.length === 0 ? 0 : 1);
