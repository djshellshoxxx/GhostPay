// @ts-check
// Static inventory of external network references in a site: scripts, styles, fonts, images, frames, telemetry,
// RPC endpoints, relays, wallet-connection services and update checks. It never fetches anything and never edits
// files. It is a review aid: endpoints chosen at runtime (e.g. a user-configured RPC URL) are invisible to it, and
// obfuscated or computed URLs are missed. The CSP connect-src of the site is what actually bounds runtime egress.
import { TEXT_EXTENSIONS, extensionOf } from '../policy.mjs';

export const EXTERNAL_REFS_SCHEMA = 'ghostpay.hosting-kit.external-references';
export const EXTERNAL_REFS_SCHEMA_VERSION = 1;

/**
 * @typedef {'script' | 'style' | 'font' | 'image' | 'frame' | 'form' | 'telemetry' | 'rpc' | 'relay' | 'wallet-connection' | 'update-check' | 'cdn' | 'xml-namespace' | 'documentation-link' | 'other'} Category
 */

/**
 * @typedef {object} ExternalReference
 * @property {string} url        as found (truncated to 200 chars)
 * @property {string} host       lowercase host, "" for scheme-only literals
 * @property {string} scheme     "https", "http", "wss", "ws" or "//" for protocol-relative
 * @property {Category} category
 * @property {boolean} loadsByDefault  true if a browser would request it while loading the page (src/href/url()/@import)
 * @property {string[]} files    site paths containing it, sorted
 */

/** Host patterns. First match wins. */
const HOST_CATEGORIES = /** @type {Array<{ re: RegExp, category: Category }>} */ ([
  { re: /(^|\.)w3\.org$/, category: 'xml-namespace' },
  { re: /(google-analytics|googletagmanager|doubleclick|plausible\.io|sentry\.io|ingest\.sentry|segment\.(io|com)|mixpanel|hotjar|matomo|amplitude|posthog|datadoghq|newrelic|fullstory|clarity\.ms|cloudflareinsights|stats\.wp\.com)/, category: 'telemetry' },
  { re: /(fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net)/, category: 'font' },
  { re: /(walletconnect\.(com|org)|reown\.com|web3modal|bridge\.walletconnect)/, category: 'wallet-connection' },
  { re: /(infura\.io|alchemy(api)?\.(io|com)|quiknode|quicknode|ankr\.com|publicnode\.com|llamarpc\.com|cloudflare-eth\.com|blastapi\.io|chainstack|getblock\.io|drpc\.org|tenderly\.co|(^|[.-])rpc[.-]|mempool\.space|blockstream\.info|esplora)/, category: 'rpc' },
  { re: /(^|\.)relay(er)?[.-]|nostr|(^|\.)nos\.lol$|damus\.io/, category: 'relay' },
  { re: /(api\.github\.com|registry\.npmjs\.org|update\.|updates\.)/, category: 'update-check' },
  { re: /(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|ajax\.googleapis\.com|code\.jquery\.com|esm\.sh|skypack)/, category: 'cdn' },
]);

/** URL literals inside a quoted string, attribute or url(). */
const URL_RE = /\b(https?|wss?):\/\/([A-Za-z0-9.-]+(?::\d+)?)?[^\s"'`<>)\\]*/g;
const SPACE_RE = /\s/u;
const REFERENCE_TOKENS = new Map([['s', 'src'], ['h', 'href'], ['a', 'action'], ['u', 'url(']]);

/** @param {string} text @param {number} from */
function skipSpace(text, from) {
  while (from < text.length && SPACE_RE.test(text.charAt(from))) from += 1;
  return from;
}

/** Token hosts contain no prefix delimiters, so subsequent host ends never move backwards.
 * Each cached delimiter cursor visits each input position at most once; no input-sized tables.
 * @param {string} text @param {string} stops
 */
function delimiterCursor(text, stops) {
  let end = -1;
  return (/** @type {number} */ from) => {
    if (from > end) {
      end = from;
      while (end < text.length && !stops.includes(text.charAt(end))) end += 1;
    }
    return end;
  };
}

/** @param {string} text @param {number} index */
function referencePrefix(text, index) {
  const token = REFERENCE_TOKENS.get(text.charAt(index).toLowerCase());
  if (token === undefined || text.slice(index, index + token.length).toLowerCase() !== token) return null;
  let p = skipSpace(text, index + token.length);
  let quote = '';
  const attribute = token !== 'url(';
  if (attribute) {
    if (text.charAt(p) !== '=') return null;
    p = skipSpace(text, p + 1);
    quote = text.charAt(p);
    if (quote !== '"' && quote !== "'") return null;
    p += 1;
  } else if (text.charAt(p) === '"' || text.charAt(p) === "'") {
    quote = text.charAt(p); p += 1;
  }
  return { p, attribute, context: attribute ? `${token}=${quote}` : `url(${quote}` };
}

/** @param {string} text */
function cssEndCursor(text) {
  const next = delimiterCursor(text, ")\"'");
  let lastQuote = -1;
  let afterQuote = 0;
  return (/** @type {number} */ from) => {
    let end = next(from);
    if (text.charAt(end) === '"' || text.charAt(end) === "'") {
      if (lastQuote !== end) { lastQuote = end; afterQuote = skipSpace(text, end + 1); }
      end = afterQuote;
    }
    return text.charAt(end) === ')' ? end : -1;
  };
}

/** @param {number} c */
function isHostCode(c) {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45 || c === 46;
}

/** Forward literal scan, retaining legacy quote handling and global nonoverlap.
 * Prefix/host spans and cached suffix/whitespace cursors have linear total work.
 * @param {string} text
 */
function* protocolRelativeReferences(text) {
  const nextQuote = delimiterCursor(text, "\"'");
  const nextCssEnd = cssEndCursor(text);
  let i = 0;
  while (i < text.length) {
    const index = i;
    i += 1;
    const prefix = referencePrefix(text, index);
    if (prefix === null || text.slice(prefix.p, prefix.p + 2) !== '//') continue;
    const start = prefix.p + 2;
    let hostEnd = start;
    while (hostEnd < text.length && isHostCode(text.charCodeAt(hostEnd))) hostEnd += 1;
    if (hostEnd === start) continue;
    const end = prefix.attribute ? nextQuote(hostEnd) : nextCssEnd(hostEnd);
    if (end < 0 || end >= text.length) continue;
    yield { index, host: text.slice(start, hostEnd).toLowerCase(), context: prefix.context };
    i = end + 1;
  }
}

/** Bounded context suffix parsing, without ambiguous optional whitespace groups.
 * @param {string} before @param {boolean} importRule
 */
function cssPrefix(before, importRule) {
  let end = before.length;
  if (before.charAt(end - 1) === '"' || before.charAt(end - 1) === "'") end -= 1;
  while (end > 0 && SPACE_RE.test(before.charAt(end - 1))) end -= 1;
  if (importRule && before.slice(0, end).endsWith('url(')) {
    end -= 4;
    while (end > 0 && SPACE_RE.test(before.charAt(end - 1))) end -= 1;
  }
  return before.slice(0, end).endsWith(importRule ? '@import' : 'url(');
}

/**
 * Category from the surrounding text when the host is not known.
 * @param {string} before   up to 40 characters preceding the URL
 * @param {string} ext
 * @returns {{ category: Category, loadsByDefault: boolean }}
 */
function classifyByContext(before, ext) {
  const b = before.toLowerCase();
  if (/<script[^>]*\bsrc\s*=\s*["']?$/.test(b)) return { category: 'script', loadsByDefault: true };
  if (/<i?frame[^>]*\bsrc\s*=\s*["']?$/.test(b)) return { category: 'frame', loadsByDefault: true };
  if (/<form[^>]*\baction\s*=\s*["']?$/.test(b)) return { category: 'form', loadsByDefault: false };
  if (/<img[^>]*\bsrc(set)?\s*=\s*["']?$/.test(b)) return { category: 'image', loadsByDefault: true };
  if (/<link[^>]*\bhref\s*=\s*["']?$/.test(b)) return { category: 'style', loadsByDefault: true };
  if (cssPrefix(b, true)) return { category: 'style', loadsByDefault: true };
  if (cssPrefix(b, false)) return { category: ext === 'css' && /@font-face|src\s*:/.test(b) ? 'font' : 'image', loadsByDefault: true };
  if (/<a[^>]*\bhref\s*=\s*["']?$/.test(b)) return { category: 'documentation-link', loadsByDefault: false };
  return { category: 'other', loadsByDefault: false };
}

/**
 * @param {string} host
 * @returns {Category | null}
 */
function classifyHost(host) {
  for (const { re, category } of HOST_CATEGORIES) if (re.test(host)) return category;
  return null;
}

/**
 * Scan a set of files for external references.
 * @param {Array<{ path: string }>} files                     inventory entries (relative paths)
 * @param {(relPath: string) => Promise<Uint8Array>} readBytes reads one site file
 * @returns {Promise<{ schema: string, schemaVersion: number, references: ExternalReference[], summary: Record<string, number>, notes: string[] }>}
 */
export async function scanExternalReferences(files, readBytes) {
  /** @type {Map<string, ExternalReference>} */
  const byUrl = new Map();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  /**
   * @param {string} url
   * @param {string} scheme
   * @param {string} host
   * @param {{ category: Category, loadsByDefault: boolean }} ctx
   * @param {string} file
   */
  const add = (url, scheme, host, ctx, file) => {
    const key = url.slice(0, 200);
    const hostCategory = classifyHost(host);
    // Host semantics (telemetry, rpc, font...) win; for a generic CDN the loading context (script, style) says more.
    /** @type {Category} */
    let category = ctx.category;
    if (hostCategory !== null && !(hostCategory === 'cdn' && ctx.category !== 'other')) category = hostCategory;
    const existing = byUrl.get(key);
    if (existing === undefined) {
      byUrl.set(key, { url: key, host, scheme, category, loadsByDefault: ctx.loadsByDefault, files: [file] });
    } else {
      if (!existing.files.includes(file)) existing.files.push(file);
      existing.loadsByDefault ||= ctx.loadsByDefault;
    }
  };

  for (const f of files) {
    const ext = extensionOf(f.path);
    if (!TEXT_EXTENSIONS.includes(ext)) continue;
    const text = decoder.decode(await readBytes(f.path));
    for (const m of text.matchAll(URL_RE)) {
      const host = (m[2] ?? '').toLowerCase().replace(/:\d+$/, '');
      if (host === '') continue; // bare scheme literal such as "https://" used in validation code
      const idx = m.index ?? 0;
      add(m[0], m[1] ?? '', host, classifyByContext(text.slice(Math.max(0, idx - 40), idx), ext), f.path);
    }
    if (ext === 'html' || ext === 'htm' || ext === 'css' || ext === 'svg') {
      for (const m of protocolRelativeReferences(text)) {
        const host = m.host;
        if (host === '') continue;
        const idx = m.index;
        const ctx = classifyByContext(text.slice(Math.max(0, idx - 40), idx) + m.context, ext);
        add(`//${host}`, '//', host, { category: ctx.category, loadsByDefault: true }, f.path);
      }
    }
  }

  const references = [...byUrl.values()]
    // Keep existing UTF-16 order, independent of host locale.
    .map((r) => ({ ...r, files: [...r.files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) }))
    .sort((a, b) => (a.category === b.category ? (a.url < b.url ? -1 : a.url > b.url ? 1 : 0) : a.category < b.category ? -1 : 1));
  /** @type {Record<string, number>} */
  const summary = {};
  for (const r of references) summary[r.category] = (summary[r.category] ?? 0) + 1;
  return {
    schema: EXTERNAL_REFS_SCHEMA,
    schemaVersion: EXTERNAL_REFS_SCHEMA_VERSION,
    references,
    summary: Object.fromEntries(Object.entries(summary).sort(([a], [b]) => (a < b ? -1 : 1))),
    notes: [
      'Static scan of text files only. It never fetched anything and did not modify any file.',
      'Endpoints chosen at runtime (user-configured RPC, relayer or wallet URLs) do not appear here; the CSP connect-src bounds them.',
      'Hosting over Tor or I2P changes how the page is delivered, not where the running app connects: RPC, relayer and wallet traffic follow the browser and wallet configuration.',
      'loadsByDefault=true marks references a browser requests while rendering (script/link/img/frame/url()/@import); review these first.',
    ],
  };
}

/**
 * Findings for references that break offline/privacy-preserving page loading.
 * @param {ExternalReference[]} refs
 * @returns {import('../types.mjs').Finding[]}
 */
export function privacyFindings(refs) {
  /** @type {import('../types.mjs').Finding[]} */
  const out = [];
  for (const r of refs) {
    if (r.category === 'telemetry') {
      out.push({ code: 'E_POLICY', rule: 'external-telemetry', severity: 'warning', message: `telemetry/analytics endpoint referenced: ${r.url} (${r.files.join(', ')})` });
    } else if (r.loadsByDefault && r.category !== 'xml-namespace' && r.category !== 'documentation-link') {
      out.push({ code: 'E_POLICY', rule: 'external-subresource', severity: 'warning', message: `page loads a third-party ${r.category} from ${r.host}; bundle it locally where its licence allows (${r.files.join(', ')})` });
    }
  }
  return out;
}
