import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  getAddress,
  http,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { GuardedBreaker, LossBudget, TokenBucketLimiter } from '@ghostpay/relayer-guard';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseManifest } from './manifest.js';
import { buildErc20Metadata, routerFee, type RouterTarget } from './routerTargets.js';
import { NO_PERMIT, buildPermitTypedData, buildRelayIntent, toRelayPermit } from './relay/intent.js';
import { buildClearingAuthorization, buildDelegatePayIntent, isDelegatedTo } from './eip7702/intent.js';
import { buildInitCode, encodeFactoryGetAddress } from './erc4337/account.js';
import { buildPayerCalls, buildUserOperation, encodeGetNonce, getUserOpHashV07 } from './erc4337/userop.js';
import { encodeRouterPay } from './routerTargets.js';
import { SponsorService } from './sponsor/service.js';
import { createLogger } from './sponsor/log.js';
import { createViemSponsorChain } from './sponsor/viemChain.js';
import { paymasterSignerFromBox } from './sponsor/keys.js';
import { SecretBox } from '@ghostpay/secret-box';

/**
 * End-to-end on a local anvil with the REAL contracts compiled by packages/payer-hiding-contracts
 * (`forge build`): GhostPayRouter, GhostPayPayRelay, GhostPayPayerDelegate (EIP-7702 type-4 tx),
 * ERC-4337 EntryPoint v0.7 (official source, test-only), account factory and verifying paymaster, driven through
 * SponsorService. Skipped when anvil or the artifacts are missing (set REQUIRE_ANVIL=1 to fail instead).
 */
const ANVIL = process.env['ANVIL_BIN'] ?? ['/home/user/tools/anvil', '/home/user/tools/foundry/anvil'].find((p) => existsSync(p)) ?? 'anvil';
const OUT = resolve(import.meta.dirname, '../../payer-hiding-contracts/out');
const J = (f: string, c = f) => `${OUT}/${f}.sol/${c}.json`;
const needed = [J('GhostPayRouter'), J('GhostPayPayRelay'), J('GhostPayPayerDelegate'), J('EntryPoint'), J('GhostPayPayerAccountFactory'), J('GhostPayVerifyingPaymaster'), J('PermitToken'), J('ERC5564Announcer')];
const available = (ANVIL === 'anvil' || existsSync(ANVIL)) && needed.every((p) => existsSync(p));
if (!available && process.env['REQUIRE_ANVIL'] === '1') throw new Error('REQUIRE_ANVIL=1 but anvil or the forge artifacts are missing');

function artifact(path: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(readFileSync(path, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

function startAnvil(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolveP, reject) => {
    const proc = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', '31337'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const timer = setTimeout(() => reject(new Error('anvil did not start')), 20_000);
    proc.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = /Listening on ([0-9.]+:[0-9]+)/.exec(buf);
      if (m?.[1] !== undefined) {
        clearTimeout(timer);
        resolveP({ proc, url: `http://${m[1]}` });
      }
    });
    proc.once('error', reject);
    proc.once('exit', () => reject(new Error('anvil exited')));
  });
}

const ERC20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function mint(address,uint256)',
  'function nonces(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const ANNOUNCER_ABI = parseAbi(['event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)']);
const EP_ABI = parseAbi(['function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) op) view returns (bytes32)', 'function depositTo(address) payable']);

describe.skipIf(!available)('payer-hiding modes end to end on anvil', () => {
  let proc: ChildProcess | undefined;
  let url = '';
  const sponsorKey = generatePrivateKey();
  const deployerKey = generatePrivateKey();
  const sponsor = privateKeyToAccount(sponsorKey);
  const deployer = privateKeyToAccount(deployerKey);
  const feeRecipient = privateKeyToAccount(generatePrivateKey()).address;
  const stealth = privateKeyToAccount(generatePrivateKey()).address;
  const sponsorFeeTo = privateKeyToAccount(generatePrivateKey()).address;
  const pmSignerKey = SecretBox.copyOf(new Uint8Array(32).fill(0x37));
  const pmSigner = paymasterSignerFromBox(pmSignerKey);

  let pub: ReturnType<typeof createPublicClient>;
  let router: Address;
  let announcer: Address;
  let token: Address;
  let relay: Address;
  let delegate: Address;
  let entryPoint: Address;
  let factory: Address;
  let paymaster: Address;
  let service: SponsorService;
  const loss = new LossBudget({ windowMs: 60_000, perKeyLimit: 10n ** 18n, globalLimit: 10n ** 19n, maxKeys: 10 });
  let routerTarget: RouterTarget;
  const clock = () => Date.now();
  const ctx = { bucket: 'e2e' };

  async function rpc(method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    return ((await res.json()) as { result: unknown }).result;
  }

  async function deploy(name: string, file: string, args: unknown[] = []): Promise<Address> {
    const a = artifact(J(file, name));
    const w = createWalletClient({ account: deployer, transport: http(url), chain: foundry });
    const hash = await w.deployContract({ abi: a.abi, bytecode: a.bytecode, args });
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    expect(rcpt.status).toBe('success');
    return getAddress(rcpt.contractAddress as Address);
  }

  const bal = (who: Address) => pub.readContract({ address: token, abi: ERC20, functionName: 'balanceOf', args: [who] });

  beforeAll(async () => {
    const a = await startAnvil();
    proc = a.proc;
    url = a.url;
    pub = createPublicClient({ transport: http(url), chain: foundry, pollingInterval: 100 });
    for (const k of [deployer.address, sponsor.address]) await rpc('anvil_setBalance', [k, '0x56bc75e2d63100000']);
    announcer = await deploy('ERC5564Announcer', 'ERC5564Announcer');
    router = await deploy('GhostPayRouter', 'GhostPayRouter', [announcer, feeRecipient]);
    token = await deploy('PermitToken', 'PermitToken', [6]);
    relay = await deploy('GhostPayPayRelay', 'GhostPayPayRelay');
    delegate = await deploy('GhostPayPayerDelegate', 'GhostPayPayerDelegate');
    entryPoint = await deploy('EntryPoint', 'EntryPoint');
    factory = await deploy('GhostPayPayerAccountFactory', 'GhostPayPayerAccountFactory', [entryPoint]);
    paymaster = await deploy('GhostPayVerifyingPaymaster', 'GhostPayVerifyingPaymaster', [entryPoint, pmSigner.address, deployer.address, 50_000_000_000n, 2_000_000_000n, 200_000n]);
    const dep = createWalletClient({ account: deployer, transport: http(url), chain: foundry });
    await pub.waitForTransactionReceipt({ hash: await dep.writeContract({ address: entryPoint, abi: EP_ABI, functionName: 'depositTo', args: [paymaster], value: 10n ** 18n }) });

    routerTarget = { kind: 'ghostpay', address: router };
    const manifest = parseManifest({ deployments: [{ chainId: 31337, relay, delegate, accountFactory: factory, paymaster, entryPoint, supports7702: true }] });
    const wallet = createWalletClient({ account: sponsor, transport: http(url), chain: foundry });
    const chain = createViemSponsorChain(31337, pub, wallet);
    service = new SponsorService({
      chains: [{ chain, deployment: manifest.deployments[0] as never, routers: [routerTarget], tokens: [token], sponsorFeeTo }],
      price: () => Promise.resolve(3_000n * 10n ** 6n),
      safetyBps: 1000,
      quoteTtlMs: 120_000,
      maxQuotes: 50,
      maxDeadlineSeconds: 3600,
      paymasterSigner: pmSigner.sign,
      paymasterSignerAddress: pmSigner.address,
      limiter: new TokenBucketLimiter({ ratePerSecond: 100, burst: 100, maxKeys: 10 }),
      breaker: new GuardedBreaker({ windowSize: 10, minSamples: 3, failureRatio: 0.6, cooldownMs: 1000, probeTimeoutMs: 5000 }),
      loss,
      log: createLogger(() => undefined),
    });
  }, 120_000);

  afterAll(() => {
    pmSignerKey.dispose();
    proc?.kill();
  });

  const GROSS = 1_000_000_000n;
  const net = GROSS - routerFee(GROSS);
  const pay = () => ({ token, stealth, gross: GROSS, minNet: net, deadline: BigInt(Math.floor(clock() / 1000) + 86_400), ephemeralPubKey: `0x02${'12'.repeat(32)}` as Hex, metadata: buildErc20Metadata(0xab, token, net) });
  const mint = async (to: Address, amount = 10n * GROSS) => {
    const w = createWalletClient({ account: deployer, transport: http(url), chain: foundry });
    await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: token, abi: ERC20, functionName: 'mint', args: [to, amount] }) });
  };
  const nowSec = () => BigInt(Math.floor(clock() / 1000));

  /** Addresses in the receipt logs and the transaction sender (the observer's view). */
  async function observe(txHash: Hex) {
    const rcpt = await pub.getTransactionReceipt({ hash: txHash });
    const transfers: { from: Address; to: Address; value: bigint }[] = [];
    let announceCaller: Address | undefined;
    for (const l of rcpt.logs) {
      try {
        const e = decodeEventLog({ abi: ERC20, data: l.data, topics: l.topics });
        if (e.eventName === 'Transfer') transfers.push({ from: getAddress(e.args.from), to: getAddress(e.args.to), value: e.args.value });
      } catch {
        /* other event */
      }
      try {
        const e = decodeEventLog({ abi: ANNOUNCER_ABI, data: l.data, topics: l.topics });
        announceCaller = getAddress(e.args.caller);
        expect(getAddress(e.args.stealthAddress)).toBe(stealth);
      } catch {
        /* other event */
      }
    }
    return { rcpt, transfers, announceCaller };
  }

  it('PH-2 permit relay: payer with zero native token pays; sponsor gets the fee; relay keeps nothing', async () => {
    const payer = privateKeyToAccount(generatePrivateKey());
    await mint(payer.address);
    expect(await pub.getBalance({ address: payer.address })).toBe(0n);
    const q = await service.quote(ctx, { mode: 'permit-relay', chainId: 31337, token, gross: GROSS });
    const b = buildRelayIntent({ chainId: 31337, relay, payer: payer.address, router: routerTarget, pay: pay(), sponsorFee: q.sponsorFee, sponsorFeeTo: q.sponsorFeeTo, deadline: nowSec() + 600n, nonce: 1n });
    const sig = await payer.signTypedData(b.typedData);
    const deadline = nowSec() + 600n;
    const nonce = await pub.readContract({ address: token, abi: ERC20, functionName: 'nonces', args: [payer.address] });
    const permitSig = await payer.signTypedData(buildPermitTypedData({ chainId: 31337, token, tokenName: 'PermitToken', tokenVersion: '1', owner: payer.address, spender: relay, value: GROSS + q.sponsorFee, nonce, deadline }));
    const permit = toRelayPermit(permitSig, GROSS + q.sponsorFee, deadline);
    const before = await bal(payer.address);
    const { txHash } = await service.submitRelay(ctx, { quoteId: q.quoteId, chainId: 31337, router: routerTarget, intent: b.intent, routerCalldata: b.routerCalldata, sig, permit });

    expect(await bal(stealth)).toBeGreaterThanOrEqual(net);
    expect(before - (await bal(payer.address))).toBe(GROSS + q.sponsorFee);
    expect(await bal(sponsorFeeTo)).toBe(q.sponsorFee);
    expect(await bal(relay)).toBe(0n);
    expect(await pub.getBalance({ address: payer.address })).toBe(0n);
    // observer view (spec section 8): tx sender = sponsor, the seller sees the RELAY as sender of the transfer into the stealth address
    const o = await observe(txHash);
    const tx = await pub.getTransaction({ hash: txHash });
    expect(getAddress(tx.from)).toBe(getAddress(sponsor.address));
    expect(o.transfers.find((t) => t.to === stealth)?.from).toBe(relay);
    expect(o.transfers.some((t) => t.from === getAddress(payer.address) && t.to === relay)).toBe(true); // N1: the payer is still public
    expect(o.announceCaller).toBe(router);
    // the same order cannot be replayed
    const q2 = await service.quote(ctx, { mode: 'permit-relay', chainId: 31337, token, gross: GROSS });
    await expect(service.submitRelay(ctx, { quoteId: q2.quoteId, chainId: 31337, router: routerTarget, intent: { ...b.intent, sponsorFee: q2.sponsorFee }, routerCalldata: b.routerCalldata, sig, permit: NO_PERMIT })).rejects.toBeDefined();
  }, 60_000);

  it('PH-3 EIP-7702: fresh EOA with zero native delegates, a sponsor submits the type-4 tx, router sees the payer', async () => {
    const payer = privateKeyToAccount(generatePrivateKey());
    await mint(payer.address);
    expect(await pub.getBalance({ address: payer.address })).toBe(0n);
    const q = await service.quote(ctx, { mode: 'eip7702-sponsored', chainId: 31337, token, gross: GROSS });
    const manifest = parseManifest({ deployments: [{ chainId: 31337, delegate }] });
    const nonce = await pub.getTransactionCount({ address: payer.address });
    const b = buildDelegatePayIntent({ chainId: 31337, manifest, delegate, payer: payer.address, payerAccountNonce: nonce, router: routerTarget, pay: pay(), sponsorFee: q.sponsorFee, sponsorFeeTo: q.sponsorFeeTo, deadline: nowSec() + 600n, nonce: 1n });
    expect(b.authorization.chainId).toBe(31337);
    const sig = await payer.signTypedData(b.typedData);
    const auth = await payer.signAuthorization(b.authorization);
    const before = await bal(payer.address);
    const feeBefore = await bal(sponsorFeeTo);
    const { txHash } = await service.submitEip7702(ctx, {
      quoteId: q.quoteId, chainId: 31337, payer: payer.address, router: routerTarget, intent: b.intent, routerCalldata: b.routerCalldata, sig,
      authorization: { chainId: auth.chainId, address: auth.address, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity ?? 0 },
    });
    expect(before - (await bal(payer.address))).toBe(GROSS + q.sponsorFee);
    expect((await bal(sponsorFeeTo)) - feeBefore).toBe(q.sponsorFee);
    expect(await pub.getBalance({ address: payer.address })).toBe(0n);
    const code = (await pub.getCode({ address: payer.address })) ?? '0x';
    expect(isDelegatedTo(code, delegate)).toBe(true); // N4: persistent fingerprint
    const o = await observe(txHash);
    const tx = await pub.getTransaction({ hash: txHash });
    expect(getAddress(tx.from)).toBe(getAddress(sponsor.address));
    expect(tx.type).toBe('eip7702');
    expect(o.transfers.find((t) => t.to === stealth)?.from).toBe(getAddress(payer.address)); // router saw the payer EOA
    expect(await bal(payer.address)).toBe(before - GROSS - q.sponsorFee);
    // clearing authorization removes the delegation (sponsor sends it; payer signs with its next nonce)
    const clear = await payer.signAuthorization(buildClearingAuthorization({ chainId: 31337, payerAccountNonce: await pub.getTransactionCount({ address: payer.address }) + 0 }));
    const w = createWalletClient({ account: sponsor, transport: http(url), chain: foundry });
    await pub.waitForTransactionReceipt({ hash: await w.sendTransaction({ to: payer.address, data: '0x', authorizationList: [clear] }) });
    expect(await pub.getCode({ address: payer.address })).toBeUndefined();
  }, 60_000);

  it('PH-3 grief: a stale authorization makes the type-4 transaction a no-op; the sponsor detects the unpaid transaction and charges the loss', async () => {
    const payer = privateKeyToAccount(generatePrivateKey());
    await mint(payer.address);
    const q = await service.quote(ctx, { mode: 'eip7702-sponsored', chainId: 31337, token, gross: GROSS });
    const manifest = parseManifest({ deployments: [{ chainId: 31337, delegate }] });
    const b = buildDelegatePayIntent({ chainId: 31337, manifest, delegate, payer: payer.address, payerAccountNonce: 0, router: routerTarget, pay: pay(), sponsorFee: q.sponsorFee, sponsorFeeTo: q.sponsorFeeTo, deadline: nowSec() + 600n, nonce: 1n });
    const sig = await payer.signTypedData(b.typedData);
    // the authorization names a nonce the payer account no longer has (stale), so it is skipped on chain
    const stale = await payer.signAuthorization({ ...b.authorization, nonce: 7 });
    const before = await bal(payer.address);
    const spent = loss.charge('probe', 0n);
    await expect(
      service.submitEip7702(ctx, {
        quoteId: q.quoteId, chainId: 31337, payer: payer.address, router: routerTarget, intent: b.intent, routerCalldata: b.routerCalldata, sig,
        authorization: { chainId: stale.chainId, address: stale.address, nonce: stale.nonce, r: stale.r, s: stale.s, yParity: stale.yParity ?? 0 },
      }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(await bal(payer.address)).toBe(before); // nothing was paid
    expect((await pub.getCode({ address: payer.address })) ?? '0x').toBe('0x'); // not delegated
    expect(loss.charge(ctx.bucket, 0n)).toBeGreaterThan(0n); // the sponsor's wasted gas was charged to this client bucket
    expect(spent).toBe(0n);
  }, 60_000);

  it('PH-4 ERC-4337: counterfactual account with zero native deploys through initCode, paymaster pays gas', async () => {
    const owner = privateKeyToAccount(generatePrivateKey());
    const saltNonce = 5n;
    const sender = getAddress(`0x${(await pub.call({ to: factory, data: encodeFactoryGetAddress(owner.address, saltNonce) })).data?.slice(26)}`);
    await mint(sender);
    expect(await pub.getBalance({ address: sender })).toBe(0n);
    expect(((await pub.getCode({ address: sender })) ?? '0x')).toBe('0x');
    const q = await service.quote(ctx, { mode: 'erc4337-paymaster', chainId: 31337, token, gross: GROSS });
    const routerCalldata = encodeRouterPay(routerTarget, pay());
    const nonce = BigInt((await pub.call({ to: entryPoint, data: encodeGetNonce(sender) })).data ?? '0x0');
    // fee fields within the sponsor's live-price bound and the paymaster's immutable caps (CONTRACTS-POOLS-01)
    const gp = await pub.getGasPrice();
    const tip = gp < 1_000_000_000n ? gp : 1_000_000_000n;
    const built = buildUserOperation({
      chainId: 31337, entryPoint, sender, initCode: buildInitCode(factory, owner.address, saltNonce), nonce,
      calls: buildPayerCalls({ token, router, routerCalldata, gross: GROSS, sponsorFee: q.sponsorFee, sponsorFeeTo: q.sponsorFeeTo }),
      gas: { verificationGasLimit: 1_500_000n, callGasLimit: 1_000_000n, preVerificationGas: 100_000n, maxFeePerGas: gp, maxPriorityFeePerGas: tip },
    });
    const req = { quoteId: q.quoteId, chainId: 31337, router: routerTarget, routerCalldata, owner: owner.address, saltNonce, sponsorFee: q.sponsorFee, userOp: built.userOp };
    const sponsored = await service.sponsorUserOp(ctx, req);
    const withPm = { ...built.userOp, paymasterAndData: sponsored.paymasterAndData };
    const hash = getUserOpHashV07(withPm, entryPoint, 31337);
    // PH-4-REQ-4: the TypeScript hash equals the one the real EntryPoint computes
    const onChain = await pub.readContract({ address: entryPoint, abi: EP_ABI, functionName: 'getUserOpHash', args: [withPm] });
    expect(hash).toBe(onChain);
    const signed = { ...withPm, signature: await owner.sign({ hash }) };
    const feeBefore = await bal(sponsorFeeTo);
    const depositBefore = await pub.readContract({ address: entryPoint, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [paymaster] });
    const { txHash } = await service.submitUserOp(ctx, { ...req, userOp: signed });
    expect(((await pub.getCode({ address: sender })) ?? '0x').length).toBeGreaterThan(2);
    expect(await pub.getBalance({ address: sender })).toBe(0n);
    expect(await bal(sender)).toBe(10n * GROSS - GROSS - q.sponsorFee);
    expect((await bal(sponsorFeeTo)) - feeBefore).toBe(q.sponsorFee);
    const depositAfter = await pub.readContract({ address: entryPoint, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [paymaster] });
    expect(depositAfter).toBeLessThan(depositBefore);
    const o = await observe(txHash);
    const tx = await pub.getTransaction({ hash: txHash });
    expect(getAddress(tx.from)).toBe(getAddress(sponsor.address)); // bundler tx sender
    expect(o.transfers.find((t) => t.to === stealth)?.from).toBe(sender); // router saw the account
    expect(encodeAbiParameters([{ type: 'address' }], [sender])).toBeDefined();
  }, 90_000);
});
