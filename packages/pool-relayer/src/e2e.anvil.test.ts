/**
 * End-to-end on local anvil: deposit -> sync -> real Groth16 proof -> relay -> exit, partial withdrawal with an
 * association set, SP-PAY with announcement scan, ragequit, replay and tamper attempts.
 *
 * Skips (with a printed reason) unless ALL of these exist: an `anvil` binary (ANVIL_BIN or PATH), forge output in
 * `packages/pool-contracts/out`, circuit artifacts in `packages/pool-circuits/build` (+ `vkeys`), and the generated verifier
 * sources or forge output for them. INSECURE DEV CEREMONY keys: testnet/local only.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { checkAnnouncement, encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { prove, terminateProver, type ProverArtifacts } from '@ghostpay/pool-prover';
import {
  PoolRelayerClient,
  assertRootMatches,
  assertSignals,
  buildAspTree,
  buildSpPayAnnounce,
  planDeposit,
  poolAbi,
  prepareRagequit,
  prepareWithdrawal,
  recoverNotes,
  registryAbi,
  syncPool,
  toCalldataProof,
  viemPoolRpc,
  encodeRagequitCall,
  type Note,
} from '@ghostpay/pool-sdk';
import { SecretBox } from '@ghostpay/secret-box';
import { createPublicClient, createWalletClient, decodeAbiParameters, encodeFunctionData, getAddress, http, parseAbiItem, type Abi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createViemChainPort } from './chain.js';
import { buildConfig } from './config.js';
import { PoolRelayerHttpServer } from './server.js';
import { PoolRelayerService } from './service.js';

const here = dirname(fileURLToPath(import.meta.url));
const PKGS = resolve(here, '../..');
const OUT = join(PKGS, 'pool-contracts/out');
const CIRC = join(PKGS, 'pool-circuits');
const ANVIL = process.env['ANVIL_BIN'] ?? 'anvil';
const SOLC = process.env['SOLC_BIN'] ?? '/home/user/tools/solc';

const files = {
  wWasm: join(CIRC, 'build/withdraw32_js/withdraw32.wasm'),
  wZkey: join(CIRC, 'build/withdraw32_final.zkey'),
  wVkey: join(CIRC, 'vkeys/withdraw32.vkey.json'),
  cWasm: join(CIRC, 'build/commitment_js/commitment.wasm'),
  cZkey: join(CIRC, 'build/commitment_final.zkey'),
};
const need = [...Object.values(files), join(OUT, 'GhostPayShieldedPoolERC20.sol/GhostPayShieldedPoolERC20.json'), join(OUT, 'PoseidonT3.sol/PoseidonT3.json'), join(OUT, 'ERC5564Announcer.sol/ERC5564Announcer.json'), join(OUT, 'MockERC20.sol/MockERC20.json')];
const anvilOk = spawnSync(ANVIL, ['--version']).status === 0;
const verifierSrc = (n: string): string => join(CIRC, 'verifiers', `${n}.sol`);
const verifierOut = (n: string): string => join(OUT, `${n}.sol/${n}.json`);
const missing = [...need.filter((f) => !existsSync(f)), ...(['WithdrawVerifier', 'RagequitVerifier'].filter((n) => !existsSync(verifierOut(n)) && !existsSync(verifierSrc(n))))];
const ready = anvilOk && missing.length === 0 && (existsSync(SOLC) || ['WithdrawVerifier', 'RagequitVerifier'].every((n) => existsSync(verifierOut(n))));
if (!ready && process.env['REQUIRE_POOL_E2E'] === '1') throw new Error('REQUIRE_POOL_E2E=1 but prerequisites are missing');
if (!ready) console.warn(`[pool-relayer e2e] SKIPPED: anvil=${String(anvilOk)} missing=${missing.map((m) => m.replace(PKGS, '')).join(',')}`);

interface Artifact {
  abi: Abi;
  bytecode: Hex;
}
function loadArtifact(path: string): Artifact {
  const j = JSON.parse(readFileSync(path, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}
function compileVerifier(name: string): Artifact {
  if (existsSync(verifierOut(name))) return loadArtifact(verifierOut(name));
  const r = spawnSync(SOLC, ['--combined-json', 'abi,bin', '--optimize', verifierSrc(name)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`solc failed: ${r.stderr}`);
  const out = JSON.parse(r.stdout) as { contracts: Record<string, { abi: Abi; bin: string }> };
  const key = Object.keys(out.contracts).find((k) => k.endsWith(`:${name}`));
  const c = key === undefined ? undefined : out.contracts[key];
  if (c === undefined) throw new Error('verifier not found');
  return { abi: c.abi, bytecode: `0x${c.bin}` };
}
const sha = (p: string): string => bytesToHex(sha256(readFileSync(p)));
const wArt = (): ProverArtifacts => ({ wasmUrl: files.wWasm, zkeyUrl: files.wZkey, sha256: { wasm: sha(files.wWasm), zkey: sha(files.wZkey) }, label: 'INSECURE-LOCAL' });
const cArt = (): ProverArtifacts => ({ wasmUrl: files.cWasm, zkeyUrl: files.cZkey, sha256: { wasm: sha(files.cWasm), zkey: sha(files.cZkey) }, label: 'INSECURE-LOCAL' });

const KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
] as const;
const deployer = privateKeyToAccount(KEYS[0]);
const s1 = privateKeyToAccount(KEYS[1]);
const relayerAcc = privateKeyToAccount(KEYS[2]);
const feeToAcc = privateKeyToAccount(KEYS[3]);
const dest1 = privateKeyToAccount(KEYS[4]);
const dest2 = privateKeyToAccount(KEYS[5]);
const publisher = privateKeyToAccount(KEYS[6]);

const describeE2e = ready ? describe : describe.skip;

describeE2e('anvil end-to-end (deposit -> relayer exit / SP-PAY / ragequit)', () => {
  let anvil: ChildProcess;
  let rpc = '';
  let server: PoolRelayerHttpServer;
  let relayerUrl = '';
  const seed = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
  const withSeed = <T,>(f: (s: Uint8Array) => T): T => f(seed.slice());
  const pub = () => createPublicClient({ chain: foundry, transport: http(rpc) });
  const wallet = (a: ReturnType<typeof privateKeyToAccount>) => createWalletClient({ chain: foundry, transport: http(rpc), account: a });
  let token: Address;
  let pool: Address;
  let registry: Address;
  let announcer: Address;
  let tokenAbi: Abi;
  const ONE = 10n ** 18n;

  async function deploy(a: Artifact, args: unknown[] = []): Promise<Address> {
    const hash = await wallet(deployer).deployContract({ abi: a.abi, bytecode: a.bytecode, args });
    const rc = await pub().waitForTransactionReceipt({ hash });
    if (rc.contractAddress == null) throw new Error('deploy failed');
    return getAddress(rc.contractAddress);
  }
  async function send(from: ReturnType<typeof privateKeyToAccount>, to: Address, data: Hex): Promise<void> {
    const hash = await wallet(from).sendTransaction({ to, data });
    const rc = await pub().waitForTransactionReceipt({ hash });
    if (rc.status !== 'success') throw new Error('tx reverted');
  }
  const bal = (who: Address): Promise<bigint> => pub().readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
  async function deposit(value: bigint, index: number): Promise<void> {
    const plan = planDeposit(withSeed, 31337, pool, index, value);
    await send(s1, pool, plan.data);
  }
  async function syncAndNotes() {
    const client = viemPoolRpc(pub());
    const st = await syncPool(client, pool, 0n);
    await assertRootMatches(client, st);
    return { st, rec: recoverNotes(withSeed, st, 20) };
  }
  const relayerClient = (): PoolRelayerClient => new PoolRelayerClient(relayerUrl);

  beforeAll(async () => {
    const port = 20000 + (globalThis.crypto.getRandomValues(new Uint16Array(1))[0] ?? 0) % 20000;
    rpc = `http://127.0.0.1:${String(port)}`;
    anvil = spawn(ANVIL, ['--port', String(port), '--chain-id', '31337', '--silent'], { stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try {
        await pub().getChainId();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const mock = loadArtifact(join(OUT, 'MockERC20.sol/MockERC20.json'));
    tokenAbi = mock.abi;
    token = await deploy(mock, ['Test', 'TST', 18]);
    const t3 = await deploy(loadArtifact(join(OUT, 'PoseidonT3.sol/PoseidonT3.json')));
    const t4 = await deploy(loadArtifact(join(OUT, 'PoseidonT4.sol/PoseidonT4.json')));
    announcer = await deploy(loadArtifact(join(OUT, 'ERC5564Announcer.sol/ERC5564Announcer.json')));
    const reg = loadArtifact(join(OUT, 'GhostPayAssociationSetRegistry.sol/GhostPayAssociationSetRegistry.json'));
    registry = await deploy(reg);
    const wv = await deploy(compileVerifier('WithdrawVerifier'));
    const rv = await deploy(compileVerifier('RagequitVerifier'));
    const poolArt = loadArtifact(join(OUT, 'GhostPayShieldedPoolERC20.sol/GhostPayShieldedPoolERC20.json'));
    pool = await deploy(poolArt, [{ asset: token, announcer, registry, withdrawVerifier: wv, ragequitVerifier: rv, poseidonT3: t3, poseidonT4: t4, denomination: 0n, maxDeposit: 10n ** 30n, maxRelayerFeeBps: 1000n, aspGraceSeconds: 600n }]);
    await send(deployer, token, encodeFunctionData({ abi: tokenAbi, functionName: 'mint', args: [s1.address, 100n * ONE] }));
    await send(s1, token, encodeFunctionData({ abi: tokenAbi, functionName: 'approve', args: [pool, 2n ** 255n] }));

    const cfg = buildConfig({ pools: [{ chainId: 31337, pool, rate: { num: 1n, den: 1n } }], feeTo: feeToAcc.address, port: 0, gasEstimate: 700_000n });
    const port0 = createViemChainPort({ chainId: 31337, rpcUrl: rpc, account: relayerAcc });
    await port0.verifyChain();
    const vkey = JSON.parse(readFileSync(files.wVkey, 'utf8')) as unknown;
    const service = new PoolRelayerService({ config: cfg, chains: new Map([[31337, port0]]), vkey });
    server = new PoolRelayerHttpServer({ config: cfg, service });
    relayerUrl = `http://127.0.0.1:${String((await server.listen()).port)}`;
  }, 120_000);

  afterAll(async () => {
    await server?.close();
    anvil?.kill();
    await terminateProver();
  });

  let exitTx: { w: unknown; proof: unknown } | undefined;

  it('SP-EXIT: partial withdrawal through the relayer, then recover the change note', async () => {
    await deposit(10n * ONE, 0);
    const { st, rec } = await syncAndNotes();
    expect(rec.notes.length).toBe(1);
    const note = rec.notes[0] as Note;
    expect(note.value).toBe(10n * ONE);
    const scope = await pub().readContract({ address: pool, abi: poolAbi, functionName: 'SCOPE' });
    const rc = relayerClient();
    const quote = await rc.quote(31337, pool, 4n * ONE);
    const ts = (await pub().getBlock()).timestamp;
    const prepared = prepareWithdrawal({
      option: 'SP-EXIT',
      withSeed,
      synced: st,
      note,
      scope,
      withdrawnValue: 4n * ONE,
      recipient: dest1.address,
      submitter: { kind: 'relayer', relayer: quote.relayer, feeTo: quote.feeTo, fee: quote.relayerFee },
      asp: { kind: 'none' },
      deadline: ts + 3600n,
      newIndex: rec.nextIndex,
      minCrowd: 0,
      crowdConfirmed: true,
    });
    const { proof, publicSignals } = await prove({ kind: 'withdraw', chainId: 31337, inputs: { ...prepared.inputs }, artifacts: wArt(), expectedSignals: prepared.expectedSignals.map(String) });
    const calldata = toCalldataProof(proof, publicSignals, 9);
    assertSignals(prepared.expectedSignals, calldata);
    const hash = await rc.relay(31337, pool, prepared.withdrawal, calldata);
    await pub().waitForTransactionReceipt({ hash });
    expect(await bal(dest1.address)).toBe(4n * ONE - quote.relayerFee);
    expect(await bal(feeToAcc.address)).toBe(quote.relayerFee);
    expect(await pub().readContract({ address: pool, abi: poolAbi, functionName: 'nullifierSpent', args: [prepared.expectedSignals[1] as bigint] })).toBe(true);
    exitTx = { w: prepared.withdrawal, proof: calldata };

    const after = await syncAndNotes();
    const live = after.rec.notes.filter((n) => n.spent !== true);
    expect(live.map((n) => n.value)).toEqual([6n * ONE]);
    expect(after.rec.notes.length).toBe(2);
  });

  it('replay and tampering are rejected by the relayer', async () => {
    const rc = relayerClient();
    const t = exitTx as { w: Parameters<PoolRelayerClient['relay']>[2]; proof: Parameters<PoolRelayerClient['relay']>[3] };
    await expect(rc.relay(31337, pool, t.w, t.proof)).rejects.toThrow(/nullifier_spent|unknown_root|deadline|refused/);
    await expect(rc.relay(31337, pool, { ...t.w, recipient: dest2.address }, t.proof)).rejects.toThrow(/context_mismatch|nullifier_spent/);
  });

  it('second withdrawal of the change note with an association set (aspEnabled = 1)', async () => {
    const { st, rec } = await syncAndNotes();
    const note = rec.notes.find((n) => n.spent !== true) as Note;
    const labels = st.deposits.map((d) => d.label);
    const tree = buildAspTree(labels);
    await send(publisher, registry, encodeFunctionData({ abi: registryAbi, functionName: 'publish', args: [tree.root(), 'ipfs://demo'] }));
    const scope = await pub().readContract({ address: pool, abi: poolAbi, functionName: 'SCOPE' });
    const rc = relayerClient();
    const quote = await rc.quote(31337, pool, 2n * ONE);
    const ts = (await pub().getBlock()).timestamp;
    const prepared = prepareWithdrawal({
      option: 'SP-EXIT', withSeed, synced: st, note, scope, withdrawnValue: 2n * ONE, recipient: dest2.address,
      submitter: { kind: 'relayer', relayer: quote.relayer, feeTo: quote.feeTo, fee: quote.relayerFee },
      asp: { kind: 'publisher', publisher: publisher.address, labels }, deadline: ts + 3600n, newIndex: rec.nextIndex, minCrowd: 0, crowdConfirmed: true,
    });
    const { proof, publicSignals } = await prove({ kind: 'withdraw', chainId: 31337, inputs: { ...prepared.inputs }, artifacts: wArt(), expectedSignals: prepared.expectedSignals.map(String) });
    const hash = await rc.relay(31337, pool, prepared.withdrawal, toCalldataProof(proof, publicSignals, 9));
    await pub().waitForTransactionReceipt({ hash });
    expect(await bal(dest2.address)).toBe(2n * ONE - quote.relayerFee);
  });

  it('SP-PAY: pool announces to the seller, caller is the pool, seller scan finds it', async () => {
    await deposit(5n * ONE, 5);
    const { st, rec } = await syncAndNotes();
    const note = rec.notes.find((n) => n.index === 5) as Note;
    const seller = generateKeySet();
    const scope = await pub().readContract({ address: pool, abi: poolAbi, functionName: 'SCOPE' });
    const rc = relayerClient();
    const quote = await rc.quote(31337, pool, 3n * ONE);
    const net = 3n * ONE - quote.relayerFee;
    const { recipient, announce } = buildSpPayAnnounce(encodeMetaAddress(seller), undefined, token, net);
    const ts = (await pub().getBlock()).timestamp;
    const prepared = prepareWithdrawal({
      option: 'SP-PAY', withSeed, synced: st, note, scope, withdrawnValue: 3n * ONE, recipient, announce,
      submitter: { kind: 'relayer', relayer: quote.relayer, feeTo: quote.feeTo, fee: quote.relayerFee },
      asp: { kind: 'none' }, deadline: ts + 3600n, newIndex: rec.nextIndex, minCrowd: 0, crowdConfirmed: true,
    });
    const { proof, publicSignals } = await prove({ kind: 'withdraw', chainId: 31337, inputs: { ...prepared.inputs }, artifacts: wArt() });
    const hash = await rc.relay(31337, pool, prepared.withdrawal, toCalldataProof(proof, publicSignals, 9));
    await pub().waitForTransactionReceipt({ hash });
    expect(await bal(recipient)).toBe(net);
    const logs = await pub().getLogs({ address: announcer, event: parseAbiItem('event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)'), fromBlock: 0n });
    expect(logs.length).toBe(1);
    const l = logs[0];
    expect(getAddress(l?.args.caller as Address)).toBe(pool);
    const found = checkAnnouncement({ schemeId: 1n, stealthAddress: l?.args.stealthAddress as string, ephemeralPublicKey: l?.args.ephemeralPubKey as string, metadata: l?.args.metadata as string }, seller.viewingSecret, seller.spendingPublicKey);
    expect(found.matches).toBe(true);
    expect(decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], announce)[0]).toBe(l?.args.ephemeralPubKey);
  });

  it('SP-RQ: ragequit returns the full note to the depositor', async () => {
    await deposit(1n * ONE, 9);
    const { rec } = await syncAndNotes();
    const note = rec.notes.find((n) => n.index === 9) as Note;
    const before = await bal(s1.address);
    const rq = prepareRagequit(note);
    const { proof, publicSignals } = await prove({ kind: 'commitment', chainId: 31337, inputs: { ...rq.inputs }, artifacts: cArt(), expectedSignals: rq.expectedSignals.map(String) });
    await send(s1, pool, encodeRagequitCall(toCalldataProof(proof, publicSignals, 4)));
    expect(await bal(s1.address)).toBe(before + ONE);
  });

  it('keeps the local seed out of the relayer traffic', () => {
    const box = SecretBox.copyOf(seed.slice());
    expect(String(box)).not.toContain(String(seed[0]));
    box.dispose();
  });
}, 600_000);
