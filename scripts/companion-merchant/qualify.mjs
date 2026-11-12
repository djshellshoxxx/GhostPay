#!/usr/bin/env node
// Owned-scope acceptance runner. Run npm ci --ignore-scripts and npm run build first.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scopes = ['merchant-billing', 'merchant-hooks', 'merchant-multisig', 'cli', 'ux-schedule', 'plugin-api', 'sandbox'];
const php = process.env.PHP_BIN ?? 'php';
const python = process.env.PYTHON_BIN ?? 'python3';
const commands = scopes.map(name => ['npm', ['test', '-w', `@ghostpay/${name}`, '--', '--maxWorkers=1']]);
commands.push(
  ['npm', ['run', 'test:compiled', '-w', '@ghostpay/cli']],
  [process.execPath, ['--test', 'examples/subscription-cron/run.test.mjs']],
  [process.execPath, ['--test', 'examples/merchant-operations/refund-batch.test.mjs', 'examples/merchant-operations/approvals-store.test.mjs']],
  [process.execPath, ['--test', 'examples/webhook-receiver/durable.test.mjs']],
  [process.execPath, ['examples/webhook-receiver/selftest.mjs']],
  [process.execPath, ['--test', 'examples/plugin-conformance/conformance.test.mjs']],
  [process.execPath, ['--test', ...readdirSync(join(root, 'examples/merchant-checkout')).filter(f => f.endsWith('.test.mjs')).sort().map(f => `examples/merchant-checkout/${f}`)]],
  [process.execPath, ['packages/merchant-multisig/tools/verify-vector.cjs']],
  [php, ['integrations/woocommerce/tests/run.php']],
  [php, ['integrations/prestashop/tests/run.php']],
  [python, ['-B', 'scripts/companion-merchant/shop-packages.test.py']],
  ['npm', ['run', 'ci:scan-secrets']],
  ['npm', ['run', 'ci:check-actions']],
  ['git', ['diff', '--check']],
);
for (const [command, args] of commands) {
  process.stdout.write(`${JSON.stringify({ command, args })}\n`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) {
    process.stderr.write(JSON.stringify({ command, status: result.status, signal: result.signal, code: result.error?.code }) + '\n');
    process.exit(result.status ?? 1);
  }
}
process.stdout.write('Companion owned-scope checks passed. Real platform/browser acceptance is separate.\n');
