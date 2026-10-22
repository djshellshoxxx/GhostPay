// Shared logic for the i18n tools. Pure functions (no process.exit) so they can be unit-tested.
// The parser and language registry are the ones the app uses; Node >= 22.18 loads .ts files natively (type stripping).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LANGUAGES,
  MACHINE_DRAFTED_STATUS,
  PSEUDO_LANGUAGES,
  REVIEWED_LOCALES,
  REVIEWED_STATUS,
  SOURCE_LOCALE,
  SOURCE_STATUS,
  pluralCategories,
} from '../../apps/web/src/i18n/languages.ts';
import { MessageSyntaxError, analyzeMessage, parseMessage, pseudolocalize } from '../../apps/web/src/i18n/message.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOCALES_DIR = join(ROOT, 'apps', 'web', 'locales');
export const SRC_DIR = join(ROOT, 'apps', 'web', 'src');
export { MACHINE_DRAFTED_STATUS, pseudolocalize };

const KEY_RE = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/;
const HTML_RE = /<\/?[A-Za-z!][^>]*>|&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z]+);/;
/** Translations longer than this multiple of the English text (strings under 20 chars get more room) are flagged. */
export const MAX_RATIO_LONG = 1.6;
export const MAX_RATIO_SHORT = 2.5;
export const MIN_RATIO = 0.2;

export function readCatalogs(dir = LOCALES_DIR) {
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    const file = join(dir, f);
    let data;
    let parseError;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
    out.push({ file: f, code: f.slice(0, -5), data, parseError });
  }
  return out;
}

function plainLength(src) {
  try {
    const flat = (nodes) => nodes.map((n) => (n.t === 'text' ? n.v : n.t === 'tag' ? flat(n.children) : n.t === 'plural' || n.t === 'select' ? flat((n.branches.find((b) => b.selector === 'other') ?? n.branches[0]).body) : n.t === 'pound' ? '0' : '000')).join('');
    return [...flat(parseMessage(src))].length;
  } catch {
    return [...src].length;
  }
}

/** Placeholders may be plain, number or plural interchangeably (a locale may add a plural for a bare count), nothing else. */
function kindClass(kinds) {
  const k = kinds.filter((x) => x !== 'plain');
  if (k.length === 0) return 'plain';
  return k.map((x) => (x === 'plural' || x === 'ordinal' ? 'number' : x)).sort().join('+');
}

function comparableKind(enKinds, locKinds) {
  const a = kindClass(enKinds);
  const b = kindClass(locKinds);
  return a === b || a === 'plain' || b === 'plain';
}

/**
 * Checks every catalog against the English source. Returns { errors, warnings } (arrays of strings).
 * Errors fail CI; warnings (length ratios, identical-to-English text) fail only with --strict.
 */
export function checkCatalogs(catalogs, options = {}) {
  const errors = [];
  const warnings = [];
  const err = (file, msg) => errors.push(`${file}: ${msg}`);
  const warn = (file, msg) => warnings.push(`${file}: ${msg}`);
  const registry = new Map([...LANGUAGES, ...PSEUDO_LANGUAGES].map((l) => [l.code, l]));
  const reviewed = options.reviewed ?? REVIEWED_LOCALES;

  const source = catalogs.find((c) => c.code === SOURCE_LOCALE);
  if (source === undefined) return { errors: ['en.json: source catalog is missing'], warnings };

  const sigs = new Map();
  for (const c of catalogs) {
    const f = c.file;
    if (c.parseError !== undefined) {
      err(f, `invalid JSON: ${c.parseError}`);
      continue;
    }
    const d = c.data;
    if (d === null || typeof d !== 'object' || typeof d.messages !== 'object' || d.messages === null || typeof d._meta !== 'object' || d._meta === null) {
      err(f, 'must be { "_meta": {...}, "messages": {...} }');
      continue;
    }
    if (!registry.has(c.code)) err(f, `locale "${c.code}" is not in the language registry (apps/web/src/i18n/languages.ts)`);
    if (d._meta.locale !== c.code) err(f, `_meta.locale "${String(d._meta.locale)}" does not match the file name`);
    const status = d._meta.status;
    if (c.code === SOURCE_LOCALE) {
      if (status !== SOURCE_STATUS) err(f, `_meta.status must be "${SOURCE_STATUS}"`);
    } else if (status !== MACHINE_DRAFTED_STATUS && status !== REVIEWED_STATUS) {
      err(f, `_meta.status must be "${MACHINE_DRAFTED_STATUS}" or "${REVIEWED_STATUS}"`);
    } else if ((status === REVIEWED_STATUS) !== reviewed.has(c.code)) {
      err(f, `_meta.status "${String(status)}" disagrees with REVIEWED_LOCALES in languages.ts`);
    }
    const map = new Map();
    for (const [key, value] of Object.entries(d.messages)) {
      if (!KEY_RE.test(key)) err(f, `bad key "${key}" (use dotted camelCase, e.g. settings.rpc.hint)`);
      if (typeof value !== 'string') {
        err(f, `${key}: value must be a string`);
        continue;
      }
      if (HTML_RE.test(value)) err(f, `${key}: HTML or an HTML entity is not allowed (use {#tag}...{/tag} markup or plain text)`);
      try {
        map.set(key, analyzeMessage(parseMessage(value)));
      } catch (e) {
        if (!(e instanceof MessageSyntaxError)) throw e;
        err(f, `${key}: ${e.message}`);
      }
    }
    sigs.set(c.code, map);
  }

  const enSigs = sigs.get(SOURCE_LOCALE);
  if (enSigs === undefined) return { errors, warnings };

  for (const c of catalogs) {
    if (c.code === SOURCE_LOCALE || !sigs.has(c.code)) continue;
    const f = c.file;
    const locSigs = sigs.get(c.code);
    const messages = c.data.messages;
    const enMessages = source.data.messages;
    for (const key of Object.keys(enMessages)) if (!(key in messages)) err(f, `missing key ${key}`);
    for (const key of Object.keys(messages)) if (!(key in enMessages)) err(f, `extra key ${key} (not in en.json)`);
    const loc = registry.get(c.code) !== undefined ? c.code : SOURCE_LOCALE;
    for (const [key, enSig] of enSigs) {
      const sig = locSigs.get(key);
      if (sig === undefined) continue;
      const names = Object.keys(enSig.args).sort().join(',');
      const locNames = Object.keys(sig.args).sort().join(',');
      if (names !== locNames) err(f, `${key}: placeholders differ (en: {${names}}, here: {${locNames}})`);
      else {
        for (const name of Object.keys(enSig.args)) {
          if (!comparableKind(enSig.args[name].kinds, sig.args[name].kinds)) err(f, `${key}: {${name}} is ${enSig.args[name].kinds.join('/')} in en but ${sig.args[name].kinds.join('/')} here`);
          const enSel = enSig.args[name].selects.map((s) => [...s].sort().join('|')).sort().join(';');
          const locSel = sig.args[name].selects.map((s) => [...s].sort().join('|')).sort().join(';');
          if (enSel !== locSel) err(f, `${key}: select options of {${name}} differ`);
        }
      }
      if (enSig.tags.join(',') !== sig.tags.join(',')) err(f, `${key}: markup tags differ (en: ${enSig.tags.join(',') || 'none'}, here: ${sig.tags.join(',') || 'none'})`);
      for (const [ordinal, lists] of [[false, Object.values(sig.args).flatMap((a) => a.plurals)], [true, Object.values(sig.args).flatMap((a) => a.ordinals)]]) {
        const need = pluralCategories(loc, ordinal);
        for (const selectors of lists) {
          const named = selectors.filter((s) => !s.startsWith('='));
          for (const s of named) if (!need.includes(s)) err(f, `${key}: "${s}" is not a ${ordinal ? 'ordinal' : 'cardinal'} plural category of ${c.code} (valid: ${need.join(', ')})`);
          for (const s of need) if (!named.includes(s)) err(f, `${key}: ${ordinal ? 'ordinal' : 'cardinal'} plural for ${c.code} is missing category "${s}"`);
          for (const s of selectors) if (s.startsWith('=') && !/^=\d+$/.test(s)) err(f, `${key}: bad exact selector "${s}"`);
        }
      }
      const a = plainLength(source.data.messages[key]);
      const b = plainLength(messages[key]);
      if (a > 0) {
        const ratio = b / a;
        const max = a < 20 ? MAX_RATIO_SHORT : MAX_RATIO_LONG;
        if (ratio > max) warn(f, `${key}: ${ratio.toFixed(2)}x longer than English (limit ${max}); check the layout for truncation`);
        if (ratio < MIN_RATIO) warn(f, `${key}: only ${ratio.toFixed(2)}x the length of English; possibly truncated`);
      }
      if (messages[key] === enMessages[key] && /[A-Za-z]{4}/.test(enMessages[key].replace(/\{[^{}]*\}/g, ''))) warn(f, `${key}: identical to English (untranslated?)`);
    }
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------------------------------------------------------------
// extract

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const USE_PATTERNS = [
  /(?<![\w.$])t\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, // t('key')
  /\.t\(\s*(['"`])([A-Za-z0-9_.]+)\1/g, // i18n.t('key')
  /<Trans\b[^>]*?\bid=(['"])([A-Za-z0-9_.]+)\1/g, // <Trans id="key" />
];
const HINT_RE = /i18n-use:\s*([A-Za-z0-9_. ,]+)/g; // comment for keys built dynamically

/** Returns Map<key, string[] of "file:line"> of every translation key referenced in the source tree. */
export function scanUsage(srcDir = SRC_DIR) {
  const used = new Map();
  const add = (key, file, text, index) => {
    const line = text.slice(0, index).split('\n').length;
    const where = `${relative(ROOT, file)}:${String(line)}`;
    used.set(key, [...(used.get(key) ?? []), where]);
  };
  for (const file of walk(srcDir)) {
    if (!/\.(ts|tsx)$/.test(file) || /\.test\.tsx?$/.test(file) || file.includes(`${join('src', 'i18n')}`)) continue;
    const text = readFileSync(file, 'utf8');
    for (const re of USE_PATTERNS) for (const m of text.matchAll(re)) add(m[2], file, text, m.index);
    for (const m of text.matchAll(HINT_RE)) for (const k of m[1].split(/[ ,]+/).filter(Boolean)) add(k, file, text, m.index);
  }
  return used;
}

export function extractReport(usage, sourceKeys) {
  const keys = new Set(sourceKeys);
  const missing = [...usage.keys()].filter((k) => !keys.has(k)).sort();
  const unused = [...keys].filter((k) => !usage.has(k)).sort();
  return { missing, unused, used: [...usage.keys()].filter((k) => keys.has(k)).sort() };
}

// ---------------------------------------------------------------------------------------------------------------------
// pseudo

export function buildPseudoCatalogs(enData) {
  const result = {};
  for (const [code, variant] of [['en-XA', 'XA'], ['en-XB', 'XB']]) {
    const messages = {};
    for (const [k, v] of Object.entries(enData.messages)) messages[k] = pseudolocalize(v, variant);
    result[code] = { _meta: { locale: code, status: 'pseudo-locale generated from English', note: 'Development only. Do not commit; regenerate with scripts/i18n/pseudo.mjs.' }, messages };
  }
  return result;
}

export function localesExist(dir = LOCALES_DIR) {
  return existsSync(dir);
}
