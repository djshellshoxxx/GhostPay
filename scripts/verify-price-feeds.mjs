// With no arguments, validate registry provenance and replay every qualified pair's pinned evidence offline.
// Capture from an operator's local fork with: node scripts/verify-price-feeds.mjs --capture <chainId> <base> <quote>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, keccak256 } from 'viem';
import { FEEDS, chainlinkAggregatorAbi, createAggregatorReader, findQualifiedFeed, readQualifiedPrice } from '@ghostpay/chain-adapters';
import { encodeFunctionData } from 'viem/utils';

const root = new URL('../', import.meta.url);
const evidence = 'docs/research/2026-11-03-claude-handoff/evidence/chainlink/';
const read = (path) => readFileSync(new URL(path, root));
const json = (path) => JSON.parse(read(path));
const decimals = encodeFunctionData({ abi: chainlinkAggregatorAbi, functionName: 'decimals' });
const round = encodeFunctionData({ abi: chainlinkAggregatorAbi, functionName: 'latestRoundData' });
const addrs = (f) => [f.address, f.qualification.reference.address, f.qualification.sequencerFeed].filter(Boolean);
const filename = (f) => `docs/chains/fiat-forks/${f.chainId}-${f.address.toLowerCase()}.json`;

/** Same round and guard checks as checkout, using only calls captured at this exact block. */
export async function replay(feed, snapshot) {
  const pin = feed.qualification;
  assert(Number.isSafeInteger(pin.blockNumber) && pin.blockNumber > 0);
  assert.match(pin.blockHash, /^0x[0-9a-f]{64}$/i);
  assert.notEqual(BigInt(pin.blockHash), 0n);
  assert.equal(snapshot.chainId, feed.chainId);
  assert.equal(snapshot.blockNumber, pin.blockNumber);
  assert.equal(snapshot.blockHash, pin.blockHash);
  assert(Number.isSafeInteger(snapshot.timestamp) && snapshot.timestamp > 0);
  const addresses = addrs(feed).map(a => a.toLowerCase());
  assert.equal(new Set(addresses).size, addresses.length);
  for (const addr of addresses) {
    assert.match(snapshot.calls[addr].codeHash, /^0x[0-9a-f]{64}$/);
    assert.notEqual(snapshot.calls[addr].codeHash, keccak256('0x'));
  }
  const reader = createAggregatorReader({ async request(method, [tx]) {
    assert.equal(method, 'eth_call');
    return snapshot.calls[tx.to.toLowerCase()][tx.data];
  } });
  return readQualifiedPrice(reader, feed, BigInt(snapshot.timestamp));
}

async function capture(feed) {
  const url = new URL(process.env.FIAT_FORK_RPC);
  assert(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Provide a loopback archive fork');
  const client = createPublicClient({ transport: http(url.href, { retryCount: 0 }) });
  const chainId = await client.getChainId();
  assert.equal(chainId, feed.chainId);
  const blockNumber = BigInt(feed.qualification.blockNumber);
  const block = await client.getBlock({ blockNumber });
  assert.equal(block.hash, feed.qualification.blockHash);
  const calls = {};
  for (const to of addrs(feed)) {
    const code = await client.getCode({ address: to, blockNumber });
    assert(code && code !== '0x');
    const record = { codeHash: keccak256(code) };
    for (const data of to === feed.qualification.sequencerFeed ? [round] : [round, decimals]) {
      const result = await client.call({ to, data, blockNumber });
      assert(result.data && result.data !== '0x');
      record[data] = result.data;
    }
    calls[to.toLowerCase()] = record;
  }
  assert.equal((await client.getBlock({ blockNumber })).hash, block.hash);
  const snapshot = { chainId, blockNumber: Number(blockNumber), blockHash: block.hash, timestamp: Number(block.timestamp), calls };
  await replay(feed, snapshot);
  process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
}

async function verifyRegistry() {
  const manifest = json(evidence + 'retrieval-manifest.json');
  const seen = new Set();
  const records = new Map();
  for (const source of manifest.sources) {
    const bytes = read(evidence + source.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
    records.set(source.chain_id, { source, entries: JSON.parse(bytes) });
  }
  for (const feed of FEEDS) {
    const key = [feed.chainId, feed.base, feed.quote].join('/');
    assert(!seen.has(key), 'duplicate pair ' + key);
    seen.add(key);
    const { source, entries } = records.get(feed.chainId);
    const entry = entries.find(e => e.proxyAddress?.toLowerCase() === feed.address.toLowerCase());
    assert(entry && entry.docs?.hidden !== true, key);
    assert.equal(entry.path, `${feed.base}-${feed.quote}`.toLowerCase());
    assert.equal(feed.decimals, entry.decimals);
    assert.equal(feed.heartbeatSec, entry.heartbeat);
    const date = source.retrieved_at_utc.slice(0, 10);
    assert.equal(feed.sourceRef, `docs/chains/SOURCES-${date}.md (retrieved ${date})`);
    const qualified = findQualifiedFeed(feed.chainId, feed.base, feed.quote);
    assert.equal(Boolean(qualified), feed.qualification !== undefined);
    if (qualified) await replay(qualified, json(filename(feed)));
  }
  process.stdout.write(`Validated ${FEEDS.length} sourced feeds and replayed ${FEEDS.filter(f => f.qualification).length} qualified feeds.\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 2) await verifyRegistry();
  else {
    const [mode, chainId, base, quote] = process.argv.slice(2);
    assert.equal(mode, '--capture');
    const feed = findQualifiedFeed(Number(chainId), base, quote);
    assert(feed, 'propose the dated registry metadata and fork pin before capturing evidence');
    await capture(feed);
  }
}
