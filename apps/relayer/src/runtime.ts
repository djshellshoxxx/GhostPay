import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monotonicNow, LossBudget } from '@ghostpay/relayer-guard';
import { createClient, findChain, verifyManifestOnChain, type ChainConfig } from '@ghostpay/chain-adapters';
import { createViemChainClient, type ChainClient } from './chain.js';
import { createWebhookAlerts, nullAlerts, type AlertSink } from './alerts.js';
import { Metrics } from './metrics.js';
import { DEV_CHAIN_ID, type RelayerConfig } from './config.js';
import { KeyHasher, RateLimiter } from './limiter.js';
import type { Logger } from './log.js';
import { FixedStablePriceSource, RpcGasPriceSource } from './pricing.js';
import { RelayerHttpServer } from './server.js';
import { RelayerService, lossCleanReserve } from './service.js';
import type { PolicyGate } from './policy.js';
import { ConfigError } from './secrets.js';

/** Version string reported by `/v1/info`. */
export const RELAYER_VERSION = '0.1.0';

/** Injected pieces for {@link buildRelayer}. */
export interface RuntimeDeps {
  readonly config: RelayerConfig;
  /** 32-byte hot key. */
  readonly hotKey: Uint8Array;
  readonly quoteSecret: Uint8Array;
  readonly previousQuoteSecret?: Uint8Array;
  readonly logger: Logger;
  readonly policy?: PolicyGate;
  /** Replaces the real chain clients (tests). */
  readonly clients?: ReadonlyMap<number, ChainClient>;
  readonly now?: () => number;
  /** Monotonic ms clock for breaker, limiters and loss budget (default: `now` when given, else `performance.now`). */
  readonly monotonic?: () => number;
  /** Replaces the config-driven alert sink (tests). */
  readonly alerts?: AlertSink;
}

/** A wired relayer. */
export interface Relayer {
  readonly service: RelayerService;
  readonly server: RelayerHttpServer;
  readonly metrics: Metrics;
  /** Stops process-lifetime maintenance timers. */
  dispose(): void;
}

function hex(b: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(b).toString('hex')}`;
}

/**
 * Builds viem-backed clients for every configured chain and verifies each endpoint reports the
 * configured chain id (via the chain-adapters RPC client) before anything is served.
 *
 * @param config Resolved configuration.
 * @param hotKey Hot key bytes.
 * @returns Chain clients by chain id.
 * @throws {ChainAdapterError} `CHAIN_MISMATCH` / `RPC_FAILURE` when an endpoint is wrong or down; `INVALID_MANIFEST` when
 * the chain does not match the deployment manifest.
 */
export async function buildChainClients(config: RelayerConfig, hotKey: Uint8Array): Promise<Map<number, ChainClient>> {
  const account = privateKeyToAccount(hex(hotKey));
  const out = new Map<number, ChainClient>();
  for (const c of config.chains) {
    const known: ChainConfig =
      findChain(c.chainId) ??
      { chainId: DEV_CHAIN_ID, name: c.name, nativeSymbol: 'ETH', nativeDecimals: 18, testnet: true, enabled: true, finalityDepth: 1, getLogsMaxRange: 1000, blockTimeMs: 1000 };
    const rpc = await createClient(known, c.rpcUrl, { allowInsecureLocalhost: config.allowInsecureLocalhostRpc });
    // CHAIN-ADAPTERS-05: the manifest's router/fee recipient/announcer/code hashes must match the chain. Fail closed.
    if (c.manifest !== undefined) await verifyManifestOnChain(c.manifest, rpc);
    const chain = defineChain({ id: c.chainId, name: c.name, nativeCurrency: { name: 'Native', symbol: known.nativeSymbol, decimals: 18 }, rpcUrls: { default: { http: [c.rpcUrl] } } });
    const transport = http(c.rpcUrl, { timeout: 10_000, retryCount: 1 });
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ chain, transport, account });
    out.set(c.chainId, createViemChainClient({ publicClient, walletClient, account, chain }));
  }
  return out;
}

/**
 * Wires limiter, price sources, service and HTTP server.
 *
 * @param d Dependencies.
 * @returns The relayer (not yet listening).
 */
export async function buildRelayer(d: RuntimeDeps): Promise<Relayer> {
  const hotBytes = Buffer.from(d.hotKey);
  if (Buffer.from(d.quoteSecret).subarray(0, hotBytes.length).equals(hotBytes) ||
      (d.previousQuoteSecret !== undefined && Buffer.from(d.previousQuoteSecret).subarray(0, hotBytes.length).equals(hotBytes))) {
    throw new ConfigError('quote secret must not equal or begin with the hot key');
  }
  const now = d.now ?? Date.now;
  const clients = d.clients ?? (await buildChainClients(d.config, d.hotKey));
  const mono = d.monotonic ?? d.now ?? monotonicNow;
  const hasher = new KeyHasher(d.config.rateLimit.saltRotationHours * 3_600_000, mono);
  const metrics = new Metrics();
  const alerts =
    d.alerts ??
    (d.config.alertWebhookUrl === undefined ? nullAlerts : createWebhookAlerts({ url: d.config.alertWebhookUrl, logger: d.logger, now: mono }));
  const lb = d.config.lossBudget;
  const lossBudget = new LossBudget(
    { windowMs: lb.windowSeconds * 1000, perKeyLimit: lb.perKeyWei, globalLimit: lb.globalWei, maxKeys: lb.maxKeys, cleanReserve: lossCleanReserve(lb.globalWei) },
    mono,
  );
  const rl = d.config.rateLimit;
  const ipLimiter = new RateLimiter({ perMinute: rl.ipPerMinute, burst: rl.ipBurst, maxKeys: rl.maxKeys }, hasher, mono);
  const ownerLimiter = new RateLimiter({ perMinute: rl.ownerPerMinute, burst: rl.ownerBurst, maxKeys: rl.maxKeys }, hasher, mono);
  const service = new RelayerService({
    config: d.config,
    clients,
    quoteSecret: d.quoteSecret,
    ...(d.previousQuoteSecret === undefined ? {} : { previousQuoteSecret: d.previousQuoteSecret }),
    gasPrices: new RpcGasPriceSource(clients),
    tokenPrices: new FixedStablePriceSource(new Map(d.config.chains.map((c) => [c.chainId, c.nativeUsdMicro]))),
    ownerLimiter,
    ...(d.policy === undefined ? {} : { policy: d.policy }),
    logger: d.logger,
    now,
    monotonic: mono,
    hasher,
    lossBudget,
    alerts,
    metrics,
    version: RELAYER_VERSION,
  });
  const server = new RelayerHttpServer({ config: d.config, service, ipLimiter, logger: d.logger, metrics, monotonic: mono });
  const rotationTimer = setInterval(() => hasher.refresh(), Math.min(d.config.rateLimit.saltRotationHours * 3_600_000, 60_000));
  rotationTimer.unref();
  return { service, server, metrics, dispose: () => clearInterval(rotationTimer) };
}
