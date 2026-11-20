// node --test scripts/pages/verify-pages-artifact.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyPagesArtifact } from './verify-pages-artifact.mjs';

const COMMIT = 'a'.repeat(40);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gp-pages-verify-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const site = join(root, 'site');
  mkdirSync(join(site, 'assets'), { recursive: true });
  writeFileSync(join(site, '.nojekyll'), '');
  writeFileSync(join(site, 'build-info.json'), JSON.stringify({ app: 'ghostpay-web', commit: COMMIT }));
  writeFileSync(join(site, 'index.html'), '<html></html>');
  writeFileSync(join(site, 'assets', 'app.js'), 'console.log(1)');
  const sums = join(root, 'SHA256SUMS');
  const paths = ['.nojekyll', 'assets/app.js', 'build-info.json', 'index.html'];
  const produce = () => writeFileSync(sums, paths.map((p) => createHash('sha256').update(readFileSync(join(site, p))).digest('hex') + '  ./' + p).join('\n') + '\n');
  produce();
  return { site, sums, paths, produce };
}

test('accepts a complete intact Pages artifact with an exact commit', (t) => {
  const { site, sums } = fixture(t);
  assert.deepEqual(verifyPagesArtifact(site, sums, { expectedCommit: COMMIT }), { problems: [], verified: 4 });
});

test('fails on modified, missing or unlisted files', (t) => {
  const { site, sums } = fixture(t);
  writeFileSync(join(site, 'assets', 'app.js'), 'tampered');
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('SHA-256 mismatch')));
  unlinkSync(join(site, 'assets', 'app.js'));
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('listed file missing')));
  writeFileSync(join(site, 'unexpected.js'), 'extra');
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('unlisted artifact file')));
});

test('rejects path traversal, duplicate, noncanonical and unsorted checksum records', (t) => {
  const { site, sums } = fixture(t);
  const original = readFileSync(sums, 'utf8');
  for (const bad of [
    '0'.repeat(64) + '  ./../escape\n',
    '0'.repeat(64) + '  .//tmp/path\n',
    '0'.repeat(64) + '  ./assets\\app.js\n',
    '0'.repeat(64) + '  ././assets/app.js\n',
    '0'.repeat(64) + '  ./assets/app.js\n' + '0'.repeat(64) + '  ./assets/app.js\n',
    original.split('\n').filter(Boolean).reverse().join('\n') + '\n',
    original.replaceAll('\n', '\r\n'),
    original.slice(0, -1),
    '',
  ]) {
    writeFileSync(sums, bad);
    assert.notEqual(verifyPagesArtifact(site, sums).problems.length, 0, JSON.stringify(bad));
  }
});

test('refuses symlinks in the release and symlinked checksum manifests', (t) => {
  const { site, sums } = fixture(t);
  symlinkSync('/etc/passwd', join(site, 'public.txt'));
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('symlink refused')));
  const alias = sums + '.link';
  symlinkSync(sums, alias);
  assert.ok(verifyPagesArtifact(site, alias).problems.some((p) => p.includes('must be a regular file')));
});

test('enforces required Pages files and exact build source', (t) => {
  const { site, sums } = fixture(t);
  assert.ok(verifyPagesArtifact(site, sums, { expectedCommit: 'b'.repeat(40) }).problems.some((p) => p.includes('unexpected source commit')));
  assert.ok(verifyPagesArtifact(site, sums, { expectedCommit: 'short' }).problems.some((p) => p.includes('full 40-hex')));
  unlinkSync(join(site, '.nojekyll'));
  assert.ok(verifyPagesArtifact(site, sums).problems.some((p) => p.includes('required Pages file missing')));
});

test('CLI verifies a source-pinned artifact and exits nonzero for tampering or incorrect usage', (t) => {
  const { site, sums } = fixture(t);
  const script = new URL('./verify-pages-artifact.mjs', import.meta.url);
  const run = (...args) => spawnSync(process.execPath, [fileURLToPath(script), ...args], { encoding: 'utf8' });
  const good = run(site, sums, '--expect-commit', COMMIT);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /4 files match/);
  writeFileSync(join(site, 'index.html'), '<script>tamper</script>');
  const bad = run(site, sums, '--expect-commit', COMMIT);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /SHA-256 mismatch/);
  assert.equal(run().status, 2);
});

// Synchronous interposition makes the filesystem races deterministic. Each hook
// handles both path and descriptor reads and is restored before the next test.
function withFsHooks(hooks, run) {
  const originals = Object.fromEntries(Object.keys(hooks).map((key) => [key, fs[key]]));
  Object.assign(fs, hooks);
  syncBuiltinESMExports();
  try { return run(); }
  finally { Object.assign(fs, originals); syncBuiltinESMExports(); }
}

function identifiesFile(input, path, stat) {
  if (typeof input !== 'number') return input === path;
  const actual = fs.fstatSync(input);
  return actual.dev === stat.dev && actual.ino === stat.ino;
}

test('rejects build-info changed after its hashed read instead of accepting a second commit', (t) => {
  const { site, sums } = fixture(t);
  const path = join(site, 'build-info.json');
  const stat = fs.lstatSync(path);
  const read = fs.readFileSync;
  let reads = 0;
  let changed = false;
  const result = withFsHooks({ readFileSync(input, ...args) {
    const data = read(input, ...args);
    if (identifiesFile(input, path, stat)) {
      reads++;
      if (!changed) {
        changed = true;
        writeFileSync(path, JSON.stringify({ app: 'ghostpay-web', commit: 'b'.repeat(40) }));
      }
    }
    return data;
  } }, () => verifyPagesArtifact(site, sums, { expectedCommit: 'b'.repeat(40) }));
  assert.equal(changed, true, 'mutation must occur during the actual metadata read');
  assert.notEqual(result.problems.length, 0, 'a commit absent from the hashed bytes must fail');
  assert.equal(reads, 1, 'commit validation must not reread metadata through its pathname');
});

test('rejects a regular artifact file swapped to an external symlink during its read', (t) => {
  const { site, sums } = fixture(t);
  const path = join(site, 'index.html');
  const external = sums + '.external';
  writeFileSync(external, readFileSync(path));
  const stat = fs.lstatSync(path);
  const read = fs.readFileSync;
  let changed = false;
  const result = withFsHooks({ readFileSync(input, ...args) {
    if (!changed && identifiesFile(input, path, stat)) {
      changed = true;
      unlinkSync(path);
      symlinkSync(external, path);
    }
    return read(input, ...args);
  } }, () => verifyPagesArtifact(site, sums));
  assert.equal(changed, true, 'swap must occur after inventory on the actual read');
  assert.equal(fs.lstatSync(path).isSymbolicLink(), true);
  assert.notEqual(result.problems.length, 0, 'matching external bytes must not hide the symlink swap');
});

test('uses one metadata read and closes every descriptor on success and read failure', (t) => {
  for (const failRead of [false, true]) {
    const { site, sums } = fixture(t);
    const infoPath = join(site, 'build-info.json');
    const infoStat = fs.lstatSync(infoPath);
    const indexPath = join(site, 'index.html');
    const indexStat = fs.lstatSync(indexPath);
    const open = fs.openSync;
    const read = fs.readFileSync;
    const close = fs.closeSync;
    const active = new Set();
    let opened = 0;
    let closed = 0;
    let metadataReads = 0;
    let failureInjected = false;
    const result = withFsHooks({
      openSync(path, flags, ...args) {
        assert.notEqual(flags & fs.constants.O_NOFOLLOW, 0);
        assert.notEqual(flags & fs.constants.O_NONBLOCK, 0);
        const fd = open(path, flags, ...args);
        active.add(fd);
        opened++;
        return fd;
      },
      readFileSync(input, ...args) {
        assert.equal(typeof input, 'number', 'verified inputs must be read from their validated descriptor');
        if (identifiesFile(input, infoPath, infoStat)) metadataReads++;
        if (failRead && identifiesFile(input, indexPath, indexStat)) {
          failureInjected = true;
          throw new Error('synthetic read failure');
        }
        return read(input, ...args);
      },
      closeSync(fd) {
        assert.equal(active.delete(fd), true);
        closed++;
        return close(fd);
      },
    }, () => verifyPagesArtifact(site, sums, { expectedCommit: COMMIT }));
    assert.equal(opened, 5, 'manifest plus four artifact files');
    assert.equal(closed, opened);
    assert.equal(active.size, 0);
    assert.equal(metadataReads, 1);
    assert.equal(failureInjected, failRead);
    assert.equal(result.problems.length === 0, !failRead);
  }
});

test('refuses symlink swaps between the final path check and open for artifacts and manifest', (t) => {
  for (const manifest of [false, true]) {
    const { site, sums } = fixture(t);
    const path = manifest ? sums : join(site, 'index.html');
    const external = sums + '.external';
    writeFileSync(external, readFileSync(path));
    const open = fs.openSync;
    let swapped = false;
    let openedTarget = false;
    const result = withFsHooks({ openSync(input, flags, ...args) {
      if (input === path && typeof flags === 'number') {
        swapped = true;
        unlinkSync(path);
        symlinkSync(external, path);
        const fd = open(input, flags, ...args);
        openedTarget = true;
        return fd;
      }
      return open(input, flags, ...args);
    } }, () => verifyPagesArtifact(site, sums));
    assert.equal(swapped, true);
    assert.equal(openedTarget, false, 'the no-follow open must refuse the symlink itself');
    assert.notEqual(result.problems.length, 0);
  }
});

test('closes and rejects a replaced inode or non-regular descriptor before reading it', (t) => {
  for (const directory of [false, true]) {
    const { site, sums } = fixture(t);
    const path = join(site, 'index.html');
    const bytes = readFileSync(path);
    const open = fs.openSync;
    const read = fs.readFileSync;
    const close = fs.closeSync;
    let targetFd;
    let readTarget = false;
    let closedTarget = false;
    const result = withFsHooks({
      openSync(input, flags, ...args) {
        if (input === path && typeof flags === 'number') {
          fs.renameSync(path, path + '.original');
          if (directory) mkdirSync(path);
          else writeFileSync(path, bytes);
          targetFd = open(input, flags, ...args);
          return targetFd;
        }
        return open(input, flags, ...args);
      },
      readFileSync(input, ...args) {
        if (input === targetFd) readTarget = true;
        return read(input, ...args);
      },
      closeSync(fd) {
        if (fd === targetFd) closedTarget = true;
        return close(fd);
      },
    }, () => verifyPagesArtifact(site, sums));
    assert.equal(typeof targetFd, 'number', 'the swap must reach the actual descriptor check');
    assert.equal(readTarget, false);
    assert.equal(closedTarget, true);
    assert.throws(() => fs.fstatSync(targetFd), { code: 'EBADF' });
    assert.notEqual(result.problems.length, 0);
  }
});

test('rejects a checksum manifest replaced after its descriptor read', (t) => {
  const { site, sums } = fixture(t);
  const stat = fs.lstatSync(sums);
  const read = fs.readFileSync;
  let changed = false;
  const result = withFsHooks({ readFileSync(input, ...args) {
    const data = read(input, ...args);
    if (!changed && identifiesFile(input, sums, stat)) {
      changed = true;
      fs.renameSync(sums, sums + '.original');
      writeFileSync(sums, data);
    }
    return data;
  } }, () => verifyPagesArtifact(site, sums));
  assert.equal(changed, true);
  assert.notEqual(result.problems.length, 0, 'identical replacement contents still change the verified input');
});

test('rejects unlisted files added after the initial inventory', (t) => {
  const { site, sums } = fixture(t);
  const path = join(site, 'index.html');
  const stat = fs.lstatSync(path);
  const read = fs.readFileSync;
  let changed = false;
  const result = withFsHooks({ readFileSync(input, ...args) {
    const data = read(input, ...args);
    if (!changed && identifiesFile(input, path, stat)) {
      changed = true;
      writeFileSync(join(site, 'late.js'), 'unlisted');
    }
    return data;
  } }, () => verifyPagesArtifact(site, sums));
  assert.equal(changed, true);
  assert.notEqual(result.problems.length, 0);
});

test('accepts stable caller parent aliases but refuses a symlink as the site root', (t) => {
  const { site, sums } = fixture(t);
  const alias = join(dirname(sums), 'parent-alias');
  symlinkSync(dirname(sums), alias, 'dir');
  assert.deepEqual(verifyPagesArtifact(join(alias, 'site'), join(alias, 'SHA256SUMS'), { expectedCommit: COMMIT }),
    { problems: [], verified: 4 });
  const rootLink = join(dirname(sums), 'site-link');
  symlinkSync(site, rootLink, 'dir');
  assert.ok(verifyPagesArtifact(rootLink, sums).problems.some((p) => p.includes('site root must be a real directory')));
});

test('rejects an artifact parent directory swapped to an external symlink during a read', (t) => {
  const { site, sums } = fixture(t);
  const assets = join(site, 'assets');
  const path = join(assets, 'app.js');
  const external = sums + '.assets';
  mkdirSync(external);
  writeFileSync(join(external, 'app.js'), readFileSync(path));
  const stat = fs.lstatSync(path);
  const read = fs.readFileSync;
  let changed = false;
  const result = withFsHooks({ readFileSync(input, ...args) {
    if (!changed && identifiesFile(input, path, stat)) {
      changed = true;
      fs.renameSync(assets, assets + '.original');
      symlinkSync(external, assets, 'dir');
    }
    return read(input, ...args);
  } }, () => verifyPagesArtifact(site, sums));
  assert.equal(changed, true);
  assert.equal(fs.lstatSync(assets).isSymbolicLink(), true);
  assert.notEqual(result.problems.length, 0);
});

test('retains valid Unicode filenames but rejects an undecodable filename that aliases them', (t) => {
  const { site, sums, paths, produce } = fixture(t);
  const valid = '\ufffd.js';
  writeFileSync(join(site, valid), 'trusted Unicode file');
  paths.push(valid);
  paths.sort();
  produce();
  assert.deepEqual(verifyPagesArtifact(site, sums), { problems: [], verified: 5 });
  const invalidName = Buffer.concat([Buffer.from([0xff]), Buffer.from('.js')]);
  const invalidPath = Buffer.concat([Buffer.from(site + sep), invalidName]);
  writeFileSync(invalidPath, 'unlisted raw-byte file');
  assert.ok(fs.readdirSync(site, { encoding: 'buffer' }).some((entry) => entry.equals(invalidName)),
    'the undecodable raw-byte filename must exist independently of the valid Unicode name');
  assert.notEqual(verifyPagesArtifact(site, sums).problems.length, 0,
    'lossy UTF-8 decoding must not collapse an unlisted file into a trusted filename');
});

test('requires lossless UTF-8 manifest records before matching valid Unicode filenames', (t) => {
  const { site, sums, paths, produce } = fixture(t);
  const valid = '\ufffd.js';
  writeFileSync(join(site, valid), 'trusted Unicode file');
  paths.push(valid);
  paths.sort();
  produce();
  assert.deepEqual(verifyPagesArtifact(site, sums), { problems: [], verified: 5 });
  const original = readFileSync(sums);
  const encoded = Buffer.from(valid);
  const offset = original.indexOf(encoded);
  assert.notEqual(offset, -1);
  const invalid = Buffer.concat([original.subarray(0, offset), Buffer.from([0xff]), Buffer.from('.js'),
    original.subarray(offset + encoded.length)]);
  writeFileSync(sums, invalid);
  assert.equal(readFileSync(sums).equals(invalid), true);
  assert.notEqual(verifyPagesArtifact(site, sums).problems.length, 0,
    'a raw-byte manifest name must not alias a different valid Unicode filename');
});
