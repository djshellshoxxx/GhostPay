import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ALLOWED_URLS, scanBundle } from '../scripts/scan-bundle.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const GOOD_HTML = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'"><meta name="referrer" content="no-referrer"><script type="module" src="./assets/a.js"></script><link rel="stylesheet" href="./assets/a.css"></head><body></body></html>`;
const GOOD_HEADERS = `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=()\n`;

function build(files: Record<string, string> = {}, opts: { html?: string; headers?: string | null } = {}): { dist: string; src: string; cfg: string } {
  const root = mkdtempSync(join(tmpdir(), 'gp-scan-'));
  dirs.push(root);
  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), opts.html ?? GOOD_HTML);
  if (opts.headers !== null) writeFileSync(join(dist, '_headers'), opts.headers ?? GOOD_HEADERS);
  writeFileSync(join(dist, 'assets/a.js'), 'console.log(1)');
  writeFileSync(join(dist, 'assets/a.css'), 'body{color:red}');
  for (const [name, text] of Object.entries(files)) {
    const p = join(root, name);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text);
  }
  writeFileSync(join(root, 'vite.config.ts'), files['vite.config.ts'] ?? 'export default { build: { sourcemap: false } }');
  return { dist, src: join(root, 'src'), cfg: join(root, 'vite.config.ts') };
}

const scan = (b: ReturnType<typeof build>): string[] => scanBundle(b.dist, b.src, b.cfg);

describe('scan-bundle', () => {
  it('permits the exact independently approved Pages origin only as a direct origin comparison', () => {
    const approved = 'https://djshellshoxxx.github.io';
    const b = build({ 'dist/assets/a.js': `function authorized(){return globalThis.origin === "${approved}"}` });
    expect(scanBundle(b.dist, b.src, b.cfg)).toContainEqual(expect.stringContaining('unexpected origin'));
    expect(scanBundle(b.dist, b.src, b.cfg, approved)).toEqual([]);
    for (const operation of [`fetch("${approved}")`, `fetch("${approved}/collect")`,
      'globalThis.origin === "https://other.github.io"', `globalThis.origin === "${approved}/GhostPay/"`]) {
      writeFileSync(join(b.dist, 'assets/a.js'), `globalThis.origin === "${approved}"; ${operation}`);
      expect(scanBundle(b.dist, b.src, b.cfg, approved)).toContainEqual(expect.stringContaining('unexpected origin'));
    }
  });

  it('passes a clean build', () => {
    expect(scan(build())).toEqual([]);
  });

  it('fails when dist is missing', () => {
    expect(scanBundle('/nonexistent-dist')[0]).toMatch(/not found/);
  });

  it.each([
    ['eval', 'dist/assets/a.js', 'var x = eval("1")', /eval/],
    ['new Function', 'dist/assets/a.js', 'var f = new Function("return 1")', /new Function/],
    ['Function()', 'dist/assets/a.js', 'var f = Function("return 1")', /Function\(\)/],
    ['string timers', 'dist/assets/a.js', 'setTimeout("alert(1)", 5)', /string/],
    ['document.write', 'dist/assets/a.js', 'document.write("x")', /document\.write/],
    ['innerHTML assignment', 'dist/assets/a.js', 'el.innerHTML = x', /innerHTML/],
    ['outerHTML assignment', 'dist/assets/a.js', 'el.outerHTML = x', /outerHTML/],
    ['insertAdjacentHTML', 'dist/assets/a.js', 'el.insertAdjacentHTML("beforeend", x)', /insertAdjacentHTML/],
    ['dangerouslySetInnerHTML prop', 'dist/assets/a.js', 'h("div",{dangerouslySetInnerHTML:{__html:x}})', /dangerouslySetInnerHTML/],
    ['importScripts', 'dist/assets/a.js', 'importScripts("x.js")', /importScripts/],
    ['Math.random', 'dist/assets/a.js', 'var r = Math.random()', /Math\.random/],
    ['unknown https host', 'dist/assets/a.js', 'fetch("https://tracker.example/x")', /unexpected origin or hostname "https:\/\/tracker\.example/],
    ['http literal', 'dist/assets/a.js', 'var u="http://insecure.example/"', /unexpected origin/],
    ['websocket host', 'dist/assets/a.js', 'new WebSocket("wss://evil.example")', /unexpected origin/],
    ['source map reference', 'dist/assets/a.js', 'x\n//# sourceMappingURL=a.js.map', /sourceMappingURL/],
    ['source map file', 'dist/assets/a.js.map', '{}', /source map emitted/],
    ['css import', 'dist/assets/a.css', '@import url(x.css);', /@import/],
    ['css remote url', 'dist/assets/a.css', 'a{background:url(https://x.test/a.png)}', /remote url\(\)|unexpected origin/],
    ['css font-face', 'dist/assets/a.css', '@font-face{font-family:x}', /font-face/],
    ['worker with fetch', 'dist/assets/scanner.worker-1.js', 'fetch("/x")', /network API "fetch\("/],
    ['worker with websocket', 'dist/assets/scanner.worker-1.js', 'new WebSocket(u)', /WebSocket/],
    ['shipped manifest', 'dist/deployments/84532.json', '{}', /manifest is shipped/],
    ['dangerouslySetInnerHTML in src', 'src/Bad.tsx', 'export const A = () => <div dangerouslySetInnerHTML={{__html: x}} />;', /src\/Bad\.tsx: dangerouslySetInnerHTML/],
    ['innerHTML in src', 'src/Bad.ts', 'el.innerHTML = "x";', /src\/Bad\.ts: innerHTML/],
    ['eval in src', 'src/Bad.ts', 'eval("1");', /eval\/new Function/],
    ['sourcemap enabled', 'vite.config.ts', 'export default { build: { sourcemap: true } }', /sourcemap is enabled/],
    ['hidden sourcemap', 'vite.config.ts', "export default { build: { sourcemap: 'hidden' } }", /sourcemap is enabled/],
    // Release boundary (audit L8-04): fixed strings of preserved code that one stray import would pull into the bundle.
    ['preserved PIR client', 'dist/assets/a.js', 'throw new E("TRANSPORT","PIR server request failed")', /preserved-code marker "PIR server request failed"/],
    ['preserved pir2 scan source', 'dist/assets/a.js', 'throw new S("OUT_OF_RANGE","window outside the PIR shard")', /preserved-code marker "window outside the PIR shard"/],
    ['preserved light-client source', 'dist/assets/a.js', 'throw new S("HEAD_MISMATCH","light client could not confirm a block hash")', /preserved-code marker "light client could not confirm/],
    ['preserved quorum source', 'dist/assets/a.js', 'throw new S("SOURCE_DISAGREE","sources disagree on the announcement set")', /preserved-code marker "sources disagree on the announcement set"/],
    ['preserved scan-mode claims', 'dist/assets/a.js', 'var c={label:"Two-server PIR scanning (research PoC, testnet only)"}', /preserved-code marker "Two-server PIR scanning/],
    ['preserved prover', 'dist/assets/a.js', 'var p={protocol:"groth16"}', /preserved-code marker "groth16"/],
    ['preserved external pools', 'dist/assets/a.js', 'var id="privacy-pools"', /preserved-code marker "privacy-pools"/],
    // SEC-14: the legacy unsigned-dev text-manifest path must not reach any build (lean or full).
    ['legacy unsigned-dev manifest acceptance', 'dist/assets/a.js', 'var w="UNSIGNED DEV MANIFEST: no release key is pinned, so this deployment manifest is not authenticated. Testnet use only"', /legacy text-manifest marker "no release key is pinned/],
    ['legacy text-manifest signing domain', 'dist/assets/a.js', 'var d="GhostPay-deployment-manifest-v1\\n"', /legacy text-manifest marker "GhostPay-deployment-manifest-v1"/],
    ['preserved code in the worker', 'dist/assets/scanner.worker-1.js', 'throw Error("PIR server request failed")', /scanner\.worker-1\.js: preserved-code marker/],
  ])('fails on %s', (_name, file, content, re) => {
    const b = build({ [file]: content });
    const problems = scan(b);
    expect(problems.join('\n')).toMatch(re);
    expect(problems.length).toBeGreaterThan(0);
  });

  it('ignores violations only present in test files and comments in source', () => {
    const b = build({ 'src/a.test.ts': 'el.innerHTML = "x"', 'src/Ok.ts': '// el.innerHTML = x\n/* eval("1") */\nexport const a = 1;' });
    expect(scan(b)).toEqual([]);
  });

  it('does not let a URL string literal hide same-line src sinks from the comment stripper', () => {
    const b = build({ 'src/Hide.ts': 'const u = "https://x.example/a"; el.innerHTML = y;\nconst v = `http://x`; eval("1");\n' });
    const out = scan(b).join('\n');
    expect(out).toMatch(/src\/Hide\.ts: innerHTML/);
    expect(out).toMatch(/src\/Hide\.ts: eval/);
  });

  it.each([
    ['nested template', 'Hidden.ts', 'const t = `${`//`}`; el.innerHTML = x;\n', 'innerHTML/outerHTML assignment'],
    ['regex after a condition', 'Hidden.ts', 'if (a) /\\/*/.test(b); el.innerHTML = c; const r = /x*/;\n', 'innerHTML/outerHTML assignment'],
    ['JSX URL text', 'Hidden.tsx', 'export const A = () => <a>https://x.y</a>; eval(z);\n', 'eval/new Function'],
    ['compound assignment', 'Hidden.ts', 'el.innerHTML += x;\n', 'innerHTML/outerHTML assignment'],
    ['string-keyed assignment', 'Hidden.ts', 'el["outerHTML"] = x;\n', 'innerHTML/outerHTML assignment'],
    ['parenthesised eval', 'Hidden.ts', '(0, eval)("1");\n', 'eval/new Function'],
    ['parenthesised constructor', 'Hidden.ts', 'new (Function)("return 1");\n', 'eval/new Function'],
    ['comment-separated property', 'Hidden.ts', 'el /* first */ . /* second */ innerHTML = x;\n', 'innerHTML/outerHTML assignment'],
    ['unparsable TypeScript', 'Hidden.ts', 'const = = = ;\n', 'could not be parsed'],
  ])('rejects source sinks or parse failures after %s', (_name, file, text, problem) => {
    expect(scan(build({ [`src/${file}`]: text }))).toContain(`src/${file}: ${problem}`);
  });

  it('does not mistake inert sink-looking strings, regex literals or JSX text for executable sinks', () => {
    const b = build({
      'src/Safe.tsx': 'const text = "el.innerHTML = x; eval(1); new Function(1)"; const r = /el.innerHTML = x/; export const A = () => <span>eval(x)</span>;\n',
      'src/Compare.ts': 'if (a === b) { x.innerHTML == y; }\n',
    });
    expect(scan(b)).toEqual([]);
  });

  it('allows the documented React DOM fingerprints but not extra innerHTML assignments', () => {
    const react = 'o.innerHTML=`<script><\\/script>`;\n?.__html!==n&&(e.innerHTML=n);case`innerHTML`:break;case`dangerouslySetInnerHTML`:if(r!=null){}n.dangerouslySetInnerHTML!=null';
    expect(scan(build({ 'dist/assets/a.js': react }))).toEqual([]);
    expect(scan(build({ 'dist/assets/a.js': `${react}\nx.innerHTML=userText;` })).join()).toMatch(/innerHTML assignment/);
    expect(scan(build({ 'dist/assets/a.js': 'var k=Math.random().toString(36).slice(2)' }))).toEqual([]);
  });

  it('allows only the documented inert URLs', () => {
    for (const a of ALLOWED_URLS) {
      expect(a.reason.length).toBeGreaterThan(10);
      expect(scan(build({ 'dist/assets/a.js': `var u="${a.prefix}x"` }))).toEqual([]);
    }
    expect(scan(build({ 'dist/assets/a.js': 'var s="https://"' }))).toEqual([]);
  });

  it('checks index.html for inline code, remote resources and the CSP/referrer meta tags', () => {
    const bad = (html: string): string => scan(build({}, { html })).join('\n');
    expect(bad(GOOD_HTML.replace('<script type="module" src="./assets/a.js"></script>', '<script>alert(1)</script>'))).toMatch(/inline <script>/);
    expect(bad(GOOD_HTML.replace('src="./assets/a.js"', 'src="https://cdn.example/a.js"'))).toMatch(/remote script/);
    expect(bad(GOOD_HTML.replace('</body>', '<style>a{}</style></body>'))).toMatch(/inline <style>/);
    expect(bad(GOOD_HTML.replace('<body>', '<body style="color:red">'))).toMatch(/inline style attribute/);
    expect(bad(GOOD_HTML.replace('<body>', '<body onload="x()">'))).toMatch(/inline event handler/);
    expect(bad(GOOD_HTML.replace('href="./assets/a.css"', 'href="https://fonts.example/a.css"'))).toMatch(/remote <link>/);
    expect(bad(GOOD_HTML.replace(/<meta http-equiv[^>]*>/, ''))).toMatch(/meta CSP missing/);
    expect(bad(GOOD_HTML.replace('<meta name="referrer" content="no-referrer">', ''))).toMatch(/referrer/);
    expect(bad(GOOD_HTML.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"))).toMatch(/unsafe-inline/);
    expect(bad(GOOD_HTML.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"))).toMatch(/unsafe-inline styles/);
    expect(bad(GOOD_HTML.replace('<script type="module" src="./assets/a.js"></script>', '<script src="./a.js">alert(1)</script>'))).toMatch(/both src and inline/);
  });

  it('still finds inline scripts whose end tag carries whitespace or attributes, or that are never closed', () => {
    const bad = (html: string): string => scan(build({}, { html })).join('\n');
    const module = '<script type="module" src="./assets/a.js"></script>';
    // HTML parsers end a script element at `</script` followed by whitespace, `/` or `>`.
    for (const end of ['</script >', '</SCRIPT\t>', '</script foo="bar">', '</script\n>']) {
      expect(bad(GOOD_HTML.replace(module, `<script>alert(1)${end}`))).toMatch(/inline <script>/);
    }
    expect(bad(GOOD_HTML.replace(module, `<script src="./a.js">alert(1)</script >`))).toMatch(/both src and inline/);
    // An unterminated element is not a parsable external script either.
    expect(scan(build({}, { html: GOOD_HTML.replace(module, '<script>alert(1)') }))).toContain('index.html: unterminated <script>');
    expect(scan(build())).toEqual([]);
  });

  it('requires a hardened _headers file', () => {
    expect(scan(build({}, { headers: null })).join()).toMatch(/_headers missing/);
    expect(scan(build({}, { headers: '/*\n  X: y\n' })).join()).toMatch(/_headers: missing default-src/);
    expect(scan(build({}, { headers: `${GOOD_HEADERS}  Content-Security-Policy: script-src 'unsafe-eval'\n` })).join()).toMatch(/unsafe-inline\/eval/);
  });
});
