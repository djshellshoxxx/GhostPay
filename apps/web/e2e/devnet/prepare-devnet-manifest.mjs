#!/usr/bin/env node
// Devnet-only Playwright fixture preparation: builds and signs a Base Sepolia (84532) manifest for contracts that were
// really deployed on a LOCAL anvil, with the same public, deterministic Playwright test key as ../prepare-manifest.mjs.
// That helper keeps its fake-address guard unchanged; this one instead refuses anything that is not provably a local
// anvil: loopback http URL, eth_chainId == 84532, web3_clientVersion "anvil/...", and anvil_nodeInfo answering with the
// same chain id. The manifest is read back on chain (router immutables and code hashes) before it is signed. It is never
// written into the repository's deployments directories. Not imported by the application or the release build.
//
// Usage: node prepare-devnet-manifest.mjs --rpc http://127.0.0.1:8546 --broadcast <run-latest.json> --out-dir <new dir>
//   [--state <devnet.json to write>] [--artifacts <forge out dir>]
// The broadcast must come from script/devnet/DeployDevnet.s.sol, which only deploys on 31337: the runner deploys there
// and switches the same anvil to 84532 (anvil_setChainId) before calling this helper.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { getAddress, keccak256 } from 'viem';
import {
  canonicalManifestJson, loadDeployment, manifestDigest, verifyManifestOnChain, verifyObjectManifestSignature,
} from '@ghostpay/chain-adapters';
import { validateAll } from '../../../../scripts/testnet/make-manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CHAIN_ID = 84532;
const DEPLOY_CHAIN_ID = 31337;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function fail(message) {
  throw new Error(`prepare-devnet-manifest: ${message}`);
}

/** Plain loopback JSON-RPC over node:http (never a proxy, never TLS). */
export function loopbackRpc(url) {
  const u = new URL(url);
  if (u.protocol !== 'http:' || !LOOPBACK.has(u.hostname) || u.username !== '' || u.password !== '') {
    fail(`refusing non-loopback RPC ${u.origin}`);
  }
  let id = 0;
  return (method, params = []) => new Promise((resolvePromise, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params });
    const req = request(u, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, timeout: 10_000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (reply.error !== undefined) reject(new Error(`${method}: ${reply.error.message ?? 'rpc error'}`));
          else resolvePromise(reply.result);
        } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${method}: timeout`)));
    req.on('error', reject);
    req.end(body);
  });
}

/** Proves the endpoint is a local anvil on 84532 before anything is signed. */
export async function assertLocalAnvil(rpc) {
  const chainId = Number.parseInt(String(await rpc('eth_chainId')), 16);
  if (chainId !== CHAIN_ID) fail(`eth_chainId is ${String(chainId)}, expected ${String(CHAIN_ID)}`);
  const client = String(await rpc('web3_clientVersion'));
  if (!/^anvil\//i.test(client)) fail('web3_clientVersion is not anvil');
  const info = await rpc('anvil_nodeInfo');
  if (typeof info !== 'object' || info === null || Number(info.environment?.chainId) !== CHAIN_ID) fail('anvil_nodeInfo did not confirm the chain');
}

function pickCreate(broadcast, contractName) {
  const txs = (broadcast.transactions ?? []).filter((t) => t.contractName === contractName && t.transactionType === 'CREATE');
  if (txs.length !== 1) fail(`expected exactly one CREATE of ${contractName}, found ${String(txs.length)}`);
  return txs[0];
}

function assertOutsideRepoDeployments(dir) {
  for (const forbidden of [resolve(ROOT, 'deployments'), resolve(ROOT, 'apps/web/deployments'), resolve(ROOT, 'apps/web/e2e/fixtures')]) {
    const rel = relative(forbidden, dir);
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) fail(`refusing to write into ${forbidden}`);
  }
}

export async function prepareDevnetManifest({ rpcUrl, broadcastPath, outDir, statePath, artifactsDir = resolve(ROOT, 'packages/contracts/out') }) {
  const rpc = loopbackRpc(rpcUrl);
  await assertLocalAnvil(rpc);
  const broadcast = JSON.parse(readFileSync(broadcastPath, 'utf8'));
  if (Number(broadcast.chain) !== DEPLOY_CHAIN_ID) fail('broadcast is not a DeployDevnet (31337) broadcast');
  const announcerTx = pickCreate(broadcast, 'ERC5564Announcer');
  const routerTx = pickCreate(broadcast, 'GhostPayRouter');
  const relayerTx = pickCreate(broadcast, 'GhostPaySweepRelayer');
  const router = getAddress(routerTx.contractAddress);
  const sweepRelayer = getAddress(relayerTx.contractAddress);
  const codeHash = async (address) => {
    const code = await rpc('eth_getCode', [address, 'latest']);
    if (typeof code !== 'string' || code === '0x') fail(`no code at ${address}`);
    return keccak256(code);
  };
  const call = async (sig) => {
    const sel = keccak256(new TextEncoder().encode(sig)).slice(0, 10);
    return String(await rpc('eth_call', [{ to: router, data: sel }, 'latest']));
  };
  const feeRecipient = getAddress(`0x${(await call('FEE_RECIPIENT()')).slice(26)}`);
  const announcer = getAddress(`0x${(await call('ANNOUNCER()')).slice(26)}`);
  const feeBps = Number(BigInt(await call('FEE_BPS()')));
  if (announcer !== getAddress(announcerTx.contractAddress)) fail('router ANNOUNCER is not the deployed announcer');
  const receipt = await rpc('eth_getTransactionReceipt', [routerTx.hash]);
  if (receipt === null || receipt.status !== '0x1') fail('router deployment receipt missing');
  const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  const artifact = JSON.parse(readFileSync(resolve(artifactsDir, 'GhostPayRouter.sol/GhostPayRouter.json'), 'utf8'));
  const solcVersion = artifact.metadata?.compiler?.version;
  if (typeof solcVersion !== 'string') fail('cannot read solc version from forge artifact (run forge build)');
  const manifest = {
    chainId: CHAIN_ID,
    announcer,
    router,
    sweepRelayer,
    feeRecipient,
    feeBps,
    deployTx: { router: routerTx.hash, sweepRelayer: relayerTx.hash },
    solcVersion,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    bytecodeHashes: { router: await codeHash(router), sweepRelayer: await codeHash(sweepRelayer) },
    date: new Date(Number.parseInt(block.timestamp, 16) * 1000).toISOString(),
  };
  // Same schema + validator gate as scripts/testnet/make-manifest.mjs, then the app's own on-chain readback.
  await validateAll(manifest);
  const validated = loadDeployment(JSON.stringify(manifest), CHAIN_ID);
  await verifyManifestOnChain(validated, { chainId: CHAIN_ID, request: (method, params) => rpc(method, params) });

  // Public, deterministic Playwright test material (identical to ../prepare-manifest.mjs). Never real funds or release trust.
  const testKey = new Uint8Array(32).fill(7);
  let output;
  let publicKey;
  try {
    publicKey = hex(secp256k1.getPublicKey(testKey, true));
    const digest = Uint8Array.from(manifestDigest(validated).slice(2).match(/../g) ?? [], (part) => Number.parseInt(part, 16));
    const signature = `0x${hex(secp256k1.sign(digest, testKey, { prehash: false, lowS: true }))}`;
    output = JSON.stringify({ ...JSON.parse(canonicalManifestJson(validated)), signature }, null, 2) + '\n';
  } finally {
    testKey.fill(0);
  }
  if (verifyObjectManifestSignature(loadDeployment(output, CHAIN_ID), [publicKey]).status !== 'valid') fail('signed manifest did not verify');

  const dir = resolve(outDir);
  assertOutsideRepoDeployments(dir);
  if (existsSync(dir) && readdirSync(dir).length > 0) fail(`output directory is not empty: ${dir}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(dir, `${String(CHAIN_ID)}.json`), output, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (statePath !== undefined) {
    const state = { rpcUrl, chainId: CHAIN_ID, publicKey, deploymentsDir: dir, announcer, router, sweepRelayer, feeRecipient, feeBps };
    writeFileSync(resolve(statePath), `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  }
  return { directory: dir, publicKey, manifest: validated };
}

function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rpcUrl = arg(argv, 'rpc');
  const broadcastPath = arg(argv, 'broadcast');
  const outDir = arg(argv, 'out-dir');
  if (rpcUrl === undefined || broadcastPath === undefined || outDir === undefined) {
    console.error('usage: prepare-devnet-manifest.mjs --rpc <loopback url> --broadcast <run-latest.json> --out-dir <dir> [--state <file>]');
    process.exit(2);
  }
  prepareDevnetManifest({ rpcUrl, broadcastPath, outDir, statePath: arg(argv, 'state'), ...(arg(argv, 'artifacts') === undefined ? {} : { artifactsDir: arg(argv, 'artifacts') }) }).then(
    ({ directory, manifest }) => { console.error(`devnet manifest signed for chain ${String(manifest.chainId)}: ${directory} (router ${manifest.router})`); },
    (e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); },
  );
}
