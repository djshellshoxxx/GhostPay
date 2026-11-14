// Helper for smoke-anvil.sh: deploys GhostPaySweepRelayer + PermitToken to a LOCAL anvil, funds the hot key, prints
// {"sweepRelayer","token"} as JSON. Refuses any chain id other than 31337. Throwaway deployer key (public, test only).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, getAddress, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const [rpc, hotKeyFile] = process.argv.slice(2);
if (!rpc || !hotKeyFile || !/^http:\/\/127\.0\.0\.1:\d+$/.test(rpc)) throw new Error('usage: node smoke-anvil-deploy.mjs http://127.0.0.1:<port> <hot-key-file>');
const out = resolve(import.meta.dirname, '../../../packages/contracts/out');
const art = (p) => {
  const j = JSON.parse(readFileSync(`${out}/${p}`, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object };
};
const call = async (method, params) => {
  const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return (await r.json()).result;
};
if (Number(BigInt(await call('eth_chainId', []))) !== 31337) throw new Error('not a local anvil (chain id 31337 required)');
const hot = privateKeyToAccount(`0x${readFileSync(hotKeyFile, 'utf8').trim()}`);
const deployer = privateKeyToAccount(`0x${'dd'.repeat(32)}`);
for (const a of [hot.address, deployer.address]) await call('anvil_setBalance', [a, '0x56bc75e2d63100000']);
const pub = createPublicClient({ transport: http(rpc) });
const wallet = createWalletClient({ account: deployer, transport: http(rpc), chain: null });
const rel = art('GhostPaySweepRelayer.sol/GhostPaySweepRelayer.json');
const tok = art('PermitToken.sol/PermitToken.json');
const h1 = await wallet.deployContract({ abi: rel.abi, bytecode: rel.bytecode, chain: null });
const sweepRelayer = getAddress((await pub.waitForTransactionReceipt({ hash: h1 })).contractAddress);
const h2 = await wallet.deployContract({ abi: tok.abi, bytecode: tok.bytecode, args: [6], chain: null });
const token = getAddress((await pub.waitForTransactionReceipt({ hash: h2 })).contractAddress);
process.stdout.write(`${JSON.stringify({ sweepRelayer, token })}\n`);
