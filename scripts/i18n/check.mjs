#!/usr/bin/env node
// CI gate for translation catalogs. Usage: node scripts/i18n/check.mjs [--strict]
//   errors  (always fail): missing/extra keys, placeholder or plural/select/markup mismatch, wrong plural categories,
//                          HTML, bad metadata, invalid ICU syntax
//   warnings (fail with --strict): translation much longer/shorter than English, identical to English
import { checkCatalogs, readCatalogs } from './lib.mjs';

const strict = process.argv.includes('--strict');
const catalogs = readCatalogs();
const { errors, warnings } = checkCatalogs(catalogs);
for (const e of errors) console.error(`ERROR   ${e}`);
for (const w of warnings) console.warn(`WARNING ${w}`);
console.log(`i18n check: ${String(catalogs.length)} catalogs, ${String(errors.length)} errors, ${String(warnings.length)} warnings`);
process.exit(errors.length > 0 || (strict && warnings.length > 0) ? 1 : 0);
