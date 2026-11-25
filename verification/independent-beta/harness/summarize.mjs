// W5 independent payment-state verifier: render a run record (run.json) as SUMMARY.md next to it.
// Usage: node verification/independent-beta/harness/summarize.mjs verification/independent-beta/results/<run>/run.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const file = process.argv[2];
if (file === undefined) throw new Error('usage: summarize.mjs <run.json>');
const rec = JSON.parse(readFileSync(file, 'utf8'));
const uniq = (xs) => [...new Set(xs)];
const step = (s) =>
  [s.op, s.tab, s.intent, s.behaviour, s.accept === undefined ? undefined : s.accept ? 'accept' : 'dismiss', s.depth, s.mode, s.to]
    .filter((x) => x !== undefined)
    .join(':');

const lines = [];
lines.push(`# W5 run ${rec.runId}`, '');
lines.push(`- Command: \`${rec.command}\``);
lines.push(`- Source HEAD: \`${rec.source.head}\`; production tree clean: ${rec.source.productionTreeClean}; production paths differing from pinned main \`${rec.pinnedMain}\`: ${rec.productionPathsDifferingFromPinnedMain.length === 0 ? 'none' : rec.productionPathsDifferingFromPinnedMain.join(', ')}`);
lines.push(`- Bundle: profile \`${rec.build.profile}\`, dist sha256 \`${rec.build.dist.sha256}\` (${rec.build.dist.files} files), built from \`${rec.build.head}\``);
lines.push(`- Environment: node ${rec.environment.node}, playwright-core ${rec.environment.playwrightCore}, Chromium ${rec.environment.chromium}, ${rec.environment.platform}, ${rec.environment.cpus} CPUs`);
lines.push(`- Seeds: ${rec.seeds.length === 0 ? 'none (named only)' : `${rec.seeds[0]}–${rec.seeds[rec.seeds.length - 1]}`}; wall time ${(rec.wallMs / 60000).toFixed(1)} min`);
lines.push(`- Totals: ${rec.totals.scenarios} scenarios, ${rec.totals.handoffs} wallet handoffs, harness errors ${rec.totals.harnessErrors}, with violations ${rec.totals.withViolations}, with ambiguities ${rec.totals.withAmbiguities}, off-origin requests blocked: ${rec.totals.blockedOffOrigin.length === 0 ? 'none' : rec.totals.blockedOffOrigin.join(', ')}`);
lines.push('', '| Scenario | Result | s | Handoffs (tab:intent:behaviour) | Clears | Violations | Ambiguities |', '|---|---|---|---|---|---|---|');
for (const r of rec.results) {
  const res = r.harnessError !== null ? 'HARNESS ERROR' : r.violations.length > 0 ? 'VIOLATION' : 'ok';
  const h = r.handoffs.map((x) => `${x.tab}:${x.intent}:${x.behaviour}`).join(', ');
  lines.push(`| ${r.name} | ${res} | ${(r.durationMs / 1000).toFixed(0)} | ${h} | X=${r.clears.X} | ${uniq(r.violations.map((v) => v.inv)).join(', ') || '–'} | ${uniq(r.ambiguities.map((a) => a.inv)).join(', ') || '–'} |`);
}
const detailed = rec.results.filter((r) => r.violations.length > 0 || r.ambiguities.length > 0 || r.harnessError !== null);
if (detailed.length > 0) lines.push('', '## Details');
for (const r of detailed) {
  lines.push('', `### ${r.name}`, '', `Steps: ${r.steps.map(step).join(' → ')} (+ fixed suffix)`);
  if (r.harnessError !== null) lines.push('', `Harness error: \`${r.harnessError.split('\n')[0]}\``);
  for (const v of r.violations) lines.push(`- **${v.inv}** at step ${v.step}: \`${JSON.stringify(v.detail).slice(0, 400)}\``);
  for (const a of r.ambiguities) lines.push(`- ${a.inv} at step ${a.step}: \`${JSON.stringify(a.detail).slice(0, 300)}\``);
  if (r.minimized !== undefined) lines.push(`- Minimized (${r.minimized.replaysUsed} replays, reproduced: ${r.minimized.reproduced}): ${r.minimized.steps.map(step).join(' → ')}`);
}
const payEnabled = rec.results.reduce((n, r) => n + (r.payEnabledWithRecord ?? 0), 0);
const fallback = rec.results.reduce((n, r) => n + r.notes.filter((x) => /I1 judged without/.test(x.note ?? '')).length, 0);
const idUnjudgeable = rec.results.reduce((n, r) => n + r.notes.filter((x) => /identity unjudgeable/.test(x.note ?? '')).length, 0);
lines.push('', `Explicit classifications (never silent): pay action enabled with own record visible (R20) ${payEnabled} observations; I1 judged without a displayed known hash ${fallback}; I3 unknown-row identity unjudgeable ${idUnjudgeable}.`);
const unknown = uniq(rec.results.flatMap((r) => r.rpcUnknownMethods));
lines.push('', `RPC methods the mock did not implement (requested by the app): ${unknown.length === 0 ? 'none' : unknown.join(', ')}`);
writeFileSync(join(dirname(file), 'SUMMARY.md'), `${lines.join('\n')}\n`);
console.log(join(dirname(file), 'SUMMARY.md'));
