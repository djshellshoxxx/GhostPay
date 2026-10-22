#!/usr/bin/env node
// Validates relative links and #anchors in every *.md file in the repository.
// External http(s)/mailto/other-scheme links are NOT fetched.
// Usage: node docs/tools/check-links.mjs   (exit 0 = no broken links, 1 = broken links found)
import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', 'coverage', '.git']);
const LINK_RE = /!?\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REF_DEF_RE = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

async function walk(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// GitHub heading slug (github-slugger rules): lowercase, drop punctuation/symbols
// except letters, numbers, marks, connector punctuation (_), hyphen and space;
// each space becomes a hyphen; duplicates get -1, -2, ... suffixes.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

function headingText(raw) {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .trim();
}

// Walks lines, skipping fenced code blocks. Yields {line, lineNo, text} with
// inline code spans blanked (same length, so columns are preserved).
function* prose(lines) {
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      continue;
    }
    if (m) {
      fence = m[1];
      continue;
    }
    yield { lineNo: i + 1, text: line.replace(/(`+)[^`]*?\1/g, (s) => ' '.repeat(s.length)), raw: line };
  }
}

const anchorCache = new Map();
async function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const set = new Set();
  const counts = new Map();
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  let prev = '';
  for (const { raw } of prose(lines)) {
    let heading = null;
    const atx = /^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(raw);
    if (atx) heading = atx[1];
    else if (/^ {0,3}(=+|-+)\s*$/.test(raw) && prev.trim() && !/^\s*([-*+]|\d+\.)\s/.test(prev)) heading = prev;
    prev = raw;
    if (heading !== null) {
      const base = slugify(headingText(heading));
      const n = counts.get(base) ?? 0;
      counts.set(base, n + 1);
      set.add(n === 0 ? base : `${base}-${n}`);
    }
    for (const m of raw.matchAll(/<a\s[^>]*?(?:id|name)=["']([^"']+)["']/gi)) set.add(m[1]);
    for (const m of raw.matchAll(/\sid=["']([^"']+)["']/gi)) set.add(m[1]);
  }
  anchorCache.set(file, set);
  return set;
}

function targetsOf(text) {
  const found = [];
  for (const m of text.matchAll(LINK_RE)) found.push({ target: m[2], col: m.index + 1 });
  const ref = REF_DEF_RE.exec(text);
  if (ref) found.push({ target: ref[1], col: 1 });
  return found;
}

async function checkFile(file) {
  const problems = [];
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  for (const { lineNo, text } of prose(lines)) {
    for (const { target: rawTarget } of targetsOf(text)) {
      let target = rawTarget.replace(/^<|>$/g, '');
      if (!target || target.startsWith('//') || SCHEME_RE.test(target)) continue;
      const hash = target.indexOf('#');
      const pathPart = hash === -1 ? target : target.slice(0, hash);
      const anchorRaw = hash === -1 ? '' : target.slice(hash + 1);
      const pathNoQuery = pathPart.split('?')[0];
      let decodedPath;
      let anchor = anchorRaw;
      try {
        decodedPath = decodeURIComponent(pathNoQuery);
        anchor = decodeURIComponent(anchorRaw);
      } catch {
        problems.push({ lineNo, target: rawTarget, reason: 'malformed URL encoding' });
        continue;
      }
      let targetFile = file;
      if (decodedPath !== '') {
        const abs = decodedPath.startsWith('/') ? join(ROOT, decodedPath) : resolve(dirname(file), decodedPath);
        let stat;
        try {
          stat = await lstat(abs);
        } catch {
          problems.push({ lineNo, target: rawTarget, reason: 'target file does not exist' });
          continue;
        }
        if (stat.isDirectory()) continue;
        targetFile = abs;
      }
      if (anchor !== '' && targetFile.endsWith('.md')) {
        const anchors = await anchorsOf(targetFile);
        if (!anchors.has(anchor)) {
          problems.push({ lineNo, target: rawTarget, reason: `no heading with anchor "#${anchor}" in ${relative(ROOT, targetFile).split(sep).join('/')}` });
        }
      }
    }
  }
  return problems;
}

const files = (await walk(ROOT, [])).sort();
let total = 0;
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  for (const p of await checkFile(file)) {
    total++;
    console.log(`${rel}:${p.lineNo}: broken link "${p.target}": ${p.reason}`);
  }
}
console.log(`checked ${files.length} markdown files, ${total} broken link(s)`);
process.exit(total === 0 ? 0 : 1);
