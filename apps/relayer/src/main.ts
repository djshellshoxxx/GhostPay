import { privateKeyToAccount } from 'viem/accounts';
import { loadConfigFile } from './config.js';
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
  const config = loadConfigFile(env['RELAYER_CONFIG'] ?? './relayer.config.json', env['DEPLOYMENTS_DIR'] ?? '../../deployments', { env, hotKeyAddress });
  const relayer = await buildRelayer({ config, hotKey, quoteSecret, ...(previousQuoteSecret === undefined ? {} : { previousQuoteSecret }), logger });
  await relayer.server.listen();
  logger.log('info', 'listening', {});
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    logger.log('info', 'shutdown_started', {});
    relayer.dispose();
    relayer.server.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
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
  const msg = e instanceof Error && (e.name === 'ConfigError' || e.name === 'ChainAdapterError') ? e.message : 'startup failed';
  process.stderr.write(`fatal: ${msg}\n`);
  process.exit(1);
});
