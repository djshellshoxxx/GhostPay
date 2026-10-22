// Assemble the static site: node build.mjs <outDir>. Pure string templating, no dependencies.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDiagram } from './lib/diagram.mjs';
import { diagrams } from './diagrams.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) throw new Error('usage: node build.mjs <outDir>');

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const NAV = [
  ['', 'App'],
  ['why.html', 'Why'],
  ['how-it-works.html', 'How it works'],
  ['privacy-options.html', 'Privacy options'],
  ['help/', 'Help'],
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const STATUS = { built: 'BUILT', planned: 'PLANNED', experimental: 'EXPERIMENTAL' };

const dg = new Map(diagrams.map((d) => [d.id, renderDiagram(d).html]));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const pagesDir = join(here, 'pages');
const pages = walk(pagesDir).filter((p) => p.endsWith('.html')).map((p) => {
  const rel = relative(pagesDir, p).split('\\').join('/');
  const raw = readFileSync(p, 'utf8');
  const m = raw.match(/^<!--page ([\s\S]*?)-->\n?/);
  if (!m) throw new Error(`${rel}: missing <!--page ...--> header`);
  const meta = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
  return { rel, meta, body: raw.slice(m[0].length) };
});
const byRel = new Map(pages.map((p) => [p.rel, p]));

for (const p of pages) {
  const depth = p.rel.split('/').length - 1;
  const root = depth === 0 ? './' : '../'.repeat(depth);
  const section = p.rel.startsWith('help/') ? 'help/' : p.rel;
  let body = p.body
    .replace(/\{\{diagram:([\w-]+)\}\}/g, (_, id) => {
      if (!dg.has(id)) throw new Error(`${p.rel}: unknown diagram ${id}`);
      return dg.get(id);
    })
    .replace(/\{\{S:(built|planned|experimental)\}\}/g, (_, s) => `<span class="status ${s}">${STATUS[s]}</span>`)
    .replace(/\{\{root\}\}/g, root);
  const nav = NAV.map(([href, label]) => {
    const cur = href === '' ? false : href === section;
    return `<li><a class="nav-btn"${cur ? ' aria-current="page"' : ''} href="${root}${href}">${label}</a></li>`;
  }).join('');
  let pager = '';
  const link = (rel, dir) => {
    const t = byRel.get(rel);
    if (!t) throw new Error(`${p.rel}: bad ${dir} ${rel}`);
    return `<a class="btn" href="${root}${rel === 'help/index.html' ? 'help/' : rel}">${dir === 'prev' ? '\u2190 ' : ''}${esc(t.meta.title)}${dir === 'next' ? ' \u2192' : ''}</a>`;
  };
  if (p.meta.prev || p.meta.next) pager = `<div class="pager"><span>${p.meta.prev ? link(p.meta.prev, 'prev') : ''}</span><span>${p.meta.next ? link(p.meta.next, 'next') : ''}</span></div>`;
  const crumbs = p.rel.startsWith('help/') && p.rel !== 'help/index.html' ? `<p class="muted"><a href="${root}help/">Help</a> / ${esc(p.meta.title)}</p>` : '';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${esc(p.meta.title)} | GhostPay</title>
<meta name="description" content="${esc(p.meta.desc ?? '')}">
<link rel="icon" href="data:,">
<link rel="stylesheet" href="${root}theme.css">
<link rel="stylesheet" href="${root}site.css">
</head>
<body class="site">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="wrap">
<p class="brand"><a href="${root}">GhostPay</a></p>
<p class="tagline">Stealth-address payments. Unaudited software, testnet only.</p>
<nav aria-label="Guides"><ul class="nav">${nav}</ul></nav>
</div></header>
<main id="main" tabindex="-1"><div class="wrap">
${crumbs}
<h1>${esc(p.meta.h1 ?? p.meta.title)}</h1>
${body}
${pager}
</div></main>
<footer class="site-footer"><div class="wrap">
<p>Pre-audit prototype. Nothing is deployed and no real money should be used. No scripts, no analytics, no third-party requests on these pages. <a href="${root}help/faq.html">FAQ</a> \u00b7 <a href="${root}help/glossary.html">Glossary</a> \u00b7 <a href="${root}">Open the app</a></p>
</div></footer>
</body>
</html>
`;
  const dest = join(out, p.rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html);
}
copyFileSync(join(here, 'site.css'), join(out, 'site.css'));
console.log(`site: ${pages.length} pages -> ${out}`);
