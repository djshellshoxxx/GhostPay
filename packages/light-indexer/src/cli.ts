#!/usr/bin/env node
import { alignedStart, parseConfig } from './config.js';
import { Indexer } from './ingest.js';
import { JsonRpcChainReader } from './rpc.js';
import { createLogsServer } from './server.js';
import { LogStore } from './store.js';

// Thin process wrapper. It prints fixed status lines only: no request lines, client addresses, query values or RPC URL.
const say = (line: string): void => {
  process.stderr.write(`light-indexer: ${line}\n`);
};

async function main(): Promise<void> {
  const c = parseConfig(process.env);
  const store = LogStore.open(c.dbPath, { chainId: c.chainId, announcer: c.announcer, indexedFrom: alignedStart(c.startBlock, c.alignBlocks) });
  const reader = new JsonRpcChainReader({ url: c.rpcUrl });
  const indexer = new Indexer({ store, reader, chainId: c.chainId, announcer: c.announcer, confirmations: c.confirmations, maxReorgDepth: c.maxReorgDepth });
  await indexer.verifyChain();
  const { server } = createLogsServer({
    store,
    chainId: c.chainId,
    announcer: c.announcer,
    alignBlocks: c.alignBlocks,
    maxWindowBlocks: c.maxWindowBlocks,
    maxPageSize: c.maxPageSize,
    maxResponseBytes: c.maxResponseBytes,
    allowedOrigins: c.allowedOrigins,
  });
  const stop = new AbortController();
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => stop.abort());
  await new Promise<void>((resolve) => server.listen(c.port, c.host, resolve));
  say(`serving chain ${String(c.chainId)} on ${c.host}:${String(c.port)} (testnet reference service, unaudited)`);
  await indexer.run({ intervalMs: c.pollMs, signal: stop.signal, onError: (e) => say(`sync error: ${e instanceof Error ? e.name : 'unknown'}`) });
  if (store.halted) say('halted: reorg deeper than the configured limit; rebuild the store');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
}

main().catch((e: unknown) => {
  say(`fatal: ${e instanceof Error ? e.message : 'unknown error'}`);
  process.exitCode = 1;
});
