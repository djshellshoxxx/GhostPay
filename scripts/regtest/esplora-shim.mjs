#!/usr/bin/env node
// Minimal Esplora-compatible HTTP server in front of a bitcoind REGTEST node (see esplora-shim-lib.mjs).
// REGTEST ONLY: it refuses to start against any other chain. Binds to 127.0.0.1 unless SHIM_HOST is set.
// Env: BITCOIND_RPC_URL (default http://127.0.0.1:18443), BITCOIND_RPC_USER, BITCOIND_RPC_PASSWORD (required), SHIM_PORT (3002), SHIM_HOST.
import { createServer } from 'node:http';
import { createHandler } from './esplora-shim-lib.mjs';

const url = process.env.BITCOIND_RPC_URL ?? 'http://127.0.0.1:18443';
const user = process.env.BITCOIND_RPC_USER;
const pass = process.env.BITCOIND_RPC_PASSWORD;
if (user === undefined || pass === undefined) {
  console.error('set BITCOIND_RPC_USER and BITCOIND_RPC_PASSWORD (see scripts/regtest/README.md)');
  process.exit(2);
}
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
let id = 0;

export async function rpc(method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify({ jsonrpc: '1.0', id: ++id, method, params }),
  });
  const body = await res.json().catch(() => ({ error: { message: `HTTP ${String(res.status)}` } }));
  if (body.error) throw new Error(body.error.message ?? 'rpc error');
  return body.result;
}

const chain = await rpc('getblockchaininfo', []);
if (chain.chain !== 'regtest') {
  console.error(`refusing to run: bitcoind reports chain "${String(chain.chain)}", not regtest`);
  process.exit(3);
}

const handle = createHandler(rpc);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }
  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > 4_000_000) req.destroy();
  });
  req.on('end', () => {
    void handle(req.method ?? 'GET', (req.url ?? '/').split('?')[0], body).then((r) => {
      res.writeHead(r.status, { ...CORS, 'content-type': r.type }).end(r.body);
    });
  });
});
const port = Number(process.env.SHIM_PORT ?? 3002);
server.listen(port, process.env.SHIM_HOST ?? '127.0.0.1', () => {
  console.log(`esplora shim for regtest listening on ${process.env.SHIM_HOST ?? '127.0.0.1'}:${String(port)}`);
});
