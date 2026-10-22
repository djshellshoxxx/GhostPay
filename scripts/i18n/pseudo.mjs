#!/usr/bin/env node
// Generates pseudo-locales from en.json for catching truncation, hard-coded strings and RTL bugs.
//   en-XA: accented letters, +40 % length, wrapped in [ ]      en-XB: same, right-to-left embedding
// Usage: node scripts/i18n/pseudo.mjs [outDir]   (default apps/web/locales/pseudo, which is git-ignored)
// The dev build also generates these in memory (language picker, development builds only), so writing files is optional.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildPseudoCatalogs, LOCALES_DIR } from './lib.mjs';

const out = resolve(process.argv[2] ?? join(LOCALES_DIR, 'pseudo'));
const en = JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf8'));
mkdirSync(out, { recursive: true });
for (const [code, catalog] of Object.entries(buildPseudoCatalogs(en))) {
  writeFileSync(join(out, `${code}.json`), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`wrote ${join(out, `${code}.json`)}`);
}
