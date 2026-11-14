#!/usr/bin/env node
// GitHub Pages static-site verifier for the lean GhostPay EVM build (scripts/pages/build-pages.sh).
//
// Independent of the Vite plugins that produced the site: it re-checks the published directory itself, so a broken or
// bypassed build plugin cannot silently publish an unsafe artifact. Checks (each failure is reported, none is skipped):
//   - only regular files with an allowlisted extension (GitHub Pages derives Content-Type from the extension);
//   - no source maps, no `_headers` (Pages ignores it; shipping it would suggest protection that does not exist);
//   - every HTML entry carries the meta CSP with `script-src 'self'`, no inline <script> body, no inline handler, and
//     only relative same-site references (the site is served under /<repo>/, so absolute paths would break);
//   - no secret-shaped strings, no public anvil development keys, no RPC provider URLs with embedded API keys;
//   - the lean module report names only supported EVM modules (no relayer service, BTC, Solana, TRON, policy, pools,
//     Node built-ins), and has worker evidence;
//   - every bundled deployment manifest is for a known EVM *testnet*; a mainnet chain id fails closed;
//   - index.html carries the mirror banner (ADR-0015: a Pages instance is a labelled, degraded mirror).
// Usage: node scripts/pages/verify-pages-site.mjs <site dir> <lean report json> [--expect-commit <sha>]
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** EVM testnets the app knows (packages/chain-adapters/src/config/chains.ts, `testnet: true`). 84532 also backs devnet. */
export const TESTNET_CHAIN_IDS = Object.freeze([11155111, 84532, 11155420, 421614, 80002, 97, 43113]);

/** Extensions GitHub Pages serves with a correct, non-executable-by-sniffing MIME type for this site. */
export const ALLOWED_EXTENSIONS = Object.freeze(['.html', '.js', '.css', '.svg', '.json', '.woff2', '.txt', '.png', '.ico']);

/** Files that must never be published to Pages. */
const FORBIDDEN_NAMES = new Set(['_headers', '_redirects', 'ghostpay-lean-build.json']);

/** Public anvil/hardhat development private keys (world-known; their presence means test code leaked into the site). */
const ANVIL_DEV_KEYS = [
  'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
];

/** Secret-shaped patterns. Each must be specific enough not to match curve constants or bytecode hashes. */
const SECRET_PATTERNS = [
  // `[ ]` keeps this pattern from matching scripts/scan-secrets.sh's own committed-key grep.
  { name: 'PEM private key', re: /-----BEGIN [A-Z ]*PRIVATE[ ]KEY-----/ },
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'OpenAI/Anthropic-style API key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: 'RPC URL with an embedded project key', re: /(?:infura\.io\/v3\/|alchemy\.com\/v2\/|quiknode\.pro\/|ankr\.com\/[a-z_]+\/)[0-9A-Za-z_-]{16,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
];

/** Module paths that must never be rendered into the Pages bundle. */
const EXCLUDED_MODULE = /(?:^|\/)(?:apps\/relayer\/|src\/features\/(?:btc|solana|tron|policy)\/|(?:packages|node_modules\/@ghostpay)\/(?:btc-silent-payments|btc-family|btc-payjoin|chain-solana|chain-tron|solana-stealth|tron-adapter|policy-scheme|pool-[^/]+|external-pools(?:-[^/]+)?|pir-[^/]+|payer-sponsor|pool-relayer|merchant-billing|merchant-hooks)\/)|^(?:virtual:)?node:/;

function walk(dir, root, out, problems) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = relative(root, full).split(sep).join('/');
    const st = lstatSync(full);
    if (st.isSymbolicLink()) problems.push(`${rel}: symlink (refused)`);
    else if (st.isDirectory()) walk(full, root, out, problems);
    else if (st.isFile()) out.push(rel);
    else problems.push(`${rel}: special file (refused)`);
  }
  return out;
}

function extOf(rel) {
  const base = rel.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

/** Every src/href in an HTML document must be a relative same-site path (no scheme, no leading slash, no `//`). */
export function checkHtml(rel, html) {
  const problems = [];
  // Comments are inert HTML: do not accept a commented CSP or reject commented-out tags.
  const liveHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(liveHtml);
  if (csp === null) problems.push(`${rel}: missing meta Content-Security-Policy`);
  else {
    const policy = csp[1] ?? '';
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'none'"]) {
      if (!policy.includes(directive)) problems.push(`${rel}: CSP lacks ${directive}`);
    }
    // The app entry runs same-origin modules only; static help pages run no script at all.
    if (!/(?:^|;)\s*script-src '(?:self|none)'\s*(?:;|$)/.test(policy)) problems.push(`${rel}: CSP script-src must be exactly 'self' or 'none'`);
  }
  for (const m of liveHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(m[1] ?? '')) problems.push(`${rel}: inline <script> without src`);
    else if ((m[2] ?? '').trim() !== '') problems.push(`${rel}: <script src> with an inline body`);
  }
  if (/\son[a-z]+\s*=/i.test(liveHtml)) problems.push(`${rel}: inline event handler attribute`);
  if (/<base\b/i.test(liveHtml)) problems.push(`${rel}: <base> element (breaks relative references)`);
  for (const m of liveHtml.matchAll(/\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+))/gi)) {
    const ref = m[1] ?? m[2] ?? m[3] ?? '';
    if (ref === '' || ref.startsWith('#')) continue;
    if (/^(?:https?:)?\/\//i.test(ref) || ref.startsWith('/')) {
      // External links are allowed only as plain navigation (<a>), never as loaded resources.
      const tag = liveHtml.lastIndexOf('<', m.index ?? 0);
      const isAnchor = /^<a\b/i.test(liveHtml.slice(tag, tag + 3));
      if (!(isAnchor && /^https:\/\//i.test(ref))) problems.push(`${rel}: non-relative reference "${ref.slice(0, 80)}"`);
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(ref) && !/^mailto:/i.test(ref)) {
      problems.push(`${rel}: reference with scheme "${ref.slice(0, 40)}"`);
    }
  }
  // An external <a target=_blank> must not hand the opener to the destination.
  for (const m of liveHtml.matchAll(/<a\b[^>]*\btarget\s*=\s*(?:"_blank"|'_blank'|_blank)[^>]*>/gi)) {
    if (!/\brel\s*=\s*(?:"[^"]*\bnoopener\b[^"]*"|'[^']*\bnoopener\b[^']*'|[^\s>]*\bnoopener\b[^\s>]*)/i.test(m[0])) problems.push(`${rel}: target=_blank link without rel=noopener`);
  }
  return problems;
}

export function checkText(rel, text) {
  const problems = [];
  const lower = text.toLowerCase();
  for (const key of ANVIL_DEV_KEYS) if (lower.includes(key)) problems.push(`${rel}: contains a public anvil development private key`);
  for (const p of SECRET_PATTERNS) if (p.re.test(text)) problems.push(`${rel}: secret-shaped string (${p.name})`);
  return problems;
}

/** Validates the lean module report written by apps/web/scripts/localBuildProfile.mjs. */
export function checkLeanReport(report) {
  const problems = [];
  if (report === null || typeof report !== 'object') return ['lean report is not an object'];
  if (report.format !== 'ghostpay-lean-build/1') problems.push('lean report has an unexpected format');
  if (report.profile !== 'lean') problems.push('site was not built with the lean profile');
  if (!Array.isArray(report.chunks) || report.chunks.length === 0) problems.push('lean report has no application chunks');
  if (!Array.isArray(report.workers) || report.workers.length === 0) problems.push('lean report has no worker evidence');
  const groups = [...(Array.isArray(report.chunks) ? report.chunks : []), ...(Array.isArray(report.workers) ? report.workers.flatMap((w) => w?.chunks ?? []) : [])];
  for (const chunk of groups) {
    for (const m of Array.isArray(chunk?.modules) ? chunk.modules : []) {
      const id = typeof m?.id === 'string' ? m.id.replaceAll('\\', '/') : '';
      if (id === '') problems.push(`lean report chunk ${String(chunk?.fileName)} has a module without id`);
      else if ((m.renderedLength ?? 0) > 0 && EXCLUDED_MODULE.test(id)) problems.push(`excluded module rendered into the site: ${id}`);
    }
  }
  return problems;
}

/** Bundled manifests (build-info.json lists only their digest), checked by chain id via the deployments directory. */
export function checkManifestDir(files) {
  const problems = [];
  const chainIds = [];
  for (const name of files) {
    const m = /^([1-9][0-9]{0,15})\.json$/.exec(name);
    if (m === null) continue;
    const id = Number(m[1]);
    chainIds.push(id);
    if (!TESTNET_CHAIN_IDS.includes(id)) problems.push(`deployment manifest ${name}: chain ${String(id)} is not an approved EVM testnet (Pages builds never enable mainnet payments)`);
  }
  return { problems, chainIds: chainIds.sort((a, b) => a - b) };
}

export function verifySite(siteDir, leanReport, o = {}) {
  const problems = [];
  const root = resolve(siteDir);
  const files = walk(root, root, [], problems);
  if (!files.includes('index.html')) problems.push('index.html missing');
  if (!files.includes('.nojekyll')) problems.push('.nojekyll missing (Jekyll would drop files that start with _)');
  if (!files.includes('build-info.json')) problems.push('build-info.json missing');
  // ADR-0015 item 5: a GitHub Pages instance must say it is a mirror and what it can and cannot do.
  if (files.includes('index.html') && !/<p class="gp-pages-mirror" role="note" id="gp-pages-mirror">/.test(readFileSync(join(root, 'index.html'), 'utf8'))) {
    problems.push('index.html: GitHub Pages mirror banner missing');
  }
  for (const rel of files) {
    const name = rel.split('/').pop() ?? '';
    if (FORBIDDEN_NAMES.has(name)) problems.push(`${rel}: must not be published on Pages`);
    if (rel.endsWith('.map')) problems.push(`${rel}: source map`);
    if (rel !== '.nojekyll' && !ALLOWED_EXTENSIONS.includes(extOf(rel))) problems.push(`${rel}: extension not allowlisted for Pages MIME types`);
    const ext = extOf(rel);
    if (['.html', '.js', '.css', '.json', '.svg', '.txt'].includes(ext)) {
      const text = readFileSync(join(root, rel), 'utf8');
      problems.push(...checkText(rel, text));
      if (ext === '.html') problems.push(...checkHtml(rel, text));
      if (ext === '.js' && /\/\/# sourceMappingURL=/.test(text)) problems.push(`${rel}: sourceMappingURL comment`);
    }
  }
  if (files.includes('build-info.json')) {
    try {
      const info = JSON.parse(readFileSync(join(root, 'build-info.json'), 'utf8'));
      if (info.app !== 'ghostpay-web') problems.push('build-info.json: unexpected app');
      if (o.expectCommit !== undefined && info.commit !== o.expectCommit) problems.push(`build-info.json: commit ${String(info.commit)} != ${o.expectCommit}`);
      if (o.expectManifestsSha256 !== undefined && info.manifestsSha256 !== o.expectManifestsSha256) problems.push('build-info.json: manifest digest does not match the approved deployments directory');
    } catch {
      problems.push('build-info.json: not valid JSON');
    }
  }
  problems.push(...checkLeanReport(leanReport));
  return { problems, files };
}

/** SHA256SUMS text (sorted, `sha256  ./path`) for every published file. */
export function sha256sums(siteDir, files) {
  return files
    .slice()
    .sort()
    .map((rel) => `${createHash('sha256').update(readFileSync(join(siteDir, rel))).digest('hex')}  ./${rel}`)
    .join('\n') + '\n';
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const [site, reportPath, ...rest] = process.argv.slice(2);
  if (site === undefined || reportPath === undefined) {
    console.error('usage: verify-pages-site.mjs <site dir> <lean report json> [--expect-commit <sha>]');
    process.exit(2);
  }
  const i = rest.indexOf('--expect-commit');
  const expectCommit = i >= 0 ? rest[i + 1] : undefined;
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    console.error(`cannot read lean report ${reportPath}`);
    process.exit(1);
  }
  const { problems, files } = verifySite(site, report, { expectCommit });
  if (problems.length > 0) {
    console.error('Pages site verification FAILED:');
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }
  console.log(`Pages site verification passed: ${String(files.length)} files.`);
}
