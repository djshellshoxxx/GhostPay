// A PRIVATE, script-owned anvil that reports an enabled-testnet chain id (default Base Sepolia 84532) with the
// GhostPay router/sweep relayer deployed from the repository's compiled artifacts and the reference ERC-5564
// announcer installed at the canonical announcer address. LOCAL ONLY: loopback, public anvil dev keys, no funds.
//
// Why: the CLI's live commands accept only chain-adapters' fixed chain table (no 31337) and chain-adapters
// verifyDeployment requires the canonical announcer, which the shared 31337 devnet does not have (see the gap notes
// in ../cli-devnet.e2e.mjs). This chain lets the UNMODIFIED CLI exercise its full live lifecycle against a real EVM
// node with real transactions. It is test-harness aliasing (same idea as scripts/devnet/e2e.mjs building under
// 84532), not a CLI bypass: every documented trust gate (--online, loopback opt-in, manifest digest pin, code-hash
// and router-parameter read-back, finality depth) still applies.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, keccak256 } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { CANONICAL_ANNOUNCER, loadDeployment, manifestDigest } from '@ghostpay/chain-adapters';
import { MNEMONIC, ROOT } from './lib.mjs';

const OUT = resolve(ROOT, 'packages/contracts/out');
const artifact = (file, name) => JSON.parse(readFileSync(resolve(OUT, file, `${name}.json`), 'utf8'));

function freePort() {
  return new Promise((ok, no) => {
    const s = createServer();
    s.once('error', no);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

function anvilBin() {
  for (const c of [process.env.ANVIL, resolve(process.env.HOME ?? '', '.foundry/bin/anvil')]) if (c && existsSync(c)) return c;
  return 'anvil';
}

/**
 * Starts the alias chain and deploys the stack.
 * @returns {Promise<{ rpc: string, chainId: number, manifestText: string, digest: string, manifest: object,
 *   pub: object, wallet: (i:number)=>object, account: (i:number)=>object, mine: (n:number)=>Promise<void>, stop: ()=>void }>}
 */
export async function startAliasChain(chainId = 84532) {
  if (!existsSync(resolve(OUT, 'GhostPayRouter.sol/GhostPayRouter.json'))) {
    execFileSync('forge', ['build'], { cwd: resolve(ROOT, 'packages/contracts'), stdio: 'ignore', env: { ...process.env, PATH: `${process.env.PATH}:${process.env.HOME}/.foundry/bin` } });
  }
  const port = await freePort();
  const rpc = `http://127.0.0.1:${port}`;
  const proc = spawn(anvilBin(), ['--host', '127.0.0.1', '--port', String(port), '--chain-id', String(chainId), '--silent'], { stdio: 'ignore' });
  const stop = () => { try { proc.kill('SIGTERM'); } catch { /* already gone */ } };
  process.once('exit', stop);
  const chain = defineChain({ id: chainId, name: 'alias', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: 25 });
  for (let i = 0; ; i++) {
    try { if ((await pub.getChainId()) === chainId) break; } catch { /* starting */ }
    if (i > 100) { stop(); throw new Error('alias anvil did not start'); }
    await new Promise((r) => setTimeout(r, 100));
  }
  const account = (i) => mnemonicToAccount(MNEMONIC, { addressIndex: i });
  const wallet = (i) => createWalletClient({ account: account(i), chain, transport: http(rpc) });
  const deployer = wallet(0);
  const feeRecipient = account(1).address;

  const ann = artifact('ERC5564Announcer.sol', 'ERC5564Announcer');
  await pub.request({ method: 'anvil_setCode', params: [CANONICAL_ANNOUNCER, ann.deployedBytecode.object] });
  const deploy = async (a, args) => {
    const hash = await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
    const rc = await pub.waitForTransactionReceipt({ hash });
    if (rc.status !== 'success' || !rc.contractAddress) throw new Error('alias deployment reverted');
    return { address: getAddress(rc.contractAddress), hash };
  };
  const routerArt = artifact('GhostPayRouter.sol', 'GhostPayRouter');
  const router = await deploy(routerArt, [CANONICAL_ANNOUNCER, feeRecipient]);
  const relayer = await deploy(artifact('GhostPaySweepRelayer.sol', 'GhostPaySweepRelayer'), []);
  const codeHash = async (address) => keccak256(await pub.getCode({ address }));
  const commit = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const wire = {
    chainId, announcer: CANONICAL_ANNOUNCER, router: router.address, sweepRelayer: relayer.address, feeRecipient, feeBps: 25,
    deployTx: { router: router.hash, sweepRelayer: relayer.hash },
    solcVersion: routerArt.metadata.compiler.version, commit,
    bytecodeHashes: { router: await codeHash(router.address), sweepRelayer: await codeHash(relayer.address) },
    date: `${new Date().toISOString().slice(0, 19)}.000Z`,
  };
  const manifestText = `${JSON.stringify(wire, null, 2)}\n`;
  const manifest = loadDeployment(manifestText, chainId);
  const mine = async (n) => { await pub.request({ method: 'anvil_mine', params: [`0x${n.toString(16)}`] }); };
  return { rpc, chainId, manifestText, manifest, digest: manifestDigest(manifest), pub, wallet, account, mine, stop };
}
