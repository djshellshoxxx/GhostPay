/** Read-only source/evidence verification; no RPC, build, test runner or EVM invocation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = '6fe060e370ccf168899796708ae4d6bed5e990ef';
const PACKET = 'ccfe55c99c4d4aaac92d10aaec90fbcc6b0e0410';
const PREFIX = 'docs/completion/remaining-20261119/combined-relayer-readback-evidence/';
const sha = (data) => createHash('sha256').update(data).digest('hex');
const args = process.argv.slice(2);
assert.equal(args[0], '--repository');
const repository = resolve(args[1]);
assert(args.length === 2 || (args.length === 4 && args[2] === '--output'));
const { keccak256 } = createRequire(resolve(repository, 'package.json'))('viem/utils');
const git = (...argv) => execFileSync('git', ['-C', repository, ...argv]);
const local = (path) => readFileSync(resolve(repository, path));
const object = (commit, path) => git('show', `${commit}:${path}`);
const readJson = (path) => JSON.parse(local(path));
const groups = [
  ['OP/status', 'a2afd126b0276cda9ec0429657bbd130e17827ea', ['budget.ts', 'chain.ts', 'opFees.ts', 'service.ts', 'opFees.test.ts', 'harness.testutil.ts'].map((p) => `apps/relayer/src/${p}`)],
  ['readback', '8238f66b6beafb46a7a2d1598e5c4c354819fc86', ['apps/relayer/src/runtime.ts', 'apps/relayer/src/runtime.test.ts', 'packages/chain-adapters/src/deploymentsVerify.ts', 'packages/chain-adapters/src/deploymentsVerify.test.ts']],
  ['action pins', 'f42553ab44d2bf8f544f0287656bbc184679014d', ['.github/workflows/ghostpay-codex-cloud.yml', '.github/workflows/ghostpay-parallel-review.yml']],
];
const sourceFiles = [];
for (const [scope, checkpoint, paths] of groups) {
  for (const path of paths) {
    const integrated = object(SOURCE, path);
    assert.deepEqual(integrated, object(checkpoint, path));
    if (/apps\/relayer\/src\/(budget|chain|opFees|service)\.ts$/.test(path)) assert.deepEqual(integrated, object('de253aaf7f4139c8778b73cd7a9e052f9438e91e', path));
    sourceFiles.push({ scope, checkpoint, path, sha256: sha(integrated) });
  }
}
const manifestBytes = local(PREFIX + 'manifest.json');
assert.equal(sha(manifestBytes), 'f15d6445cc3bcf75bddf4fe2c4cad8acba02ad2b7f8c2076e5d07ed0be4d078f');
assert.deepEqual(manifestBytes, object(PACKET, PREFIX + 'manifest.json'));
const markdownPath = 'docs/completion/remaining-20261119/COMBINED_RELAYER_READBACK_20261119.md';
assert.equal(sha(local(markdownPath)), 'e562b06429d3ab78e71dafc1abff5d358db06fee31b326f4283c818ee773a0c2');
assert.deepEqual(local(markdownPath), object(PACKET, markdownPath));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.files.length, 8);
for (const file of manifest.files) {
  const bytes = local(PREFIX + file.path);
  assert.equal(bytes.length, file.bytes);
  assert.equal(sha(bytes), file.sha256);
  assert.deepEqual(bytes, object(PACKET, PREFIX + file.path));
}
const initial = readJson(PREFIX + 'initial/results.json');
const final = readJson(PREFIX + 'final/results.json');
for (const receipt of [initial, final]) {
  assert.equal(receipt.source, SOURCE);
  assert.equal(receipt.final_source, SOURCE);
  assert.equal(receipt.require_anvil, true);
  assert.equal(receipt.heap_mib, 512);
  assert.equal(receipt.node, '22.23.4');
}
assert.deepEqual(initial.commands.map((c) => [c.name, c.exit_code]), [['adapters-build', 0], ['relayer-build', 0], ['relayer-integrated', 1]]);
assert.deepEqual(final.commands.map((c) => [c.name, c.exit_code]), [['relayer-integrated', 0], ['readback-integrated', 0]]);
assert.deepEqual(initial.commands[2].command, final.commands[0].command);
assert.equal(initial.commands[2].cwd, final.commands[0].cwd);
const initialLog = local(PREFIX + 'initial/relayer-integrated.log').toString();
assert.match(initialLog, /Tests\s+1 failed \| 241 passed \| 4 skipped \(246\)/);
assert.match(initialLog, /anvil binary and forge artifacts exist/);
assert.match(initialLog, /"relayer": false/);
assert.match(initialLog, /"token": false/);
assert.match(local(PREFIX + 'final/relayer-integrated.log').toString(), /Tests\s+246 passed \(246\)/);
assert.match(local(PREFIX + 'final/readback-integrated.log').toString(), /Tests\s+64 passed \(64\)/);
const parity = readJson(PREFIX + 'initial/artifact-source-parity.json');
const sources = new Map();
const artifacts = [];
for (const artifact of parity.artifacts) {
  const bytes = local(artifact.path);
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(sha(bytes), artifact.sha256);
  const parsed = JSON.parse(bytes);
  const metadata = parsed.metadata;
  const rawMetadata = JSON.parse(parsed.rawMetadata);
  assert.deepEqual(rawMetadata.sources, metadata.sources);
  assert.deepEqual(rawMetadata.compiler, metadata.compiler);
  for (const [path, entry] of Object.entries(metadata.sources)) {
    if (sources.has(path)) assert.equal(sources.get(path), entry.keccak256);
    sources.set(path, entry.keccak256);
  }
  artifacts.push({ ...artifact, compiler: metadata.compiler.version, evmVersion: metadata.settings.evmVersion,
    optimizer: metadata.settings.optimizer, sourceCount: Object.keys(metadata.sources).length,
    rawAndParsedMetadataSourceMapsAgree: true });
}
assert.equal(artifacts.length, 2);
assert.equal(sources.size, 29);
assert.equal(Object.keys(parity.sources).length, 29);
for (const [path, expected] of sources) {
  assert.equal(parity.sources[path], expected);
  const bytes = object(SOURCE, `packages/contracts/${path}`);
  assert.deepEqual(bytes, local(`packages/contracts/${path}`));
  assert.equal(keccak256(bytes), expected);
}
const record = {
  schemaVersion: 1, reviewer: 'contract_security', reviewDate: '2026-11-19', verdict: 'PASS for scoped source integration and recorded local qualification',
  runtimeSource: SOURCE, coordinatorPacketCommit: PACKET, reviewerReranSuites: false,
  sourceFiles, coordinatorManifestSha256: sha(manifestBytes), coordinatorMarkdownSha256: sha(local(markdownPath)),
  rawCoordinatorFilesVerified: manifest.files,
  qualification: { initial: { passed: 241, failed: 1, skipped: 4, cause: 'required compiled artifacts absent' },
    final: { relayerPassed: 246, readbackPassed: 64, skipped: 0 }, buildExits: [0, 0],
    originalRelayerSelectionUnchanged: true, sourceUnchangedBetweenAttempts: true, node: final.node, heapMiB: final.heap_mib, requireAnvil: true },
  artifacts, uniqueMetadataSourceHashesCheckedAgainstExactGitObjects: 29,
  metadataSourceHashes: Object.fromEntries([...sources].sort(([a], [b]) => a.localeCompare(b))),
  limits: ['No new suite, compilation, EVM, RPC or workflow execution by the reviewer.',
    'Metadata source identity and existing artifact provenance are verified; no new reproducible-bytecode build is claimed.',
    'Foundry raw and parsed metadata normalize other fields differently; only their source maps and compiler identity are asserted equal.',
    'Targeted checks do not establish full coverage, full test-source typechecking, browser acceptance or public OP fee acceptance.',
    'Existing devnet fixture incompatibility is a separate owner follow-up, not a readback waiver.',
    'Strict Mythril failure and hosted release/merge decisions remain unchanged.'],
  checkerSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
};
if (args.length === 4) writeFileSync(resolve(args[3]), JSON.stringify(record, null, 2) + '\n');
console.log('PASS: 12 source files; 8 committed evidence files; unchanged selections; 2 exact artifacts and 29 committed source hashes. No suite rerun.');
