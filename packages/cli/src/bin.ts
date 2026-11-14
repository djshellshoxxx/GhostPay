#!/usr/bin/env node
import process from 'node:process';
import { createNodeIo } from './node-io.js';
import { run } from './run.js';

// Keep raw bytes so the adapter can reject malformed UTF-8 and preserve body bytes.
// A closed pipe is an I/O failure, without an uncaught stack or echoed payload.
process.stdout.on('error', () => { process.exitCode = 3; });
process.stderr.on('error', () => { process.exitCode = 3; });
const io = createNodeIo({
  env: process.env,
  version: process.versions.node,
  write: (stream, text) => {
    process[stream].write(text);
  },
  stdin: process.stdin,
});
process.exitCode = await run(process.argv.slice(2), io);
