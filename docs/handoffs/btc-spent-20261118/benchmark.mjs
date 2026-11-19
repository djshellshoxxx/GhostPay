import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { scanBlocks, silentPaymentKeysFromSeed, zeroize } from '@ghostpay/btc-silent-payments';

// Deterministic scanner/input-filter fixture. No network, full-block parsing, or crypto throughput claim.
const blocks = 500;
const inputsPerBlock = 1_000;
const keys = silentPaymentKeysFromSeed(new Uint8Array(32).fill(19), { network: 'testnet' });
const txid = (n) => n.toString(16).padStart(64, '0');
const watch = new Set(Array.from({ length: 10_000 }, (_, i) => `${txid(1_000_001 + i)}:0`));
let requests = 0;
const source = {
  async getTipHeight() { return blocks; },
  async getTweaks(height) { requests++; return { height, blockHash: txid(height), tweaks: [] }; },
  async getOutputs(height) { requests++; return { height, blockHash: txid(height), outputs: [] }; },
  async getSpends(height) {
    requests++;
    return { height, blockHash: txid(height), spends: Array.from({ length: inputsPerBlock }, (_, i) => ({
      txid: txid(i === 0 ? 1_000_000 + height : 2_000_000 + height * inputsPerBlock + i),
      vout: 0, spentBy: txid(3_000_000 + height),
    })) };
  },
};
try {
  globalThis.gc?.();
  const memoryBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  let matches = 0; let spentEvents = 0; let completedBlocks = 0;
  for await (const _ of scanBlocks({ source, keys, fromHeight: 1, toHeight: blocks, maxBlocks: blocks,
    watchOutpoints: watch, onSpend: () => { spentEvents++; }, onBlock: () => { completedBlocks++; },
  })) matches++;
  const elapsedMs = performance.now() - start;
  assert.equal(matches, 0); assert.equal(spentEvents, blocks); assert.equal(completedBlocks, blocks);
  assert.equal(requests, 3 * blocks);
  globalThis.gc?.();
  const heapDeltaBytes = process.memoryUsage().heapUsed - memoryBefore;
  const controller = new AbortController(); requests = 0; let cancelBlocks = 0;
  const cancelStart = performance.now();
  for await (const _ of scanBlocks({ source, keys, fromHeight: 1, toHeight: blocks, signal: controller.signal,
    watchOutpoints: watch, onSpend: () => {}, onBlock: () => { if (++cancelBlocks === 10) controller.abort(); },
  })) assert.fail('No fixture output should match.');
  assert.equal(cancelBlocks, 10); assert.equal(requests, 30);
  console.log(JSON.stringify({
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version, fixture: 'scanner input validation and local watch filtering; no network or block cryptography',
    blocks, inputsPerBlock, inputRecords: blocks * inputsPerBlock, watchedOutpoints: watch.size,
    completedBlocks, spentEvents, matchedOutputs: matches, sourceCalls: 3 * blocks, outpointNetworkQueries: 0,
    elapsedMs: Number(elapsedMs.toFixed(3)), retainedHeapDeltaBytesAfterGC: heapDeltaBytes,
    cancellation: { completedBlocks: cancelBlocks, sourceCalls: requests, elapsedMsIncludingTenBlocks: Number((performance.now() - cancelStart).toFixed(3)), callsAfterAbort: 0 },
  }, null, 2));
} finally { zeroize(keys.scanSecret, keys.spendSecret); }
