// Tests for scripts/verify-tag.sh against throw-away repositories and keys.
// Run: node --test scripts/tests/release-verify-tag.test.mjs
// SSH cases need ssh-keygen (OpenSSH >= 8.2) and PGP cases need gpg; each group is skipped, with a message, when
// its tool is missing. The trust-root and tag-shape cases need only git.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERIFY_TAG = join(repo, 'scripts', 'verify-tag.sh');
const has = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const HAS_SSH = spawnSync('ssh-keygen', ['-?'], { stdio: 'ignore' }).error === undefined;
const HAS_GPG = has('gpg', ['--version']);

const root = mkdtempSync(join(tmpdir(), 'gpvt-'));
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};
const work = join(root, 'repo');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? work, encoding: 'utf8', env: { ...gitEnv, ...(opts.env ?? {}) }, input: opts.input });
  if (opts.check !== false && r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r;
}
const git = (...args) => run('git', args).stdout.trim();
function verifyTag(args) {
  const r = run('bash', [VERIFY_TAG, ...args], { check: false });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const expectReject = (res, pattern) => {
  assert.notEqual(res.status, 0, res.out);
  assert.match(res.out, /::error::verify-tag:/);
  assert.match(res.out, pattern);
};

let c1; let c2; let emptySigners;
before(() => {
  run('git', ['init', '-q', '-b', 'main', work], { cwd: root });
  writeFileSync(join(work, 'a.txt'), 'one\n');
  git('add', 'a.txt'); git('commit', '-q', '-m', 'one');
  c1 = git('rev-parse', 'HEAD');
  writeFileSync(join(work, 'a.txt'), 'two\n');
  git('commit', '-q', '-am', 'two');
  c2 = git('rev-parse', 'HEAD');
  emptySigners = join(root, 'empty_allowed_signers');
  writeFileSync(emptySigners, '# comments only, no keys\n\n');
});
after(() => {
  if (HAS_GPG) for (const h of ['gpg-a', 'gpg-b']) spawnSync('gpgconf', ['--kill', 'gpg-agent'], { env: { ...process.env, GNUPGHOME: join(root, h) } });
  rmSync(root, { recursive: true, force: true });
});

// A hand-made tag object with a syntactically present but bogus signature block (exercises the checks that run
// before any cryptography, and proves "a signature block is present" is no longer sufficient).
function mktag(refName, { name = refName, object = c2, sig = 'SSH' } = {}) {
  const body = `object ${object}\ntype commit\ntag ${name}\ntagger Test <test@example.invalid> 1767225600 +0000\n\nrelease\n`
    + `-----BEGIN ${sig} SIGNATURE-----\nAAAA\n-----END ${sig} SIGNATURE-----\n`;
  const sha = run('git', ['mktag'], { input: body }).stdout.trim();
  git('update-ref', `refs/tags/${refName}`, sha);
}

// Copies a signed tag object under a new name with an altered message but the ORIGINAL signature block.
function forgeFrom(srcTag, newName) {
  const body = git('cat-file', 'tag', `refs/tags/${srcTag}`) + '\n';
  const forged = body.replace(`tag ${srcTag}\n`, `tag ${newName}\n`).replace(`GhostPay ${srcTag}`, `GhostPay ${newName} (altered)`);
  const sha = run('git', ['mktag'], { input: forged }).stdout.trim();
  git('update-ref', `refs/tags/${newName}`, sha);
}

test('the committed trust root has no keys yet, so it rejects every tag (fail closed, human gate)', () => {
  const committed = readFileSync(join(repo, '.github', 'release-signers', 'allowed_signers'), 'utf8');
  assert.equal(committed.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length, 0);
  mktag('v0.9.0');
  expectReject(verifyTag(['v0.9.0', c2]), /no release-signing keys are pinned .*repository owner must add/);
});

test('empty allowed_signers is rejected before any signature check', () => {
  mktag('v0.9.1');
  expectReject(verifyTag(['--allowed-signers', emptySigners, 'v0.9.1', c2]), /no release-signing keys are pinned/);
  expectReject(verifyTag(['--allowed-signers', join(root, 'does-not-exist'), 'v0.9.1', c2]), /no release-signing keys are pinned/);
});

test('lightweight tag is rejected', () => {
  git('tag', 'v0.1.0', c2);
  expectReject(verifyTag(['--allowed-signers', emptySigners, 'v0.1.0', c2]), /lightweight tag/);
});

test('unsigned annotated tag is rejected', () => {
  git('tag', '-a', 'v0.2.0', '-m', 'unsigned', c2);
  expectReject(verifyTag(['--allowed-signers', emptySigners, 'v0.2.0', c2]), /annotated tag without a signature/);
});

test('tag pointing at a different commit than the one being built is rejected', () => {
  mktag('v0.3.0', { object: c1 });
  expectReject(verifyTag(['--allowed-signers', emptySigners, 'v0.3.0', c2]), /points at commit .* expected/);
});

test('a tag object re-pushed under another name is rejected', () => {
  mktag('v0.4.1', { name: 'v0.4.0' });
  expectReject(verifyTag(['--allowed-signers', emptySigners, 'v0.4.1', c2]), /named 'v0\.4\.0' inside but was pushed as 'v0\.4\.1'/);
});

test('non-release tag names and short commits are rejected', () => {
  expectReject(verifyTag(['--allowed-signers', emptySigners, 'nightly', c2]), /not a release tag name/);
  expectReject(verifyTag(['--allowed-signers', emptySigners, 'v1.0.0', c2.slice(0, 12)]), /full 40-hex SHA/);
});

test('missing tag is rejected', () => {
  expectReject(verifyTag(['--allowed-signers', emptySigners, 'v7.7.7', c2]), /does not exist locally/);
});

test('ssh: signed by the pinned key passes; unpinned key, empty trust root and side-branch commit fail', (t) => {
  if (!HAS_SSH) { t.skip('ssh-keygen not installed; covered by hosted CI (ubuntu-latest ships OpenSSH)'); return; }
  const keyA = join(root, 'id_a'); const keyB = join(root, 'id_b');
  for (const k of [keyA, keyB]) run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'throwaway', '-f', k]);
  const pinned = join(root, 'allowed_signers');
  writeFileSync(pinned, `# test trust root\nrelease@example.invalid namespaces="git" ${readFileSync(`${keyA}.pub`, 'utf8').trim()}\n`);
  const signTag = (name, key, commit = c2) => git('-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'tag', '-s', name, '-m', `GhostPay ${name}`, commit);

  signTag('v1.0.0', keyA);
  const ok = verifyTag(['--allowed-signers', pinned, 'v1.0.0', c2]);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /OK: v1\.0\.0 .* signed by pinned signer release@example\.invalid/);
  const okAnc = verifyTag(['--allowed-signers', pinned, '--ancestor-of', 'refs/heads/main', 'v1.0.0', c2]);
  assert.equal(okAnc.status, 0, okAnc.out);

  expectReject(verifyTag(['--allowed-signers', emptySigners, 'v1.0.0', c2]), /no release-signing keys are pinned/);
  expectReject(verifyTag(['--allowed-signers', pinned, 'v1.0.0', c1]), /points at commit/);

  forgeFrom('v1.0.0', 'v1.0.9');
  expectReject(verifyTag(['--allowed-signers', pinned, 'v1.0.9', c2]), /did not verify|could not confirm/);

  signTag('v1.0.1', keyB);
  expectReject(verifyTag(['--allowed-signers', pinned, 'v1.0.1', c2]), /did not verify|not in|could not confirm/);

  // A properly signed tag on a commit that is not on the protected branch.
  git('checkout', '-q', '-b', 'side', c1);
  writeFileSync(join(work, 'b.txt'), 'side\n');
  git('add', 'b.txt'); git('commit', '-q', '-m', 'side');
  const side = git('rev-parse', 'HEAD');
  git('checkout', '-q', 'main');
  signTag('v1.0.2', keyA, side);
  assert.equal(verifyTag(['--allowed-signers', pinned, 'v1.0.2', side]).status, 0);
  expectReject(verifyTag(['--allowed-signers', pinned, '--ancestor-of', 'refs/heads/main', 'v1.0.2', side]), /not reachable from refs\/heads\/main/);
});

test('pgp: signed by a pinned key passes; unpinned key and missing pgp trust root fail', (t) => {
  if (!HAS_GPG) { t.skip('gpg not installed'); return; }
  const homes = {};
  for (const h of ['gpg-a', 'gpg-b']) {
    const home = join(root, h);
    run('mkdir', ['-m', '700', '-p', home]);
    const env = { GNUPGHOME: home };
    run('gpg', ['--batch', '--quiet', '--passphrase', '', '--quick-gen-key', `Throwaway ${h} <${h}@example.invalid>`, 'ed25519', 'sign', 'never'], { env });
    const fpr = run('gpg', ['--batch', '--with-colons', '--fingerprint'], { env }).stdout.split('\n').find((l) => l.startsWith('fpr:')).split(':')[9];
    homes[h] = { env, fpr };
  }
  const pinned = join(root, 'pgp-keys.asc');
  writeFileSync(pinned, run('gpg', ['--batch', '--armor', '--export', homes['gpg-a'].fpr], { env: homes['gpg-a'].env }).stdout);
  const signTag = (name, h) => run('git', ['-c', 'gpg.format=openpgp', '-c', 'gpg.program=gpg', '-c', `user.signingkey=${homes[h].fpr}`,
    'tag', '-s', name, '-m', `GhostPay ${name}`, c2], { env: homes[h].env });

  signTag('v2.0.0', 'gpg-a');
  const ok = verifyTag(['--allowed-signers', emptySigners, '--pgp-keys', pinned, 'v2.0.0', c2]);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, new RegExp(`signed by pinned signer PGP ${homes['gpg-a'].fpr}`));

  forgeFrom('v2.0.0', 'v2.0.9');
  expectReject(verifyTag(['--allowed-signers', emptySigners, '--pgp-keys', pinned, 'v2.0.9', c2]), /did not verify|bad, expired|no good PGP/);

  signTag('v2.0.1', 'gpg-b');
  expectReject(verifyTag(['--allowed-signers', emptySigners, '--pgp-keys', pinned, 'v2.0.1', c2]), /did not verify|not a pinned key|no good PGP/);

  expectReject(verifyTag(['--allowed-signers', emptySigners, '--pgp-keys', join(root, 'none.asc'), 'v2.0.0', c2]), /no release-signing PGP keys are pinned/);
});
