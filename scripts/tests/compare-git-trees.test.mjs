import test from 'node:test';
import assert from 'node:assert/strict';
import { compareGitTrees } from '../consolidation/compare-git-trees.mjs';

const sha = n => n.toString(16).padStart(40, '0');
const tree = (entries, identity = sha(900)) => ({ sha: identity, truncated: false, tree: entries });
const file = (path, n, type = 'blob') => ({ path, sha: sha(n), type, mode: type === 'tree' ? '040000' : type === 'commit' ? '160000' : '100644' });

test('preserves all 701 changes beyond GitHub 300-file compare limit', () => {
  const same = Array.from({ length: 400 }, (_, i) => file(`docs/same/${i}.md`, i + 1));
  const updated = Array.from({ length: 701 }, (_, i) => file(`packages/core/src/${i}.ts`, i + 1000));
  const old = [...same, ...updated];
  const next = [...same, ...updated.map((f,i) => ({ ...f, sha: sha(i + 3000) }))];
  const result = compareGitTrees(tree(old), tree(next, sha(901)));
  assert.equal(result.summary.changed, 701);
  assert.equal(result.summary.identical, 400);
  assert.equal(result.changed.length, 701);
  assert.equal(result.summary.totalDifferingPaths, 701);
});

test('detects added, removed, modified, unchanged and gitlink submodules', () => {
  const before = tree([file('docs/a.md', 1), file('src/deleted.ts', 2), file('vendor/repo', 3, 'commit'), file('src/keep.ts', 4)]);
  const after = tree([file('docs/a.md', 9), file('src/added.ts', 5), file('vendor/repo', 6, 'commit'), file('src/keep.ts', 4)]);
  const diff = compareGitTrees(before, after);
  assert.deepEqual(diff.summary, { baseObjects: 4, donorObjects: 4, added: 1, deleted: 1, changed: 2, identical: 1, totalDifferingPaths: 4 });
  assert.deepEqual(diff.changed.map(x=>x.path), ['docs/a.md', 'vendor/repo']);
  assert.equal(diff.changed[1].donorType, 'commit');
});

test('rejects truncated, absent and silently incomplete trees', () => {
  const valid = tree([file('x', 1)]);
  for (const input of [null, {}, {tree: []}, {tree: [], truncated: true}]) {
    assert.throws(() => compareGitTrees(input, valid), /complete recursive Git tree/);
    assert.throws(() => compareGitTrees(valid, input), /complete recursive Git tree/);
  }
});

test('rejects duplicate, malformed and ambiguous tracked paths', () => {
  const valid = tree([]);
  for (const invalid of [
    [file('dup', 1), file('dup', 2)],
    [file('../escape', 1)], [file('/absolute', 1)], [file('x//y', 1)], [file('x\\y', 1)],
    [{path: 'x', type: 'blob', sha: 'not-a-sha'}], [{path: 'x', type: 'unknown', sha: sha(1)}],
  ]) {
    assert.throws(() => compareGitTrees(tree(invalid), valid), /invalid tree entry|duplicate path/);
  }
});

test('directory entries are ignored, a tree cannot masquerade as a complete merge proof', () => {
  const base = tree([file('src', 10, 'tree'), file('src/a.ts', 1)]);
  const donor = tree([file('src', 11, 'tree'), file('src/a.ts', 1)]);
  const delta = compareGitTrees(base, donor);
  assert.equal(delta.summary.totalDifferingPaths, 0);
  assert.match(delta.caveats.join(' '), /not patch equivalence or commit ancestry/);
});

test('a chmod or symlink change is not silently classified as an identical blob', () => {
  const base = tree([
    { ...file('bin/run.sh', 81), mode: '100644' },
    { ...file('config/current', 83), mode: '100644' },
  ]);
  const donor = tree([
    { ...file('bin/run.sh', 81), mode: '100755' },
    { ...file('config/current', 83), mode: '120000' },
  ]);
  const delta = compareGitTrees(base, donor);
  assert.equal(delta.summary.changed, 2);
  assert.equal(delta.summary.identical, 0);
  assert.deepEqual(delta.changed.map(entry => [entry.path, entry.baseMode, entry.donorMode]), [
    ['bin/run.sh', '100644', '100755'],
    ['config/current', '100644', '120000'],
  ]);
});

test('requires file mode and validates blob/gitlink/directory consistency', () => {
  const valid = tree([{ ...file('sub/repo', 3, 'commit'), mode: '160000' }]);
  for (const item of [
    { path: 'src/no-mode.ts', sha: sha(2), type: 'blob' },
    { ...file('sub/repo', 3, 'commit'), mode: '100644' },
    { ...file('src/unsafe.ts', 4), mode: '160000' },
    { ...file('src/octal.ts', 5), mode: '0100644' },
    { ...file('src/invalid-mode.ts', 6), mode: '999999' },
    { ...file('sub', 7, 'tree'), mode: '100644' },
  ]) assert.throws(() => compareGitTrees(tree([item]), valid), /invalid tree entry|invalid mode/);
});

test('rejects conflicting tracked parent path instead of inventing a possible Git tree', () => {
  const valid = tree([]);
  const conflicting = tree([
    { ...file('src', 31), mode: '100644' },
    { ...file('src/tool.ts', 32), mode: '100644' },
  ]);
  assert.throws(() => compareGitTrees(conflicting, valid), /conflicting tracked path/);
});
