import { timedRpcFetch } from './rpcMetrics.js';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monotonicNow, LossBudget } from '@ghostpay/relayer-guard';
import { createAggregatorReader, createClient, findChain, verifyManifestOnChain, type ChainConfig, type RpcClient } from '@ghostpay/chain-adapters';
import { createViemChainClient, type ChainClient } from './chain.js';
import { createWebhookAlerts, nullAlerts, type AlertSink } from './alerts.js';
import { Metrics } from './metrics.js';
import { MetricsHttpServer } from './metricsServer.js';
import { DEV_CHAIN_ID, type RelayerConfig } from './config.js';
import { KeyHasher, RateLimiter } from './limiter.js';
import type { Logger } from './log.js';
import { RpcGasPriceSource } from './pricing.js';
import { ConfiguredPriceSource, type NativeFeedSource } from './feedPricing.js';
import { CanonicalSourceChecks, type SourcePair } from './sourceChecks.js';
import { RelayerHttpServer } from './server.js';
import { RelayerService, lossCleanReserve } from './service.js';
import type { PolicyGate } from './policy.js';
import { ConfigError } from './secrets.js';
import { FileStateBackend, MemoryStateBackend, StateError, StateJournal, StateLockLost, acquireStateLock, type StateLock } from './stateStore.js';
import { hostname } from 'node:os';

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
  /** Replaces configured read-only source clients in tests. Required source entries still fail closed if absent. */
  readonly sourceClients?: ReadonlyMap<number, { readonly primary: RpcClient; readonly secondary?: RpcClient }>;
  readonly now?: () => number;
  /** Monotonic ms clock for breaker, limiters and loss budget (default: `now` when given, else `performance.now`). */
  readonly monotonic?: () => number;
  /** Replaces the config-driven alert sink (tests). */
  readonly alerts?: AlertSink;
  /** Replaces the config-driven state journal (tests). When given, no lock file is taken. */
  readonly journal?: StateJournal;
  /**
   * Called once when the state lock is lost (another process took it, or heartbeats failed for too long). The process
   * entry point drains and exits non-zero so the supervisor restarts it. Default: stop admitting work.
   */
  readonly onLockLost?: () => void;
}

/** A wired relayer. */
export interface Relayer {
  readonly service: RelayerService;
  readonly server: RelayerHttpServer;
  readonly metricsServer?: MetricsHttpServer;
  readonly metrics: Metrics;
  /** Stops process-lifetime maintenance timers and releases the state lock. */
  dispose(): void;
}

/** How often the single-writer lock heartbeat is refreshed (the lock goes stale after 30 s). */
const LOCK_HEARTBEAT_MS = 10_000;
/** Without a successful heartbeat for this long another process may take the lock over: treat it as lost. */
const LOCK_GIVE_UP_MS = 25_000;

/**
 * Opens the state journal named by the config: a locked file journal, or an in-memory one for `state.ephemeral`.
 *
 * @throws {StateError} when the file is locked by another process, unreadable or invalid (startup must stop).
 */
export function openJournal(config: RelayerConfig, now: () => number): { journal: StateJournal; lock: StateLock | undefined } {
  if (config.stateFile === undefined) return { journal: new StateJournal(new MemoryStateBackend(), now), lock: undefined };
  const lock = acquireStateLock(config.stateFile, { pid: process.pid, host: hostname(), now });
  try {
    // Fencing: every journal write first checks that the lock still carries this process's token.
    return { journal: new StateJournal(new FileStateBackend(config.stateFile), now, () => lock.assertHeld()), lock };
  } catch (e) {
    lock.release();
    throw e;
  }
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
export async function buildChainClients(config: RelayerConfig, hotKey: Uint8Array, metrics?: Metrics, now: () => number = monotonicNow): Promise<Map<number, ChainClient>> {
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
    const transport = http(c.rpcUrl, { timeout: 10_000, retryCount: 1, ...(metrics === undefined ? {} : { fetchFn: timedRpcFetch(metrics, c.chainId, now) }) });
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ chain, transport, account });
    out.set(c.chainId, createViemChainClient({ publicClient, walletClient, account, chain }));
  }
  return out;
}

/** Builds only explicitly requested read-only sources, with bounded requests and periodic chain-id checks. */
export async function buildSourceClients(config: RelayerConfig): Promise<Map<number, { primary: RpcClient; secondary?: RpcClient }>> {
  const sources = new Map<number, { primary: RpcClient; secondary?: RpcClient }>();
  for (const chain of config.chains) {
    if (chain.secondaryRpcUrl === undefined && chain.nativeUsdFeed === undefined) continue;
    const descriptor = findChain(chain.chainId) ?? { chainId: chain.chainId, name: chain.name, nativeSymbol: 'ETH', nativeDecimals: 18, testnet: true, enabled: true, finalityDepth: 1, getLogsMaxRange: 1000, blockTimeMs: 1000 };
    const options = { allowInsecureLocalhost: config.allowInsecureLocalhostRpc, timeoutMs: 10_000, maxResponseBytes: 64 * 1024, retries: 0 };
    const primary = await createClient(descriptor, chain.rpcUrl, options);
    const secondary = chain.secondaryRpcUrl === undefined ? undefined : await createClient(descriptor, chain.secondaryRpcUrl, options);
    sources.set(chain.chainId, { primary, ...(secondary === undefined ? {} : { secondary }) });
  }
  return sources;
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
  const mono = d.monotonic ?? d.now ?? monotonicNow;
  const metrics = new Metrics();
  const clients = d.clients ?? (await buildChainClients(d.config, d.hotKey, metrics, mono));
  const hasher = new KeyHasher(d.config.rateLimit.saltRotationHours * 3_600_000, mono);
  const alerts =
    d.alerts ??
    (d.config.alertWebhookUrl === undefined || d.config.alertWebhookSecret === undefined || d.config.alertWebhookAllowedHosts === undefined
      ? nullAlerts
      : createWebhookAlerts({ url: d.config.alertWebhookUrl, secret: d.config.alertWebhookSecret, allowedHosts: d.config.alertWebhookAllowedHosts, logger: d.logger, now: mono }));
  const sourceClients = d.sourceClients ?? await buildSourceClients(d.config);
  const pairs = new Map<number, SourcePair>();
  const feeds = new Map<number, NativeFeedSource>();
  const fixed = new Map<number, bigint>();
  for (const chain of d.config.chains) {
    const clientsForChain = sourceClients.get(chain.chainId);
    if (chain.secondaryRpcUrl !== undefined) {
      if (clientsForChain?.secondary === undefined) throw new ConfigError('configured secondary RPC is unavailable');
      pairs.set(chain.chainId, { primary: clientsForChain.primary, secondary: clientsForChain.secondary, finalityDepth: findChain(chain.chainId)?.finalityDepth ?? 1 });
    }
    if (chain.nativeUsdFeed !== undefined) {
      if (clientsForChain === undefined || clientsForChain.primary.chainId !== chain.chainId) throw new ConfigError('configured native/USD reader is unavailable');
      feeds.set(chain.chainId, { ...chain.nativeUsdFeed, reader: createAggregatorReader(clientsForChain.primary) });
    } else if (chain.nativeUsdMicro !== undefined) fixed.set(chain.chainId, chain.nativeUsdMicro);
    else throw new ConfigError('native/USD price source is missing');
  }
  const lb = d.config.lossBudget;
  const lossBudget = new LossBudget(
    { windowMs: lb.windowSeconds * 1000, perKeyLimit: lb.perKeyWei, globalLimit: lb.globalWei, maxKeys: lb.maxKeys, cleanReserve: lossCleanReserve(lb.globalWei) },
    mono,
  );
  const opened = d.journal === undefined ? openJournal(d.config, now) : { journal: d.journal, lock: undefined };
  const rl = d.config.rateLimit;
  const ipLimiter = new RateLimiter({ perMinute: rl.ipPerMinute, burst: rl.ipBurst, maxKeys: rl.maxKeys }, hasher, mono);
  const ownerLimiter = new RateLimiter({ perMinute: rl.ownerPerMinute, burst: rl.ownerBurst, maxKeys: rl.maxKeys }, hasher, mono);
  const quoteGroupLimiter = new RateLimiter({ perMinute: rl.quoteGroupPerMinute, burst: rl.quoteGroupBurst, maxKeys: rl.maxKeys }, hasher, mono);
  const service = new RelayerService({
    config: d.config,
    clients,
    quoteSecret: d.quoteSecret,
    ...(d.previousQuoteSecret === undefined ? {} : { previousQuoteSecret: d.previousQuoteSecret }),
    gasPrices: new RpcGasPriceSource(clients),
    tokenPrices: new ConfiguredPriceSource(fixed, feeds, alerts, metrics, now),
    sourceChecks: new CanonicalSourceChecks(pairs, alerts, metrics),
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
    journal: opened.journal,
  });
  const server = new RelayerHttpServer({ config: d.config, service, ipLimiter, quoteGroupLimiter, alerts, logger: d.logger, metrics, monotonic: mono });
  const metricsServer = d.config.metricsEnabled ? new MetricsHttpServer(d.config, metrics) : undefined;
  const rotationTimer = setInterval(() => hasher.refresh(), Math.min(d.config.rateLimit.saltRotationHours * 3_600_000, 60_000));
  rotationTimer.unref();
  const lock = opened.lock;
  let lockTimer: NodeJS.Timeout | undefined;
  if (lock !== undefined) {
    let lastBeat = now();
    const lost = (): void => {
      d.logger.log('error', 'state_lock_lost', { errorClass: 'state_lock_lost' });
      clearInterval(lockTimer);
      // Journal writes are fenced already (no new send can start); this ends the process or its admission.
      if (d.onLockLost !== undefined) d.onLockLost();
      else void service.shutdown();
    };
    lockTimer = setInterval(() => {
      try {
        lock.heartbeat();
        lastBeat = now();
      } catch (e) {
        if (e instanceof StateLockLost) return lost();
        if (!(e instanceof StateError)) throw e;
        // Transient I/O trouble: retry on the next beat, but give up before the lock can go stale.
        metrics.inc('relayer_state_lock_heartbeat_failures_total');
        d.logger.log('warn', 'state_lock_heartbeat_failed', { errorClass: 'state_lock_heartbeat_failed' });
        if (now() - lastBeat >= LOCK_GIVE_UP_MS) lost();
      }
    }, LOCK_HEARTBEAT_MS);
    lockTimer.unref();
  }
  return {
    service,
    server,
    ...(metricsServer === undefined ? {} : { metricsServer }),
    metrics,
    dispose: () => {
      alerts.close?.();
      clearInterval(rotationTimer);
      if (lockTimer !== undefined) clearInterval(lockTimer);
      lock?.release();
    },
  };
}
