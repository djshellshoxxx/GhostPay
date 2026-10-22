#!/usr/bin/env node
import process from 'node:process';
import { createNodeIo } from './node-io.js';
import { run } from './run.js';

process.stdin.setEncoding('utf8');
const io = createNodeIo({
  env: process.env,
  version: process.versions.node,
  write: (stream, text) => {
    process[stream].write(text);
  },
  stdin: process.stdin,
});
process.exitCode = await run(process.argv.slice(2), io);
