// Logic bug PoC: after the breaker opens and the cooldown elapses, ONE probe request that ends in a user-class error
// (simulation revert, gas_limit_too_high, budget_exhausted, gas_price_too_high ...) never records success/failure, so the breaker
// stays 'half_open' forever: CircuitBreaker.allow() returns false for half_open, every later sweep gets 503 breaker_open,
// while /healthz keeps reporting "ok" (it only treats 'open' as degraded).
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { privateKeyToAccount } from 'viem/accounts';
import { buildSweepTypedData } from '@ghostpay/chain-adapters';
const dist = path.resolve(process.env.RELAYER_DIST);
const { buildRelayer, createLogger, SimulationRevert } = await import(pathToFileURL(path.join(dist, 'index.js')).href);

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e', SWEEPER = '0x5FbDB2315678afecb367f032d93F642f64180aa3', FEE_TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', DEST = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const clock = { ms: 1_900_000_000_000 };
const fake = { chainId: 84532, relayerAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', balance: 10n ** 18n, simulateError: undefined, n: 0,
  getGasPrice: async () => 10n ** 9n, getBalance: async function () { return fake.balance; }, getPendingNonce: async () => 1,
  simulateSweep: async () => { if (fake.simulateError) throw fake.simulateError; return { gasLimit: 150000n }; },
  sendSweep: async () => '0x' + (++fake.n).toString(16).padStart(64, '0'), waitForReceipt: async () => ({ status: 'success', gasUsed: 100000n }) };
const config = { host: '127.0.0.1', port: 0, allowedOrigins: ['https://app.example'], allowInsecureLocalhostRpc: false, trustProxyHops: 0, quoteTtlSeconds: 120, minDeadlineSeconds: 30, maxDeadlineSeconds: 1800,
  rateLimit: { ipPerMinute: 6000, ipBurst: 1000, ownerPerMinute: 6000, ownerBurst: 1000, maxKeys: 1000, saltRotationHours: 24 },
  breaker: { windowSize: 10, minSamples: 3, failureRatio: 0.5, cooldownSeconds: 60 }, queue: { maxPending: 4, receiptTimeoutSeconds: 30 }, shutdownGraceSeconds: 1,
  chains: [{ chainId: 84532, name: 'Base Sepolia', rpcUrl: 'https://rpc.invalid/', sweepRelayer: SWEEPER, feeTo: FEE_TO, tokens: [{ address: USDC, symbol: 'USDC', decimals: 6, permit: false, usdStable: true }],
    nativeUsdMicro: 3_000_000_000n, gasUnits: { sweep: 100000n, sweepWithPermit: 130000n }, maxGasLimit: 400000n, maxGasPriceWei: 50_000_000_000n, dailyBudgetWei: 10n ** 17n, minBalanceWei: 10n ** 15n }] };
const relayer = await buildRelayer({ config, hotKey: new Uint8Array(32).fill(1), quoteSecret: new Uint8Array(32).fill(2), logger: createLogger(() => {}), clients: new Map([[84532, fake]]), now: () => clock.ms });
const { port } = await relayer.server.listen();
const call = (method, p, body) => new Promise((res) => { const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'content-type': 'application/json' }, agent: false }, (rs) => { let b = ''; rs.on('data', (c) => (b += c)); rs.on('end', () => res({ status: rs.statusCode, body: JSON.parse(b || '{}') })); }); r.end(body ? JSON.stringify(body) : undefined); });
const owner = privateKeyToAccount('0x' + '11'.repeat(32));
let nonce = 0n;
async function trySweep(label) {
  const amount = 1_000_000_000n;
  const q = await call('POST', '/v1/quote', { chainId: 84532, token: USDC, owner: owner.address, destination: DEST, amount: amount.toString() });
  const fee = BigInt(q.body.fee); const deadline = BigInt(Math.floor(clock.ms / 1000) + 600);
  const order = { token: USDC, owner: owner.address, destination: DEST, feeTo: FEE_TO, amount, fee, deadline, nonce: nonce++ };
  const td = buildSweepTypedData(84532, SWEEPER, order);
  const sweepSig = await owner.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message });
  const s = (v) => (typeof v === 'bigint' ? v.toString() : v);
  const r = await call('POST', '/v1/sweep', { chainId: 84532, sweep: Object.fromEntries(Object.entries(order).map(([k, v]) => [k, s(v)])), sweepSig, quoteToken: q.body.quoteToken });
  const h = await call('GET', '/healthz');
  console.log(`${label.padEnd(58)} -> HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 60)} | healthz=${h.body.status} breaker=${h.body.chains[0].breaker}`);
}
await trySweep('1. healthy relayer, valid sweep');
fake.balance = 0n; await trySweep('2. hot-key balance below floor -> breaker trips (expected)');
fake.balance = 10n ** 18n; clock.ms += 61_000;
fake.simulateError = new SimulationRevert('NonceAlreadyUsed'); await trySweep('3. cooldown over; first PROBE is a user-error sweep (reverts in sim)');
fake.simulateError = undefined; await trySweep('4. problem fixed, valid sweep (should succeed, 60 s cooldown long over)');
clock.ms += 3_600_000; await trySweep('5. one hour later, valid sweep (still blocked => permanent until restart)');
process.exit(0);
