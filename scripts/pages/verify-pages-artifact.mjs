#!/usr/bin/env node
// Independent integrity verifier for an extracted GhostPay Pages release artifact.
// SHA256SUMS must be obtained from a trusted release/workflow, not from the site being checked.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = ['.nojekyll', 'build-info.json', 'index.html'];

function safeName(name) {
  return name.length > 0 && !name.includes('\\') && !/[\x00-\x1f\x7f]/.test(name) &&
    name.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function inventory(root, dir, files, problems) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const path = relative(root, full).split(sep).join('/');
    const st = lstatSync(full);
    if (!safeName(path)) { problems.push('unsafe artifact path'); continue; }
    if (st.isSymbolicLink()) problems.push(path + ': symlink refused');
    else if (st.isDirectory()) inventory(root, full, files, problems);
    else if (st.isFile()) files.add(path);
    else problems.push(path + ': special file refused');
  }
}

export function verifyPagesArtifact(siteDir, sumsPath, { expectedCommit } = {}) {
  const problems = [];
  const root = resolve(siteDir);
  const files = new Set();
  try {
    const rootInfo = lstatSync(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return { problems: ['site root must be a real directory'], verified: 0 };
    const sumInfo = lstatSync(sumsPath);
    if (!sumInfo.isFile() || sumInfo.isSymbolicLink()) return { problems: ['SHA256SUMS must be a regular file'], verified: 0 };
    inventory(root, root, files, problems);
  } catch {
    return { problems: ['cannot enumerate site or read SHA256SUMS'], verified: 0 };
  }

  let sums;
  try { sums = readFileSync(sumsPath, 'utf8'); }
  catch { return { problems: [...problems, 'cannot read SHA256SUMS'], verified: 0 }; }
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
  for (const path of files) if (!expected.has(path)) problems.push(path + ': unlisted artifact file');
  let verified = 0;
  for (const [path, digest] of expected) {
    if (!files.has(path)) { problems.push(path + ': listed file missing or unsafe'); continue; }
    try {
      const actual = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
      if (actual !== digest) problems.push(path + ': SHA-256 mismatch');
      else verified++;
    } catch { problems.push(path + ': cannot hash file'); }
  }
  if (expectedCommit !== undefined) {
    if (!/^[0-9a-f]{40}$/.test(expectedCommit)) problems.push('expected commit must be a full 40-hex SHA');
    else if (files.has('build-info.json')) {
      try {
        const info = JSON.parse(readFileSync(join(root, 'build-info.json'), 'utf8'));
        if (info.commit !== expectedCommit) problems.push('build-info.json: unexpected source commit');
      } catch { problems.push('build-info.json: invalid JSON'); }
    }
  }
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
