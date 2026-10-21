import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ChainAdapterError, assertManifestVerified, createClient, findChain, verifyManifest, type ChainConfig } from '@ghostpay/chain-adapters';
import { createViemChainClient, type ChainClient } from './chain.js';
import { DEV_CHAIN_ID, type RelayerConfig } from './config.js';
import { KeyHasher, RateLimiter } from './limiter.js';
import { nullLogger, type Logger } from './log.js';
import { FixedStablePriceSource, RpcGasPriceSource } from './pricing.js';
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
  readonly logger: Logger;
  readonly policy?: PolicyGate;
  /** Replaces the real chain clients (tests). */
  readonly clients?: ReadonlyMap<number, ChainClient>;
  readonly now?: () => number;
}

/** A wired relayer. */
export interface Relayer {
  readonly service: RelayerService;
  readonly server: RelayerHttpServer;
}

function hex(b: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(b).toString('hex')}`;
}

/**
 * Builds viem-backed clients for every configured chain and verifies each endpoint reports the
 * configured chain id (via the chain-adapters RPC client) before anything is served.
 *
 * Chains with a deployment manifest are then READ BACK from the chain (`verifyManifest`): fee recipient, announcer,
 * fee bps and the runtime code hash of the router and the sweep relayer must equal the manifest, otherwise startup
 * fails closed (N-07 remainder). Chains without a manifest (dev/test configs naming `sweepRelayer` only) keep the
 * weaker "has contract code" check and a warning.
 *
 * @param config Resolved configuration.
 * @param hotKey Hot key bytes.
 * @param logger Receives `manifest_readback_failed` (error) / `manifest_readback_ok` (info) / `manifest_unverified` (warn).
 * @returns Chain clients by chain id.
 * @throws {ChainAdapterError} `CHAIN_MISMATCH` / `RPC_FAILURE` when an endpoint is wrong or down;
 *   `MANIFEST_READBACK_FAILED` (message names the failed checks, no chain values) when the chain disagrees with the manifest.
 */
export async function buildChainClients(config: RelayerConfig, hotKey: Uint8Array, logger: Logger = nullLogger): Promise<Map<number, ChainClient>> {
  const account = privateKeyToAccount(hex(hotKey));
  const out = new Map<number, ChainClient>();
  for (const c of config.chains) {
    const known: ChainConfig =
      findChain(c.chainId) ??
      { chainId: DEV_CHAIN_ID, name: c.name, nativeSymbol: 'ETH', nativeDecimals: 18, testnet: true, enabled: true, finalityDepth: 1, getLogsMaxRange: 1000, blockTimeMs: 1000 };
    const rpc = await createClient(known, c.rpcUrl, { allowInsecureLocalhost: config.allowInsecureLocalhostRpc });
    if (c.manifest !== undefined) {
      try {
        assertManifestVerified(await verifyManifest(c.manifest, [rpc]));
      } catch (e) {
        logger.log('error', 'manifest_readback_failed', { chainId: c.chainId, errorClass: 'manifest_readback_failed' });
        throw e;
      }
      logger.log('info', 'manifest_readback_ok', { chainId: c.chainId });
    } else {
      logger.log('warn', 'manifest_unverified', { chainId: c.chainId });
    }
    const chain = defineChain({ id: c.chainId, name: c.name, nativeCurrency: { name: 'Native', symbol: known.nativeSymbol, decimals: 18 }, rpcUrls: { default: { http: [c.rpcUrl] } } });
    const transport = http(c.rpcUrl, { timeout: 10_000, retryCount: 1 });
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ chain, transport, account });
    // N-07: refuse to sign sweeps against an address that has no contract code on this RPC.
    const code = await publicClient.getCode({ address: c.sweepRelayer }).catch(() => undefined);
    if (code === undefined || code === '0x') throw new ChainAdapterError('RPC_FAILURE', 'sweep relayer has no contract code on the configured RPC');
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
  const now = d.now ?? Date.now;
  const clients = d.clients ?? (await buildChainClients(d.config, d.hotKey, d.logger));
  const hasher = new KeyHasher(d.config.rateLimit.saltRotationHours * 3_600_000, now);
  const rl = d.config.rateLimit;
  const ipLimiter = new RateLimiter({ perMinute: rl.ipPerMinute, burst: rl.ipBurst, maxKeys: rl.maxKeys }, hasher, now);
  const ownerLimiter = new RateLimiter({ perMinute: rl.ownerPerMinute, burst: rl.ownerBurst, maxKeys: rl.maxKeys }, hasher, now);
  const service = new RelayerService({
    config: d.config,
    clients,
    quoteSecret: d.quoteSecret,
    gasPrices: new RpcGasPriceSource(clients),
    tokenPrices: new FixedStablePriceSource(new Map(d.config.chains.map((c) => [c.chainId, c.nativeUsdMicro]))),
    ownerLimiter,
    ...(d.policy === undefined ? {} : { policy: d.policy }),
    logger: d.logger,
    now,
    version: RELAYER_VERSION,
  });
  const server = new RelayerHttpServer({ config: d.config, service, ipLimiter, logger: d.logger });
  return { service, server };
}
