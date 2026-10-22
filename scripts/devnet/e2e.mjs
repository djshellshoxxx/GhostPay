#!/usr/bin/env node
// Full scripted GhostPay end-to-end on the local anvil devnet (chain 31337). Uses ONLY the public anvil dev
// accounts (no real keys or funds). Flow: seller keygen -> signed invoices -> pay (ETH, ERC-20 approve,
// ERC-20 permit) -> scan -> direct sweeps -> relayer-sponsored sweeps (real apps/relayer process).
//
// Usage: node scripts/devnet/e2e.mjs [--write-log]   (run scripts/devnet/up.sh first; `npm run build:libs` done)
// Env: DEVNET_PORT (8545), E2E_RELAYER_PORT (18787).
// Note: chain-adapters' fixed chain table has no 31337 entry. Router calldata does not contain the chain id, so
// payments are BUILT under the Base Sepolia (84532) alias and EXECUTED on 31337. Sweep/permit EIP-712 signatures
// use the real chain id 31337.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, parseAbi, parseEther, formatEther } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import {
  checkAnnouncement, deriveStealthPayment, deriveStealthSecret, encodeMetaAddress, generateKeySet, unsafeRevealSecret,
} from '@ghostpay/core-crypto';
import { createInvoice, signInvoice, verifyInvoiceSignature } from '@ghostpay/invoice-schema';
import {
  addressOfSecret, assertPreviewMatchesCalldata, buildPaymentTx, buildPermitTypedData, buildSweepTypedData, createClient,
  decodePaymentCalldata, fetchAnnouncements, findChain, loadDeployment, routerSplit, signPermit, signSweep,
  manifestDigest, verifyObjectManifestSignature,
} from '@ghostpay/chain-adapters';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = resolve(ROOT, 'scripts/devnet/.state');
const state = JSON.parse(readFileSync(resolve(STATE, 'devnet.json'), 'utf8'));
const manifestText = readFileSync(resolve(ROOT, 'deployments/31337.json'), 'utf8');
const manifest = loadDeployment(manifestText, 31337);
const RPC = state.rpcUrl;
const CHAIN_ID = 31337;
const RELAYER_PORT = Number(process.env.E2E_RELAYER_PORT ?? 18787);
const MNEMONIC = 'test test test test test test test test test test test junk'; // public anvil mnemonic
const acct = (i) => mnemonicToAccount(MNEMONIC, { addressIndex: i });
const keyOf = (i) => `0x${Buffer.from(acct(i).getHdKey().privateKey).toString('hex')}`;

const payer = acct(state.accounts.payer);
const funder = acct(state.accounts.sellerFunder);
const hot = acct(state.accounts.relayerHot);
const relayerFeeTo = acct(5);
const sellerDest = acct(6); // seller's cold destination for swept funds
const sweepDest2 = acct(7);

const chain = defineChain({ id: CHAIN_ID, name: 'devnet', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 25 });
const wallet = (account) => createWalletClient({ account, chain, transport: http(RPC) });

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)', 'function mint(address,uint256)', 'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)', 'function name() view returns (string)', 'function nonces(address) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
]);
const routerAbi = parseAbi([
  'function FEE_RECIPIENT() view returns (address)', 'function FEE_BPS() view returns (uint256)',
]);

const results = [];
const txs = [];
const step = (name, detail = '') => { results.push({ name, detail }); console.log(`PASS ${name}${detail ? ` | ${detail}` : ''}`); };
async function sendWait(label, p) {
  const hash = await p;
  const rc = await pub.waitForTransactionReceipt({ hash });
  assert.equal(rc.status, 'success', `${label} reverted`);
  txs.push({ label, hash, block: rc.blockNumber.toString(), gasUsed: rc.gasUsed.toString() });
  return rc;
}
const bal = (t, a) => pub.readContract({ address: t, abi: erc20, functionName: 'balanceOf', args: [a] });

// ---- preflight ----
assert.equal(await pub.getChainId(), CHAIN_ID, 'anvil not on 31337');
assert.equal(getAddress(await pub.readContract({ address: manifest.router, abi: routerAbi, functionName: 'FEE_RECIPIENT' })), manifest.feeRecipient);
assert.equal(await pub.readContract({ address: manifest.router, abi: routerAbi, functionName: 'FEE_BPS' }), 25n);
const T = Object.fromEntries(Object.entries(state.tokens).map(([k, v]) => [k, { ...v, address: getAddress(v.address) }]));
step('preflight', `router=${manifest.router} relayer=${manifest.sweepRelayer} announcer=${manifest.announcer}`);

// ---- chain-adapters views of the devnet ----
const base = findChain(84532);
assert.ok(base, 'alias chain missing');
const devChain = { ...base, chainId: CHAIN_ID, name: 'Local devnet', enabled: true, finalityDepth: 2, blockTimeMs: 1000 };
const aliasDeployment = { ...manifest, chainId: 84532 }; // see header note
const findTokenFn = (_c, a) => Object.values(T).find((t) => t.address.toLowerCase() === a.toLowerCase())
  ? { chainId: 84532, address: a, permit: Object.values(T).find((t) => t.address.toLowerCase() === a.toLowerCase()).permit }
  : undefined;

// ---- seller keygen + signed invoices ----
const keys = generateKeySet();
const meta = encodeMetaAddress(keys);
const signingKey = crypto.getRandomValues(new Uint8Array(32));
const signerHex = Buffer.from((await import('@noble/curves/secp256k1.js')).secp256k1.getPublicKey(signingKey, true)).toString('hex');
const now = Number((await pub.getBlock()).timestamp);
const plan = [
  { id: 'ETH', token: 'native', gross: parseEther('1'), mode: 'native' },
  { id: 'USDC', token: T.USDC.address, gross: 1_000_000_000n, mode: 'permit', t: T.USDC },
  { id: 'USDT', token: T.USDT.address, gross: 500_000_000n, mode: 'approve', t: T.USDT },
  { id: 'DAI', token: T.DAI.address, gross: 200n * 10n ** 18n, mode: 'approve', t: T.DAI },
];
for (const p of plan) {
  const inv = createInvoice({
    chainId: CHAIN_ID, metaAddress: meta, fiat: { currency: 'USD', minorUnits: '100000' },
    token: p.token === 'native' ? 'native' : p.token.toLowerCase(),
    amountPolicy: { mode: 'fixed_token', tokenAmount: p.gross.toString() },
    quote: { source: 'devnet:fixed', timestamp: now, expiresAt: now + 600, maxSlippageBps: 50 },
    expiresAt: now + 3600,
    lineItems: [{ description: `devnet ${p.id} item`, quantity: '1', unitMinorUnits: '100000' }],
    tax: { rateBps: 0, minorUnits: '0' }, feePolicy: 'seller_pays', memo: 'devnet e2e', signer: signerHex,
  });
  const signed = signInvoice(inv, signingKey);
  assert.ok(verifyInvoiceSignature(signed));
  p.invoice = inv;
}
step('seller keygen + invoices', `meta=${meta.slice(0, 20)}... invoices=${plan.length} (signed, signature verified)`);

// ---- fund payer (dev faucet mints) ----
for (const p of plan.filter((x) => x.t)) await sendWait(`mint ${p.id} to payer`, wallet(acct(0)).writeContract({ address: p.t.address, abi: erc20, functionName: 'mint', args: [payer.address, p.gross * 2n] }));

// ---- pay ----
const deadline = BigInt(now + 3000);
const feeBefore = { native: await pub.getBalance({ address: manifest.feeRecipient }) };
for (const p of Object.values(T)) feeBefore[p.address] = await bal(p.address, manifest.feeRecipient);
const paid = [];
for (const p of plan) {
  const payment = deriveStealthPayment(p.invoice.metaAddress);
  let permitSignature;
  if (p.mode === 'permit') {
    const td = await buildPermitTypedData({
      chainId: CHAIN_ID, token: p.token, owner: payer.address, spender: manifest.router, value: p.gross, deadline,
      reader: {
        name: (t) => pub.readContract({ address: t, abi: erc20, functionName: 'name' }),
        version: async () => '1',
        nonce: (t, o) => pub.readContract({ address: t, abi: erc20, functionName: 'nonces', args: [o] }),
        domainSeparator: (t) => pub.readContract({ address: t, abi: erc20, functionName: 'DOMAIN_SEPARATOR' }),
      },
    });
    permitSignature = await payer.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message });
  }
  const built = buildPaymentTx({
    chain: base, deployment: aliasDeployment, invoice: { chainId: 84532, token: p.invoice.token }, payment,
    grossAmount: p.gross, deadline, findTokenFn, ...(permitSignature ? { permitSignature } : {}),
  });
  assertPreviewMatchesCalldata(built.preview, built.tx, 84532);
  decodePaymentCalldata(built.tx, 84532);
  const split = routerSplit(p.gross);
  assert.equal(built.preview.fee, split.fee);
  if (p.mode === 'approve') await sendWait(`approve ${p.id}`, wallet(payer).writeContract({ address: p.t.address, abi: erc20, functionName: 'approve', args: [manifest.router, p.gross] }));
  const before = p.mode === 'native' ? await pub.getBalance({ address: payment.stealthAddress }) : await bal(p.token, payment.stealthAddress);
  const rc = await sendWait(`pay ${p.id} (${built.preview.method})`, wallet(payer).sendTransaction({ to: built.tx.to, data: built.tx.data, value: built.tx.value }));
  const after = p.mode === 'native' ? await pub.getBalance({ address: payment.stealthAddress }) : await bal(p.token, payment.stealthAddress);
  assert.equal(after - before, split.net, `${p.id} stealth received != net`);
  paid.push({ ...p, stealth: payment.stealthAddress, split, payHash: rc.transactionHash });
}
// fee recipient got exactly the fees
const feeNative = (await pub.getBalance({ address: manifest.feeRecipient })) - feeBefore.native;
assert.equal(feeNative, paid.find((x) => x.id === 'ETH').split.fee);
for (const p of paid.filter((x) => x.t)) assert.equal((await bal(p.token, manifest.feeRecipient)) - feeBefore[p.t.address], p.split.fee);
step('pay', paid.map((p) => `${p.id}:gross=${p.gross} fee=${p.split.fee} net=${p.split.net}`).join('; '));
step('router fee parity', 'on-chain deltas equal chain-adapters routerSplit() for all 4 payments');

// ---- scan ----
const rpcClient = await createClient(devChain, RPC, { allowInsecureLocalhost: true });
const scanned = await fetchAnnouncements({ chain: devChain, client: rpcClient, announcer: manifest.announcer, cursor: { nextBlock: 0n } });
const mine = [];
for (const a of scanned.announcements) {
  const hit = checkAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey);
  if (hit.matches) mine.push({ a, secret: deriveStealthSecret(a, keys) });
}
assert.equal(mine.length, plan.length, 'scanner must find exactly the 4 seller payments');
for (const m of mine) {
  assert.equal(addressOfSecret(m.secret), getAddress(m.a.stealthAddress));
  assert.equal(m.a.caller.toLowerCase(), manifest.router.toLowerCase());
}
const secretOf = (stealth) => mine.find((m) => getAddress(m.a.stealthAddress) === getAddress(stealth)).secret;
step('scan', `announcements=${scanned.announcements.length} matched=${mine.length} skipped=${scanned.skipped}`);

// ---- direct sweeps (stealth key signs its own tx) ----
const asAccount = (secret) => privateKeyToAccount(`0x${Buffer.from(unsafeRevealSecret(secret)).toString('hex')}`);
{
  const p = paid.find((x) => x.id === 'ETH');
  const acc = asAccount(secretOf(p.stealth));
  assert.equal(acc.address, getAddress(p.stealth));
  const gp = await pub.getGasPrice();
  const value = p.split.net - 21_000n * gp;
  const before = await pub.getBalance({ address: sellerDest.address });
  await sendWait('direct sweep ETH', wallet(acc).sendTransaction({ to: sellerDest.address, value, gas: 21_000n, gasPrice: gp, type: 'legacy' }));
  assert.equal((await pub.getBalance({ address: sellerDest.address })) - before, value);
  assert.equal(await pub.getBalance({ address: p.stealth }), 0n);
  step('direct sweep ETH', `swept ${formatEther(value)} ETH to ${sellerDest.address}`);
}
{
  const p = paid.find((x) => x.id === 'USDT');
  const acc = asAccount(secretOf(p.stealth));
  await sendWait('fund USDT stealth gas', wallet(funder).sendTransaction({ to: p.stealth, value: parseEther('0.01') }));
  const before = await bal(p.token, sellerDest.address);
  await sendWait('direct sweep USDT', wallet(acc).writeContract({ address: p.token, abi: erc20, functionName: 'transfer', args: [sellerDest.address, p.split.net] }));
  assert.equal((await bal(p.token, sellerDest.address)) - before, p.split.net);
  assert.equal(await bal(p.token, p.stealth), 0n);
  step('direct sweep USDT (gas topped up)', `swept ${p.split.net} base units`);
}

// ---- relayer-sponsored sweeps ----
const secretHex = (b) => `0x${Buffer.from(b).toString('hex')}`;
const cfgPath = resolve(STATE, 'relayer.config.json');
mkdirSync(STATE, { recursive: true });
writeFileSync(cfgPath, JSON.stringify({
  allowDevChain: true, allowInsecureLocalhostRpc: true,
  listen: { host: '127.0.0.1', port: RELAYER_PORT },
  allowedOrigins: ['http://localhost:5173'],
  chains: [{
    chainId: CHAIN_ID, rpcUrl: RPC, feeTo: relayerFeeTo.address,
    tokens: [
      { address: T.USDC.address, symbol: 'USDC', decimals: 6, permit: true, usdStable: true },
      { address: T.DAI.address, symbol: 'DAI', decimals: 18, permit: true, usdStable: true },
    ],
    nativeUsdPrice: '3000', gasUnits: { sweep: '150000', sweepWithPermit: '200000' },
    maxGasLimit: '1000000', maxGasPriceWei: '1000000000000', dailyBudgetWei: '1000000000000000000',
    minBalanceWei: '1000000000000000',
  }],
}, null, 2));
const relayerDist = resolve(ROOT, 'apps/relayer/dist/main.js');
if (!existsSync(relayerDist)) execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { cwd: resolve(ROOT, 'apps/relayer'), stdio: 'inherit' });
const quoteSecret = crypto.getRandomValues(new Uint8Array(32));

// This deterministic private key is a disposable fixture for this local-only E2E, never a release key.
// Sign the generated devnet deployment with it so the relayer exercises the same structured manifestDigest
// verification used in production. The key is scoped to chain 31337 and the temporary fixture directory.
const devReleaseSecret = new Uint8Array(32);
devReleaseSecret[31] = 1;
const { secp256k1 } = await import('@noble/curves/secp256k1.js');
const devReleasePublicKey = Buffer.from(secp256k1.getPublicKey(devReleaseSecret, true)).toString('hex');
const manifestDigestBytes = Uint8Array.from(manifestDigest(manifest).slice(2).match(/../g) ?? [], (byte) => parseInt(byte, 16));
const devManifestSignature = `0x${Buffer.from(secp256k1.sign(manifestDigestBytes, devReleaseSecret, { prehash: false, lowS: true })).toString('hex')}`;
const signedManifest = { ...manifest, signature: devManifestSignature };
assert.equal(verifyObjectManifestSignature(signedManifest, [devReleasePublicKey]).status, 'valid', 'devnet manifest fixture signature');
const signedDeploymentsDir = resolve(STATE, 'signed-deployments');
mkdirSync(signedDeploymentsDir, { recursive: true });
const signedManifestPath = resolve(signedDeploymentsDir, `${CHAIN_ID}.json`);
writeFileSync(signedManifestPath, `${JSON.stringify(signedManifest, null, 2)}\n`);
assert.equal(
  verifyObjectManifestSignature(loadDeployment(readFileSync(signedManifestPath, 'utf8'), CHAIN_ID), [devReleasePublicKey]).status,
  'valid',
  'serialized devnet manifest signature',
);
const relayerProc = spawn(process.execPath, [relayerDist], {
  cwd: resolve(ROOT, 'apps/relayer'),
  env: {
    ...process.env,
    RELAYER_CONFIG: cfgPath,
    DEPLOYMENTS_DIR: signedDeploymentsDir,
    GHOSTPAY_RELEASE_PUBKEYS: devReleasePublicKey,
    RELAYER_KEY: keyOf(state.accounts.relayerHot),
    QUOTE_SECRET: secretHex(quoteSecret),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let relayerLog = '';
relayerProc.stdout.on('data', (d) => { relayerLog += d; });
relayerProc.stderr.on('data', (d) => { relayerLog += d; });
const stopRelayer = () => { if (!relayerProc.killed) relayerProc.kill('SIGTERM'); };
process.on('exit', stopRelayer);
try {
  const base_ = `http://127.0.0.1:${RELAYER_PORT}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base_}/healthz`)).ok) break; } catch { /* retry */ }
    if (relayerProc.exitCode !== null) throw new Error(`relayer exited: ${relayerLog}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  const post = async (path, body) => {
    const r = await fetch(`${base_}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json() };
  };
  const info = await (await fetch(`${base_}/v1/info`)).json();
  assert.equal(info.chains[0].chainId, CHAIN_ID);
  assert.equal(getAddress(info.chains[0].sweepRelayer), manifest.sweepRelayer);
  step('relayer started', `port=${RELAYER_PORT} sweepRelayer=${info.chains[0].sweepRelayer}`);

  for (const id of ['USDC', 'DAI']) {
    const p = paid.find((x) => x.id === id);
    const secret = secretOf(p.stealth);
    const amount = p.split.net;
    const dest = id === 'USDC' ? sellerDest.address : sweepDest2.address;
    const q = await post('/v1/quote', { chainId: CHAIN_ID, token: p.token, owner: p.stealth, destination: dest, amount: amount.toString() });
    assert.equal(q.status, 200, JSON.stringify(q.json));
    const fee = BigInt(q.json.fee);
    assert.ok(fee >= (amount * 50n) / 10_000n && fee <= (amount * 300n) / 10_000n, 'fee outside 50-300 bps');
    const dl = (await pub.getBlock()).timestamp + 600n;
    const order = { token: p.token, owner: getAddress(p.stealth), destination: dest, feeTo: relayerFeeTo.address, amount, fee, deadline: dl, nonce: 1n };
    const sweepSig = (await signSweep(buildSweepTypedData(CHAIN_ID, manifest.sweepRelayer, order), secret)).signature;
    const ptd = await buildPermitTypedData({
      chainId: CHAIN_ID, token: p.token, owner: p.stealth, spender: manifest.sweepRelayer, value: amount, deadline: dl,
      reader: {
        name: (t) => pub.readContract({ address: t, abi: erc20, functionName: 'name' }),
        version: async () => '1',
        nonce: (t, o) => pub.readContract({ address: t, abi: erc20, functionName: 'nonces', args: [o] }),
        domainSeparator: (t) => pub.readContract({ address: t, abi: erc20, functionName: 'DOMAIN_SEPARATOR' }),
      },
    });
    const ps = await signPermit(ptd, secret);
    const body = {
      chainId: CHAIN_ID,
      sweep: { token: p.token, owner: order.owner, destination: dest, feeTo: relayerFeeTo.address, amount: amount.toString(), fee: fee.toString(), deadline: dl.toString(), nonce: '1' },
      sweepSig, permit: { value: amount.toString(), deadline: dl.toString(), v: ps.v, r: ps.r, s: ps.s }, quoteToken: q.json.quoteToken,
    };
    const dBefore = await bal(p.token, dest);
    const fBefore = await bal(p.token, relayerFeeTo.address);
    const r = await post('/v1/sweep', body);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const rc = await pub.waitForTransactionReceipt({ hash: r.json.txHash });
    assert.equal(rc.status, 'success');
    assert.equal(getAddress(rc.from), hot.address, 'sweep must be sent by the relayer hot key');
    txs.push({ label: `relayer sweep ${id} (permit)`, hash: r.json.txHash, block: rc.blockNumber.toString(), gasUsed: rc.gasUsed.toString() });
    assert.equal((await bal(p.token, dest)) - dBefore, amount - fee);
    assert.equal((await bal(p.token, relayerFeeTo.address)) - fBefore, fee);
    assert.equal(await bal(p.token, p.stealth), 0n);
    assert.equal(await pub.getBalance({ address: p.stealth }), 0n, 'stealth address never held gas');
    step(`relayer sweep ${id}`, `amount=${amount} fee=${fee} dest=${dest}; stealth never held ETH`);
    const again = await post('/v1/sweep', body);
    assert.equal(again.status, 409);
    assert.deepEqual(again.json, { error: { code: 'nonce_used' } });
    step(`relayer replay ${id} refused`, '409 nonce_used');
  }
} finally {
  stopRelayer();
}

// ---- log ----
const anvilVersion = execFileSync('anvil', ['--version'], { encoding: 'utf8', env: { ...process.env, PATH: `${process.env.PATH}:/root/.foundry/bin` } }).split('\n')[0];
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const stamp = new Date().toISOString();
const md = [
  '# Devnet end-to-end log',
  '',
  `Run: ${stamp}  `,
  `Commit: ${commit} (working tree may contain uncommitted changes)  `,
  `Node: ${process.version}  `,
  `Anvil: ${anvilVersion}  `,
  `Chain: local anvil, chain id ${CHAIN_ID} (no public network; public anvil dev accounts only; no real funds)`,
  '',
  '## Contracts',
  '',
  `- Announcer (reference ERC-5564): \`${manifest.announcer}\``,
  `- GhostPayRouter: \`${manifest.router}\` (deploy tx \`${manifest.deployTx.router}\`)`,
  `- GhostPaySweepRelayer: \`${manifest.sweepRelayer}\` (deploy tx \`${manifest.deployTx.sweepRelayer}\`)`,
  `- Fee recipient (anvil account 1): \`${manifest.feeRecipient}\``,
  `- Devnet tokens: ${Object.entries(T).map(([k, v]) => `${k} \`${v.address}\``).join(', ')}`,
  '',
  '## Steps',
  '',
  ...results.map((r, i) => `${i + 1}. PASS ${r.name}${r.detail ? ` - ${r.detail}` : ''}`),
  '',
  '## Transactions (this run)',
  '',
  '| Label | Tx hash | Block | Gas used |',
  '|---|---|---|---|',
  ...txs.map((t) => `| ${t.label} | \`${t.hash}\` | ${t.block} | ${t.gasUsed} |`),
  '',
  'Caveats: payments are built under the 84532 chain-adapters alias (the adapter chain table has no 31337 entry) and executed on 31337; token allowlist replaced by the devnet token list via `findTokenFn`. The anvil chain is ephemeral, so these hashes are not verifiable after `down.sh`.',
  '',
].join('\n');
if (process.argv.includes('--write-log')) {
  const out = resolve(ROOT, 'docs/operators/devnet-e2e-log.md');
  writeFileSync(out, md);
  console.log(`wrote ${out}`);
}
console.log(`E2E OK: ${results.length} steps, ${txs.length} transactions`);
