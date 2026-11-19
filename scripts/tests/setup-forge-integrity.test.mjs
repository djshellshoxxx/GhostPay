import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const action = readFileSync(join(root, '.github/actions/setup-forge/action.yml'), 'utf8');
const checksum = '9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25';

function guard() {
  const block = action.match(/- shell: bash\n {6}run: \|\n((?: {8}[^\n]*\n)+)/)?.[1];
  assert.ok(block, 'restored compiler cache must be verified before the build cache is used');
  assert.ok(block.includes(`expected=${checksum}`), 'official Linux solc 0.8.28 checksum remains pinned');
  // Point only the two shell path references at isolated fixtures; do not alter the user's home or cache.
  return block.replace(/^ {8}/gm, '').replaceAll('$HOME', '$GP_TEST_CACHE_ROOT')
    .replaceAll('XDG_DATA_HOME', 'GP_TEST_DATA_ROOT');
}

test('Foundry setup accepts an absent cache and rejects corrupted solc in either supported cache location', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-solc-integrity-'));
  const run = () => spawnSync('bash', ['-c', guard()], {
    encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, GP_TEST_CACHE_ROOT: directory, GP_TEST_DATA_ROOT: join(directory, 'data') },
  });
  try {
    const absent = run();
    assert.equal(absent.status, 0, absent.stdout + absent.stderr);
    for (const relative of ['.svm/0.8.28/solc-0.8.28', 'data/svm/0.8.28/solc-0.8.28']) {
      const file = join(directory, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, 'corrupted compiler cache fixture\n');
      const corrupt = run();
      assert.equal(corrupt.status, 1, `${relative}: ${corrupt.stdout}${corrupt.stderr}`);
      assert.match(corrupt.stdout, /::error::cached solc 0\.8\.28 hash mismatch/);
      rmSync(file);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
