// @ts-check
// Generates a tiny, deterministic, CSP-clean single-page demo site so the full workflow (validate -> package ->
// verify -> preview -> profiles) runs without any user-supplied files and without a GhostPay build. Asset names are
// content-hashed like a Vite build, URLs are relative (works at "/" and under a subpath), there is one SPA deep link
// ("./settings"), a hash route, a nested directory index, a same-origin JSON fetch and a `.well-known` file.
// The page reports whether it runs in a secure context, which matters for onion/I2P origins served over http.
import { createHash } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ERROR_CODES, KitError } from '../errors.mjs';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'self'";
const META_CSP = CSP.replace("; frame-ancestors 'none'", ''); // frame-ancestors is ignored in a meta tag

const DEMO_JS = `// Demo SPA. Renders text nodes only. Routes: "/" , "settings" (deep link) and "#invoice=<id>".
const view = document.getElementById('view');
const facts = document.getElementById('facts');

function line(parent, text) {
  const p = document.createElement('p');
  p.textContent = text;
  parent.appendChild(p);
  return p;
}

function render() {
  view.replaceChildren();
  const last = location.pathname.split('/').filter(Boolean).pop() ?? '';
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('invoice')) {
    line(view, 'Hash route: invoice ' + hash.get('invoice') + ' (fragments never reach the server).');
  } else if (last === 'settings') {
    line(view, 'Deep link "settings" rendered by the client after the server answered with the entrypoint.');
  } else {
    line(view, 'Home view rendered by assets/demo-*.js.');
  }
}

function showFacts() {
  facts.replaceChildren();
  line(facts, 'Origin: ' + location.origin);
  line(facts, 'Secure context: ' + String(window.isSecureContext) + ' (WebCrypto subtle: ' + String(Boolean(globalThis.crypto && crypto.subtle)) + ')');
  fetch('demo-data.json')
    .then((r) => r.json())
    .then((d) => line(facts, 'Same-origin fetch: ' + d.message))
    .catch((e) => line(facts, 'Same-origin fetch failed: ' + String(e)));
}

window.addEventListener('hashchange', render);
render();
showFacts();
`;

const DEMO_CSS = `:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
header { display: flex; gap: .75rem; align-items: center; }
nav a { margin-right: 1rem; }
#facts { font-family: ui-monospace, monospace; font-size: .9rem; }
.note { border-left: 4px solid #888; padding-left: .75rem; }
`;

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="3"/><path d="M10 17l4 4 8-9" fill="none" stroke="currentColor" stroke-width="3"/></svg>
`;

/**
 * @param {string} s
 * @returns {string} first 10 hex chars of sha256
 */
function shortHash(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 10);
}

/**
 * The demo site as a list of files (deterministic).
 * @returns {Array<{ path: string, data: string }>}
 */
export function demoSiteFiles() {
  const js = `assets/demo-${shortHash(DEMO_JS)}.js`;
  const css = `assets/demo-${shortHash(DEMO_CSS)}.css`;
  const svg = `assets/logo-${shortHash(LOGO_SVG)}.svg`;
  const head = (/** @type {string} */ prefix, /** @type {string} */ title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${META_CSP}">
<title>${title}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="${prefix}${css}">
`;
  const index = `${head('./', 'Hosting kit demo')}<script type="module" src="./${js}"></script>
</head>
<body>
<header><img src="./${svg}" alt="" width="32" height="32"><h1>Hosting kit demo</h1></header>
<nav><a href="./">Home</a><a href="./settings">Settings (deep link)</a><a href="./about/">About</a><a href="./#invoice=demo-123">Invoice (hash route)</a></nav>
<main id="view"><p>Static HTML loaded. The script adds the route view here.</p></main>
<section id="facts" aria-label="Environment facts"></section>
<p class="note">Demo only. Loading a page offline or over Tor/I2P says nothing about how a payment app's wallet, RPC or
chain traffic is routed. No chain IDs, contract addresses or RPC URLs are part of this demo.</p>
</body>
</html>
`;
  const about = `${head('../', 'About the demo')}</head>
<body>
<h1>About</h1>
<p>A nested directory index served at <code>about/</code>. Its links are relative, so it works at any base path.</p>
<p><a href="../">Back</a></p>
</body>
</html>
`;
  const headers = `# Response headers for this demo (Netlify/Cloudflare "_headers" format). The hosting kit derives every
# server profile and the preview server from this file. Packaged, never served.
/*
  Content-Security-Policy: ${CSP}
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin

/index.html
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
  Cross-Origin-Resource-Policy: same-origin

/demo-data.json
  Cache-Control: no-store
`;
  return [
    { path: '_headers', data: headers },
    { path: '.well-known/security.txt', data: 'Contact: mailto:security@example.invalid\nExpires: 2030-01-01T00:00:00.000Z\n' },
    { path: 'LICENSE', data: 'Demonstration content generated by the GhostPay portable hosting kit (tools/portable-hosting-kit).\nIt is covered by the same terms as the GhostPay repository; no licence has been chosen yet (see the repository README).\n' },
    { path: 'about/index.html', data: about },
    { path: css, data: DEMO_CSS },
    { path: js, data: DEMO_JS },
    { path: svg, data: LOGO_SVG },
    { path: 'demo-data.json', data: '{\n  "message": "served from the same origin",\n  "note": "demo data only; contains no keys, chain IDs, contract addresses or RPC URLs"\n}\n' },
    { path: 'index.html', data: index },
    { path: 'robots.txt', data: 'User-agent: *\nDisallow:\n' },
  ];
}

/**
 * Write the demo site into `dir` (created if missing). Refuses to write into a non-empty directory.
 * @param {string} dir
 * @returns {Promise<string[]>} relative paths written
 */
export async function writeDemoSite(dir) {
  await mkdir(dir, { recursive: true });
  if ((await readdir(dir)).length > 0) throw new KitError(ERROR_CODES.USAGE, `refusing to write the demo into non-empty directory ${dir}`);
  const files = demoSiteFiles();
  for (const f of files) {
    const target = join(dir, ...f.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, f.data, { flag: 'wx' });
  }
  return files.map((f) => f.path);
}
