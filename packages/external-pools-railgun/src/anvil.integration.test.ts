/**
 * Entry path against the REAL Railgun v2 `RailgunSmartWallet` code on a local anvil node: the adapter reads `shieldFee()`,
 * the SDK-output check accepts a correctly shaped `shield` call, the contract executes it, and `recordEntry` reads the net
 * value from the real `Shield` event.
 *
 * Needs `RG_CONTRACTS_OUT`: a `forge build` output of `Railgun-Privacy/contract` @36bcf5ed (solc 0.8.28, OpenZeppelin
 * 4.9.6) plus a tiny `TestToken` ERC-20 (not in this repository). The unshield path (zero-knowledge proofs, verification
 * keys, PPOI, broadcasters) is NOT exercised: it needs the Railgun SDK and circuits [UNVERIFIED].
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createViemChainReader, makeRequest, makeSeed, parseManifest, type TxReceiptLike } from '@ghostpay/external-pools';
import { createPublicClient, createTestClient, createWalletClient, encodeDeployData, encodeFunctionData, http, keccak256, parseAbi, parseEther, type Abi, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { RailgunAdapter } from './adapter.js';
import { railgunAbi } from './abi.js';
import { FakeWallet, shieldCalldata } from './fakes.testutil.js';

const OUT = process.env['RG_CONTRACTS_OUT'];
const ANVIL = process.env['ANVIL_BIN'] ?? '/home/user/tools/anvil';
const ready = OUT !== undefined && existsSync(join(OUT, 'RailgunSmartWallet.sol/RailgunSmartWallet.json')) && existsSync(ANVIL);
const required = process.env['REQUIRE_ANVIL'] === '1';
let proc: ChildProcess | undefined;
afterAll(() => {
  proc?.kill();
});

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });

interface Artifact { abi: Abi; bytecode: { object: Hex; linkReferences: Record<string, Record<string, { start: number; length: number }[]>> } }
const art = (n: string): Artifact => JSON.parse(readFileSync(join(OUT ?? '', `${n}.json`), 'utf8')) as Artifact;

describe.skipIf(!ready && !required)('shield against the real RailgunSmartWallet on anvil', () => {
  it('quotes the on-chain fee, shields from S1 and records the net amount from the real log', async () => {
    if (!ready) throw new Error('REQUIRE_ANVIL=1 but contracts or anvil are missing');
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
    const deployer = privateKeyToAccount(generatePrivateKey());
    const s1 = privateKeyToAccount(generatePrivateKey());
    const treasury = privateKeyToAccount(generatePrivateKey()).address;
    for (const a of [deployer, s1]) await test.setBalance({ address: a.address, value: parseEther('10') });
    const wallet = (a: typeof deployer) => createWalletClient({ account: a, chain: foundry, transport: http(url) });
    const deploy = async (name: string, args: unknown[] = [], links: Record<string, Address> = {}): Promise<Address> => {
      const a = art(name);
      let obj: string = a.bytecode.object;
      for (const refs of Object.values(a.bytecode.linkReferences)) {
        for (const [lib, spots] of Object.entries(refs)) {
          for (const s of spots) obj = obj.slice(0, 2 + s.start * 2) + (links[lib] ?? '').slice(2).toLowerCase() + obj.slice(2 + (s.start + s.length) * 2);
        }
      }
      const hash = await wallet(deployer).sendTransaction({ data: encodeDeployData({ abi: a.abi, bytecode: obj as Hex, args }) });
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.contractAddress === null || r.contractAddress === undefined) throw new Error(`deploy of ${name} failed`);
      return r.contractAddress;
    };
    const t3 = await deploy('Poseidon.sol/PoseidonT3');
    const t4 = await deploy('Poseidon.sol/PoseidonT4');
    const proxy = await deploy('RailgunSmartWallet.sol/RailgunSmartWallet', [], { PoseidonT3: t3, PoseidonT4: t4 });
    const token = await deploy('TestToken.sol/TestToken');
    const rgAbi = art('RailgunSmartWallet.sol/RailgunSmartWallet').abi;
    const w = wallet(deployer);
    await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: proxy, abi: rgAbi, functionName: 'initializeRailgunLogic', args: [treasury, 25n, 25n, 0n, deployer.address] }) });
    await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: token, abi: parseAbi(['function mint(address,uint256)']), functionName: 'mint', args: [s1.address, 10n ** 9n] }) });

    const code = (await pub.getCode({ address: proxy })) ?? '0x';
    const manifest = parseManifest({
      schema: 1, retrieved: '2026-10-21',
      entries: [{ route: 'railgun', chainId: 31337, status: 'verified', contracts: { proxy }, codeHashes: { proxy: keccak256(code) }, sources: ['local anvil deployment of Railgun-Privacy/contract 36bcf5e'] }],
    });
    const reader = createViemChainReader(() => pub);
    const fake = new FakeWallet();
    fake.shieldTo = proxy;
    const adapter = new RailgunAdapter({ manifest, chain: reader, wallet: fake });
    const req = makeRequest({ chainId: 31337, asset: token, amount: 1_000_000n, stealth: { address: s1.address, signer: { address: s1.address, signMessage: (m) => wallet(s1).signMessage({ message: m }) } }, rootSeed: makeSeed(8) });

    const q = await adapter.quoteEntry(req);
    expect(q.fee.entryFeeBps).toBe(25); // read from the real contract
    const txs = await adapter.prepareEntry(req, q);
    let last: TxReceiptLike | undefined;
    for (const tx of txs) {
      const hash = await wallet(s1).sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
      const r = await pub.waitForTransactionReceipt({ hash });
      await test.mine({ blocks: 3 });
      const head = await pub.getBlockNumber({ cacheTime: 0 });
      last = {
        transactionHash: r.transactionHash, blockNumber: r.blockNumber, from: r.from, to: r.to ?? null, status: r.status,
        logs: r.logs.map((l) => ({ address: l.address, topics: l.topics as Hex[], data: l.data, logIndex: l.logIndex, blockNumber: l.blockNumber, transactionHash: l.transactionHash })),
        confirmations: Number(head - r.blockNumber),
      };
    }
    const note = await adapter.recordEntry(req, q, last as TxReceiptLike);
    expect(note.depositedAmount).toBe(997_500n); // value - floor(value * 25 / 10000), as RailgunLogic.getFee
    expect(note.state).toBe('confirmed');
    const treasuryBalance = (await pub.readContract({ address: token, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [treasury] }));
    expect(treasuryBalance).toBe(2_500n);

    // an SDK that targets another contract or token is refused before anything is sent
    fake.shieldTo = token;
    await expect(adapter.prepareEntry(req, q)).rejects.toMatchObject({ code: 'MANIFEST_MISMATCH' });
    fake.shieldTo = proxy;
    fake.shieldData = (t, a) => shieldCalldata(t, a + 1n);
    await expect(adapter.prepareEntry(req, q)).rejects.toMatchObject({ code: 'SDK_OUTPUT_REJECTED' });
    expect(encodeFunctionData({ abi: railgunAbi, functionName: 'shieldFee' })).toBe('0x01c37790');
  }, 120_000);
});
