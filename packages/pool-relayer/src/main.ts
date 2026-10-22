import { readFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address } from 'viem';
import { createViemChainPort, type ChainPort } from './chain.js';
import { buildConfig, type PoolEntry } from './config.js';
import { createLogger } from './log.js';
import { PoolRelayerHttpServer } from './server.js';
import { PoolRelayerService } from './service.js';

/**
 * Entry point. Environment (no secrets in files or logs):
 *
 * - `POOL_RELAYER_KEY`   hot key, 0x-hex 32 bytes (testnet funds only; never commit, never log)
 * - `POOL_RELAYER_FEE_TO` fee recipient address
 * - `POOL_RELAYER_POOLS` JSON `[{ "chainId": 31337, "pool": "0x..", "rpcUrl": "http://127.0.0.1:8545", "rate": ["1","1"] }]`
 * - `POOL_RELAYER_VKEY`  path to `withdraw.vkey.json`
 * - `POOL_RELAYER_MIN_BALANCE_WEI` hot-key balance floor (default 0.01 ETH); below it the breaker opens
 * - `POOL_RELAYER_HOST`, `POOL_RELAYER_PORT`, `POOL_RELAYER_ORIGINS` (comma list), `POOL_RELAYER_PROXIES` (CIDR comma list)
 */
async function main(): Promise<void> {
  const env = process.env;
  const need = (k: string): string => {
    const v = env[k];
    if (v === undefined || v === '') throw new Error(`missing env ${k}`);
    return v;
  };
  const key = need('POOL_RELAYER_KEY');
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('POOL_RELAYER_KEY is not a 32-byte hex key');
  const account = privateKeyToAccount(key as `0x${string}`);
  delete env['POOL_RELAYER_KEY'];
  const raw = JSON.parse(need('POOL_RELAYER_POOLS')) as { chainId: number; pool: Address; rpcUrl: string; rate?: [string, string] }[];
  const pools: PoolEntry[] = raw.map((p) => ({ chainId: p.chainId, pool: p.pool, rate: { num: BigInt(p.rate?.[0] ?? '1'), den: BigInt(p.rate?.[1] ?? '1') } }));
  const csv = (k: string): string[] => (env[k] ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
  const config = buildConfig({
    pools,
    feeTo: need('POOL_RELAYER_FEE_TO') as Address,
    allowedOrigins: csv('POOL_RELAYER_ORIGINS'),
    trustedProxies: csv('POOL_RELAYER_PROXIES'),
    ...(env['POOL_RELAYER_HOST'] === undefined ? {} : { host: env['POOL_RELAYER_HOST'] }),
    ...(env['POOL_RELAYER_PORT'] === undefined ? {} : { port: Number(env['POOL_RELAYER_PORT']) }),
  });
  const chains = new Map<number, ChainPort>();
  for (const p of raw) {
    if (chains.has(p.chainId)) continue;
    const port = createViemChainPort({ chainId: p.chainId, rpcUrl: p.rpcUrl, account });
    await port.verifyChain();
    chains.set(p.chainId, port);
  }
  const vkey = JSON.parse(readFileSync(need('POOL_RELAYER_VKEY'), 'utf8')) as unknown;
  const logger = createLogger((l) => process.stdout.write(`${l}\n`));
  const service = new PoolRelayerService({ config, chains, vkey, logger });
  const server = new PoolRelayerHttpServer({ config, service, logger });
  const addr = await server.listen();
  logger.log('info', 'listening', {});
  void addr;
  const floor = BigInt(env['POOL_RELAYER_MIN_BALANCE_WEI'] ?? '10000000000000000');
  const probe = setInterval(() => void service.checkHotKeys(floor), 30_000);
  probe.unref();
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => void server.close().then(() => process.exit(0)));
}

main().catch((e: unknown) => {
  process.stderr.write(`fatal: ${e instanceof Error ? e.message : 'unknown'}\n`);
  process.exit(1);
});
