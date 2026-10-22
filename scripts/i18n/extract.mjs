#!/usr/bin/env node
// Lists translation keys used in apps/web/src (t('key'), i18n.t('key'), <Trans id="key">, "i18n-use: a.b c.d" comments)
// against apps/web/locales/en.json. Usage: node scripts/i18n/extract.mjs [--fail-on-unused]
//   missing: used in code, absent from en.json     -> always exit 1
//   unused : in en.json, never used in code       -> reported; exit 1 only with --fail-on-unused
import { extractReport, LOCALES_DIR, scanUsage } from './lib.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const en = JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf8'));
const usage = scanUsage();
const r = extractReport(usage, Object.keys(en.messages));
for (const k of r.missing) console.error(`MISSING ${k}  (${(usage.get(k) ?? []).join(', ')})`);
for (const k of r.unused) console.log(`unused  ${k}`);
console.log(`i18n extract: ${String(r.used.length)} used, ${String(r.missing.length)} missing from en.json, ${String(r.unused.length)} unused`);
process.exit(r.missing.length > 0 || (process.argv.includes('--fail-on-unused') && r.unused.length > 0) ? 1 : 0);
