#!/usr/bin/env node
// @ts-check
// GhostPay portable hosting kit CLI. See ../README.md. Runs on Node.js >= 22 with no dependencies.
import { main } from '../src/cli.mjs';

// A closed stdout/stderr (e.g. `ghostpay-host verify f.zip | head`) is not an error worth a stack trace.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (/** @type {NodeJS.ErrnoException} */ e) => {
    if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0);
    throw e;
  });
}

process.exitCode = await main(process.argv.slice(2));
