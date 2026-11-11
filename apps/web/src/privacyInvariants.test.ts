import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/** Production sources only: no tests, fixtures or test helpers. Comments are stripped so prose cannot trip or hide a check. */
function productionSources(root: string): { readonly file: string; readonly text: string }[] {
  return walk(root)
    .map((f) => ({ file: relative(root, f).split(sep).join('/'), abs: f }))
    .filter(({ file }) => /\.(ts|tsx)$/.test(file) && !/\.test\.|\.testutil\.|(^|\/)test\//.test(file))
    .map(({ file, abs }) => ({
      file,
      text: readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'),
    }));
}

const TELEMETRY = /sendBeacon|sentry|posthog|gtag\s*\(|google-?analytics|googletagmanager|mixpanel|amplitude|segment\.(?:com|io)|plausible|hotjar|datadog|fullstory|logrocket|bugsnag|rollbar|newrelic|matomo|navigator\.connection/i;
const TELEMETRY_PACKAGES = /sentry|posthog|analytics|mixpanel|amplitude|segment|plausible|hotjar|datadog|fullstory|logrocket|bugsnag|rollbar|newrelic|matomo|gtag/i;

describe('privacy invariants: web app', () => {
  const web = productionSources(WEB_SRC);

  it('found production sources to check (guards against a path mistake making this test vacuous)', () => {
    expect(web.length).toBeGreaterThan(50);
    expect(web.some((s) => s.file === 'lib/relayerClient.ts')).toBe(true);
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
    const files = web.filter((s) => /(?<![.\w$])fetch\s*\(|=>\s*fetch\s*\(/.test(s.text) || /\bfetch\(u, i\)/.test(s.text)).map((s) => s.file).sort();
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
    // Dummy base used only to parse request paths; never contacted.
    expect(origins).toEqual(['server.ts: http://relayer.invalid']);
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
