import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../stamp-build.mjs', import.meta.url));
const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const sentinel = 'unrelated-secret-must-not-enter-build-metadata';
const fixtureGitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));

function execute(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
    ...(executable === 'git' ? { env: fixtureGitEnvironment } : {}), ...options,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false);
  return result.stdout;
}

async function fixture(t, repository = true) {
  const root = await mkdtemp(join(tmpdir(), 'GhostPay build stamp '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = join(root, 'packages', 'cli');
  await mkdir(join(cli, 'dist'), { recursive: true });
  await copyFile(script, join(cli, 'stamp-build.mjs'));
  await writeFile(join(cli, 'package.json'), '{"type":"module"}\n');
  await writeFile(join(root, '.gitignore'), 'packages/cli/dist/\n');
  await writeFile(join(root, 'source.txt'), 'tracked source\n');
  if (repository) {
    execute('git', ['init', '--quiet', '--initial-branch=main'], { cwd: root });
    execute('git', ['add', '.'], { cwd: root });
    execute('git', ['-c', 'user.name=GhostPay build test', '-c', 'user.email=build-test@example.invalid',
      '-c', 'commit.gpgSign=false', '-c', `core.hooksPath=${join(root, 'no-hooks')}`, 'commit', '--quiet', '-m', 'fixture'], { cwd: root });
  }
  return { root, cli };
}

function stamp(cli, env = process.env) {
  // The build entry point must find its own checkout even when called from elsewhere.
  return execute(process.execPath, [join(cli, 'stamp-build.mjs')], {
    cwd: tmpdir(), env: { ...env, GHOSTPAY_UNRELATED_SECRET: sentinel },
  });
}

function readBuildInfo(cli) {
  const moduleUrl = pathToFileURL(join(cli, 'dist', 'build-info.js')).href;
  return JSON.parse(execute(process.execPath, ['--input-type=module', '-e',
    `const {BUILD_INFO}=await import(${JSON.stringify(moduleUrl)}); if(!Object.isFrozen(BUILD_INFO))process.exit(1); process.stdout.write(JSON.stringify(BUILD_INFO));`]));
}

test('build stamping records a real clean Git revision and produces identical bytes on repeat', async t => {
  const { root, cli } = await fixture(t);
  const revision = execute('git', ['rev-parse', 'HEAD'], { cwd: root }).trim();
  assert.match(revision, /^[0-9a-f]{40}$/);
  assert.equal(stamp(cli), '');
  assert.deepEqual(readBuildInfo(cli), { sourceRevision: revision, dirty: false });
  const first = await readFile(join(cli, 'dist', 'build-info.js'), 'utf8');
  stamp(cli);
  assert.equal(await readFile(join(cli, 'dist', 'build-info.js'), 'utf8'), first);
  assert.equal(first.includes(sentinel), false);
  assert.equal(first.includes(root), false);
  assert.equal(first.includes('timestamp'), false);
});

test('build stamping identifies tracked changes and untracked source files', async t => {
  const { root, cli } = await fixture(t);
  const revision = execute('git', ['rev-parse', 'HEAD'], { cwd: root }).trim();
  await appendFile(join(root, 'source.txt'), 'uncommitted change\n');
  stamp(cli);
  assert.deepEqual(readBuildInfo(cli), { sourceRevision: revision, dirty: true });
  await writeFile(join(root, 'source.txt'), 'tracked source\n');
  await writeFile(join(root, 'new-source.txt'), 'untracked change\n');
  stamp(cli);
  assert.deepEqual(readBuildInfo(cli), { sourceRevision: revision, dirty: true });
});

test('build stamping replaces prior metadata with explicit nulls when Git is unavailable', async t => {
  const { cli } = await fixture(t);
  stamp(cli);
  assert.match(readBuildInfo(cli).sourceRevision, /^[0-9a-f]{40}$/);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^path$/i.test(key)) delete env[key];
  env.PATH = '';
  assert.equal(stamp(cli, env), '');
  assert.deepEqual(readBuildInfo(cli), { sourceRevision: null, dirty: null });
});

test('build stamping uses explicit nulls for a source archive without Git metadata', async t => {
  const { cli } = await fixture(t, false);
  stamp(cli);
  assert.deepEqual(readBuildInfo(cli), { sourceRevision: null, dirty: null });
});

test('build stamping ignores unrelated checkout routing in ambient Git variables', async t => {
  const current = await fixture(t);
  const foreign = await fixture(t);
  await appendFile(join(foreign.root, 'source.txt'), 'a different checkout\n');
  execute('git', ['add', 'source.txt'], { cwd: foreign.root });
  execute('git', ['-c', 'user.name=GhostPay build test', '-c', 'user.email=build-test@example.invalid',
    '-c', 'commit.gpgSign=false', '-c', `core.hooksPath=${join(foreign.root, 'no-hooks')}`, 'commit', '--quiet', '-m', 'foreign revision'], { cwd: foreign.root });
  const revision = execute('git', ['rev-parse', 'HEAD'], { cwd: current.root }).trim();
  const foreignRevision = execute('git', ['rev-parse', 'HEAD'], { cwd: foreign.root }).trim();
  assert.notEqual(revision, foreignRevision);
  stamp(current.cli, { ...process.env, GIT_DIR: join(foreign.root, '.git'), GIT_WORK_TREE: foreign.root,
    GIT_INDEX_FILE: join(foreign.root, '.git', 'index') });
  assert.deepEqual(readBuildInfo(current.cli), { sourceRevision: revision, dirty: false });
});

test('compiled diagnostics exposes the stamped module without invoking Git at runtime', async () => {
  const { BUILD_INFO } = await import('../dist/build-info.js');
  assert.deepEqual(Object.keys(BUILD_INFO).sort(), ['dirty', 'sourceRevision']);
  assert.equal(BUILD_INFO.sourceRevision === null || /^[0-9a-f]{40}$/.test(BUILD_INFO.sourceRevision), true);
  assert.equal(BUILD_INFO.dirty === null || typeof BUILD_INFO.dirty === 'boolean', true);
  const env = { ...process.env, GHOSTPAY_UNRELATED_SECRET: sentinel };
  for (const key of Object.keys(env)) if (/^path$/i.test(key)) delete env[key];
  env.PATH = '';
  const report = JSON.parse(execute(process.execPath, [bin, 'diagnostics', '--json'], { env, cwd: tmpdir() }));
  assert.deepEqual(report.buildInfo, BUILD_INFO);
  assert.equal(report.networkContacted, false);
  assert.equal(report.providerTrustEstablished, false);
});
