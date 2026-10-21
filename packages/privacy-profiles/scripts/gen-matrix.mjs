// Prints the compatibility matrix as Markdown. Usage: npm run build && node scripts/gen-matrix.mjs [--chain]
// Prints to stdout only; the docs owner pastes it (no auto-write into docs).
import { compatibilityMatrix, chainMatrix } from '../dist/index.js';

if (process.argv.includes('--chain')) {
  console.log('| a | b | relation | rules |\n|---|---|---|---|');
  for (const c of chainMatrix()) console.log(`| ${c.a} | ${c.b} | ${c.relation} | ${c.ruleIds.join(', ')} |`);
} else {
  const SYMBOL = { ok: 'Y', conflict: 'X', requires: 'X', warn: 'W', moot: 'M' };
  console.log('| a | b | cell | rules |\n|---|---|---|---|');
  for (const c of compatibilityMatrix()) {
    console.log(`| ${c.a.option}=${c.a.value} | ${c.b.option}=${c.b.value} | ${SYMBOL[c.relation]} | ${c.ruleIds.join(', ')} |`);
  }
}
