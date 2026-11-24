// Finding R14-2: the release-verify composite action's attestation step must pin each attestation to the release
// workflow, the release tag ref and the expected commit, on a GitHub-hosted runner, exactly as deploy/selfhost.sh does.
// `--repo` alone accepts an attestation made by any workflow on any ref of the repository. The step's script is taken
// from action.yml and run with a fake `gh` on PATH that records its arguments. No dependencies; needs bash.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const ACTION = '.github/actions/release-verify/action.yml';
const action = readFileSync(join(root, ACTION), 'utf8');

const indentOf = (line) => line.search(/\S/);

/** { env: text, run: dedented script } of the composite step whose `- name:` starts with `prefix`. */
function step(prefix) {
  const lines = action.split('\n');
  const at = lines.findIndex((l) => l.trim().startsWith(`- name: ${prefix}`));
  assert.ok(at >= 0, `step "${prefix}" not found in ${ACTION}`);
  const keyIndent = lines[at].indexOf('name:');
  const block = [];
  for (let i = at + 1; i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) >= keyIndent); i++) {
    if (indentOf(lines[i]) === keyIndent && lines[i].trim().startsWith('- ')) break;
    block.push(lines[i]);
  }
  const runAt = block.findIndex((l) => indentOf(l) === keyIndent && /^\s*run: \|\s*$/.test(l));
  assert.ok(runAt >= 0, `step "${prefix}" has no run: | block`);
  const body = [];
  for (let i = runAt + 1; i < block.length && (block[i].trim() === '' || indentOf(block[i]) > keyIndent); i++) body.push(block[i]);
  const indent = Math.min(...body.filter((l) => l.trim() !== '').map(indentOf));
  return { text: block.join('\n'), run: `${body.map((l) => l.slice(indent)).join('\n')}\n` };
}

const attest = step('Verify build attestations');
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const FILES = ['ghostpay-web-v1.2.3.tar.gz', 'release-manifest.json'];

/** Run the step script; the fake gh writes each call as one JSON array of its argv. */
function runStep(env) {
  const dir = mkdtempSync(join(tmpdir(), 'r14-2-'));
  try {
    const bin = join(dir, 'bin');
    const art = join(dir, 'art');
    mkdirSync(bin);
    mkdirSync(art);
    const log = join(dir, 'gh.log');
    writeFileSync(join(bin, 'gh'),
      `#!/usr/bin/env bash\nnode -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- "$@" >> "${log}"\nexit "\${FAKE_GH_STATUS:-0}"\n`);
    chmodSync(join(bin, 'gh'), 0o755);
    for (const f of FILES) writeFileSync(join(art, f), 'x');
    writeFileSync(join(art, 'SHA256SUMS'), FILES.map((f) => `${'0'.repeat(64)}  ${f}\n`).join(''));
    const result = spawnSync('bash', ['-c', attest.run], {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`, GP_DIR: art, GP_SUMS: 'SHA256SUMS', GP_REPO: 'owner/repo',
        GP_COMMIT: COMMIT, GP_TAG: 'v1.2.3', GH_TOKEN: 'x', ...env,
      },
    });
    const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { status: result.status, calls, out: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('attestation step pins signer workflow, tag ref, commit digest and GitHub-hosted runners for every file', () => {
  const { status, calls, out } = runStep({});
  assert.equal(status, 0, out);
  assert.deepEqual(calls, FILES.map((f) => [
    'attestation', 'verify', f, '--repo', 'owner/repo',
    '--signer-workflow', 'owner/repo/.github/workflows/release.yml',
    '--source-ref', 'refs/tags/v1.2.3', '--source-digest', COMMIT, '--deny-self-hosted-runners',
  ]));
});

test('a missing or malformed tag fails closed before gh runs', () => {
  for (const tag of ['', '1.2.3', 'refs/tags/v1.2.3', 'v1.2.3 --repo evil/x', 'v1.2.3\n', 'v1/../x', '-v1', 'v', 'v1.2.3;id', 'main']) {
    const { status, calls } = runStep({ GP_TAG: tag });
    assert.notEqual(status, 0, `tag ${JSON.stringify(tag)} accepted`);
    assert.deepEqual(calls, [], `gh ran for tag ${JSON.stringify(tag)}`);
  }
  const unset = runStep({ GP_TAG: undefined });
  assert.notEqual(unset.status, 0);
  assert.deepEqual(unset.calls, []);
});

test('a malformed expected commit or repository fails closed before gh runs', () => {
  for (const env of [{ GP_COMMIT: '' }, { GP_COMMIT: COMMIT.slice(1) }, { GP_COMMIT: COMMIT.toUpperCase() },
    { GP_COMMIT: `${COMMIT} x` }, { GP_REPO: 'owner/repo/x' }, { GP_REPO: '' }]) {
    const { status, calls } = runStep(env);
    assert.notEqual(status, 0, JSON.stringify(env));
    assert.deepEqual(calls, [], JSON.stringify(env));
  }
});

test('a failing gh attestation verify fails the step', () => {
  const { status, calls } = runStep({ FAKE_GH_STATUS: '1' });
  assert.notEqual(status, 0);
  assert.equal(calls.length, 1);
});

test('the step receives tag and commit through env, and no input is interpolated into any script', () => {
  assert.match(action, /\n {2}tag:\n {4}description: /, 'action has a tag input');
  assert.match(attest.text, /\n\s+GP_TAG: \$\{\{ inputs\.tag \}\}\n/);
  assert.match(attest.text, /\n\s+GP_COMMIT: \$\{\{ inputs\.expected-commit \}\}\n/);
  assert.doesNotMatch(attest.run, /\$\{\{/, 'expression in the attestation script text');
  assert.doesNotMatch(action, /^\s*run: [^|\n]*\$\{\{/m, 'expression in a one-line run script');
});
