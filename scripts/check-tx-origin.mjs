import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const excluded = new Set(['test', 'tests', 'script', 'scripts', 'node_modules']);
let failed = false;
let count = 0;

function entries(path) {
  try { return readdirSync(path, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

// Comments separate tokens; string contents cannot start comments. Preserve the conservative
// rule for mentions inside strings and trailing comments while recognizing executable tokens.
function violations(source) {
  const found = new Set();
  let index = 0;
  let line = 1;
  let codeOnLine = false;
  const recent = [];
  const advance = (end) => {
    while (index < end) {
      if (source[index++] === '\n') { line++; codeOnLine = false; }
    }
  };
  const mention = (text, startLine) => {
    let offset = 0;
    let currentLine = startLine;
    for (const match of text.matchAll(/\btx\s*\.\s*origin\b/g)) {
      while (offset < match.index) if (text[offset++] === '\n') currentLine++;
      found.add(currentLine);
    }
  };
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { advance(index + 1); continue; }
    const start = index;
    const startLine = line;
    if (source.startsWith('//', index) || source.startsWith('/*', index)) {
      const block = source[index + 1] === '*';
      const close = source.indexOf(block ? '*/' : '\n', index + 2);
      if (block && close === -1) throw new Error(`unterminated block comment at line ${line}`);
      const end = close === -1 ? source.length : close + (block ? 2 : 0);
      if (codeOnLine) mention(source.slice(start, end), startLine);
      advance(end);
      continue;
    }
    if (char === '"' || char === "'") {
      advance(index + 1);
      let closed = false;
      while (index < source.length) {
        if (source[index] === '\\') { advance(Math.min(index + 2, source.length)); continue; }
        const next = source[index];
        advance(index + 1);
        if (next === char) { closed = true; break; }
      }
      if (!closed) throw new Error(`unterminated string at line ${startLine}`);
      mention(source.slice(start, index), startLine);
      recent.length = 0;
      codeOnLine = true;
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(char)) {
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) advance(index + 1);
    } else advance(index + 1);
    codeOnLine = true;
    recent.push({ token: source.slice(start, index), line: startLine });
    if (recent.length > 3) recent.shift();
    if (recent.length === 3 && recent[0].token === 'tx' && recent[1].token === '.' && recent[2].token === 'origin') {
      found.add(recent[0].line);
    }
  }
  return found;
}

function scan(directory) {
  for (const entry of entries(directory)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) scan(path);
    else if (entry.isFile() && entry.name.endsWith('.sol')) {
      count++;
      const name = relative(root, path);
      try {
        for (const line of violations(readFileSync(path, 'utf8'))) {
          console.error(`ERROR ${name}:${line}: tx.origin must not be used`);
          failed = true;
        }
      } catch (error) {
        console.error(`ERROR ${name}: ${error.message}`);
        failed = true;
      }
    }
  }
}

for (const entry of entries(join(root, 'packages'))) {
  if (!entry.isDirectory()) continue;
  for (const directory of ['src', 'contracts']) scan(join(root, 'packages', entry.name, directory));
}
if (!failed) console.log(`OK: no tx.origin in ${count} Solidity source file(s).`);
process.exitCode = failed ? 1 : 0;
