import { ANNOUNCEMENT_TOPIC, CHAINS, ghostPayRouterAbi, grossForNet, type Address, type Hex, type RpcLog } from '@ghostpay/chain-adapters';
import { buildErc20Metadata, deriveStealthPayment, encodeMetaAddress, generateKeySet, unsafeRevealSecret, zeroize, type RandomSource } from '@ghostpay/core-crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { TOKEN_84532 } from '../test/announcements';
import { mockRpc } from '../test/mockRpc';
import { PrivateScanVault, PRIVATE_SCAN_MAX_PLAINTEXT_BYTES, type PrivateScanScope, type PrivateScanState } from './privateScanStore';
import type { ReconciliationVaultStore } from './reconciliationVault';
import { checkpointKeyId, runScan, type ScanMatch } from './scanClient';

/*
 * One measured pair: an empty journal versus reopening a prior encrypted journal and replaying its historical match
 * blocks. Fixture construction and the preparatory scan are outside the measurements. "Cold" means no saved history,
 * not a cold JavaScript process: preparation warms the same runtime. Every announcement has a distinct ephemeral key.
 *
 * The real fetch validator, worker protocol/crypto, transaction-bound receipt checks, HKDF/AES-GCM and awaited complete
 * journal saves run here. RPC responses and CAS storage are in memory. This does not measure browser IndexedDB latency,
 * worker transfer/rendering costs, real-network latency or mobile throughput. No wall-clock ratio is an acceptance gate.
 */
const chain = CHAINS.find((candidate) => candidate.chainId === 84532)!;
const manifest = fakeManifest(chain.chainId);
const OLD_HEAD = 4095n;
const NEW_HEAD = 4351n;
const NEW_BLOCK = 4200;
const NET = 1_000_000n;
const PAYER: Address = '0x2222222222222222222222222222222222222222';
const OPEN_CALLER: Address = '0x3333333333333333333333333333333333333333';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const blockHash = (block: bigint): Hex => `0x${block.toString(16).padStart(64, '0')}`;
const word = (address: string): Hex => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;

/** Test-only deterministic input, passed through the public crypto API; global encryption randomness stays unchanged. */
function fixtureRandom(): RandomSource {
  let counter = 0;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let offset = 0; offset < bytes.length; offset += 32) {
        bytes.set(sha256(utf8ToBytes(`private-scan-performance-v1:${counter++}`)).subarray(0, bytes.length - offset), offset);
      }
      return array;
    },
  };
}

interface FixtureLog {
  readonly log: RpcLog;
  readonly transactionHash: Hex;
  readonly stealthAddress: Address;
  readonly ephemeral: Hex;
  readonly metadata: Hex;
  readonly mine: boolean;
  readonly router: boolean;
}

function fixtureLog(metaAddress: string, block: number, index: number, mine: boolean, rng: RandomSource): FixtureLog {
  const payment = deriveStealthPayment(metaAddress, rng);
  const stealthAddress: Address = `0x${payment.stealthAddress.slice(2)}`;
  const ephemeral: Hex = `0x${bytesToHex(payment.ephemeralPublicKey)}`;
  const metadata: Hex = `0x${bytesToHex(buildErc20Metadata(payment.viewTag, TOKEN_84532, NET))}`;
  const transactionHash: Hex = `0x${(BigInt(block) * 65536n + BigInt(index)).toString(16).padStart(64, '0')}`;
  const router = mine || index % 2 === 1;
  return {
    transactionHash, stealthAddress, ephemeral, metadata, mine, router,
    log: {
      address: FAKE_ANNOUNCER,
      topics: [ANNOUNCEMENT_TOPIC, `0x${'1'.padStart(64, '0')}`, word(stealthAddress), word(router ? FAKE_ROUTER : OPEN_CALLER)],
      data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [ephemeral, metadata]),
      blockNumber: `0x${block.toString(16)}`, blockHash: blockHash(BigInt(block)),
      logIndex: `0x${(100 + index * 2).toString(16)}`, transactionHash,
    },
  };
}

function makeFixture() {
  const rng = fixtureRandom();
  const keys = generateKeySet(rng);
  const stranger = generateKeySet(rng);
  try {
    const mine = encodeMetaAddress(keys);
    const other = encodeMetaAddress(stranger);
    const blocks = [...Array.from({ length: 16 }, (_, index) => 100 + index * 256), NEW_BLOCK];
    const logs = blocks.flatMap((block, group) => Array.from({ length: 16 }, (_, index) => {
      const isMine = index === 0 && group % 4 === 0;
      return fixtureLog(isMine ? mine : other, block, index, isMine, rng);
    }));
    const scope: PrivateScanScope = {
      chainId: chain.chainId, sellerKeyId: checkpointKeyId(bytesToHex(keys.spendingPublicKey), bytesToHex(keys.viewingPublicKey)),
      announcer: FAKE_ANNOUNCER, router: FAKE_ROUTER, finalityDepth: chain.finalityDepth, deep: false,
      configuration: bytesToHex(sha256(utf8ToBytes('deterministic-in-memory-rpc-v1'))),
    };
    return { keys, logs, scope };
  } finally { zeroize(stranger.spendingSecret); zeroize(stranger.viewingSecret); }
}

function fixtureClient(head: bigint, rows: readonly FixtureLog[]) {
  const transfer = (row: FixtureLog): RpcLog => ({
    address: TOKEN_84532, blockNumber: row.log.blockNumber, blockHash: row.log.blockHash,
    transactionHash: row.transactionHash, logIndex: `0x${(BigInt(row.log.logIndex) - 1n).toString(16)}`,
    topics: [TRANSFER_TOPIC, word(PAYER), word(row.stealthAddress)], data: `0x${NET.toString(16).padStart(64, '0')}`,
  });
  const transfers = rows.filter((row) => row.router).map(transfer);
  return mockRpc(chain.chainId, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const block = BigInt(params[0] as string | number | bigint);
      return { hash: blockHash(block), parentHash: blockHash(block === 0n ? 0n : block - 1n), number: `0x${block.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const filter = params[0] as { address: string; fromBlock: bigint; toBlock: bigint; topics?: readonly (string | null)[] };
      const logs = filter.address.toLowerCase() === TOKEN_84532.toLowerCase() ? transfers : rows.map((row) => row.log);
      const caller = filter.topics?.[3];
      return logs.filter((log) => BigInt(log.blockNumber) >= filter.fromBlock && BigInt(log.blockNumber) <= filter.toBlock &&
        (caller == null || log.topics[3] === caller));
    }
    if (method === 'eth_getTransactionReceipt' || method === 'eth_getTransactionByHash') {
      const row = rows.find((candidate) => candidate.transactionHash === params[0]);
      if (row === undefined || !row.router) return null;
      const common = { to: FAKE_ROUTER, from: PAYER, blockNumber: row.log.blockNumber, blockHash: row.log.blockHash };
      if (method === 'eth_getTransactionReceipt') return { ...common, status: '0x1', transactionHash: row.transactionHash, logs: [transfer(row), row.log] };
      return { ...common, hash: row.transactionHash, value: '0x0', input: encodeFunctionData({
        abi: ghostPayRouterAbi, functionName: 'payERC20',
        args: [TOKEN_84532, row.stealthAddress, grossForNet(NET), NET, 9999999999n, row.ephemeral, row.metadata],
      }) };
    }
    if (method === 'eth_call' || method === 'eth_getBalance') return '0x0';
    throw new Error('unexpected deterministic fixture RPC method');
  });
}

class MemoryCas implements ReconciliationVaultStore {
  readonly values: Map<string, string>;
  constructor(initial?: ReadonlyMap<string, string>) { this.values = new Map(initial); }
  read(key: string): Promise<string | null> { return Promise.resolve(this.values.get(key) ?? null); }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if ((this.values.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.values.set(key, next);
    return Promise.resolve(true);
  }
}

async function scan(fixture: ReturnType<typeof makeFixture>, store: MemoryCas, head: bigint) {
  const client = fixtureClient(head, fixture.logs);
  const worker = new InlineWorker();
  const commits: PrivateScanState[] = [];
  const progress: { readonly historical: boolean; readonly committed: number }[] = [];
  let saveMs = 0;
  const started = performance.now();
  const vault = await PrivateScanVault.open(fixture.scope, unsafeRevealSecret(fixture.keys.viewingSecret), store, () => undefined);
  try {
    const loaded = await vault.load();
    const openLoadMs = performance.now() - started;
    const replayBlocks = [...new Set(loaded?.matches.map((match) => match.announcement.blockNumber) ?? [])];
    const scanStarted = performance.now();
    const result = await runScan({
      chain, manifest, client, cursor: loaded?.cursor ?? { nextBlock: 0n }, replayBlocks,
      spendingPublicKeyHex: bytesToHex(fixture.keys.spendingPublicKey), keyId: fixture.scope.sellerKeyId,
      viewingKey: unsafeRevealSecret(fixture.keys.viewingSecret), createWorker: () => worker,
      signal: new AbortController().signal, maxPages: 8, maxAnnouncementsPerScan: 1024, maxMatchesPerScan: 16, openLaneBudget: 512,
      onCheckpoint: async (cursor, matches, routerOnlyBlocks) => {
        const next: PrivateScanState = { startBlock: 0n, cursor, matches: [...matches], routerOnlyBlocks: [...routerOnlyBlocks] };
        const saveStarted = performance.now();
        await vault.save(next);
        saveMs += performance.now() - saveStarted;
        commits.push(next);
      },
      onProgress: (value) => { progress.push({ historical: value.revalidating === true, committed: commits.length }); },
    });
    const scanMs = performance.now() - scanStarted;
    const totalMs = performance.now() - started;
    const rpcCalls: Record<string, number> = {};
    for (const call of client.calls) rpcCalls[call.method] = (rpcCalls[call.method] ?? 0) + 1;
    const envelope = [...store.values.values()][0];
    if (envelope === undefined) throw new Error('fixture journal was not committed');
    const batches = worker.received.filter((message) => message.type === 'batch');
    return {
      loaded, result, commits, progress, client, worker,
      metrics: {
        announcements: result.scanned, matches: result.matches.length, replayBlocks: replayBlocks.length,
        workerBatches: batches.length, checkpointCommits: commits.length, rpcCalls,
        envelopeBytes: new TextEncoder().encode(envelope).length,
        milliseconds: { openAndLoad: openLoadMs, scanIncludingSaves: scanMs, encryptedSaves: saveMs, total: totalMs },
      },
    };
  } finally { vault.lock(); }
}

async function restored(fixture: ReturnType<typeof makeFixture>, store: MemoryCas): Promise<PrivateScanState | undefined> {
  const vault = await PrivateScanVault.open(fixture.scope, unsafeRevealSecret(fixture.keys.viewingSecret), store, () => undefined);
  try { return await vault.load(); } finally { vault.lock(); }
}

const identities = (matches: readonly ScanMatch[]): readonly string[] => matches.map((match) => match.announcement.id).sort();

describe('deterministic private checkpoint performance observation', () => {
  it('measures one empty-history scan and one encrypted-history resume with equal freshly verified discoveries', async () => {
    const fixture = makeFixture();
    try {
      expect(fixture.logs).toHaveLength(272);
      expect(new Set(fixture.logs.map((row) => row.ephemeral)).size).toBe(272);
      const oldStore = new MemoryCas();
      const prepared = await scan(fixture, oldStore, OLD_HEAD);
      expect(prepared.result.scanned).toBe(256);
      expect(prepared.result.matches).toHaveLength(4);
      expect(prepared.result.matches.every((match) => match.receipt === 'verified')).toBe(true);
      const prior = await restored(fixture, oldStore);
      expect(prior?.cursor.nextBlock).toBe(OLD_HEAD + 1n - BigInt(chain.finalityDepth));
      expect(prior?.matches.every((match) => match.receipt === 'claimed')).toBe(true);

      const coldStore = new MemoryCas();
      const cold = await scan(fixture, coldStore, NEW_HEAD);
      const resumedStore = new MemoryCas(oldStore.values);
      const resumed = await scan(fixture, resumedStore, NEW_HEAD);
      const expectedIds = fixture.logs.filter((row) => row.mine)
        .map((row) => `${row.log.blockHash}:${BigInt(row.log.logIndex).toString()}`).sort();

      expect(cold.loaded).toBeUndefined();
      expect(resumed.loaded?.matches.every((match) => match.receipt === 'claimed')).toBe(true);
      expect(cold.metrics.announcements).toBe(272);
      expect(resumed.metrics.announcements).toBe(80);
      expect(cold.metrics.replayBlocks).toBe(0);
      expect(resumed.metrics.replayBlocks).toBe(4);
      expect(resumed.progress.filter((value) => value.historical)).toHaveLength(4);
      expect(resumed.progress.filter((value) => value.historical).every((value) => value.committed === 0)).toBe(true);
      for (const outcome of [cold, resumed]) {
        expect(identities(outcome.result.matches)).toEqual(expectedIds);
        expect(outcome.result.matches.every((match) => match.viaRouter && match.receipt === 'verified')).toBe(true);
        expect(outcome.result.discrepancies).toEqual([]);
        expect(outcome.result.limitReached).toBe(false);
        expect(outcome.result.backlog ?? 0).toBe(0);
        expect(outcome.result.cursor.nextBlock).toBe(NEW_HEAD + 1n);
        expect(outcome.worker.terminated).toBe(true);
        expect(outcome.metrics.workerBatches).toBeLessThanOrEqual(12);
        expect(outcome.metrics.checkpointCommits).toBeGreaterThan(0);
        expect(outcome.metrics.envelopeBytes).toBeLessThanOrEqual(PRIVATE_SCAN_MAX_PLAINTEXT_BYTES * 2 + 512);
        expect(Object.values(outcome.metrics.rpcCalls).reduce((sum, count) => sum + count, 0)).toBeLessThan(200);
        expect(outcome.progress.some((value) => !value.historical)).toBe(true);
        expect(outcome.progress.filter((value) => !value.historical).every((value) => value.committed > 0)).toBe(true);
      }
      for (const store of [coldStore, resumedStore]) {
        expect(store.values.size).toBe(1);
        const saved = await restored(fixture, store);
        expect(saved?.cursor).toEqual({ nextBlock: NEW_HEAD + 1n - BigInt(chain.finalityDepth),
          last: { number: NEW_HEAD - BigInt(chain.finalityDepth), hash: blockHash(NEW_HEAD - BigInt(chain.finalityDepth)) } });
        expect(identities(saved?.matches ?? [])).toEqual(expectedIds);
        expect(saved?.matches.every((match) => match.receipt === 'claimed')).toBe(true);
      }
      for (const [phase, outcome] of [['cold', cold], ['historical-resume', resumed]] as const) {
        const milliseconds = Object.fromEntries(Object.entries(outcome.metrics.milliseconds).map(([name, value]) => [name, Number(value.toFixed(2))]));
        process.stdout.write(`private-scan-performance ${JSON.stringify({ phase, ...outcome.metrics, milliseconds })}\n`);
      }
    } finally { zeroize(fixture.keys.spendingSecret); zeroize(fixture.keys.viewingSecret); }
  }, 120_000);
});
