// Malicious / hostile RPC fixtures against packages/chain-adapters (dist built from HEAD).
import http from 'node:http';
import { createClient, validateRpcUrl, fetchAnnouncements, findChain, ANNOUNCEMENT_TOPIC, fetchTransport } from '@ghostpay/chain-adapters';
import { generateKeySet, encodeMetaAddress, deriveStealthPayment, buildNativeMetadata } from '@ghostpay/core-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { encodeAbiParameters } from 'viem';

const chain = findChain(84532);
const line = (k, v) => console.log(`${k.padEnd(64)} ${v}`);
const res = async (f) => { try { return 'OK ' + JSON.stringify(await f(), (_, x) => (typeof x === 'bigint' ? x + 'n' : x)).slice(0, 90); } catch (e) { return `${e.name}: ${e.message}`; } };

function rpcServer(handler) {
  return new Promise((resolve) => { const s = http.createServer((req, rs) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => handler(JSON.parse(b), rs, req)); }); s.listen(0, '127.0.0.1', () => resolve({ s, url: `http://127.0.0.1:${s.address().port}/` })); });
}
const ok = (rs, id, result) => { rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ jsonrpc: '2.0', id, result })); };

console.log('--- URL validation');
for (const u of ['https://user:pw@rpc.example/', 'https://rpc.example/#frag', 'http://rpc.example/', 'https://localhost/', 'https://127.0.0.1/', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/', 'https://0x7f.1/', 'https://2130706433/', 'wss://rpc.example/', 'javascript:alert(1)', 'https://rpc.example:99999/'])
  line(u, await res(() => validateRpcUrl(u)));
line('http://localhost with allowInsecureLocalhost', await res(() => validateRpcUrl('http://localhost:8545', { allowInsecureLocalhost: true })));

console.log('--- hostile RPC behaviours (loopback http allowed via explicit dev flag)');
const opts = { allowInsecureLocalhost: true, retries: 0, timeoutMs: 1500, maxResponseBytes: 64 * 1024 };
{ const { s, url } = await rpcServer((q, rs) => ok(rs, q.id, '0x1')); line('wrong chain id (mainnet) at connect', await res(() => createClient(chain, url, opts))); s.close(); }
{ let n = 0; const { s, url } = await rpcServer((q, rs) => ok(rs, q.id, q.method === 'eth_chainId' ? (n++ === 0 ? '0x14a34' : '0x1') : '0x10')); const c = await createClient(chain, url, opts); line('bait-and-switch: chain id correct once, wrong later (client keeps working)', await res(() => c.request('eth_chainId', []))); s.close(); }
{ const { s, url } = await rpcServer((q, rs) => { rs.writeHead(200); rs.end(JSON.stringify({ jsonrpc: '2.0', id: q.id, result: '0x14a34', pad: 'A'.repeat(200000) })); }); line('response > maxBytes (200 KB vs 64 KB cap)', await res(() => createClient(chain, url, opts))); s.close(); }
{ const { s, url } = await rpcServer((q, rs) => { rs.writeHead(200); rs.write('{"jsonrpc":"2.0","id":1,"result":"0x14a34"'); /* never ends: slow-loris body */ }); const t0 = Date.now(); line('never-ending body (slow-loris) with timeout 1500 ms', (await res(() => createClient(chain, url, opts))) + ` after ${Date.now() - t0} ms`); s.closeAllConnections(); s.close(); }
{ const { s, url } = await rpcServer((q, rs) => { rs.writeHead(302, { location: 'https://evil.example/' }); rs.end(); }); line('HTTP redirect to another host', await res(() => createClient(chain, url, opts))); s.close(); }
{ const { s, url } = await rpcServer((q, rs) => { rs.writeHead(200); rs.end(JSON.stringify([{ jsonrpc: '2.0', id: q.id, result: '0x14a34' }])); }); line('batch-array response', await res(() => createClient(chain, url, opts))); s.close(); }
{ const { s, url } = await rpcServer((q, rs) => ok(rs, q.id + 1, '0x14a34')); line('id mismatch', await res(() => createClient(chain, url, opts))); s.close(); }

console.log('--- forged / hostile logs via eth_getLogs');
const seller = generateKeySet(); const pay = deriveStealthPayment(encodeMetaAddress(seller));
const topic = (a) => '0x' + '0'.repeat(24) + a.slice(2).toLowerCase();
const ANN = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';
const mkLog = (over = {}) => ({ address: ANN, topics: [ANNOUNCEMENT_TOPIC, '0x' + '0'.repeat(63) + '1', topic(pay.stealthAddress), topic('0x' + '11'.repeat(20))],
  data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], ['0x' + bytesToHex(pay.ephemeralPublicKey), '0x' + bytesToHex(buildNativeMetadata(pay.viewTag, 5n))]),
  blockNumber: '0x5', blockHash: '0x' + 'ab'.repeat(32), logIndex: '0x0', transactionHash: '0x' + 'cd'.repeat(32), removed: false, ...over });
async function scenario(name, logs, blockHashFn = (n) => '0x' + 'ab'.repeat(32)) {
  const { s, url } = await rpcServer((q, rs) => {
    if (q.method === 'eth_chainId') return ok(rs, q.id, '0x14a34');
    if (q.method === 'eth_blockNumber') return ok(rs, q.id, '0x10');
    if (q.method === 'eth_getBlockByNumber') { const n = BigInt(q.params[0]); return ok(rs, q.id, { number: q.params[0], hash: blockHashFn(n), parentHash: '0x' + '00'.repeat(32) }); }
    if (q.method === 'eth_getLogs') return ok(rs, q.id, logs);
  });
  const client = await createClient(chain, url, opts);
  line(name, await res(async () => { const r = await fetchAnnouncements({ chain, client, announcer: ANN, cursor: { nextBlock: 0n } }); return { n: r.announcements.length, skipped: r.skipped }; }));
  s.close();
}
await scenario('honest log', [mkLog()]);
await scenario('wrong emitter', [mkLog({ address: '0x' + '22'.repeat(20) })]);
await scenario('removed=true', [mkLog({ removed: true })]);
await scenario('block outside requested range', [mkLog({ blockNumber: '0x9999' })]);
await scenario('duplicate log ids (same blockHash:logIndex x2)', [mkLog(), mkLog()]);
await scenario('log blockHash != canonical hash of that block (forged hash)  <-- ACCEPTED', [mkLog({ blockHash: '0x' + 'ee'.repeat(32) })]);
await scenario('entirely fabricated log (no tx exists)  <-- ACCEPTED, only a 2nd RPC could tell', [mkLog({ transactionHash: '0x' + '99'.repeat(32) })]);
await scenario('garbage data field', [mkLog({ data: '0x1234' })]);
await scenario('uppercase topic hash', [mkLog({ topics: mkLog().topics.map((t, i) => (i === 0 ? t.toUpperCase().replace('0X', '0x') : t)) })]);
await scenario('1,000 hostile logs (skip, do not throw)', Array.from({ length: 1000 }, (_, i) => mkLog({ data: '0x', logIndex: '0x' + i.toString(16) })));
process.exit(0);
