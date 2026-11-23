import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  InMemoryTweakSource, createScanState, parseScanState, resumeScan, scanBlocks,
  serializeScanState, silentPaymentKeysFromSeed, zeroize,
} from '../../../../packages/btc-silent-payments/dist/index.js';

// Deterministic library-only workload using the existing InMemoryTweakSource.
// Hash construction matches fixtures.testutil.ts:blockHashOf. Synthetic outpoints
// and fixed test keys never refer to public-chain funds. No network is used.
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const scenario = process.argv[2] ?? 'scan';
assert(['scan', 'resume', 'conflict'].includes(scenario));
const blocksCount = 500;
const entriesPerBlock = 2_000;
const uniquePerBlock = entriesPerBlock / 2;
const watchedCount = scenario === 'resume' ? 750 : 10_000;
const workerStateByteCap = 512 * 1024;
const hex = (n) => n.toString(16).padStart(64, '0');
const blockHash = (height) => createHash('sha256').update(`block:${height}`).digest('hex');
const hashOf = (path) => createHash('sha256').update(readFileSync(`${repo}/${path}`)).digest('hex');
const keys = silentPaymentKeysFromSeed(new Uint8Array(32).fill(0x57), { network: 'testnet' });
const publicKey = Buffer.from(keys.spendPublicKey.subarray(1)).toString('hex');
const chainBlocks = Array.from({ length: blocksCount + 1 }, (_, height) => ({
  tweaks: { height, blockHash: blockHash(height), tweaks: [] },
  outputs: { height, blockHash: blockHash(height), outputs: [] },
}));
const base = new InMemoryTweakSource(chainBlocks);
let spendCalls = 0;
let suppliedEntries = 0;
let spendEvents = 0;
let completedBlocks = 0;
let checkpointBytesTotal = 0;
let maxCheckpointBytes = 0;
let headerLookups = 0;
const source = {
  getTipHeight: () => base.getTipHeight(),
  getTweaks: (height) => base.getTweaks(height),
  getOutputs: (height) => base.getOutputs(height),
  getSpends: async (height) => {
    spendCalls++;
    const inputs = [];
    for (let i = 0; i < uniquePerBlock; i++) {
      const serial = (height - 1) * uniquePerBlock + i + 1;
      const persistedIndex = (height - 1) * 2 + i;
      const input = {
        txid: scenario === 'resume' && i < 2 && persistedIndex < watchedCount ? hex(1_000_000 + persistedIndex) : hex(serial),
        vout: 0,
        spentBy: hex(10_000_000 + serial),
      };
      inputs.push(input, scenario === 'conflict' && i === 0 ? { ...input, spentBy: hex(20_000_000 + serial) } : input);
    }
    suppliedEntries += inputs.length;
    return { height, blockHash: blockHash(height), spends: inputs };
  },
};
const watched = new Set();
if (scenario !== 'resume') {
  for (let height = 1; height <= blocksCount; height++) {
    for (let i = 0; i < 20; i++) watched.add(`${hex((height - 1) * uniquePerBlock + i + 1)}:0`);
  }
}
let state;
if (scenario === 'resume') {
  state = { ...createScanState('regtest', 0), lastHeight: 0, lastHash: blockHash(0), recent: [{ height: 0, hash: blockHash(0) }],
    matches: Array.from({ length: watchedCount }, (_, i) => ({
      height: 0, blockHash: blockHash(0), xOnlyPublicKey: publicKey, k: 0, label: null,
      txid: hex(1_000_000 + i), vout: 0, amountSats: 1_000n, status: 'confirmed',
      spentCheckedThrough: { height: 0, blockHash: blockHash(0) },
    })),
  };
  state = parseScanState(serializeScanState(state));
}
if (global.gc) global.gc();
const heapBefore = process.memoryUsage().heapUsed;
const started = performance.now();
let outcome = 'completed';
if (scenario === 'resume') {
  const iterator = resumeScan({ source, keys, state, toHeight: blocksCount, maxBlocks: blocksCount,
    hashAt: (height) => { headerLookups++; return blockHash(height); },
    onState: (next) => {
      state = next;
      completedBlocks++;
      const bytes = Buffer.byteLength(serializeScanState(next));
      checkpointBytesTotal += bytes;
      maxCheckpointBytes = Math.max(maxCheckpointBytes, bytes);
    },
  });
  for (;;) { const result = await iterator.next(); if (result.done) { state = result.value; break; } }
  assert.equal(state.lastHeight, blocksCount);
  assert.equal(state.matches.length, watchedCount);
  spendEvents = state.matches.filter((m) => m.spent !== undefined).length;
  assert.equal(spendEvents, watchedCount);
  assert(state.matches.every((m) => m.spentCheckedThrough?.height === blocksCount));
  assert(maxCheckpointBytes <= workerStateByteCap);
} else {
  try {
    for await (const unused of scanBlocks({ source, keys, fromHeight: 1, toHeight: blocksCount, maxBlocks: blocksCount,
      watchOutpoints: watched, onSpend: () => { spendEvents++; }, onBlock: () => { completedBlocks++; } })) {
      assert.fail(`Unexpected output at ${unused.height}`);
    }
  } catch (error) {
    if (scenario !== 'conflict' || error?.code !== 'INVALID_RESPONSE') throw error;
    outcome = 'rejected conflicting duplicate';
  }
  if (scenario === 'conflict') {
    assert.equal(outcome, 'rejected conflicting duplicate');
    assert.equal(spendEvents, 0);
    assert.equal(completedBlocks, 0);
  } else {
    assert.equal(spendEvents, watchedCount);
    assert.equal(completedBlocks, blocksCount);
  }
}
const wallTimeMs = performance.now() - started;
if (global.gc) global.gc();
const heapAfter = process.memoryUsage().heapUsed;
const counts = { getTipHeight: 0, getTweaks: 0, getOutputs: 0, getSpends: spendCalls, networkRequests: 0 };
for (const request of base.requests) counts[request.method]++;
const report = {
  scenario, outcome, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  sourceSha256: {
    'packages/btc-silent-payments/src/scan/state.ts': hashOf('packages/btc-silent-payments/src/scan/state.ts'),
    'packages/btc-silent-payments/src/scan/scanner.ts': hashOf('packages/btc-silent-payments/src/scan/scanner.ts'),
    'packages/btc-silent-payments/dist/scan/state.js': hashOf('packages/btc-silent-payments/dist/scan/state.js'),
    'packages/btc-silent-payments/dist/scan/scanner.js': hashOf('packages/btc-silent-payments/dist/scan/scanner.js'),
  },
  node: process.version, platform: process.platform, requestedBlocks: blocksCount,
  completedBlocks, watchedOutpoints: watchedCount, uniqueInputsPerBlock: uniquePerBlock,
  inputEntriesPerBlock: entriesPerBlock, duplicateCopiesPerInput: 2, inputEntriesSupplied: suppliedEntries,
  spendEvents, sourceMethodCalls: counts, headerLookups,
  checkpointBytesTotal, maxCheckpointBytes, workerStateByteCap,
  wallTimeMs: Math.round(wallTimeMs * 100) / 100,
  maxRssKiB: process.resourceUsage().maxRSS,
  heapBeforeBytes: heapBefore, heapAfterBytes: heapAfter, retainedHeapDeltaBytes: heapAfter - heapBefore,
  gcBeforeAndAfter: typeof global.gc === 'function',
  scope: 'Node library input indexing, local matching, state updates and JSON checkpoint serialization only. Excludes BIP-352 receiver cryptography (no tweaks), raw block/header validation, browser/worker messaging, encryption, storage I/O and network latency. RSS includes runtime and fixture setup. Timing is one deterministic local run, not a browser benchmark or universal performance guarantee.',
};
zeroize(keys.scanSecret, keys.spendSecret);
const output = JSON.stringify(report, null, 2) + '\n';
if (process.argv[3]) writeFileSync(process.argv[3], output);
process.stdout.write(output);
