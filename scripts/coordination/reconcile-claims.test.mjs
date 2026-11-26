import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { reconcileSnapshot } from './reconcile-claims.mjs';

const script = fileURLToPath(new URL('./reconcile-claims.mjs', import.meta.url));
function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'ghostpay-claims-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: {
      ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    } });
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('config', 'core.filemode', 'true');
  const put = (name, text) => { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), text); };
  const commit = (message) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  put('src/value.js', 'export const value = 1;\n');
  const initial = commit('initial');
  return { root, git, put, commit, initial };
}
function snapshot(base, head = base, changes = {}) {
  const integration = changes.integration_sha ?? base;
  return {
    repository: 'fixture/GhostPay', observation_completed_utc: '2026-11-21T02:31:12Z',
    main_sha: base, integration_sha: base, integration_pr: 307,
    counts: { branches: 3, open_prs: 2 },
    branches: [{ name: 'main', sha: base }, { name: 'feature', sha: head }, { name: 'integration', sha: integration }],
    pull_requests: [{ number: 1, title: 'Fixture', state: 'open', draft: true,
      base_ref: 'main', base_sha: base, head_ref: 'feature', head_sha: head,
      url: 'https://github.com/fixture/GhostPay/pull/1' },
    { number: 307, title: 'Integration fixture', state: 'open', draft: true,
      base_ref: 'main', base_sha: base, head_ref: 'integration', head_sha: integration,
      url: 'https://github.com/fixture/GhostPay/pull/307' }],
    ...changes,
  };
}
function build(f, data) { return reconcileSnapshot({ repo: f.root, snapshot: data, snapshotSha256: '0'.repeat(64) }); }

test('pins ancestry separately from exact postimages and keeps raw ownership evidence', t => {
  const f = repository(t);
  f.put('src/value.js', 'export const value = 2;\n');
  f.put('docs/ai/ACTIVE_WORK.md', '# Task\nOwner: worker A\n');
  const feature = f.commit('feature');
  f.put('src/value.js', 'export const value = 3;\n');
  const main = f.commit('later change');
  const data = snapshot(main, feature);
  data.pull_requests[0].base_sha = f.initial;
  const result = build(f, data);
  const pr = result.pull_requests[0];
  assert.equal(pr.relationships.main.head_is_ancestor, true);
  assert.equal(pr.postimages.main.status, 'partial_match');
  assert.deepEqual(pr.postimages.main.differences.map(x => x.path), ['src/value.js']);
  assert.equal(result.claim_documents[pr.ownership.blob_sha].text, '# Task\nOwner: worker A\n');
  assert.equal(pr.ownership.interpretation, 'uninterpreted');
  assert.equal(result.qualification.status, 'not_assessed');
});

test('recognizes exact cherry-picked postimages without inventing ancestry or semantic qualification', t => {
  const f = repository(t);
  f.git('switch', '-qc', 'feature');
  f.put('src/value.js', 'export const value = 2;\n');
  const feature = f.commit('feature');
  f.git('switch', '-q', 'main');
  f.put('unrelated.txt', 'Independent main change\n');
  f.commit('main change');
  f.git('cherry-pick', feature);
  const main = f.git('rev-parse', 'HEAD');
  const data = snapshot(main, feature);
  data.pull_requests[0].base_sha = f.initial;
  const pr = build(f, data).pull_requests[0];
  assert.equal(pr.relationships.main.head_is_ancestor, false);
  assert.equal(pr.postimages.main.status, 'all_match');
  assert.deepEqual(pr.postimages.main.matching_paths, ['src/value.js']);
});

test('preserves rename, deletion, executable-mode and unusual-path evidence', t => {
  const f = repository(t);
  f.put('old.txt', 'rename me\n');
  f.put('gone.txt', 'remove me\n');
  f.put('script.sh', '#!/bin/sh\ntrue\n');
  const base = f.commit('baseline');
  f.git('switch', '-qc', 'feature');
  f.git('mv', 'old.txt', 'new name\twith newline\n.txt');
  f.git('rm', 'gone.txt');
  chmodSync(join(f.root, 'script.sh'), 0o755);
  f.put('docs/example.js', 'export const executed = true;\n');
  f.put('docs/report.json', '{"evidence":true}\n');
  f.put('docs/notes.md', '# Narrative\n');
  const head = f.commit('operations');
  const pr = build(f, snapshot(base, head)).pull_requests[0];
  assert.equal(pr.delta.changes.find(x => x.path === 'gone.txt').after, null);
  assert.equal(pr.delta.changes.find(x => x.path === 'old.txt').status, 'D');
  assert.equal(pr.delta.changes.find(x => x.path === 'new name\twith newline\n.txt').status, 'A');
  const mode = pr.delta.changes.find(x => x.path === 'script.sh');
  assert.equal(mode.before.sha, mode.after.sha);
  assert.equal(mode.before.mode, '100644');
  assert.equal(mode.after.mode, '100755');
  assert.ok(pr.postimages.main.differences.some(x => x.path === 'script.sh'));
  assert.ok(pr.delta.non_documentation_paths.includes('docs/example.js'));
  assert.ok(pr.delta.non_documentation_paths.includes('docs/report.json'));
  assert.ok(!pr.delta.non_documentation_paths.includes('docs/notes.md'));
});

test('reports matching deletion only when the target also lacks that path', t => {
  const f = repository(t);
  f.put('gone.txt', 'remove me\n');
  const base = f.commit('baseline');
  f.git('rm', 'gone.txt');
  const head = f.commit('delete');
  const data = snapshot(base, head, { integration_sha: head });
  const pr = build(f, data).pull_requests[0];
  assert.equal(pr.postimages.main.status, 'no_match');
  assert.equal(pr.postimages.integration.status, 'all_match');
});

test('gitlink changes remain visible when local Git configuration ignores submodules', t => {
  const f = repository(t);
  f.git('update-index', '--add', '--cacheinfo', `160000,${f.initial},modules/example`);
  f.git('commit', '-qm', 'initial gitlink');
  const base = f.git('rev-parse', 'HEAD');
  f.git('update-index', '--cacheinfo', `160000,${base},modules/example`);
  f.git('commit', '-qm', 'updated gitlink');
  const head = f.git('rev-parse', 'HEAD');
  f.git('config', 'diff.ignoreSubmodules', 'all');
  f.git('config', 'diff.relative', 'true');
  const pr = build(f, snapshot(base, head)).pull_requests[0];
  const change = pr.delta.changes.find(x => x.path === 'modules/example');
  assert.deepEqual(change.before, { mode: '160000', type: 'commit', sha: f.initial });
  assert.deepEqual(change.after, { mode: '160000', type: 'commit', sha: base });
  assert.equal(pr.postimages.main.status, 'no_match');
});

test('a target directory cannot satisfy a donor file deletion', t => {
  const f = repository(t);
  f.put('replaced', 'old file\n');
  const base = f.commit('file baseline');
  f.git('switch', '-qc', 'feature');
  f.git('rm', 'replaced');
  const head = f.commit('delete file');
  f.git('switch', '-q', 'main');
  f.git('rm', 'replaced');
  f.put('replaced/child.txt', 'new directory content\n');
  const target = f.commit('replace file with directory');
  const data = snapshot(target, head);
  data.pull_requests[0].base_sha = base;
  const pr = build(f, data).pull_requests[0];
  assert.equal(pr.delta.changes.find(x => x.path === 'replaced').after, null);
  assert.equal(pr.postimages.main.status, 'no_match');
  const actual = pr.postimages.main.differences.find(x => x.path === 'replaced').target_entry;
  assert.equal(actual.type, 'tree');
  assert.equal(actual.mode, '040000');
});

test('running from a repository subdirectory preserves root claims and all paths', t => {
  const f = repository(t);
  f.put('docs/ai/ACTIVE_WORK.md', '# Root ownership\n');
  const head = f.commit('claim');
  const data = snapshot(f.initial, head);
  const nested = join(f.root, 'deep', 'working', 'directory');
  mkdirSync(nested, { recursive: true });
  const result = reconcileSnapshot({ repo: nested, snapshot: data, snapshotSha256: '0'.repeat(64) });
  assert.deepEqual(result, build(f, data));
  assert.ok(result.pull_requests[0].ownership.blob_sha);
});

test('refuses missing or contradictory primary target provenance', t => {
  const f = repository(t);
  f.put('src/value.js', 'export const value = 2;\n');
  const head = f.commit('feature');
  for (const mutate of [
    d => { d.main_sha = head; },
    d => { d.integration_sha = head; },
    d => { d.integration_pr = 999; },
    d => { d.branches = d.branches.filter(x => x.name !== 'main'); d.counts.branches--; },
  ]) {
    const data = snapshot(f.initial, head); mutate(data);
    assert.throws(() => build(f, data), /must identify/);
  }
});

test('reports pinned stacks, drift and path overlaps without assigning owners', t => {
  const f = repository(t);
  f.put('src/value.js', 'export const value = 2;\n');
  const parent = f.commit('parent');
  f.put('src/value.js', 'export const value = 3;\n');
  const child = f.commit('child');
  const data = snapshot(f.initial, parent);
  data.branches.push({ name: 'child', sha: child });
  data.pull_requests.push({ ...data.pull_requests[0], number: 2,
    base_ref: 'feature', base_sha: parent, head_ref: 'child', head_sha: child,
    url: 'https://github.com/fixture/GhostPay/pull/2' });
  data.counts = { branches: data.branches.length, open_prs: data.pull_requests.length };
  data.branches[1].sha = child;
  const result = build(f, data);
  assert.deepEqual(result.pull_requests[1].dependencies.map(x => x.pr), [1]);
  assert.equal(result.pull_requests[1].dependencies[0].base_sha_matches_head, true);
  assert.equal(result.pull_requests[0].snapshot_refs.head.status, 'sha_mismatch');
  assert.deepEqual(result.overlaps.find(x => x.path === 'src/value.js').pull_requests, [1, 2]);
});

test('marks unrelated history as not comparable, never as an empty successful delta', t => {
  const f = repository(t);
  f.git('checkout', '--orphan', 'pages');
  f.git('rm', '-rf', '.');
  f.put('index.html', '<h1>Published</h1>\n');
  const pages = f.commit('published');
  const data = snapshot(f.initial, pages);
  const result = build(f, data);
  assert.equal(result.branches[0].delta.status, 'unrelated_history');
  assert.equal(result.pull_requests[0].postimages.main.status, 'not_comparable');
  assert.equal(result.pull_requests[0].relationships.main.head_is_ancestor, false);
});

test('replay is deterministic and does not depend on mutable branch names', t => {
  const f = repository(t);
  f.put('src/value.js', 'export const value = 2;\n');
  const head = f.commit('feature');
  const data = snapshot(f.initial, head);
  const first = JSON.stringify(build(f, data));
  f.git('update-ref', 'refs/heads/moved-after-snapshot', head);
  f.put('src/value.js', 'uncommitted content\n');
  assert.equal(JSON.stringify(build(f, data)), first);
});

test('rejects malformed snapshots, duplicate identities, count errors and noncommit objects', t => {
  const f = repository(t);
  const invalid = [
    d => { delete d.main_sha; },
    d => { d.main_sha = 'main'; },
    d => { d.branches.push(d.branches[0]); d.counts.branches++; },
    d => { d.pull_requests.push(d.pull_requests[0]); d.counts.open_prs++; },
    d => { d.counts.branches++; },
    d => { d.pull_requests[0].base_sha = 'a'.repeat(40); },
    d => { d.main_sha = f.git('rev-parse', `${f.initial}^{tree}`); },
    d => { d.observation_completed_utc = 'not a timestamp'; },
    d => { d.observation_completed_utc = '2026-02-31T02:31:12Z'; },
  ];
  for (const mutate of invalid) {
    const data = snapshot(f.initial); mutate(data);
    assert.throws(() => build(f, data));
  }
});

test('CLI refuses invalid provenance without overwriting an existing output', t => {
  const f = repository(t);
  const input = join(f.root, 'input.json');
  const output = join(f.root, 'output.json');
  writeFileSync(input, JSON.stringify({})); writeFileSync(output, 'preserve me\n');
  const failed = spawnSync(process.execPath, [script, '--repo', f.root, '--snapshot', input, '--output', output], { encoding: 'utf8' });
  assert.notEqual(failed.status, 0);
  assert.equal(readFileSync(output, 'utf8'), 'preserve me\n');
  writeFileSync(input, JSON.stringify(snapshot(f.initial)));
  const passed = spawnSync(process.execPath, [script, '--repo', f.root, '--snapshot', input, '--output', output], { encoding: 'utf8' });
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).counts.branches, 3);
  assert.equal(JSON.parse(passed.stdout).sha256, createHash('sha256').update(readFileSync(output)).digest('hex'));
  assert.equal(existsSync(`${output}.tmp`), false);
  assert.notEqual(resolve(input), resolve(output));
});
