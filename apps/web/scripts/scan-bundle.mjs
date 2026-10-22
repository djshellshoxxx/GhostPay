#!/usr/bin/env node
// Post-build scan of apps/web/dist (npm run build -> postbuild). Fails the build on dynamic code, HTML injection,
// unexpected origins/hostnames, source maps, inline script/style, or network APIs inside the scanner worker.
// React DOM's own internals contain a few innerHTML / dangerouslySetInnerHTML strings; those are matched by explicit
// fingerprints below (and the application source is separately forbidden from using them, enforced by ESLint and by
// the source scan here). Anything else fails.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseKeys, validateDeployments } from './validate-deployments.mjs';

/** Hosts/URLs that may appear as inert string literals. None is ever fetched; each has a reason. */
export const ALLOWED_URLS = [
  { prefix: 'http://www.w3.org/2000/svg', reason: 'SVG XML namespace identifier (React DOM, QR code library)' },
  { prefix: 'http://www.w3.org/1999/xlink', reason: 'XLink XML namespace identifier (React DOM)' },
  { prefix: 'http://www.w3.org/XML/1998/namespace', reason: 'XML namespace identifier (React DOM)' },
  { prefix: 'http://www.w3.org/1998/Math/MathML', reason: 'MathML namespace identifier (React DOM)' },
  { prefix: 'https://react.dev/errors/', reason: 'React production error-decoder text in a thrown message' },
  { prefix: 'https://viem.sh', reason: 'viem error documentation link inside error message text' },
  { prefix: 'https://4byte.sourcify.dev/', reason: 'viem error hint text ("you can look up the signature here")' },
];

/** React DOM internals that legitimately contain these substrings (name-agnostic fingerprints). */
const REACT_INNERHTML_OK = [
  /\.innerHTML=`<script><\\\/script>`/g, // React creates a <script> element through a div
  /__html[!=]==?\w+&&\(\w+\.innerHTML=\w+\)/g, // React applying the dangerouslySetInnerHTML prop (never passed by this app)
  /case`innerHTML`:/g, // prop-name switch
];

const FORBIDDEN_JS = [
  { name: 'eval', re: /(?<![.\w$])eval\s*\(/g },
  { name: 'new Function', re: /new\s+Function\s*\(/g },
  { name: 'Function()', re: /(?<![.\w$])Function\s*\(/g },
  { name: 'setTimeout/setInterval with string', re: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/g },
  { name: 'document.write', re: /document\s*\.\s*write(?:ln)?\s*\(/g },
  { name: 'insertAdjacentHTML', re: /insertAdjacentHTML/g },
  { name: 'outerHTML assignment', re: /\.outerHTML\s*=(?!=)/g },
  { name: 'dangerouslySetInnerHTML prop use', re: /dangerouslySetInnerHTML\s*[:=](?!=)/g },
  { name: 'importScripts', re: /importScripts\s*\(/g },
  { name: 'Math.random outside React keys', re: /Math\.random\s*\(\s*\)(?!\.toString\(36\)\.slice\(2\))/g },
];

const WORKER_FORBIDDEN = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'importScripts', 'navigator.serviceWorker'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function countMatches(text, re) {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))].length;
}

function scanInnerHtml(text, label, problems) {
  const all = countMatches(text, /\.innerHTML\s*=(?!=)/g);
  let allowed = 0;
  for (const fp of REACT_INNERHTML_OK.slice(0, 2)) allowed += countMatches(text, fp);
  if (all > allowed) problems.push(`${label}: ${String(all - allowed)} innerHTML assignment(s) outside the known React DOM fingerprints`);
}

function scanHosts(text, label, problems) {
  for (const m of text.matchAll(/\b(?:https?|wss?):\/\/([A-Za-z0-9][A-Za-z0-9.-]*)?[^\s"'`<>)\\]*/g)) {
    const full = m[0];
    if (m[1] === undefined) continue; // a bare "https://" scheme literal used for prefix checks
    if (!ALLOWED_URLS.some((a) => full.startsWith(a.prefix))) problems.push(`${label}: unexpected origin or hostname "${full.slice(0, 80)}"`);
  }
}

/** Scans a built `dist` directory (and optionally the app source tree) and returns a list of problems. */
export function scanBundle(distDir, srcDir, viteConfigPath) {
  const problems = [];
  if (!existsSync(distDir)) return [`dist directory not found: ${distDir}`];
  const files = walk(distDir);
  const rel = (f) => relative(distDir, f).split(sep).join('/');

  for (const f of files) {
    const r = rel(f);
    if (r.endsWith('.map')) problems.push(`${r}: source map emitted`);
    if (/\.(js|mjs|css)$/.test(r)) {
      const text = readFileSync(f, 'utf8');
      if (/sourceMappingURL/.test(text)) problems.push(`${r}: sourceMappingURL reference`);
      scanHosts(text, r, problems);
      if (r.endsWith('.css')) {
        if (/@import/.test(text)) problems.push(`${r}: @import in CSS`);
        if (/url\(\s*["']?(?:https?:)?\/\//.test(text)) problems.push(`${r}: remote url() in CSS`);
        if (/font-face/.test(text)) problems.push(`${r}: @font-face present (no remote fonts allowed)`);
      } else {
        for (const { name, re } of FORBIDDEN_JS) {
          const n = countMatches(text, re);
          if (n > 0) problems.push(`${r}: ${name} (${String(n)} occurrence${n === 1 ? '' : 's'})`);
        }
        scanInnerHtml(text, r, problems);
        if (/worker/i.test(r)) {
          for (const w of WORKER_FORBIDDEN) if (text.includes(w)) problems.push(`${r}: scanner worker contains network API "${w}"`);
        }
      }
    }
  }

  const indexPath = join(distDir, 'index.html');
  if (!existsSync(indexPath)) problems.push('index.html missing');
  else {
    const html = readFileSync(indexPath, 'utf8');
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(m[1])) problems.push('index.html: inline <script>');
      else if (m[2].trim() !== '') problems.push('index.html: script with both src and inline body');
      if (/\bsrc\s*=\s*["']?(?:https?:)?\/\//.test(m[1])) problems.push('index.html: remote script');
    }
    if (/<style\b/i.test(html)) problems.push('index.html: inline <style>');
    if (/\sstyle\s*=/i.test(html)) problems.push('index.html: inline style attribute');
    if (/\son[a-z]+\s*=/i.test(html)) problems.push('index.html: inline event handler attribute');
    if (/<link\b[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\//i.test(html)) problems.push('index.html: remote <link>');
    if (!/http-equiv="Content-Security-Policy"/.test(html)) problems.push('index.html: meta CSP missing');
    if (!/name="referrer"\s+content="no-referrer"/.test(html)) problems.push('index.html: meta referrer no-referrer missing');
    if (/script-src[^;"]*'unsafe-(?:inline|eval)'/.test(html)) problems.push("index.html: CSP allows unsafe-inline/eval scripts");
    if (/style-src[^;"]*'unsafe-inline'/.test(html)) problems.push("index.html: CSP allows unsafe-inline styles");
    scanHosts(html, 'index.html', problems);
  }

  const headersPath = join(distDir, '_headers');
  if (!existsSync(headersPath)) problems.push('_headers missing');
  else {
    const h = readFileSync(headersPath, 'utf8');
    for (const need of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", 'Referrer-Policy: no-referrer', 'X-Content-Type-Options: nosniff', 'Permissions-Policy']) {
      if (!h.includes(need)) problems.push(`_headers: missing ${need}`);
    }
    if (/'unsafe-(?:inline|eval)'/.test(h)) problems.push('_headers: unsafe-inline/eval in CSP');
  }

  if (existsSync(join(distDir, 'deployments'))) {
    for (const f of walk(join(distDir, 'deployments'))) {
      if (/\.json$/i.test(f)) problems.push(`deployments/${relative(join(distDir, 'deployments'), f)}: a manifest is shipped (none may be)`);
    }
  }

  if (viteConfigPath !== undefined && existsSync(viteConfigPath)) {
    const cfg = readFileSync(viteConfigPath, 'utf8');
    if (/sourcemap\s*:\s*(?:true|['"](?:inline|hidden)['"])/.test(cfg)) problems.push('vite.config: build.sourcemap is enabled');
  }

  if (srcDir !== undefined && existsSync(srcDir)) {
    for (const f of walk(srcDir)) {
      const r = relative(srcDir, f).split(sep).join('/');
      if (!/\.(ts|tsx)$/.test(r) || /\.test\.|\/test\//.test(r)) continue;
      const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/dangerouslySetInnerHTML/.test(text)) problems.push(`src/${r}: dangerouslySetInnerHTML`);
      if (/\.innerHTML\s*=(?!=)|\.outerHTML\s*=(?!=)/.test(text)) problems.push(`src/${r}: innerHTML/outerHTML assignment`);
      if (/(?<![.\w$])eval\s*\(|new\s+Function\s*\(/.test(text)) problems.push(`src/${r}: eval/new Function`);
    }
  }
  return problems;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const deploymentDir = process.env['GHOSTPAY_DEPLOYMENTS_DIR'] === undefined
    ? join(root, 'deployments')
    : resolve(process.env['GHOSTPAY_DEPLOYMENTS_DIR']);
  const deploymentProblems = await validateDeployments(deploymentDir, parseReleaseKeys(process.env['GHOSTPAY_RELEASE_PUBKEYS']));
  if (deploymentProblems.length > 0) {
    console.error('Deployment manifest scan FAILED:');
    for (const p of deploymentProblems) console.error(` - ${p}`);
    process.exit(1);
  }
  const problems = scanBundle(join(root, 'dist'), join(root, 'src'), join(root, 'vite.config.ts'));
  if (problems.length > 0) {
    console.error('Bundle scan FAILED:');
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }
  const files = walk(join(root, 'dist'));
  console.log(`Bundle scan passed: ${String(files.length)} files; bundled deployment source validated; no dynamic code, unexpected origins, source maps, or loose deployment JSON.`);
}
