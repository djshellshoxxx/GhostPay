// Offline executable fixtures only; no real analyzer result or finding approval is created here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../..', import.meta.url));
const targets = ['GhostPayRouter', 'GhostPaySweepRelayer', 'GhostPayPolicyRouter', 'PolicyAccount', 'PolicyAccountFactory'];
const clean = '{"success":true,"error":null,"issues":[]}\n';
const complete = { schemaVersion: 1, instrumentationReady: true, reportCount: 1, executionTimeoutObserved: false, creationTimeoutObserved: false, exceptionCount: 0, errorLogObserved: false };
const sha = (v) => createHash('sha256').update(v).digest('hex');

function capture({ exit = 0, output = clean, reuse = false, timeout = '900' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ghostpay-capture-'));
  const root = join(directory, 'repo');
  const evidence = join(directory, 'evidence');
  const bin = join(directory, 'bin');
  try {
    mkdirSync(bin);
    const files = {
      '.github/workflows/contract-analysis.yml': "mythril==0.24.8\n",
      'packages/contracts/foundry.toml': 'solc = "0.8.28"\n',
      'packages/contracts/lib/openzeppelin-contracts/contracts/Mock.sol': 'contract Mock {}\n',
      'packages/contracts/scripts/mythril-compat.py': '# fixture\n',
    };
    for (const name of ['run-mythril.sh', 'capture-mythril-evidence.py']) files[`packages/contracts/scripts/${name}`] = readFileSync(join(repo, 'packages/contracts/scripts', name));
    for (const target of targets) files[`packages/contracts/src/${target}.sol`] = `contract ${target} {}\n`;
    for (const [path, bytes] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); }
    writeFileSync(join(bin, 'myth'), `#!/usr/bin/env bash
if [[ "$1" == version ]]; then echo 'Mythril version v0.24.8'; exit 0; fi
cat "$FIXTURE_OUTPUT"
printf '%s\\n' '${JSON.stringify(complete)}' >"$MYTHRIL_COMPLETENESS_FILE"
exit "$FIXTURE_EXIT"
`, { mode: 0o755 });
    writeFileSync(join(bin, 'solc'), "#!/usr/bin/env bash\necho 'solc, the solidity compiler commandline interface'\necho 'Version: 0.8.28+commit.7893614a.Linux.g++'\n", { mode: 0o755 });
    // Test-only module stubs let the real capture code resolve a distinct compiler path.
    putModule('solcx/__init__.py', '');
    putModule('solcx/install.py', `import os\nfrom pathlib import Path\ndef get_executable(version):\n    assert version == "0.8.28"\n    return Path(os.environ["FIXTURE_NATIVE_SOLC"])\n`);
    putModule('mythril/__init__.py', '');
    putModule('mythril/ethereum/util.py', '# synthetic selector only\n');
    const native = join(directory, 'native-solc');
    writeFileSync(native, readFileSync(join(bin, 'solc')), { mode: 0o755 });
    function putModule(path, bytes) { const out = join(directory, 'modules', path); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, bytes); }
    writeFileSync(join(directory, 'output'), output);
    if (reuse) mkdirSync(evidence);
    const result = spawnSync('bash', ['packages/contracts/scripts/run-mythril.sh', timeout], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MYTHRIL_EVIDENCE_DIR: evidence,
        PYTHONPATH: join(directory, 'modules'), FIXTURE_NATIVE_SOLC: native, FIXTURE_OUTPUT: join(directory, 'output'), FIXTURE_EXIT: String(exit) },
    });
    if (reuse) return { result };
    const manifest = JSON.parse(readFileSync(join(evidence, 'manifest.json'), 'utf8'));
    const retained = Object.fromEntries(targets.map((target) => [target, {
      stdout: readFileSync(join(evidence, `${target}.stdout.json`), 'utf8'),
      stderr: readFileSync(join(evidence, `${target}.stderr.log`), 'utf8'),
      completeness: readFileSync(join(evidence, `${target}.completeness.json`), 'utf8'),
    }]));
    return { result, manifest, retained };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('passive capture preserves all five clean reports, exact invocations and actual process outcomes', () => {
  const { result, manifest, retained } = capture();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(manifest.completed, true);
  assert.equal(manifest.sourceUnchanged, true);
  assert.equal(manifest.runnerExitCode, 0);
  assert.equal(manifest.configuration.transactionDepth, 3);
  assert.equal(manifest.configuration.executionTimeoutSeconds, 900);
  assert.equal(manifest.tools.mythril.exitCode, 0);
  assert.match(manifest.tools.solc.stdout, /0\.8\.28/);
  assert.deepEqual(manifest.analyses.map((a) => a.target), targets);
  for (const entry of manifest.analyses) {
    assert.equal(entry.stdout.sha256, sha(retained[entry.target].stdout));
    assert.equal(entry.stderr.sha256, sha(retained[entry.target].stderr));
    assert.equal(entry.completeness.sha256, sha(retained[entry.target].completeness));
    assert.deepEqual(JSON.parse(retained[entry.target].completeness), complete);
    assert.equal(entry.exitCode, 0);
    assert.equal(entry.compiler.exitCode, 0);
    assert.equal(entry.compiler.selection, 'solcx.install.get_executable(0.8.28)');
    assert.match(entry.compiler.executablePath, /native-solc$/);
    assert.equal(entry.compiler.executableSha256, manifest.tools.mythrilCompiler.executableSha256);
    assert.match(entry.compiler.resolverSha256, /^[0-9a-f]{64}$/);
    assert.match(entry.compiler.mythrilSelectorSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(entry.argv, ['analyze', `src/${entry.target}.sol`, '--solv', '0.8.28', '--solc-json', 'config.json', '--execution-timeout', '900', '-t', '3', '-o', 'json']);
  }
});

test('capturing findings never clears the strict gate', () => {
  const output = '{"success":true,"error":null,"issues":[{"title":"fixture only"}]}\n';
  const { result, manifest } = capture({ exit: 1, output });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(manifest.runnerExitCode, 1);
  assert.equal(manifest.completed, true);
  assert.ok(manifest.analyses.every((a) => a.exitCode === 1));
});

test('clean JSON followed by a crash is retained as a failure for every target', () => {
  const { result, manifest } = capture({ exit: 137 });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(manifest.runnerExitCode, 1);
  assert.ok(manifest.analyses.every((a) => a.exitCode === 137));
});

test('an existing evidence directory is refused before analysis, preventing stale target substitution', () => {
  const { result } = capture({ reuse: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /capture failed/);
  assert.doesNotMatch(result.stdout, /"success"/);
});

test('capture records an explicitly requested budget without pretending it is the reviewed default', () => {
  const { result, manifest } = capture({ timeout: '10' });
  assert.equal(result.status, 0);
  assert.equal(manifest.configuration.executionTimeoutSeconds, 10);
  assert.ok(manifest.analyses.every((a) => a.argv[7] === '10'));
});
