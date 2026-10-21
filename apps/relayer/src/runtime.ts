import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient, findChain, type ChainConfig } from '@ghostpay/chain-adapters';
import { FailureBudgets } from './abuse.js';
import { WebhookAlertSink, createHttpsPoster, nullAlertSink, validateWebhookUrl, type AlertSink, type Poster } from './alerts.js';
import { createViemChainClient, type ChainClient } from './chain.js';
import { DEV_CHAIN_ID, type RelayerConfig } from './config.js';
import { KeyHasher, RateLimiter } from './limiter.js';
import type { Logger } from './log.js';
import { FixedStablePriceSource, RpcGasPriceSource } from './pricing.js';
import { makeKeyring } from './quoteToken.js';
import { ConfigError } from './secrets.js';
import { RelayerHttpServer } from './server.js';
import { RelayerService } from './service.js';
import type { PolicyGate } from './policy.js';

/** Version string reported by `/v1/info`. */
export const RELAYER_VERSION = '0.1.0';

/** Injected pieces for {@link buildRelayer}. */
export interface RuntimeDeps {
  readonly config: RelayerConfig;
  /** 32-byte hot key. */
  readonly hotKey: Uint8Array;
  readonly quoteSecret: Uint8Array;
  /** Previous quote secret, accepted for verification only during a rotation window. */
  readonly previousQuoteSecret?: Uint8Array;
  readonly logger: Logger;
  /** Replaces the webhook sink built from `config.alerts` (tests). */
  readonly alertSink?: AlertSink;
  /** Replaces the HTTPS transport of the webhook sink (tests). */
  readonly alertPost?: Poster;
  readonly policy?: PolicyGate;
  /** Replaces the real chain clients (tests). */
  readonly clients?: ReadonlyMap<number, ChainClient>;
  readonly now?: () => number;
}

/** A wired relayer. */
export interface Relayer {
  readonly service: RelayerService;
  readonly server: RelayerHttpServer;
  /** Stops background timers (salt rotation, balance monitor). The timers are unref'd, this is for tidy shutdown and tests. */
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
 * @throws {ChainAdapterError} `CHAIN_MISMATCH` / `RPC_FAILURE` when an endpoint is wrong or down.
 */
export async function buildChainClients(config: RelayerConfig, hotKey: Uint8Array): Promise<Map<number, ChainClient>> {
  const account = privateKeyToAccount(hex(hotKey));
  const out = new Map<number, ChainClient>();
  for (const c of config.chains) {
    const known: ChainConfig =
      findChain(c.chainId) ??
      { chainId: DEV_CHAIN_ID, name: c.name, nativeSymbol: 'ETH', nativeDecimals: 18, testnet: true, enabled: true, finalityDepth: 1, getLogsMaxRange: 1000, blockTimeMs: 1000 };
    await createClient(known, c.rpcUrl, { allowInsecureLocalhost: config.allowInsecureLocalhostRpc });
    const chain = defineChain({ id: c.chainId, name: c.name, nativeCurrency: { name: 'Native', symbol: known.nativeSymbol, decimals: 18 }, rpcUrls: { default: { http: [c.rpcUrl] } } });
    const transport = http(c.rpcUrl, { timeout: 10_000, retryCount: 1 });
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ chain, transport, account });
    out.set(c.chainId, createViemChainClient({ publicClient, walletClient, account, chain }));
  }
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && Buffer.from(a).equals(Buffer.from(b));
}

/**
 * Refuses a quote secret that is, or starts with, the hot signing key: the HMAC key and the funds key must be
 * independent so that exposing one does not hand over the other.
 */
function assertSecretsIndependent(hotKey: Uint8Array, secrets: readonly Uint8Array[]): void {
  for (const q of secrets) {
    if (sameBytes(q, hotKey) || (q.length > hotKey.length && sameBytes(q.subarray(0, hotKey.length), hotKey))) {
      throw new ConfigError('quote secret must differ from the hot key');
    }
  }
}

/**
 * Wires limiter, price sources, service and HTTP server.
 *
 * @param d Dependencies.
 * @returns The relayer (not yet listening).
 * @throws {ConfigError} when the quote secret(s) equal or embed the hot key, or the previous secret equals the current one.
 */
export async function buildRelayer(d: RuntimeDeps): Promise<Relayer> {
  assertSecretsIndependent(d.hotKey, d.previousQuoteSecret === undefined ? [d.quoteSecret] : [d.quoteSecret, d.previousQuoteSecret]);
  let quoteKeys;
  try {
    quoteKeys = makeKeyring(d.quoteSecret, d.previousQuoteSecret);
  } catch {
    throw new ConfigError('previous quote secret must differ from the current one');
  }
  const now = d.now ?? Date.now;
  const clients = d.clients ?? (await buildChainClients(d.config, d.hotKey));
  const rotationMs = d.config.rateLimit.saltRotationHours * 3_600_000;
  const hasher = new KeyHasher(rotationMs, now);
  const rl = d.config.rateLimit;
  const ipLimiter = new RateLimiter({ perMinute: rl.ipPerMinute, burst: rl.ipBurst, maxKeys: rl.maxKeys }, hasher, now);
  const ownerLimiter = new RateLimiter({ perMinute: rl.ownerPerMinute, burst: rl.ownerBurst, maxKeys: rl.maxKeys }, hasher, now);
  const quoteLimiter = new RateLimiter({ perMinute: rl.quotePerMinute, burst: rl.quoteBurst, maxKeys: 16 }, hasher, now);
  const ab = d.config.abuse;
  const abuse = new FailureBudgets(
    { ownerMax: ab.ownerMaxFailures, destinationMax: ab.destinationMaxFailures, windowMs: ab.windowSeconds * 1000, maxKeys: rl.maxKeys },
    hasher,
    now,
  );
  let alerts: AlertSink = d.alertSink ?? nullAlertSink;
  const hook = d.config.alerts.webhookUrl;
  if (d.alertSink === undefined && hook !== undefined) {
    alerts = new WebhookAlertSink(validateWebhookUrl(hook), {
      cooldownMs: d.config.alerts.cooldownSeconds * 1000,
      now,
      post: d.alertPost ?? createHttpsPoster({ timeoutMs: 5000 }),
      logger: d.logger,
    });
  }
  const service = new RelayerService({
    config: d.config,
    clients,
    quoteKeys,
    gasPrices: new RpcGasPriceSource(clients),
    tokenPrices: new FixedStablePriceSource(new Map(d.config.chains.map((c) => [c.chainId, c.nativeUsdMicro]))),
    ownerLimiter,
    abuse,
    alerts,
    ...(d.policy === undefined ? {} : { policy: d.policy }),
    logger: d.logger,
    now,
    version: RELAYER_VERSION,
  });
  const server = new RelayerHttpServer({ config: d.config, service, ipLimiter, quoteLimiter, logger: d.logger });
  // Eager salt rotation: a quiet relayer must not keep expired buckets in memory.
  hasher.startTimer(Math.min(60_000, rotationMs));
  service.startMonitor(60_000);
  return {
    service,
    server,
    dispose: () => {
      hasher.stopTimer();
      service.stopMonitor();
    },
  };
}
