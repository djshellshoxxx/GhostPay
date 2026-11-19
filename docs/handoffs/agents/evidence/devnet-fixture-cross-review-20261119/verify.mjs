/** Read-only devnet evidence review. Does not invoke a runner, compiler, RPC or browser. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SOURCE = '5f6af961b25b9759497693ceb14b834bcae54f45';
const RED = '05f5631d759476793614913c8926cb1727e376b3';
const PACKET = 'bd62f0737e34112253380a0919fc3aedaaf2c7db';
const DOC = 'docs/completion/remaining-20261119/workflows-devnet-fixture';
const EVIDENCE = 'docs/completion/remaining-20261119/workflows-evidence/';
const args = process.argv.slice(2);
assert.equal(args[0], '--repository');
const repository = resolve(args[1]);
assert(args.length === 2 || (args.length === 4 && args[2] === '--output'));
const require = createRequire(resolve(repository, 'package.json'));
const { keccak256 } = require('viem/utils');
const { CANONICAL_ANNOUNCER, loadDeployment, verifyObjectManifestSignature } = await import(pathToFileURL(require.resolve('@ghostpay/chain-adapters')).href);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const local = (path) => readFileSync(resolve(repository, path));
const git = (...argv) => execFileSync('git', ['-C', repository, ...argv]);
const object = (commit, path) => git('show', `${commit}:${path}`);
const readJson = (path) => JSON.parse(local(path));
const json = local(DOC + '.json');
const markdown = local(DOC + '.md');
assert.equal(sha(json), 'd1cb4c457d372a9c62cf7f9d96dea2751bebb0bf66b36d76e860f5941945a709');
assert.equal(sha(markdown), '1fa2e1683693ba02482c4da77a12be1c34adbc4d9948593b188af64795863a48');
assert.deepEqual(json, object(PACKET, DOC + '.json'));
assert.deepEqual(markdown, object(PACKET, DOC + '.md'));
const packet = JSON.parse(json);
assert.equal(packet.final_runtime_sha, SOURCE);
assert.equal(packet.artifacts.length, 57);
for (const artifact of packet.artifacts) {
  const bytes = local(artifact.path);
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(sha(bytes), artifact.sha256);
  assert.deepEqual(bytes, object(PACKET, artifact.path));
}
const sourceHashes = [];
for (const key of ['runtime_source_hashes', 'preserved_source_hashes']) {
  for (const row of packet.source_proof[key]) {
    const bytes = object(SOURCE, row.path);
    assert.equal(sha(bytes), row.sha256);
    if (row.compared_with) assert.deepEqual(bytes, object(row.compared_with, row.path));
    sourceHashes.push({ ...row, kind: key });
  }
}
assert.equal(sourceHashes.length, 14);
assert.deepEqual(new Set(git('diff', '--name-only', RED, SOURCE).toString().trim().split('\n')),
  new Set(['scripts/beta/browser-devnet.sh', 'apps/web/e2e/devnet/prepare-devnet-manifest.mjs']));
assert.deepEqual(object(RED, 'scripts/testnet/make-manifest.test.mjs'), object(SOURCE, 'scripts/testnet/make-manifest.test.mjs'));
const runner = object(SOURCE, 'scripts/beta/browser-devnet.sh').toString();
const oldRunner = object(RED, 'scripts/beta/browser-devnet.sh').toString();
const marker = 'if [ "$MODE" = "pages" ]; then\n  echo "== playwright';
assert(runner.includes(marker) && oldRunner.includes(marker));
assert.equal(runner.slice(runner.indexOf(marker)), oldRunner.slice(oldRunner.indexOf(marker)));
const seed = /node --input-type=module - "\$RPC_URL" "\$WORK\/forge-out" <<'NODE'\n([\s\S]*?)\nNODE/.exec(runner)[1];
const proof = readJson(EVIDENCE + 'devnet-fixture-native-green-proof.json');
assert.deepEqual(proof, packet.final_native_result);
assert.equal(proof.source_revision, SOURCE);
assert.equal(sha(Buffer.from(seed)), proof.runner_seed_source_sha256);
assert.equal(sha(local(EVIDENCE + 'devnet-fixture-native-replay.py')), proof.replay_sha256);
assert.equal(proof.prepare_exit_code, 0);
assert.equal(proof.browser_executed, false);
assert.equal(proof.owned_anvil_stopped, true);
assert.equal(proof.original_31337_broadcast_preserved, true);
assert.equal(proof.stand_in_token_code_preserved, true);
assert.equal(proof.stand_in_tokens.length, 3);
assert.equal(proof.manifest_result.allowlistedTokensHaveNoCode, true);
assert.equal(proof.steps.length, 5);
assert(proof.steps.every((step) => step.exit_code === 0));
const checks = Object.fromEntries(packet.checks.map((check) => [check.name, check]));
for (const [name, exit] of [['devnet-fixture-unit-red', 1], ['devnet-fixture-native-red', 0],
  ['devnet-fixture-unit-green', 0], ['devnet-fixture-native-green', 1],
  ['devnet-fixture-native-green-final', 1], ['devnet-fixture-native-green-verified', 0]]) assert.equal(checks[name].exit_code, exit);
assert.match(local(EVIDENCE + 'devnet-fixture-unit-red.log').toString(), /# pass 9\n# fail 5\n/);
assert.match(local(EVIDENCE + 'devnet-fixture-unit-green.log').toString(), /# pass 14\n# fail 0\n/);
const redProof = readJson(EVIDENCE + 'devnet-fixture-native-red-proof.json');
assert.equal(redProof.prepare_exit_code, 1);
assert.equal(redProof.owned_anvil_stopped, true);
const original = local(EVIDENCE + 'devnet-fixture-green-original-31337-broadcast.json');
assert.equal(sha(original), proof.original_31337_broadcast_sha256);
assert.equal(JSON.parse(original).chain, 31337);
assert.equal(readJson(EVIDENCE + 'devnet-fixture-green-canonical-84532-broadcast.json').chain, 84532);
const state = readJson(EVIDENCE + 'devnet-fixture-green-browser-state.json');
const signed = local(EVIDENCE + 'devnet-fixture-green-signed-84532.json');
assert.equal(sha(signed), proof.signed_manifest_sha256);
const manifest = loadDeployment(signed.toString(), 84532);
assert.equal(manifest.announcer, CANONICAL_ANNOUNCER);
assert.equal(verifyObjectManifestSignature(manifest, [state.publicKey]).status, 'valid');
const artifactBytes = local(EVIDENCE + 'devnet-fixture-green-reference-artifact.json');
assert.equal(sha(artifactBytes), proof.canonical_runtime_artifact_sha256);
const artifact = JSON.parse(artifactBytes);
assert.deepEqual(JSON.parse(artifact.rawMetadata).sources, artifact.metadata.sources);
const sourceEntries = Object.entries(artifact.metadata.sources);
assert.equal(sourceEntries.length, 1);
for (const [path, entry] of sourceEntries) assert.equal(keccak256(object(SOURCE, `packages/contracts/${path}`)), entry.keccak256);
const result = {
  schemaVersion: 1, reviewer: 'contract_security', date: '2026-11-19', verdict: 'PASS for scoped source and archived native qualification',
  runtimeSource: SOURCE, regressionBaseline: RED, authorPacketCommit: PACKET,
  packetJsonSha256: sha(json), packetMarkdownSha256: sha(markdown), archivedArtifactsVerified: 57,
  sourceHashes, sameRegressionsBeforeAndAfter: true, mandatoryBrowserTailIdentical: true,
  extractedSeedProgramSha256: proof.runner_seed_source_sha256, executedReplaySha256: proof.replay_sha256,
  unitBaseline: { passed: 9, failed: 5 }, unitFinal: { passed: 14, failed: 0, skipped: 0 },
  nativeBaseline: { helperExit: 1, expectedFailureWrapperExit: 0, reason: 'canonical announcer mismatch' },
  retainedReplayWrapperFailures: packet.retained_replay_failures,
  finalNative: { exit: 0, seconds: checks['devnet-fixture-native-green-verified'].seconds,
    stepNames: proof.steps.map((step) => step.name), originalTokenBroadcastPreserved: true,
    standInTokensWithCode: 3, publicAllowlistedTokensStillAbsent: true, ownedAnvilStopped: true, browserExecuted: false },
  reviewerOfflineSignatureCheck: 'valid', referenceArtifactSha256: sha(artifactBytes),
  referenceArtifactSourceMatchesExactGitRevision: true,
  reviewerExecutedNativeOrBrowserRun: false,
  limits: packet.qualification_limits,
  checkerSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
};
if (args.length === 4) writeFileSync(resolve(args[3]), JSON.stringify(result, null, 2) + '\n');
console.log('PASS: 57 committed artifacts, 14 source hashes, unchanged tests/browser tail, preserved failed attempts and offline fixture signature. No native/browser rerun.');
