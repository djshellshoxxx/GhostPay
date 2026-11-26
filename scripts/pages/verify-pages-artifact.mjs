#!/usr/bin/env node
// Independent integrity verifier for an extracted GhostPay Pages release artifact.
// SHA256SUMS must be obtained from a trusted release/workflow, not from the site being checked.
// Keep the input tree, manifest and their ancestors private and stable through
// verification and use. These checks detect observed mutations, not an atomic
// filesystem snapshot; O_NOFOLLOW protects only the final path component.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = ['.nojekyll', 'build-info.json', 'index.html'];
const SNAPSHOT_FIELDS = ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];

function sameSnapshot(before, after) {
  // Access time can change because of our own reads; content and identity cannot.
  return SNAPSHOT_FIELDS.every((key) => before[key] === after[key]);
}

function readRegular(path, expected) {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || !sameSnapshot(expected, before)) throw new Error('file changed');
  // Nonblocking open also prevents a regular-file-to-FIFO swap from hanging.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || !sameSnapshot(expected, opened)) throw new Error('file changed');
    const bytes = readFileSync(fd);
    if (BigInt(bytes.length) !== expected.size ||
        !sameSnapshot(expected, fstatSync(fd, { bigint: true })) ||
        !sameSnapshot(expected, lstatSync(path, { bigint: true }))) throw new Error('file changed');
    return bytes;
  } finally { closeSync(fd); }
}

function safeName(name) {
  return name.length > 0 && !name.includes('\\') && !/[\x00-\x1f\x7f]/.test(name) &&
    name.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function inventory(root, dir, before, files, entries, problems) {
  const current = lstatSync(dir, { bigint: true });
  if (!current.isDirectory() || !sameSnapshot(before, current)) throw new Error('directory changed');
  entries.set(relative(root, dir).split(sep).join('/') || '.', before);
  for (const rawName of readdirSync(dir, { encoding: 'buffer' }).sort(Buffer.compare)) {
    const name = rawName.toString('utf8');
    if (!Buffer.from(name, 'utf8').equals(rawName)) { problems.push('artifact path is not valid UTF-8'); continue; }
    const full = join(dir, name);
    const path = relative(root, full).split(sep).join('/');
    const st = lstatSync(full, { bigint: true });
    if (!safeName(path)) { problems.push('unsafe artifact path'); continue; }
    if (st.isSymbolicLink()) problems.push(path + ': symlink refused');
    else if (st.isDirectory()) inventory(root, full, st, files, entries, problems);
    else if (st.isFile()) { files.set(path, st); entries.set(path, st); }
    else problems.push(path + ': special file refused');
  }
  if (!sameSnapshot(before, lstatSync(dir, { bigint: true }))) throw new Error('directory changed');
}

export function verifyPagesArtifact(siteDir, sumsPath, { expectedCommit } = {}) {
  const problems = [];
  if (![constants.O_NOFOLLOW, constants.O_NONBLOCK].every((flag) => Number.isInteger(flag) && flag > 0)) {
    return { problems: ['platform lacks required O_NOFOLLOW/O_NONBLOCK file-open flags'], verified: 0 };
  }
  const inputRoot = resolve(siteDir);
  const inputSums = resolve(sumsPath);
  const files = new Map();
  const entries = new Map();
  let root, sumsFile, rootInfo, sumInfo;
  try {
    rootInfo = lstatSync(inputRoot, { bigint: true });
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return { problems: ['site root must be a real directory'], verified: 0 };
    sumInfo = lstatSync(inputSums, { bigint: true });
    if (!sumInfo.isFile() || sumInfo.isSymbolicLink()) return { problems: ['SHA256SUMS must be a regular file'], verified: 0 };
    // Resolve existing caller parent aliases once; the final inputs cannot be symlinks.
    root = realpathSync(inputRoot);
    sumsFile = realpathSync(inputSums);
    if (!sameSnapshot(sumInfo, lstatSync(sumsFile, { bigint: true }))) throw new Error('manifest changed');
    inventory(root, root, rootInfo, files, entries, problems);
  } catch {
    return { problems: ['cannot enumerate site or read SHA256SUMS'], verified: 0 };
  }

  let sums;
  try {
    const bytes = readRegular(sumsFile, sumInfo);
    sums = bytes.toString('utf8');
    if (!Buffer.from(sums, 'utf8').equals(bytes)) return { problems: [...problems, 'SHA256SUMS requires valid UTF-8'], verified: 0 };
  }
  catch { return { problems: [...problems, 'cannot read unchanged regular SHA256SUMS'], verified: 0 }; }
  if (!sums.endsWith('\n') || sums.includes('\r')) problems.push('SHA256SUMS requires canonical LF-terminated lines');
  const lines = sums.endsWith('\n') ? sums.slice(0, -1).split('\n') : sums.split('\n');
  const expected = new Map();
  let previous = '';
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  \.\/([^\r\n]+)$/.exec(line);
    if (!match || !safeName(match[2])) { problems.push('SHA256SUMS has an invalid or unsafe record'); continue; }
    const path = match[2];
    if (expected.has(path)) problems.push(path + ': duplicate SHA256SUMS record');
    if (previous !== '' && path <= previous) problems.push('SHA256SUMS entries must be uniquely sorted');
    previous = path;
    expected.set(path, match[1]);
  }
  for (const required of REQUIRED) if (!files.has(required)) problems.push(required + ': required Pages file missing');
  for (const path of files.keys()) if (!expected.has(path)) problems.push(path + ': unlisted artifact file');
  let verified = 0;
  let buildInfo;
  for (const [path, digest] of expected) {
    if (!files.has(path)) { problems.push(path + ': listed file missing or unsafe'); continue; }
    try {
      const bytes = readRegular(join(root, path), files.get(path));
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== digest) problems.push(path + ': SHA-256 mismatch');
      else {
        verified++;
        if (path === 'build-info.json') buildInfo = bytes;
      }
    } catch { problems.push(path + ': cannot hash unchanged regular file'); }
  }
  if (expectedCommit !== undefined) {
    if (!/^[0-9a-f]{40}$/.test(expectedCommit)) problems.push('expected commit must be a full 40-hex SHA');
    else if (buildInfo !== undefined) {
      try {
        const info = JSON.parse(buildInfo.toString('utf8'));
        if (info.commit !== expectedCommit) problems.push('build-info.json: unexpected source commit');
      } catch { problems.push('build-info.json: invalid JSON'); }
    }
  }
  try {
    const finalEntries = new Map();
    inventory(root, root, rootInfo, new Map(), finalEntries, problems);
    if (entries.size !== finalEntries.size || [...entries].some(([path, before]) =>
      !finalEntries.has(path) || !sameSnapshot(before, finalEntries.get(path)))) throw new Error('inventory changed');
    for (const [path, before] of [[inputRoot, rootInfo], [inputSums, sumInfo], [sumsFile, sumInfo]]) {
      if (!sameSnapshot(before, lstatSync(path, { bigint: true }))) throw new Error('input changed');
    }
  } catch { problems.push('artifact or SHA256SUMS changed during verification'); }
  return { problems, verified };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (!(args.length === 2 || (args.length === 4 && args[2] === '--expect-commit'))) {
    console.error('usage: node verify-pages-artifact.mjs <site-dir> <trusted-SHA256SUMS> [--expect-commit <40-hex-sha>]');
    process.exitCode = 2;
  } else {
    const result = verifyPagesArtifact(args[0], args[1], { expectedCommit: args[3] });
    if (result.problems.length) {
      for (const problem of result.problems) console.error(' - ' + problem);
      process.exitCode = 1;
    } else console.log('Pages artifact verified: ' + result.verified + ' files match trusted SHA256SUMS.');
  }
}
