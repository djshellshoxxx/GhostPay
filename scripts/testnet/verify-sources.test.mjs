// node --test scripts/testnet/verify-sources.test.mjs   (needs `cast` on PATH; no network: forge is a recording stub)
// SUPPLY-CHAIN-CI-06: manifest-derived strings must never reach a shell, and must be validated strictly.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, 'verify-sources.sh');
const good = JSON.parse(readFileSync(resolve(here, '../../deployments/31337.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'verify-sources-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;

// Fake repo root (script derives ROOT from its own path) with one manifest and a recording forge stub.
function run(manifest, env = {}) {
  const root = join(tmp, `r${n++}`);
  mkdirSync(join(root, 'scripts/testnet'), { recursive: true });
  mkdirSync(join(root, 'deployments'));
  mkdirSync(join(root, 'packages/contracts'), { recursive: true });
  mkdirSync(join(root, 'bin'));
  copyFileSync(script, join(root, 'scripts/testnet/verify-sources.sh'));
  writeFileSync(join(root, 'deployments/31337.json'), JSON.stringify(manifest));
  const log = join(root, 'forge.log');
  writeFileSync(join(root, 'bin/forge'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\n`);
  chmodSync(join(root, 'bin/forge'), 0o755);
  const r = spawnSync('bash', [join(root, 'scripts/testnet/verify-sources.sh'), '31337'], {
    env: { PATH: `${join(root, 'bin')}:${process.env.PATH}:/root/.foundry/bin`, HOME: process.env.HOME ?? '/tmp', ...env },
    encoding: 'utf8',
  });
  return { ...r, root, forgeCalls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] };
}

test('valid manifest: confirmed run invokes forge with plain args (VERIFIER_URL only, no API key)', () => {
  const r = run(good, { CONFIRM_VERIFY: '1', VERIFIER_URL: 'https://blockscout.example/api' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.forgeCalls.length, 2);
  assert.match(r.forgeCalls[0], /^verify-contract 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 src\/GhostPayRouter\.sol:GhostPayRouter /);
  assert.match(r.forgeCalls[0], /--compiler-version v0\.8\.28\+commit\.7893614a /);
});

test('shell metacharacters in solcVersion are rejected and never executed', () => {
  const m = { ...good, solcVersion: '0.8.28; touch PWNED #' };
  const r = run(m, { CONFIRM_VERIFY: '1', ETHERSCAN_API_KEY: 'k' });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(join(r.root, 'packages/contracts/PWNED')), false, 'payload executed');
  assert.equal(r.forgeCalls.length, 0);
  assert.match(r.stderr, /solcVersion/);
});

test('command substitution in an address field is rejected and never executed', () => {
  const m = { ...good, router: `0x$(touch ${tmp}/PWNED2)00000000000000000000000000000000` };
  const r = run(m, { CONFIRM_VERIFY: '1', ETHERSCAN_API_KEY: 'k' });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(join(tmp, 'PWNED2')), false, 'payload executed');
  assert.match(r.stderr, /router/);
});

test('malformed address is rejected even in dry run', () => {
  const r = run({ ...good, feeRecipient: '0x1234' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /feeRecipient/);
});
