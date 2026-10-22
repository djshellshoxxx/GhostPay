/**
 * A2 (spec section 10): the adapter against the REAL upstream Privacy Pools contracts and REAL circuits on a local
 * anvil node. Needs, via environment variables, artifacts that are NOT in this repository:
 *
 * - `PP_CONTRACTS_OUT`: a `forge build` output directory of `0xbow-io/privacy-pools-core` at commit
 *   d494b63e79f33bb2b0c8ece6cdacdca465c3b884 (solc 0.8.28; GPL-3.0 verifiers stay outside this repository).
 * - `PP_ARTIFACT_DIR`: the six official circuit artifacts (digests pinned in the manifest).
 * - an `anvil` binary (`ANVIL_BIN`, default /home/user/tools/anvil).
 *
 * The relayer here is a small in-test stand-in that follows the upstream HTTP API shape; the upstream relayer
 * package itself (Express + SQLite) was NOT run.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as sdk from '@0xbow/privacy-pools-core-sdk';
import {
  MemoryVaultStorage, Vault, createViemChainReader, makeRequest, makeSeed, recoverNotes, stubTransport, json, findEntry, TESTNET_MANIFEST, parseManifest, type PoolNote, type TxReceiptLike, type PreparedTx,
} from '@ghostpay/external-pools';
import {
  createPublicClient, createTestClient, createWalletClient, encodeAbiParameters, encodeDeployData, encodeFunctionData, getAddress, http, keccak256, parseEther, type Abi, type Address, type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { PrivacyPoolsAdapter, decodeNoteData, formatProof } from './adapter.js';
import { NATIVE_ASSET, entrypointAbi, relayDataParams } from './abi.js';
import { createSdkCrypto } from './sdk-crypto.js';

const OUT = process.env['PP_CONTRACTS_OUT'];
const ART = process.env['PP_ARTIFACT_DIR'];
const ANVIL = process.env['ANVIL_BIN'] ?? '/home/user/tools/anvil';
const ready = OUT !== undefined && ART !== undefined && existsSync(join(OUT, 'Entrypoint.sol/Entrypoint.json')) && existsSync(join(ART, 'withdraw.zkey')) && existsSync(ANVIL);
const required = process.env['REQUIRE_ANVIL'] === '1';

let proc: ChildProcess | undefined;
afterAll(() => {
  proc?.kill();
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

interface Artifact { abi: Abi; bytecode: { object: Hex; linkReferences: Record<string, Record<string, { start: number; length: number }[]>> } }
const art = (name: string): Artifact => JSON.parse(readFileSync(join(OUT ?? '', `${name}.json`), 'utf8')) as Artifact;

describe.skipIf(!ready && !required)('real contracts + real circuits on anvil (A2)', () => {
  it('deposit from S1, relayed withdraw to D, ragequit of an unapproved deposit, self-relay and recovery', async () => {
    if (!ready) throw new Error('REQUIRE_ANVIL=1 but contracts, circuits or anvil are missing');
    const port = await freePort();
    proc = spawn(ANVIL, ['--port', String(port), '--host', '127.0.0.1', '--chain-id', '31337', '--silent', '--code-size-limit', '100000'], { stdio: 'ignore' });
    const url = `http://127.0.0.1:${String(port)}`;
    const pub = createPublicClient({ chain: foundry, transport: http(url) });
    for (let i = 0; i < 50; i++) {
      try {
        await pub.getChainId();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const test = createTestClient({ chain: foundry, mode: 'anvil', transport: http(url) });
    const deployerKey = generatePrivateKey();
    const deployer = privateKeyToAccount(deployerKey);
    const relayerAcct = privateKeyToAccount(generatePrivateKey());
    const feeAcct = privateKeyToAccount(generatePrivateKey());
    const s1Acct = privateKeyToAccount(generatePrivateKey());
    const fresh = privateKeyToAccount(generatePrivateKey());
    for (const a of [deployer, relayerAcct, s1Acct, fresh]) await test.setBalance({ address: a.address, value: parseEther('100') });
    const wallet = (acct: typeof deployer) => createWalletClient({ account: acct, chain: foundry, transport: http(url) });
    const send = async (acct: typeof deployer, tx: PreparedTx): Promise<TxReceiptLike> => {
      const hash = await wallet(acct).sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
      const r = await pub.waitForTransactionReceipt({ hash });
      await test.mine({ blocks: 3 });
      const head = await pub.getBlockNumber({ cacheTime: 0 });
      return {
        transactionHash: r.transactionHash, blockNumber: r.blockNumber, from: r.from, to: r.to ?? null, status: r.status,
        logs: r.logs.map((l) => ({ address: l.address, topics: l.topics as Hex[], data: l.data, logIndex: l.logIndex, blockNumber: l.blockNumber, transactionHash: l.transactionHash })),
        confirmations: Number(head - r.blockNumber),
      };
    };

    // ---- deploy upstream contracts (pinned commit), linking the Poseidon libraries ----
    const deploy = async (name: string, args: unknown[] = [], links: Record<string, Address> = {}): Promise<Address> => {
      const a = art(name);
      let obj: string = a.bytecode.object;
      for (const refs of Object.values(a.bytecode.linkReferences)) {
        for (const [lib, spots] of Object.entries(refs)) {
          for (const s of spots) obj = obj.slice(0, 2 + s.start * 2) + (links[lib] ?? '').slice(2).toLowerCase() + obj.slice(2 + (s.start + s.length) * 2);
        }
      }
      const data = encodeDeployData({ abi: a.abi, bytecode: obj as Hex, args });
      const hash = await wallet(deployer).sendTransaction({ data });
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.contractAddress === null || r.contractAddress === undefined) throw new Error(`deploy of ${name} failed`);
      return r.contractAddress;
    };
    const t3 = await deploy('PoseidonT3.sol/PoseidonT3');
    const t4 = await deploy('PoseidonT4.sol/PoseidonT4');
    const wv = await deploy('WithdrawalVerifier.sol/WithdrawalVerifier');
    const rv = await deploy('CommitmentVerifier.sol/CommitmentVerifier');
    const impl = await deploy('Entrypoint.sol/Entrypoint');
    const entryAbi = art('Entrypoint.sol/Entrypoint').abi;
    const proxy = await deploy('ERC1967Proxy.sol/ERC1967Proxy', [impl, encodeFunctionData({ abi: entryAbi, functionName: 'initialize', args: [deployer.address, deployer.address] })]);
    const pool = await deploy('PrivacyPoolSimple.sol/PrivacyPoolSimple', [proxy, wv, rv], { PoseidonT3: t3, PoseidonT4: t4 });
    const w = wallet(deployer);
    await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: proxy, abi: entryAbi, functionName: 'registerPool', args: [NATIVE_ASSET, pool, parseEther('0.001'), 100n, 100n] }) });

    // ---- pinned manifest for this local deployment (code hashes read back from the node, then pinned) ----
    const codeOf = async (a: Address): Promise<Hex> => (await pub.getCode({ address: a })) ?? '0x';
    const manifest = parseManifest({
      schema: 1,
      retrieved: '2026-10-21',
      entries: [
        {
          route: 'privacy-pools', chainId: 31337, status: 'verified',
          contracts: { entrypoint: proxy, 'pool:native': pool },
          codeHashes: { entrypoint: keccak256(await codeOf(proxy)), 'pool:native': keccak256(await codeOf(pool)) },
          artifactSha256: findEntry(TESTNET_MANIFEST, 'privacy-pools', 11155111)?.artifactSha256,
          relayers: ['http://127.0.0.1:3999'],
          deploymentBlock: 0,
          sources: ['local anvil deployment of 0xbow-io/privacy-pools-core d494b63'],
        },
      ],
    });

    // ---- adapter with real crypto, real chain reader, local ASP and a relayer stand-in ----
    const crypto = await createSdkCrypto((c, k) => Promise.resolve(new Uint8Array(readFileSync(join(ART ?? '', `${c}.${k}`)))));
    const aspLabels: bigint[] = [];
    const postRoot = async (): Promise<void> => {
      const root = BigInt(sdk.generateMerkleProof([...aspLabels], aspLabels[0] as bigint).root);
      await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: proxy, abi: entryAbi, functionName: 'updateRoot', args: [root, 'Qm'.padEnd(46, 'x')] }) });
    };
    const clock = { now: Date.now() };
    const relayed: Hex[] = [];
    const st = stubTransport((c) => {
      const u = new URL(c.url);
      if (u.pathname === '/relayer/details') return json({ feeBPS: '50', feeReceiverAddress: feeAcct.address, chainId: 31337, assetAddress: NATIVE_ASSET, minWithdrawAmount: '1000', maxGasPrice: null });
      if (u.pathname === '/relayer/quote') {
        const b = JSON.parse(c.body ?? '{}') as { amount: string; asset: Address; recipient: Address };
        return json({ baseFeeBPS: '50', feeBPS: '50', gasPrice: '1', detail: {}, feeCommitment: { expiration: clock.now + 60_000, withdrawalData: encodeAbiParameters(relayDataParams, [b.recipient, feeAcct.address, 50n]), asset: b.asset, signedRelayerCommitment: `0x${'11'.repeat(65)}`, extraGas: false, amount: b.amount } });
      }
      return new Response('', { status: 404 });
    }, clock);
    // /relayer/request is async (needs a chain write), so wrap fetch
    const base = st.transport.fetch;
    const transport = {
      ...st.transport,
      fetch: (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!href.endsWith('/relayer/request')) return base(input, init);
        const b = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { withdrawal: { processooor: Address; data: Hex }; proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }; publicSignals: string[]; scope: string };
        const fp = formatProof({ proof: b.proof, publicSignals: b.publicSignals }, 8);
        const hash = await wallet(relayerAcct).writeContract({ address: proxy, abi: entrypointAbi, functionName: 'relay', args: [b.withdrawal, fp as never, BigInt(b.scope)] });
        await pub.waitForTransactionReceipt({ hash });
        relayed.push(hash);
        return json({ success: true, timestamp: clock.now, requestId: 'local-1', txHash: hash });
      }) as typeof fetch,
    };
    const reader = createViemChainReader(() => pub);
    const adapter = new PrivacyPoolsAdapter({
      manifest, chain: reader, transport, crypto, asp: { getAssociationSet: () => Promise.resolve({ leaves: aspLabels }) }, clock: () => clock.now,
    });
    const D = privateKeyToAccount(generatePrivateKey()).address;
    const req = makeRequest({ chainId: 31337, asset: 'native', amount: parseEther('1'), stealth: { address: s1Acct.address, signer: { address: s1Acct.address } }, destination: D, rootSeed: makeSeed(11) });

    const enter = async (): Promise<PoolNote> => {
      const q = await adapter.quoteEntry(req);
      const [tx] = await adapter.prepareEntry(req, q);
      return adapter.recordEntry(req, q, await send(s1Acct, tx as PreparedTx));
    };

    // 1. deposit and relayed withdrawal
    const n1 = await enter();
    expect(n1.depositedAmount).toBe(parseEther('1') - parseEther('0.01')); // 1% vetting fee from assetConfig
    expect(n1.state).toBe('confirmed');
    aspLabels.push(decodeNoteData(n1.adapterData).label);
    await postRoot();
    const q1 = await adapter.quoteExit(n1, { destination: D, maxFeeBps: 100 });
    const before = await pub.getBalance({ address: D });
    const res = await adapter.executeExit(n1, q1, transport);
    expect(res.newState).toBe('exited');
    expect((await pub.getBalance({ address: D })) - before).toBe(res.exitedAmount);
    expect(res.exitedAmount + res.feeAmount).toBe(n1.depositedAmount);
    expect(relayed).toHaveLength(1);

    // 2. a deposit that is not in the approval set can only ragequit, and only from S1
    const adapterAfter = adapter;
    const n2 = await enter();
    const q2 = await adapterAfter.quoteExit(n2, { destination: D });
    await expect(adapterAfter.executeExit(n2, q2, transport)).rejects.toMatchObject({ code: 'ASP_UNAVAILABLE' });
    const [rq] = await adapterAfter.prepareEmergencyExit(n2);
    await expect(wallet(fresh).sendTransaction({ to: (rq as PreparedTx).to, data: (rq as PreparedTx).data })).rejects.toThrow();
    const s1Before = await pub.getBalance({ address: s1Acct.address });
    const rr = await send(s1Acct, rq as PreparedTx);
    expect(rr.status).toBe('success');
    expect((await pub.getBalance({ address: s1Acct.address })) - s1Before).toBeGreaterThan(n2.depositedAmount - parseEther('0.01'));

    // 3. self-relay (N3 acknowledged) from a fresh gas-funded address
    const n3 = await enter();
    aspLabels.push(decodeNoteData(n3.adapterData).label);
    await postRoot();
    const qs = await adapter.quoteExit(n3, { destination: D, selfBroadcast: true, ackN3: true });
    const [selfTx] = await adapter.prepareSelfRelayExit(n3, qs, fresh.address);
    const dBefore = await pub.getBalance({ address: D });
    expect((await send(fresh, selfTx as PreparedTx)).status).toBe('success');
    expect((await pub.getBalance({ address: D })) - dBefore).toBe(n3.depositedAmount);

    // 4. recovery from chain data only
    const vault = await Vault.create(new MemoryVaultStorage(), 'correct horse battery', { N: 1 << 14, r: 8, p: 1 });
    const rep = await recoverNotes([adapter], req.rootSeed, { chainId: 31337, chain: reader, stealthAddresses: [s1Acct.address], fromBlock: 0n }, vault);
    expect(rep.errors).toEqual([]);
    const states = new Map((await vault.listNotes()).map((n) => [n.noteId, n.state]));
    expect(states.get(n1.noteId)).toBe('exited');
    expect(states.get(n2.noteId)).toBe('ragequit');
    expect(states.get(n3.noteId)).toBe('exited');
    expect(decodeNoteData((await vault.getNote(n1.noteId))!.adapterData)).toEqual(decodeNoteData(n1.adapterData));
    expect(getAddress(s1Acct.address)).toBe(n1.depositor);
  }, 600_000);
});

