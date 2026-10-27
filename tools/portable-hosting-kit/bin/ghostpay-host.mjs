#!/usr/bin/env node
// @ts-check
// GhostPay portable hosting kit CLI. See ../README.md. Runs on Node.js >= 22 with no dependencies.
import { main } from '../src/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
