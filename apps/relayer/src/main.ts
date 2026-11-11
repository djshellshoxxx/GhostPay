import { privateKeyToAccount } from 'viem/accounts';
import { loadConfigFile, parseReleaseKeys } from './config.js';
import { createLogger } from './log.js';
import { buildRelayer } from './runtime.js';
import { HOT_KEY_SOURCE, QUOTE_SECRET_PREVIOUS_SOURCE, QUOTE_SECRET_SOURCE, loadOptionalSecret, loadSecret } from './secrets.js';

/** Process entry point: `node dist/main.js`. Excluded from coverage (thin glue over tested modules). */
async function main(): Promise<void> {
  const logger = createLogger((line) => process.stdout.write(`${line}\n`));
  const env = process.env;
  const hotKey = loadSecret(env, HOT_KEY_SOURCE);
  const quoteSecret = loadSecret(env, QUOTE_SECRET_SOURCE);
  const previousQuoteSecret = loadOptionalSecret(env, QUOTE_SECRET_PREVIOUS_SOURCE);
  const hotKeyAddress = privateKeyToAccount(`0x${Buffer.from(hotKey).toString('hex')}`).address;
  const releaseKeys = parseReleaseKeys(env['GHOSTPAY_RELEASE_PUBKEYS']);
  const config = loadConfigFile(env['RELAYER_CONFIG'] ?? './relayer.config.json', env['DEPLOYMENTS_DIR'] ?? '../../deployments', { env, hotKeyAddress, releaseKeys });
  let stopping = false;
  // `exitCode` 1 after a lost state lock, so `Restart=on-failure` / the container policy brings the relayer back.
  const stop = (exitCode = 0): void => {
    if (stopping) return;
    stopping = true;
    logger.log('info', 'shutdown_started', {});
    // Drain first (queued and in-flight sweeps still write the journal), then release the state lock: releasing it
    // earlier would let a starting replacement take the state over while this process still writes it.
    relayer.server.close().then(
      () => {
        relayer.dispose();
        process.exit(exitCode);
      },
      () => {
        relayer.dispose();
        process.exit(1);
      },
    );
  };
  const relayer = await buildRelayer({
    config, hotKey, quoteSecret, ...(previousQuoteSecret === undefined ? {} : { previousQuoteSecret }), logger,
    onLockLost: () => stop(1),
  });
  await relayer.server.listen();
  logger.log('info', 'listening', {});
  process.on('SIGTERM', () => stop());
  process.on('SIGINT', () => stop());
}

// Node's default process diagnostics can expose provider URLs or request details; emit only a fixed class.
for (const event of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(event, () => {
    process.stderr.write(`fatal: ${event}\n`);
    process.exit(1);
  });
}

main().catch((e: unknown) => {
  // Startup errors name variables/paths only (ConfigError); never print arbitrary objects.
  const msg = e instanceof Error && (e.name === 'ConfigError' || e.name === 'ChainAdapterError' || e.name === 'StateError') ? e.message : 'startup failed';
  process.stderr.write(`fatal: ${msg}\n`);
  process.exit(1);
});
