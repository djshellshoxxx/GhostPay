#!/usr/bin/env node
import { runCli } from './cli.js';

/** Process entry point (`ghostpay-ops-monitor`). Thin glue over the tested {@link runCli}; excluded from coverage. */
runCli(process.argv.slice(2), process.env).then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.stderr.write('fatal: unexpected error\n');
    process.exitCode = 3;
  },
);
