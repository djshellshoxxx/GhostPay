#!/usr/bin/env node
// Writes release-manifest.json to stdout. Fields follow docs/SECURITY_QA_DEVOPS_PLAYBOOK.md "Release manifest".
// Anything the build cannot know (IPFS CID, onion hash, source verification, audit summaries, ...) is emitted as
// an explicit "not-recorded" entry and listed in `unrecordedFields`; nothing is invented.
// Usage: gen-release-manifest.mjs --out-dir D --tarball NAME --version V --commit C --source-date-epoch N
//                                 --lockfile PATH --sbom NAME [--tree-clean 1|0|unknown] [--tag-commit SHA|none]
//
// `channel` is "release" only if ALL hold: the version is a release tag name (vX.Y.Z[-pre]), --tag-commit equals
// --commit (the git tag exists and points at the built commit), and --tree-clean is 1. Otherwise it is
// "development" and `channelReasons` says why. scripts/verify-release.sh rejects development manifests, so a local
// or dirty build cannot be passed off as a release. Fields only ever get ADDED here (schemaVersion stays 1):
// .github/actions/release-verify/verify.sh and scripts/verify-release.sh read commit, checksumsFile and artifacts[].
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
for (const k of ['out-dir', 'tarball', 'version', 'commit', 'source-date-epoch', 'lockfile', 'sbom']) {
  if (!args[k]) { console.error(`missing --${k}`); process.exit(2); }
}
const RELEASE_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;
if (!/^[0-9a-f]{40}$/.test(args.commit)) { console.error('--commit must be a 40-hex SHA'); process.exit(2); }
if (!/^\d+$/.test(args['source-date-epoch'])) { console.error('--source-date-epoch must be an integer'); process.exit(2); }
const treeClean = args['tree-clean'] ?? 'unknown';
const tagCommit = args['tag-commit'] ?? 'none';
if (!['1', '0', 'unknown'].includes(treeClean)) { console.error('--tree-clean must be 1, 0 or unknown'); process.exit(2); }
if (tagCommit !== 'none' && !/^[0-9a-f]{40}$/.test(tagCommit)) { console.error('--tag-commit must be a 40-hex SHA or none'); process.exit(2); }
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const tryExec = (cmd, a) => { try { return execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0]; } catch { return 'not-installed'; } };

const nr = (reason) => ({ status: 'not-recorded', reason });
const tarPath = join(args['out-dir'], args.tarball);
const sbomPath = join(args['out-dir'], args.sbom);

const deployDir = join(repo, 'deployments');
const deployments = existsSync(deployDir)
  ? readdirSync(deployDir).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0])).map((f) => {
      const j = JSON.parse(readFileSync(join(deployDir, f), 'utf8'));
      return { file: `deployments/${f}`, sha256: sha256(join(deployDir, f)), chainId: j.chainId, announcer: j.announcer, router: j.router,
        sweepRelayer: j.sweepRelayer, feeRecipient: j.feeRecipient, feeBps: j.feeBps, deployTx: j.deployTx, solcVersion: j.solcVersion, commit: j.commit };
    })
  : [];

const isTag = RELEASE_TAG.test(args.version) && !args.version.includes('..');
const channelReasons = [];
if (!isTag) channelReasons.push(`version "${args.version}" is not a release tag name (vX.Y.Z[-pre])`);
if (tagCommit === 'none') channelReasons.push(`no git tag refs/tags/${args.version} found at build time`);
else if (tagCommit !== args.commit) channelReasons.push(`tag ${args.version} points at ${tagCommit}, not the built commit`);
if (treeClean === '0') channelReasons.push('source tree was dirty (modified/untracked files, or HEAD != recorded commit)');
if (treeClean === 'unknown') channelReasons.push('source tree state unknown (no git metadata)');
const channel = channelReasons.length === 0 ? 'release' : 'development';
const ciRun = process.env.GITHUB_RUN_ID && process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;

const manifest = {
  schemaVersion: 1,
  project: 'ghostpay-web',
  channel,
  ...(channel === 'development' ? { channelReasons } : {}),
  version: args.version,
  tag: channel === 'release' ? args.version : null,
  commit: args.commit,
  sourceTree: { clean: treeClean === 'unknown' ? null : treeClean === '1', tagCommit: tagCommit === 'none' ? null : tagCommit },
  sourceDateEpoch: Number(args['source-date-epoch']),
  builtFromCommitTime: new Date(Number(args['source-date-epoch']) * 1000).toISOString(),
  tools: {
    node: process.version,
    npm: tryExec('npm', ['--version']),
    forge: tryExec('forge', ['--version']),
    solc: process.env.GP_SOLC_VERSION ?? 'not-recorded (CI pins 0.8.28 in .github/workflows/ci.yml)',
    tar: tryExec('tar', ['--version']),
    gzip: tryExec('gzip', ['--version']),
    os: `${process.platform}-${process.arch}`,
  },
  lockfile: { path: 'package-lock.json', sha256: sha256(args.lockfile) },
  artifacts: [
    { name: args.tarball, kind: 'web-bundle-tarball', sha256: sha256(tarPath), bytes: statSync(tarPath).size },
    { name: args.sbom, kind: 'sbom', format: 'CycloneDX (npm sbom, production dependencies)', sha256: sha256(sbomPath), bytes: statSync(sbomPath).size },
  ],
  checksumsFile: 'SHA256SUMS',
  provenance: { attestation: 'GitHub build provenance attestation (actions/attest-build-provenance), set by the release workflow', verifyWith: 'gh attestation verify <file> --repo <owner>/<repo>' },
  publication: {
    status: 'not-published',
    note: 'Hosting (IPFS, ENS, Tor, Pages) is intentionally not enabled. These artifacts are the only distribution.',
    ipfsCid: null,
    onionArtifactHash: null,
  },
  chains: { deploymentManifests: deployments, note: deployments.length === 0 ? 'no deployments/<chainId>.json present in this commit' : undefined },
  ci: { runUrl: ciRun },
  evidence: {
    tests: nr('see the CI run for this commit; the build script does not run tests'),
    fuzz: nr('see nightly workflow runs; not captured in this manifest'),
    staticAnalysis: nr('Slither runs in CI/nightly; result not captured here'),
    audits: nr('see docs/audits at this commit'),
    sourceVerification: nr('no block-explorer verification recorded by the build'),
    supportedTokenOracleMatrix: nr('not generated by the build'),
  },
  knownLimitations: 'See open findings in docs/audits/* at the recorded commit.',
  signingKeyVerification: 'See docs/operators/release-and-verify.md (signed tag, SHA256SUMS, attestation).',
  unrecordedFields: ['publication.ipfsCid', 'publication.onionArtifactHash', 'evidence.*', 'tools.solc (unless GP_SOLC_VERSION set)'],
};
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
