import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Pins privacy properties the code already intends (docs/threat-model/PRIVACY_THREAT_MODEL.md, section 6):
 * no analytics or telemetry client, no fixed third-party origin, and a short, explicit list of files that may issue a
 * network request. These are source-level checks; apps/web/scripts/scan-bundle.mjs separately scans the built bundle for
 * unexpected origin literals, so the two together cover source and output. A failure here means a new network path or
 * telemetry dependency was added and the privacy documents must be reviewed before the test list is edited.
 */

const WEB_SRC = fileURLToPath(new URL('.', import.meta.url));
const WEB_ROOT = join(WEB_SRC, '..');
const RELAYER_SRC = join(WEB_ROOT, '..', 'relayer', 'src');
const RELAYER_ROOT = join(WEB_ROOT, '..', 'relayer');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * Production sources only: no tests, fixtures or test helpers. Comments are removed with the TypeScript printer (a real
 * tokenizer), so prose cannot trip a check and a `/*` inside a string or line comment cannot swallow code. A regex
 * stripper did exactly that (it deleted most of i18n/message.ts), which is why the shrink guard below exists.
 */
const printer = ts.createPrinter({ removeComments: true });
function productionSources(root: string): { readonly file: string; readonly text: string; readonly raw: string; readonly sf: ts.SourceFile }[] {
  return walk(root)
    .map((f) => ({ file: relative(root, f).split(sep).join('/'), abs: f }))
    .filter(({ file }) => /\.(ts|tsx)$/.test(file) && !/\.test\.|\.testutil\.|(^|\/)test\//.test(file))
    .map(({ file, abs }) => {
      const raw = readFileSync(abs, 'utf8');
      const sf = ts.createSourceFile(abs, raw, ts.ScriptTarget.Latest, true, abs.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      return { file, raw, sf, text: printer.printFile(sf) };
    });
}

const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
/** True for `window`, `(globalThis as T)`, `window!`, `globalThis.window`, ...: outer casts/parens are unwrapped. */
function isGlobalObject(e: ts.Expression): boolean {
  let x: ts.Expression = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isTypeAssertionExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x)) x = x.expression;
  if (ts.isIdentifier(x)) return GLOBAL_OBJECTS.has(x.text);
  if (ts.isPropertyAccessExpression(x) && GLOBAL_OBJECTS.has(x.name.text)) return isGlobalObject(x.expression);
  return false;
}
/**
 * True when the file references the global `fetch`: a bare `fetch` identifier in value position (call, alias,
 * shorthand `{ fetch }`), `.fetch` on a global object even behind casts, parentheses or `!`
 * (`(globalThis as T).fetch`), or `globalThis['fetch']`. Property names such as `{ fetch: ... }` or `rpc.fetch(...)`
 * on an injected client and `typeof fetch` in a type are not the global. A name built at runtime is not detected.
 */
function referencesGlobalFetch(sf: ts.SourceFile): boolean {
  let hit = false;
  const visit = (n: ts.Node): void => {
    if (hit) return;
    if (ts.isTypeQueryNode(n) || ts.isTypeReferenceNode(n)) return;
    if (ts.isIdentifier(n) && n.text === 'fetch') {
      const p = n.parent;
      const isName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isMethodSignature(p)) && p.name === n);
      if (!isName) hit = true;
      else if (ts.isPropertyAccessExpression(p) && isGlobalObject(p.expression)) hit = true;
    }
    if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === 'fetch') hit = true;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hit;
}
const parseSnippet = (code: string): ts.SourceFile => ts.createSourceFile('probe.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const TELEMETRY = /sendBeacon|sentry|posthog|gtag\s*\(|google-?analytics|googletagmanager|mixpanel|amplitude|segment\.(?:com|io)|plausible|hotjar|datadog|fullstory|logrocket|bugsnag|rollbar|newrelic|matomo|navigator\.connection/i;
const TELEMETRY_PACKAGES = /sentry|posthog|analytics|mixpanel|amplitude|segment|plausible|hotjar|datadog|fullstory|logrocket|bugsnag|rollbar|newrelic|matomo|gtag/i;

describe('privacy invariants: global fetch detector', () => {
  it.each([
    'fetch("x")',
    'const f = fetch; f("x")',
    'window.fetch("x")',
    'self.fetch("x")',
    'globalThis?.fetch("x")',
    'globalThis["fetch"]("x")',
    'window[`fetch`]("x")',
    'const o = { fetch }',
    'const { fetch: f } = globalThis; f("x")',
    '(globalThis as { fetch?: typeof fetch }).fetch?.("x")',
    '(globalThis as any).fetch("x")',
    '(window as Window).fetch("x")',
    '(globalThis).fetch("x")',
    'window!.fetch("x")',
    'globalThis.window.fetch("x")',
  ])('flags %s', (code) => {
    expect(referencesGlobalFetch(parseSnippet(code))).toBe(true);
  });
  it.each(['const o = { fetch: 1 }', 'type F = typeof fetch', 'rpc.fetch("x")', 'this.fetchFn("x")', 'const s = "fetch failed"'])('does not flag %s', (code) => {
    expect(referencesGlobalFetch(parseSnippet(code))).toBe(false);
  });
});

describe('privacy invariants: web app', () => {
  const web = productionSources(WEB_SRC);

  it('found production sources to check (guards against a path mistake making this test vacuous)', () => {
    expect(web.length).toBeGreaterThan(50);
    expect(web.some((s) => s.file === 'lib/relayerClient.ts')).toBe(true);
  });

  it('comment removal keeps the code (guards against a stripper that silently deletes what it should check)', () => {
    // Printed output reformats code but never drops statements; a file shrinking to a fraction of its source means
    // code went missing. Comment-heavy files stay well above this bound.
    const shrunk = web.filter((s) => s.text.length < s.raw.length * 0.25 && s.raw.length > 2000).map((s) => s.file);
    expect(shrunk).toEqual([]);
    const msg = web.find((s) => s.file === 'i18n/message.ts');
    expect(msg?.text).toMatch(/export function/);
  });

  it('contains no analytics, telemetry, beacon or fingerprinting-API client', () => {
    const hits = web.filter((s) => TELEMETRY.test(s.text)).map((s) => s.file);
    expect(hits).toEqual([]);
  });

  it('embeds no fixed third-party origin (RPC, relayer and Esplora URLs are user-supplied at runtime)', () => {
    const origins: string[] = [];
    for (const s of web) for (const m of s.text.matchAll(/\b(?:https?|wss?):\/\/[A-Za-z0-9][A-Za-z0-9.-]*/g)) origins.push(`${s.file}: ${m[0]}`);
    // SVG namespace identifier used by the QR renderer; never fetched.
    expect(origins).toEqual(['lib/qr.ts: http://www.w3.org']);
  });

  it('opens no WebSocket, EventSource, XMLHttpRequest or image/beacon channel of its own', () => {
    const hits = web
      .filter((s) => /\bnew\s+(?:WebSocket|EventSource|XMLHttpRequest)\b|\bnew\s+Image\s*\(|navigator\.sendBeacon|\bimportScripts\s*\(/.test(s.text))
      .map((s) => s.file);
    expect(hits).toEqual([]);
  });

  it('issues fetch() only from the three audited call sites (everything else uses the injected fetchFn or RPC client)', () => {
    const files = web.filter((s) => referencesGlobalFetch(s.sf)).map((s) => s.file).sort();
    expect(files).toEqual(['lib/defaultServices.ts', 'lib/manifest.ts', 'lib/relayerClient.ts']);
  });

  it('sends relayer requests without cookies or referrer and never follows redirects', () => {
    const text = web.find((s) => s.file === 'lib/relayerClient.ts')?.text ?? '';
    expect(text).toMatch(/credentials:\s*'omit'/);
    expect(text).toMatch(/referrerPolicy:\s*'no-referrer'/);
    expect(text).toMatch(/redirect:\s*'error'/);
    expect(text).toMatch(/cache:\s*'no-store'/);
  });

  it('declares no analytics or telemetry package in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(WEB_ROOT, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    const names = [...Object.keys(pkg['dependencies'] ?? {}), ...Object.keys(pkg['devDependencies'] ?? {}), ...Object.keys(pkg['optionalDependencies'] ?? {})];
    expect(names.filter((n) => TELEMETRY_PACKAGES.test(n))).toEqual([]);
  });

  it('ships index.html with a no-referrer policy and a CSP that allows no remote script, style, font or image origin', () => {
    const html = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/name="referrer"\s+content="no-referrer"/);
    const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/'unsafe-(?:inline|eval)'/);
    // The only network-capable directive is connect-src, which is broad by design (user-chosen RPC, relayer, Esplora).
    expect(csp).toContain("connect-src 'self' https: wss:");
  });

  it('host _headers repeat no-referrer and the same-origin script policy', () => {
    const headers = readFileSync(join(WEB_ROOT, 'public', '_headers'), 'utf8');
    expect(headers).toContain('Referrer-Policy: no-referrer');
    expect(headers).toContain("script-src 'self'");
    expect(headers).toContain("frame-ancestors 'none'");
  });
});

describe('privacy invariants: relayer', () => {
  const relayer = productionSources(RELAYER_SRC);

  it('found relayer production sources', () => {
    expect(relayer.length).toBeGreaterThan(10);
  });

  it('contains no analytics or telemetry client and no fixed third-party origin', () => {
    expect(relayer.filter((s) => TELEMETRY.test(s.text)).map((s) => s.file)).toEqual([]);
    const origins: string[] = [];
    for (const s of relayer) for (const m of s.text.matchAll(/\b(?:https?|wss?):\/\/[A-Za-z0-9][A-Za-z0-9.-]*/g)) origins.push(`${s.file}: ${m[0]}`);
    // server.ts: dummy base used only to parse request paths; never contacted. ops.ts: the operator CLI's `health`
    // command, whose default target is the relayer's own loopback listener (http://127.0.0.1:8787) and whose usage text
    // shows an http://host:port placeholder; an operator-supplied --url or RELAYER_HEALTH_URL overrides it. Neither is
    // a third-party origin.
    expect(origins.sort()).toEqual(['ops.ts: http://127.0.0.1', 'ops.ts: http://host', 'server.ts: http://relayer.invalid']);
  });

  it('declares no analytics or telemetry package in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(RELAYER_ROOT, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    const names = [...Object.keys(pkg['dependencies'] ?? {}), ...Object.keys(pkg['devDependencies'] ?? {})];
    expect(names.filter((n) => TELEMETRY_PACKAGES.test(n))).toEqual([]);
  });

  it('keeps the log schema a closed allowlist with no address, amount, signature or IP field', () => {
    const log = relayer.find((s) => s.file === 'log.ts')?.text ?? '';
    const iface = /export interface LogFields \{([\s\S]*?)\n\}/.exec(log)?.[1] ?? '';
    const fields = [...iface.matchAll(/readonly (\w+)\??:/g)].map((m) => m[1]).sort();
    expect(fields).toEqual(['chainId', 'errorClass', 'requestId', 'route', 'status', 'txHash']);
  });
});
