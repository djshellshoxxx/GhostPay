// Relayer HTTP-layer probes against the compiled relayer (clean-room build). Usage: RELAYER_DIST=<.../apps/relayer/dist> node poc-05-relayer-http.mjs
import net from 'node:net';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dist = path.resolve(process.env.RELAYER_DIST ?? '../../../apps/relayer/dist');
const { buildRelayer, createLogger, signQuote, verifyQuote } = await import(pathToFileURL(path.join(dist, 'index.js')).href);

const A = (n) => `0x${n.toString(16).padStart(40, '0')}`;
const cfg = (over = {}) => ({
  host: '127.0.0.1', port: 0, allowedOrigins: ['https://app.example'], allowInsecureLocalhostRpc: false, trustProxyHops: 0,
  quoteTtlSeconds: 120, minDeadlineSeconds: 30, maxDeadlineSeconds: 1800,
  rateLimit: { ipPerMinute: 30, ipBurst: 10, ownerPerMinute: 6, ownerBurst: 3, maxKeys: 10000, saltRotationHours: 24 },
  breaker: { windowSize: 20, minSamples: 5, failureRatio: 0.5, cooldownSeconds: 60 }, queue: { maxPending: 16, receiptTimeoutSeconds: 120 }, shutdownGraceSeconds: 2,
  chains: [{ chainId: 84532, name: 'Base Sepolia', rpcUrl: 'https://rpc.invalid/', sweepRelayer: '0x5FbDB2315678afecb367f032d93F642f64180aa3', feeTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    tokens: [{ address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC', decimals: 6, permit: true, usdStable: true }], nativeUsdMicro: 3_000_000_000n,
    gasUnits: { sweep: 100000n, sweepWithPermit: 130000n }, maxGasLimit: 400000n, maxGasPriceWei: 50000000000n, dailyBudgetWei: 10n ** 17n, minBalanceWei: 10n ** 15n }],
  ...over });
const fake = { chainId: 84532, relayerAddress: A(9), getGasPrice: async () => 10n ** 9n, getBalance: async () => 10n ** 18n, getPendingNonce: async () => 1, simulateSweep: async () => ({ gasLimit: 1n }), sendSweep: async () => '0x' + '1'.repeat(64), waitForReceipt: async () => ({ status: 'success', gasUsed: 1n }) };
async function start(over) {
  const relayer = await buildRelayer({ config: cfg(over), hotKey: new Uint8Array(32).fill(1), quoteSecret: new Uint8Array(32).fill(2), logger: createLogger(() => {}), clients: new Map([[84532, fake]]) });
  const addr = await relayer.server.listen(); return { relayer, port: addr.port };
}
const post = (port, body, headers = {}) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port, path: '/v1/quote', method: 'POST', headers: { 'content-type': 'application/json', ...headers }, agent: false }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', (e) => resolve('ERR ' + e.code)); req.setTimeout(3000, () => { req.destroy(); resolve('TIMEOUT'); }); req.end(body);
});
const raw = (port, data, wait = 600) => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1', () => s.write(data)); let out = ''; s.on('data', (d) => (out += d)); s.on('error', () => {}); setTimeout(() => { s.destroy(); resolve(out.split('\r\n')[0] || '(no response)'); }, wait); });
const line = (k, v) => console.log(`${k.padEnd(66)} ${v}`);

// 1. X-Forwarded-For rate-limit bypass when relayer is reachable directly and trustProxyHops=1 (the shipped example config value)
for (const hops of [0, 1]) {
  const { relayer, port } = await start({ trustProxyHops: hops });
  const codes = [];
  for (let i = 0; i < 40; i++) codes.push(await post(port, '{}', { 'x-forwarded-for': `203.0.113.${i + 1}` }));
  line(`40 reqs, one real client, distinct spoofed XFF, trustProxyHops=${hops}`, `429s=${codes.filter((c) => c === 429).length} (400s=${codes.filter((c) => c === 400).length})`);
  await relayer.server.close();
}
// 2. Body-size / framing probes
{
  const { relayer, port } = await start();
  line('17 KiB body (Content-Length)', await post(port, 'x'.repeat(17 * 1024)));
  line('16 KiB of "[" (deep nesting, JSON.parse)', await post(port, '['.repeat(16 * 1024)));
  line('CL+TE smuggling attempt', await raw(port, 'POST /v1/quote HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nGET /healthz HTTP/1.1\r\nHost: x\r\n\r\n'));
  line('duplicate Content-Length', await raw(port, 'POST /v1/quote HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 2\r\nContent-Length: 40\r\n\r\n{}'));
  line('chunked >16 KiB without Content-Length', await raw(port, 'POST /v1/quote HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n' + `${(20000).toString(16)}\r\n${'a'.repeat(20000)}\r\n0\r\n\r\n`, 900));
  line('CORS: Origin https://evil.example on /healthz', await (async () => { const r = await fetch(`http://127.0.0.1:${port}/healthz`, { headers: { origin: 'https://evil.example' } }); return `${r.status} ACAO=${r.headers.get('access-control-allow-origin')}`; })());
  line('CORS: Origin allowed', await (async () => { const r = await fetch(`http://127.0.0.1:${port}/healthz`, { headers: { origin: 'https://app.example' } }); return `${r.status} ACAO=${r.headers.get('access-control-allow-origin')}`; })());
  line('text/plain POST (CORS-simple) rejected', await post(port, '{}', { 'content-type': 'text/plain' }));
  line('__proto__ key in body', await post(port, '{"__proto__":{"x":1},"chainId":1}'));
  await relayer.server.close();
}
// 3. Connection exhaustion: maxConnections=1024, no per-IP cap
{
  const { relayer, port } = await start();
  const socks = [];
  for (let i = 0; i < 1100; i++) { const s = net.connect(port, '127.0.0.1'); s.on('error', () => {}); s.write('POST /v1/quote HTTP/1.1\r\nHost: x\r\n'); socks.push(s); }
  await new Promise((r) => setTimeout(r, 1500));
  line('1100 half-open header connections held by ONE client; legit /healthz', await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/healthz', agent: false }, (res) => { res.resume(); resolve(`served ${res.statusCode}`); });
    req.on('error', (e) => resolve('NOT SERVED: ' + e.code)); req.setTimeout(2500, () => { req.destroy(); resolve('NOT SERVED: timeout (no free connection slot)'); });
  }));
  socks.forEach((s) => s.destroy()); await relayer.server.close();
}
// 4. Quote-token properties
{
  const secret = new Uint8Array(32).fill(7);
  const claims = { chainId: 84532, token: A(5), owner: A(6), destination: A(7), amount: 1000000n, fee: 3000n, feeTo: A(8), expiresAt: 1900000000 };
  const t = signQuote(secret, claims); const [v, exp, fee, mac] = t.split('.');
  const bind = { chainId: 84532, token: A(5), owner: A(6), destination: A(7), amount: 1000000n, feeTo: A(8) };
  line('valid token verifies', JSON.stringify(verifyQuote(secret, t, bind), (_, x) => (typeof x === 'bigint' ? x.toString() : x)));
  line('fee lowered in token', String(verifyQuote(secret, `${v}.${exp}.1.${mac}`, bind)));
  line('expiry extended in token', String(verifyQuote(secret, `${v}.${Number(exp) + 1}.${fee}.${mac}`, bind)));
  line('different destination', String(verifyQuote(secret, t, { ...bind, destination: A(99) })));
  line('NON-CANONICAL: two leading zeros in expiry still verifies', String(verifyQuote(secret, `${v}.00${exp}.${fee}.${mac}`, bind) !== null) + '  (token malleable; harmless: replay is stopped by the contract nonce)');
  line('uppercase MAC hex', String(verifyQuote(secret, `${v}.${exp}.${fee}.${mac.toUpperCase()}`, bind)));
}
process.exit(0);
