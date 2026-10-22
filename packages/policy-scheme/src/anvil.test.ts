// Real-contract cross-check on a local anvil: deploys PolicyAccount + PolicyAccountFactory from the
// vector deployer key and compares addresses, hashes and signatures of this package (and of
// test-vectors/policy-scheme.json) with what the compiled contracts compute and accept.
// Skips when anvil or the forge artifacts are missing, unless REQUIRE_ANVIL=1 (CI), where it fails.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { secretScalarFromBytes, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createPublicClient, createWalletClient, decodeEventLog, encodeFunctionData, http, type Abi, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildCancelDestinationTypedData,
  buildPolicyPaymentTx,
  checkScheme2Announcement,
  decodePolicyPaymentCalldata,
  deriveScheme2OwnerKey,
  deriveScheme2Payment,
  buildCancelWithdrawTypedData,
  buildLimitsTree,
  buildProposeDestinationTypedData,
  buildWithdrawTypedData,
  computePolicyHash,
  encodeCancelDestination,
  encodeCancelWithdraw,
  encodeDeployAccount,
  encodeExecuteWithdraw,
  encodeProposeDestination,
  encodeRequestWithdraw,
  getLimitProof,
  noLimitsProof,
  policyAccountAbi,
  policyAccountFactoryAbi,
  ghostPayPolicyRouterAbi,
  policyDomain,
  policyDomainSeparator,
  signPolicyTypedData,
  ZERO_ADDRESS,
  type Address,
  type CallRequest,
  type Hex,
} from './index.js';
import { hexBytes, toLimits, vectors, type VectorAccount } from './fixtures.testutil.js';

const ARTIFACTS = resolve(import.meta.dirname, process.env['POLICY_SCHEME_ARTIFACTS'] ?? '../../contracts/out');
const IMPL_JSON = `${ARTIFACTS}/PolicyAccount.sol/PolicyAccount.json`;
const FACTORY_JSON = `${ARTIFACTS}/PolicyAccountFactory.sol/PolicyAccountFactory.json`;
const ROUTER_JSON = `${ARTIFACTS}/GhostPayPolicyRouter.sol/GhostPayPolicyRouter.json`;
const ANNOUNCER_JSON = `${ARTIFACTS}/ERC5564Announcer.sol/ERC5564Announcer.json`;
const TOKEN_JSON = `${ARTIFACTS}/MockERC20.sol/MockERC20.json`;
const routerArtifacts = [ROUTER_JSON, ANNOUNCER_JSON, TOKEN_JSON].every((f) => existsSync(f));
const ANVIL = process.env['ANVIL_BIN'] ?? 'anvil';
const anvilOk = spawnSync(ANVIL, ['--version'], { stdio: 'ignore' }).status === 0;
const available = anvilOk && existsSync(IMPL_JSON) && existsSync(FACTORY_JSON) && routerArtifacts;
const required = process.env['REQUIRE_ANVIL'] === '1';

if (required && !available) {
  describe('policy-scheme anvil cross-check', () => {
    it('REQUIRE_ANVIL=1 but anvil or contract artifacts are missing', () => {
      expect.fail(`anvil=${String(anvilOk)} artifacts=${ARTIFACTS}`);
    });
  });
}

const FEE_RECIPIENT: Address = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

function artifact(path: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(readFileSync(path, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}
const bytecode = (path: string): Hex => artifact(path).bytecode;

function startAnvil(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((ok, reject) => {
    const proc = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', String(vectors.deployment.chainId)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    const timer = setTimeout(() => reject(new Error('anvil did not start')), 20_000);
    proc.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = /Listening on ([0-9.]+:[0-9]+)/.exec(buf);
      if (m?.[1] !== undefined) {
        clearTimeout(timer);
        ok({ proc, url: `http://${m[1]}` });
      }
    });
    proc.once('error', reject);
  });
}

describe.skipIf(!available)('policy-scheme anvil cross-check (real PolicyAccount + PolicyAccountFactory)', () => {
  let proc: ChildProcess | undefined;
  let url = '';
  let pub: PublicClient;
  let wallet: WalletClient;
  const deployer = privateKeyToAccount(vectors.deployment.deployerPrivateKey);
  const dep = { factory: vectors.deployment.factory, implementation: vectors.deployment.implementation };

  const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = (await res.json()) as { result?: unknown; error?: unknown };
    if (j.error !== undefined) throw new Error(JSON.stringify(j.error));
    return j.result;
  };
  const send = async (c: CallRequest): Promise<'success' | 'reverted'> => {
    const hash = await wallet.sendTransaction({ account: deployer, to: c.to, data: c.data, value: c.value, chain: null, gas: 1_000_000n });
    return (await pub.waitForTransactionReceipt({ hash })).status;
  };
  const read = <T>(address: Address, functionName: string, args: unknown[] = []): Promise<T> =>
    pub.readContract({ address, abi: policyAccountAbi, functionName: functionName as never, args: args });
  const warp = async (seconds: bigint): Promise<void> => {
    await rpc('evm_increaseTime', [Number(seconds)]);
    await rpc('evm_mine', []);
  };
  const policyOf = (a: VectorAccount) => ({ destination: a.policy.destination, delaySeconds: BigInt(a.policy.delaySeconds), limitsRoot: a.policy.limitsRoot });
  const acct = (id: string) => vectors.accounts.find((a) => a.id === id) as VectorAccount;

  beforeAll(async () => {
    const a = await startAnvil();
    proc = a.proc;
    url = a.url;
    pub = createPublicClient({ transport: http(url), pollingInterval: 50 });
    wallet = createWalletClient({ account: deployer, transport: http(url), pollingInterval: 50 });
    await rpc('anvil_setBalance', [deployer.address, '0x56bc75e2d63100000']);
    const h1 = await wallet.deployContract({ abi: policyAccountAbi, bytecode: bytecode(IMPL_JSON), chain: null, account: deployer });
    const impl = (await pub.waitForTransactionReceipt({ hash: h1 })).contractAddress;
    const h2 = await wallet.deployContract({
      abi: policyAccountFactoryAbi,
      bytecode: bytecode(FACTORY_JSON),
      args: [impl as Address, ZERO_ADDRESS, 0n, FEE_RECIPIENT],
      chain: null,
      account: deployer,
    });
    const factory = (await pub.waitForTransactionReceipt({ hash: h2 })).contractAddress;
    expect(impl?.toLowerCase()).toBe(dep.implementation.toLowerCase());
    expect(factory?.toLowerCase()).toBe(dep.factory.toLowerCase());
  });

  afterAll(() => {
    proc?.kill();
  });

  it('typehashes and factory constants match the package', async () => {
    const t = vectors.typehashes;
    expect(await read<Hex>(dep.implementation, 'WITHDRAW_TYPEHASH')).toBe(t.Withdraw);
    expect(await read<Hex>(dep.implementation, 'CANCEL_WITHDRAW_TYPEHASH')).toBe(t.CancelWithdraw);
    expect(await read<Hex>(dep.implementation, 'PROPOSE_DESTINATION_TYPEHASH')).toBe(t.ProposeDestination);
    expect(await read<Hex>(dep.implementation, 'CANCEL_DESTINATION_TYPEHASH')).toBe(t.CancelDestination);
    const f = (functionName: string, args: unknown[] = []) =>
      pub.readContract({ address: dep.factory, abi: policyAccountFactoryAbi, functionName: functionName as never, args: args });
    expect(await f('MIN_DELAY')).toBe(3600n);
    expect(await f('MAX_DELAY')).toBe(2592000n);
    expect(((await f('IMPLEMENTATION')) as string).toLowerCase()).toBe(dep.implementation.toLowerCase());
  });

  it('predictAddress / policyHashOf equal the package and vectors; deploy lands there', async () => {
    for (const a of vectors.accounts) {
      const ph = computePolicyHash(policyOf(a));
      const onchainHash = await pub.readContract({
        address: dep.factory,
        abi: policyAccountFactoryAbi,
        functionName: 'policyHashOf',
        args: [a.policy.destination, BigInt(a.policy.delaySeconds), a.policy.limitsRoot],
      });
      expect(onchainHash).toBe(ph);
      const predicted = await pub.readContract({ address: dep.factory, abi: policyAccountFactoryAbi, functionName: 'predictAddress', args: [a.ownerAddress, ph] });
      expect(predicted).toBe(a.accountAddress);
      const tx = encodeDeployAccount(dep, a.ownerAddress, policyOf(a));
      expect(tx.account).toBe(a.accountAddress);
      expect(await send(tx)).toBe('success');
      expect(await read<Address>(a.accountAddress, 'owner')).toBe(a.ownerAddress);
      expect(await read<Hex>(a.accountAddress, 'policyHash')).toBe(a.policyHash);
      expect(await read<Hex>(a.accountAddress, 'DOMAIN_SEPARATOR')).toBe(
        policyDomainSeparator(policyDomain(vectors.deployment.chainId, a.accountAddress)),
      );
    }
  });

  it.each(['acct-001', 'acct-003'])('%s: vector withdraw signature (limits tree) is accepted, executes after the delay', async (id) => {
    const a = acct(id);
    const o = vectors.orders.find((x) => x.account === a.id);
    if (o === undefined) throw new Error('missing order');
    await rpc('anvil_setBalance', [a.accountAddress, '0xde0b6b3a7640000']);
    const tree = buildLimitsTree(toLimits(vectors.limitTrees.find((t) => t.id === a.policy.tree) as never));
    const proof = getLimitProof(tree, ZERO_ADDRESS);
    const m = o.withdraw.message;
    const td = buildWithdrawTypedData({
      chainId: o.chainId,
      account: a.accountAddress,
      token: m.token,
      amount: BigInt(m.amount),
      deadline: BigInt(m.deadline),
      nonce: BigInt(m.nonce),
      limit: { limitsRoot: a.policy.limitsRoot, proof },
    });
    expect(await send(encodeRequestWithdraw(td, proof, o.withdraw.signature))).toBe('success');
    const req = await read<{ status: number; amount: bigint; limit: bigint }>(a.accountAddress, 'requests', [td.structHash]);
    expect(req.status).toBe(1);
    expect(req.limit).toBe(proof.limit);
    expect(await read<boolean>(a.accountAddress, 'nonceUsed', [BigInt(m.nonce)])).toBe(true);
    const before = await pub.getBalance({ address: a.policy.destination });
    expect(await send(encodeExecuteWithdraw(a.accountAddress, td.structHash))).toBe('reverted');
    await warp(BigInt(a.policy.delaySeconds) + 1n);
    expect(await send(encodeExecuteWithdraw(a.accountAddress, td.structHash))).toBe('success');
    expect((await pub.getBalance({ address: a.policy.destination })) - before).toBe(BigInt(m.amount));
  });

  it('package-signed withdraw and cancel on a no-limits account; a wrong signer is rejected', async () => {
    const a = acct('acct-002');
    await rpc('anvil_setBalance', [a.accountAddress, '0xde0b6b3a7640000']);
    const owner = secretScalarFromBytes(hexBytes(a.ownerPrivateKey));
    const latest = await pub.getBlock();
    const td = buildWithdrawTypedData({
      chainId: vectors.deployment.chainId,
      account: a.accountAddress,
      token: ZERO_ADDRESS,
      amount: 12345n,
      deadline: latest.timestamp + 600n,
      nonce: 2n ** 255n + 3n,
      limit: null,
    });
    const intruder = secretScalarFromBytes(hexBytes(vectors.accounts[0]?.ownerPrivateKey as Hex));
    const forged = await signPolicyTypedData(td, intruder);
    expect(await send(encodeRequestWithdraw(td, noLimitsProof(), forged))).toBe('reverted');
    const sig = await signPolicyTypedData(td, owner, a.ownerAddress);
    expect(await send(encodeRequestWithdraw(td, noLimitsProof(), sig))).toBe('success');
    const cancel = buildCancelWithdrawTypedData(vectors.deployment.chainId, a.accountAddress, td.structHash);
    expect(await send(encodeCancelWithdraw(a.accountAddress, td.structHash, await signPolicyTypedData(cancel, owner)))).toBe('success');
    const req = await read<{ status: number }>(a.accountAddress, 'requests', [td.structHash]);
    expect(req.status).toBe(3);
  });

  it('vector propose/cancel destination signatures are accepted', async () => {
    const a = acct('acct-003');
    const o = vectors.orders.find((x) => x.account === a.id);
    if (o === undefined) throw new Error('missing order');
    const pm = o.proposeDestination.message;
    const pd = buildProposeDestinationTypedData({
      chainId: o.chainId,
      account: a.accountAddress,
      newDestination: pm.newDestination,
      deadline: BigInt(pm.deadline),
      nonce: BigInt(pm.nonce),
    });
    expect(await send(encodeProposeDestination(pd, o.proposeDestination.signature))).toBe('success');
    expect(await read<Hex>(a.accountAddress, 'pendingProposalId')).toBe(pd.structHash);
    expect(await read<Address>(a.accountAddress, 'pendingDestination')).toBe(pm.newDestination);
    const cd = buildCancelDestinationTypedData(o.chainId, a.accountAddress, pd.structHash);
    expect(cd.digest).toBe(o.cancelDestination.digest);
    expect(await send(encodeCancelDestination(a.accountAddress, pd.structHash, o.cancelDestination.signature))).toBe('success');
    expect(await read<bigint>(a.accountAddress, 'pendingEffectiveAt')).toBe(0n);
  });
  it('GhostPayPolicyRouter: pay a counterfactual account, scan the announcement, deploy, withdraw', async () => {
    const a = acct('acct-004');
    const deploy = async (path: string, args: unknown[]): Promise<Address> => {
      const art = artifact(path);
      const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args: args, chain: null, account: deployer });
      return (await pub.waitForTransactionReceipt({ hash })).contractAddress as Address;
    };
    const announcer = await deploy(ANNOUNCER_JSON, []);
    const router = await deploy(ROUTER_JSON, [announcer, FEE_RECIPIENT, dep.factory]);
    const token = await deploy(TOKEN_JSON, ['Mock', 'MOCK', 6]);
    const tokenAbi = artifact(TOKEN_JSON).abi;
    const viewingSecret = secretScalarFromBytes(hexBytes(a.viewingPrivateKey));
    const spendingSecret = secretScalarFromBytes(hexBytes(a.spendingPrivateKey));
    const spend = hexBytes(a.spendingPublicKey);
    const now = (await pub.getBlock()).timestamp;

    // Native payment to a fresh counterfactual account.
    const pay = deriveScheme2Payment(a.metaAddress, dep);
    const native = buildPolicyPaymentTx({ router, feeRecipient: FEE_RECIPIENT, deployment: dep, payment: pay, token: 'native', gross: 10n ** 16n, deadline: now + 600n, now });
    expect(decodePolicyPaymentCalldata(native.tx.data, dep).stealth).toBe(pay.accountAddress);
    const h = await wallet.sendTransaction({ account: deployer, to: native.tx.to, data: native.tx.data, value: native.tx.value, chain: null });
    const receipt = await pub.waitForTransactionReceipt({ hash: h });
    expect(receipt.status).toBe('success');
    expect(await pub.getBalance({ address: pay.accountAddress })).toBe(native.net);
    const log = receipt.logs.find((l) => l.address.toLowerCase() === announcer.toLowerCase());
    if (log === undefined) throw new Error('no announcement');
    const ev = decodeEventLog({ abi: artifact(ANNOUNCER_JSON).abi, data: log.data, topics: log.topics }) as unknown as {
      args: { schemeId: bigint; stealthAddress: Address; ephemeralPubKey: Hex; metadata: Hex };
    };
    expect(ev.args.schemeId).toBe(0x47500002n);
    const ann = { schemeId: ev.args.schemeId, stealthAddress: ev.args.stealthAddress, ephemeralPublicKey: ev.args.ephemeralPubKey, metadata: ev.args.metadata };
    const check = checkScheme2Announcement(ann, viewingSecret, spend as never, [a.policyHash], dep);
    expect(check).toEqual({ matches: true, ownerAddress: pay.ownerAddress, accountAddress: pay.accountAddress, policyHash: a.policyHash });

    // ERC-20 payment to the same account.
    await send({ to: token, data: encodeFunctionData({ abi: tokenAbi, functionName: 'mint', args: [deployer.address, 10n ** 9n] }), value: 0n });
    await send({ to: token, data: encodeFunctionData({ abi: tokenAbi, functionName: 'approve', args: [router, 10n ** 9n] }), value: 0n });
    const erc = buildPolicyPaymentTx({ router, feeRecipient: FEE_RECIPIENT, deployment: dep, payment: pay, token, gross: 4_000_000n, deadline: now + 600n });
    expect(await send(erc.tx)).toBe('success');
    const bal = (who: Address) => pub.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [who] });
    expect(await bal(pay.accountAddress)).toBe(erc.net);
    expect(await bal(FEE_RECIPIENT)).toBe(erc.fee);
    // Router rejects a stealth address that is not the policy account of (owner, policyHash).
    const bad = encodeFunctionData({ abi: ghostPayPolicyRouterAbi, functionName: 'payNative', args: [a.policy.destination, { owner: pay.ownerAddress, policyHash: a.policyHash }, 1n, now + 600n, `0x${bytesToHex(pay.ephemeralPublicKey)}`, native.metadata] });
    expect(await send({ to: router, data: `0x${bad.slice(2)}`, value: 10n ** 16n })).toBe('reverted');

    // Recover the owner key, deploy the account, withdraw the ERC-20 (tree-1 has only a native leaf,
    // so the token can never leave: the limits tree is enforced) and the native coin.
    const key = deriveScheme2OwnerKey(ann, { viewingSecret, spendingSecret }, spend as never, [a.policyHash], dep);
    expect(`0x${bytesToHex(unsafeRevealSecret(key.ownerSecret))}`).not.toBe(a.ownerPrivateKey);
    const policy = policyOf(a);
    expect(await send(encodeDeployAccount(dep, key.ownerAddress, policy))).toBe('success');
    const tree = buildLimitsTree(toLimits(vectors.limitTrees.find((t) => t.id === a.policy.tree) as never));
    const proof = getLimitProof(tree, ZERO_ADDRESS);
    const td = buildWithdrawTypedData({ chainId: vectors.deployment.chainId, account: key.accountAddress, token: ZERO_ADDRESS, amount: native.net, deadline: now + 3600n, nonce: 1n, limit: { limitsRoot: tree.root, proof } });
    const sig = await signPolicyTypedData(td, key.ownerSecret, key.ownerAddress);
    expect(await send(encodeRequestWithdraw(td, proof, sig))).toBe('success');
    const tdToken = buildWithdrawTypedData({ chainId: vectors.deployment.chainId, account: key.accountAddress, token, amount: 1n, deadline: now + 3600n, nonce: 2n, limit: { limitsRoot: tree.root, proof } });
    expect(() => encodeRequestWithdraw(tdToken, proof, '0x')).toThrow(/limitLeafHash/);
    // Bypass the client check: the contract itself refuses the mismatched leaf (LimitLeafMismatch).
    const raw = encodeFunctionData({
      abi: policyAccountAbi,
      functionName: 'requestWithdraw',
      args: [tdToken.message, { limit: proof.limit, windowSeconds: proof.windowSeconds, proof: [...proof.proof] }, (await signPolicyTypedData(tdToken, key.ownerSecret)).signature],
    });
    expect(await send({ to: key.accountAddress, data: raw, value: 0n })).toBe('reverted');
    const before = await pub.getBalance({ address: a.policy.destination });
    await warp(BigInt(a.policy.delaySeconds) + 1n);
    expect(await send(encodeExecuteWithdraw(key.accountAddress, td.structHash))).toBe('success');
    expect((await pub.getBalance({ address: a.policy.destination })) - before).toBe(native.net);
  });
});
