import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const stage = process.argv[4];
const compiled = resolve(output, `../ledger-probe-${stage}`);
const { default: ts } = await import(pathToFileURL(resolve(repo, 'node_modules/typescript/lib/typescript.js')).href);
mkdirSync(compiled, { recursive: true });
writeFileSync(resolve(compiled, 'package.json'), '{"type":"module"}\n');
const sourceHashes = {};
for (const name of ['reconcile', 'decimal', 'errors']) {
  const source = readFileSync(resolve(repo, `packages/merchant-ledger/src/${name}.ts`), 'utf8');
  sourceHashes[name] = createHash('sha256').update(source).digest('hex');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  writeFileSync(resolve(compiled, `${name}.js`), result.outputText);
}
const { reconcile } = await import(pathToFileURL(resolve(compiled, 'reconcile.js')).href);
const invoices = [
  { id: 'unpaid-positive', currency: 'USD', amountMinor: '50', expiresAt: 20 },
  { id: 'nothing-owed', currency: 'USD', amountMinor: '0', expiresAt: 20 },
];
const options = { now: 10, tolerance: { absoluteMinor: 100n } };
const observed = reconcile(invoices, [], options);
const result = {
  stage,
  reproduction: 'Direct calls to independently transpiled current source; no historical PR test helper or compiled workspace artifact is used',
  compiler: ts.version,
  sourceHashes,
  input: { invoices, payments: [], options },
  observed,
  expected: { 'unpaid-positive': 'unmatched', 'nothing-owed': 'paid' },
  conforms: observed.invoices.every((invoice) => invoice.status === (invoice.invoiceId === 'unpaid-positive' ? 'unmatched' : 'paid')),
};
writeFileSync(output, JSON.stringify(result, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
console.log(JSON.stringify({ stage, conforms: result.conforms, observed: observed.invoices }, null, 2));
