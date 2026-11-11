import { CHAINS } from '@ghostpay/chain-adapters';
import { parseCompressedPoint, secretScalarFromBytes } from '@ghostpay/core-crypto';
import {
  ZERO_ADDRESS,
  decodePolicyPaymentCalldata,
  deriveScheme2OwnerKey,
  ghostPayPolicyRouterAbi,
  parsePolicyRecord,
  policyAccountAbi,
  serializePolicyRecord,
  type Address,
  type Hex,
} from '@ghostpay/policy-scheme';
import { recoverTypedDataAddress } from 'viem';
import { decodeFunctionData } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { PINNED_POLICY_DEPLOYMENTS, readAccount, readBalance, readWindow, verifyPolicyDeployment, chainNow, readNonceUsed } from './chain';
import { createPolicyMetaAddress, DELAY_PRESETS } from './create';
import { POLICY_FLAG, isPolicyFeatureEnabled } from './flag';
import { fetchAccountEvents, summarizeAccount } from './guard';
import { preparePolicyPayment } from './pay';
import { fetchScheme2Announcements, matchScheme2, mergeMatches } from './scan2';
import { deployCall, planWithdraw, randomNonce, signCancel, signWithdraw } from './withdraw';
import {
  ANNOUNCER,
  DEPLOYMENT,
  ROUTER,
  SEPOLIA,
  account,
  accountCalls,
  accountLog,
  clientVectors,
  deploymentCalls,
  fakeChain,
  fixedRng,
  hexToU8,
  limitRows,
  scheme2Log,
} from './fixtures.testutil';

const sepolia = CHAINS.find((c) => c.chainId === SEPOLIA)!;
const mainnet = CHAINS.find((c) => c.chainId === 1)!;
const a1 = account('acct-001');
const a2 = account('acct-002');
const canonical = (id: string): string => clientVectors.records.valid.find((v) => v.id === id)!.canonical;

describe('feature flag', () => {
  it('is off unless the build sets the flag to exactly "1"', () => {
    expect(isPolicyFeatureEnabled({})).toBe(false);
    expect(isPolicyFeatureEnabled({ [POLICY_FLAG]: 'true' })).toBe(false);
    expect(isPolicyFeatureEnabled({ [POLICY_FLAG]: 1 })).toBe(false);
    expect(isPolicyFeatureEnabled({ [POLICY_FLAG]: '1' })).toBe(true);
    expect(isPolicyFeatureEnabled()).toBe(false);
  });
  it('no network has a pinned policy deployment', () => {
    expect(Object.keys(PINNED_POLICY_DEPLOYMENTS)).toEqual([]);
  });
});

describe('create policy meta-address (vectors)', () => {
  it('reproduces acct-001 (two limits) and its canonical record', () => {
    const rec = createPolicyMetaAddress({
      spendingPublicKeyHex: a1.spendingPublicKey,
      viewingPublicKeyHex: a1.viewingPublicKey,
      destination: a1.policy.destination,
      delaySeconds: BigInt(a1.policy.delaySeconds),
      limits: [...limitRows(a1), { token: '', limit: '', windowSeconds: '' }],
    });
    expect(rec.metaAddress).toBe(a1.metaAddress);
    expect(serializePolicyRecord(rec)).toBe(canonical('acct-001'));
  });
  it('reproduces acct-002 (no limits)', () => {
    const rec = createPolicyMetaAddress({ spendingPublicKeyHex: a2.spendingPublicKey, viewingPublicKeyHex: a2.viewingPublicKey, destination: a2.policy.destination, delaySeconds: 3600n, limits: [] });
    expect(serializePolicyRecord(rec)).toBe(canonical('acct-002'));
  });
  it('accepts "native" and "unlimited" shorthands', () => {
    const rec = createPolicyMetaAddress({ spendingPublicKeyHex: a2.spendingPublicKey, viewingPublicKeyHex: a2.viewingPublicKey, destination: a2.policy.destination, delaySeconds: 7200n, limits: [{ token: 'native', limit: 'unlimited', windowSeconds: '0' }] });
    expect(rec.limits).toEqual([{ token: ZERO_ADDRESS, limit: 2n ** 256n - 1n, windowSeconds: 0n }]);
  });
  it('refuses invalid input with fixed messages', () => {
    const base = { spendingPublicKeyHex: a2.spendingPublicKey, viewingPublicKeyHex: a2.viewingPublicKey, destination: a2.policy.destination, delaySeconds: 3600n, limits: [] };
    expect(() => createPolicyMetaAddress({ ...base, destination: '0xabc' })).toThrow(/checksummed/);
    expect(() => createPolicyMetaAddress({ ...base, delaySeconds: 3599n })).toThrow(/1 hour and 30 days/);
    expect(() => createPolicyMetaAddress({ ...base, delaySeconds: 2_592_001n })).toThrow(/1 hour and 30 days/);
    expect(() => createPolicyMetaAddress({ ...base, limits: [{ token: '0xnope', limit: '1', windowSeconds: '1' }] })).toThrow(/Limit 1: token/);
    expect(() => createPolicyMetaAddress({ ...base, limits: [{ token: 'native', limit: '0', windowSeconds: '1' }] })).toThrow(/Limit 1: amount/);
    expect(() => createPolicyMetaAddress({ ...base, limits: [{ token: 'native', limit: '5', windowSeconds: 'x' }] })).toThrow(/Limit 1: window/);
    expect(() => createPolicyMetaAddress({ ...base, limits: [{ token: 'native', limit: '5', windowSeconds: '0' }] })).toThrow(/at least one second/);
  });
  it('delay presets are all accepted by the factory rules', () => {
    for (const p of DELAY_PRESETS) {
      expect(() => createPolicyMetaAddress({ spendingPublicKeyHex: a2.spendingPublicKey, viewingPublicKeyHex: a2.viewingPublicKey, destination: a2.policy.destination, delaySeconds: p.seconds, limits: [] })).not.toThrow();
    }
  });
});

describe('pay via policy router', () => {
  it('derives the vector account and builds a self-checked payNative call', () => {
    const p = preparePolicyPayment({ metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1_800_000_000n, rng: fixedRng(a1.ephemeralPrivateKey) });
    expect(p.payment.accountAddress).toBe(a1.accountAddress);
    expect(p.payment.ownerAddress).toBe(a1.ownerAddress);
    expect(p.built.method).toBe('payNative');
    expect(p.built.tx.to).toBe(ROUTER);
    expect(p.built.tx.value).toBe(1_000_000n);
    expect(p.built.fee).toBe(2500n);
    expect(p.approval).toBeUndefined();
    const d = decodePolicyPaymentCalldata(p.built.tx.data, DEPLOYMENT);
    expect(d.stealth).toBe(a1.accountAddress);
  });
  it('builds an ERC-20 approval for the router first', () => {
    const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const p = preparePolicyPayment({ metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token, gross: 5_000n, nowSec: 1n });
    expect(p.built.method).toBe('payERC20');
    expect(p.approval?.to).toBe(token);
    expect(p.approval?.data.startsWith('0x095ea7b3')).toBe(true);
    const args = decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: p.built.tx.data }).args as readonly unknown[];
    expect(args[3]).toBe(5_000n);
  });
  it('refuses a scheme-1 meta-address, bad token and zero amount', () => {
    const base = { metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1n, nowSec: 1n };
    expect(() => preparePolicyPayment({ ...base, metaAddress: 'st:eth:0x00' })).toThrow(/st:eth:gp2/);
    expect(() => preparePolicyPayment({ ...base, token: 'usdc' })).toThrow(/token/);
    expect(() => preparePolicyPayment({ ...base, gross: 0n })).toThrow(/above zero/);
  });
});

describe('deployment verification', () => {
  const input = { factory: DEPLOYMENT.factory, router: ROUTER };
  it('reads implementation, fee recipient and announcer from the chain', async () => {
    const d = await verifyPolicyDeployment(fakeChain(SEPOLIA, deploymentCalls()), sepolia, input);
    expect(d).toEqual(DEPLOYMENT);
  });
  it('refuses mainnets, other chains, missing code and mismatches', async () => {
    await expect(verifyPolicyDeployment(fakeChain(1, deploymentCalls()), mainnet, input)).rejects.toThrow(/only test networks/);
    await expect(verifyPolicyDeployment(fakeChain(84532, deploymentCalls()), sepolia, input)).rejects.toThrow(/different chain/);
    await expect(verifyPolicyDeployment(fakeChain(SEPOLIA, { ...deploymentCalls(), code: new Set() }), sepolia, input)).rejects.toThrow(/No contract code/);
    const r = ROUTER.toLowerCase();
    await expect(verifyPolicyDeployment(fakeChain(SEPOLIA, deploymentCalls({ [`FACTORY@${r}`]: ROUTER })), sepolia, input)).rejects.toThrow(/does not use this factory/);
    await expect(verifyPolicyDeployment(fakeChain(SEPOLIA, deploymentCalls({ [`SCHEME_ID@${r}`]: 1n })), sepolia, input)).rejects.toThrow(/scheme/);
    await expect(verifyPolicyDeployment(fakeChain(SEPOLIA, deploymentCalls({ [`FEE_BPS@${r}`]: 30n })), sepolia, input)).rejects.toThrow(/fee differs/);
    await expect(verifyPolicyDeployment(fakeChain(SEPOLIA, deploymentCalls()), sepolia, { ...input, router: 'nope' })).rejects.toThrow(/Router/);
    const noImpl = deploymentCalls();
    noImpl.code.delete(DEPLOYMENT.implementation.toLowerCase());
    await expect(verifyPolicyDeployment(fakeChain(SEPOLIA, noImpl), sepolia, input)).rejects.toThrow(/implementation or announcer/);
  });
});

/** The announcement the router emits for the vector payment to acct-001. */
function vectorAnnouncement(block = 500): { log: ReturnType<typeof scheme2Log>; metadata: Hex } {
  const p = preparePolicyPayment({ metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1n, rng: fixedRng(a1.ephemeralPrivateKey) });
  return { log: scheme2Log({ stealth: a1.accountAddress, ephemeralPublicKey: a1.ephemeralPublicKey, metadata: p.built.metadata, block }), metadata: p.built.metadata };
}

describe('scheme-2 scanner', () => {
  it('fetches only scheme 0x47500002 logs from the announcer and matches by policy hash', async () => {
    const { log } = vectorAnnouncement();
    const client = fakeChain(SEPOLIA, { head: 1000, logs: [log] });
    const f = await fetchScheme2Announcements({ chain: sepolia, client, deployment: DEPLOYMENT, cursor: { nextBlock: 0n } });
    expect(f.announcements).toHaveLength(1);
    const getLogs = client.calls.find((c) => c.method === 'eth_getLogs')!.params[0] as { topics: string[]; address: string };
    expect(getLogs.address.toLowerCase()).toBe(ANNOUNCER.toLowerCase());
    expect(getLogs.topics[1]).toBe(`0x${'47500002'.padStart(64, '0')}`);
    const viewing = secretScalarFromBytes(hexToU8(a1.viewingPrivateKey));
    const spend = parseCompressedPoint(hexToU8(a1.spendingPublicKey));
    const m = matchScheme2([...f.announcements, ...f.announcements], viewing, spend, [a1.policyHash], DEPLOYMENT);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ accountAddress: a1.accountAddress, ownerAddress: a1.ownerAddress, policyHash: a1.policyHash, caller: ROUTER });
    expect(matchScheme2(f.announcements, viewing, spend, [a2.policyHash], DEPLOYMENT)).toEqual([]);
    expect(matchScheme2(f.announcements, viewing, spend, [], DEPLOYMENT)).toEqual([]);
    const otherView = secretScalarFromBytes(hexToU8(a2.viewingPrivateKey));
    expect(matchScheme2(f.announcements, otherView, spend, [a1.policyHash], DEPLOYMENT)).toEqual([]);
  });
  it('merges matches by account and drops reorged ones', () => {
    const m = { id: 'x', accountAddress: a1.accountAddress, ownerAddress: a1.ownerAddress, policyHash: a1.policyHash, ephemeralPublicKey: '0x', metadata: '0x', blockNumber: 10n, caller: ROUTER };
    expect(mergeMatches([m], [m])).toHaveLength(1);
    expect(mergeMatches([m], [], { rolledBackTo: 10n })).toHaveLength(0);
    expect(mergeMatches([m], [], { rolledBackTo: 11n })).toHaveLength(1);
  });
});

describe('account reads', () => {
  it('reads a deployed account, window, nonce, balances and time', async () => {
    const x = a1.accountAddress.toLowerCase();
    const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const client = fakeChain(SEPOLIA, {
      code: new Set([x]),
      calls: accountCalls(a1, { [`windowState(${usdc.toLowerCase()})@${x}`]: [604800n, 3n, 7n, 9n] }),
      balances: { [`native@${x}`]: 42n, [`${usdc.toLowerCase()}@${x}`]: 77n },
      timestamp: 123n,
    });
    const v = await readAccount(client, a1.accountAddress);
    expect(v).toMatchObject({ deployed: true, owner: a1.ownerAddress, destination: a1.policy.destination, delay: 86400n, policyHash: a1.policyHash });
    expect(await readWindow(client, a1.accountAddress, usdc)).toEqual({ window: 604800n, bucket: 3n, current: 7n, previous: 9n });
    expect(await readBalance(client, a1.accountAddress, ZERO_ADDRESS)).toBe(42n);
    expect(await readBalance(client, a1.accountAddress, usdc)).toBe(77n);
    expect(await readNonceUsed(client, a1.accountAddress, 5n)).toBe(false);
    expect(await chainNow(client)).toBe(123n);
    expect(await readAccount(fakeChain(SEPOLIA, {}), a1.accountAddress)).toEqual({ deployed: false });
  });
});

describe('withdraw within limits', () => {
  const rec1 = parsePolicyRecord(canonical('acct-001'));
  const rec2 = parsePolicyRecord(canonical('acct-002'));
  const deployed = (a: typeof a1, over = {}) => ({
    deployed: true as const, owner: a.ownerAddress, destination: a.policy.destination, delay: BigInt(a.policy.delaySeconds),
    limitsRoot: a.policy.limitsRoot, policyHash: a.policyHash, pendingDestination: ZERO_ADDRESS, pendingEffectiveAt: 0n, ...over,
  });
  const fresh = { window: 0n, bucket: 0n, current: 0n, previous: 0n };
  const now = 1_800_000_000n;

  it('caps by balance, window headroom at execution time, pending requests and the leaf limit', () => {
    const eth = 10n ** 18n;
    // Native leaf: 1 ETH per 86400 s. Execution at now + 86400 lands in the next bucket.
    const bucketNow = now / 86400n;
    let p = planWithdraw({ record: rec1, view: deployed(a1), token: ZERO_ADDRESS, balance: 5n * eth, window: fresh, pendingSameToken: 0n, nowSec: now });
    expect(p).toMatchObject({ max: eth, limit: eth, executeAfter: now + 86400n, problems: [] });
    p = planWithdraw({ record: rec1, view: deployed(a1), token: ZERO_ADDRESS, balance: 5n * eth, window: { window: 86400n, bucket: bucketNow, current: eth / 4n, previous: 0n }, pendingSameToken: eth / 4n, nowSec: now });
    // At execution the current bucket becomes "previous" (0.25 used) and a pending 0.25 may execute first.
    expect(p.max).toBe(eth / 2n);
    p = planWithdraw({ record: rec1, view: deployed(a1), token: ZERO_ADDRESS, balance: eth / 10n, window: fresh, pendingSameToken: 0n, nowSec: now });
    expect(p.max).toBe(eth / 10n);
    p = planWithdraw({ record: rec1, view: deployed(a1), token: ZERO_ADDRESS, balance: eth, window: fresh, pendingSameToken: 2n * eth, nowSec: now });
    expect(p.max).toBe(0n);
  });
  it('blocks tokens without a leaf, window mismatches and policy/destination drift', () => {
    const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    expect(planWithdraw({ record: rec1, view: deployed(a1), token: weth, balance: 1n, window: fresh, pendingSameToken: 0n, nowSec: now }).problems[0]).toMatch(/no limit leaf/);
    expect(planWithdraw({ record: rec1, view: deployed(a1), token: ZERO_ADDRESS, balance: 1n, window: { ...fresh, window: 5n }, pendingSameToken: 0n, nowSec: now }).problems[0]).toMatch(/another window length/);
    const drift = planWithdraw({ record: rec1, view: deployed(a1, { destination: a2.policy.destination, pendingDestination: a2.policy.destination, policyHash: a2.policyHash }), token: ZERO_ADDRESS, balance: 1n, window: fresh, pendingSameToken: 0n, nowSec: now });
    expect(drift.max).toBe(0n);
    expect(drift.problems).toHaveLength(3);
    expect(planWithdraw({ record: rec2, view: { deployed: false }, token: ZERO_ADDRESS, balance: 9n, window: fresh, pendingSameToken: 0n, nowSec: now })).toMatchObject({ max: 0n, problems: [expect.stringMatching(/not deployed/)] });
    expect(planWithdraw({ record: rec2, view: deployed(a2), token: ZERO_ADDRESS, balance: 9n, window: fresh, pendingSameToken: 4n, nowSec: now }).max).toBe(5n);
  });
  it('signs a withdraw with the scanned owner key; the signature recovers to the owner', async () => {
    const { log } = vectorAnnouncement();
    const client = fakeChain(SEPOLIA, { logs: [log] });
    const f = await fetchScheme2Announcements({ chain: sepolia, client, deployment: DEPLOYMENT, cursor: { nextBlock: 0n } });
    const ann = f.announcements[0]!;
    const key = deriveScheme2OwnerKey(
      { schemeId: ann.schemeId, stealthAddress: ann.stealthAddress, ephemeralPublicKey: ann.ephemeralPublicKey, metadata: ann.metadata },
      { viewingSecret: secretScalarFromBytes(hexToU8(a1.viewingPrivateKey)), spendingSecret: secretScalarFromBytes(hexToU8(a1.spendingPrivateKey)) },
      parseCompressedPoint(hexToU8(a1.spendingPublicKey)), [a1.policyHash], DEPLOYMENT,
    );
    const plan = planWithdraw({ record: rec1, view: deployed(a1), token: ZERO_ADDRESS, balance: 10n ** 18n, window: fresh, pendingSameToken: 0n, nowSec: now });
    const s = await signWithdraw({ chainId: SEPOLIA, account: a1.accountAddress, owner: a1.ownerAddress, record: rec1, plan, token: ZERO_ADDRESS, amount: 10n ** 17n, deadline: now + 600n, nonce: 7n, ownerSecret: key.ownerSecret });
    expect(s.request.to).toBe(a1.accountAddress);
    const d = decodeFunctionData({ abi: policyAccountAbi, data: s.request.data });
    expect(d.functionName).toBe('requestWithdraw');
    const [w, lp, sig] = d.args as unknown as [{ token: Address; amount: bigint; deadline: bigint; nonce: bigint; limitLeafHash: Hex }, { limit: bigint }, Hex];
    expect(lp.limit).toBe(10n ** 18n);
    const signer = await recoverTypedDataAddress({
      domain: { name: 'GhostPayPolicyAccount', version: '1', chainId: SEPOLIA, verifyingContract: a1.accountAddress },
      types: { Withdraw: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'limitLeafHash', type: 'bytes32' }] },
      primaryType: 'Withdraw',
      message: w,
      signature: sig,
    });
    expect(signer).toBe(a1.ownerAddress);
    expect(decodeFunctionData({ abi: policyAccountAbi, data: s.execute.data }).args).toEqual([s.id]);
    await expect(signWithdraw({ chainId: SEPOLIA, account: a1.accountAddress, owner: a1.ownerAddress, record: rec1, plan, token: ZERO_ADDRESS, amount: plan.max + 1n, deadline: now, nonce: 8n, ownerSecret: key.ownerSecret })).rejects.toThrow(/above what the policy allows/);
    const c1 = await signCancel({ chainId: SEPOLIA, account: a1.accountAddress, owner: a1.ownerAddress, kind: 'withdraw', id: s.id, ownerSecret: key.ownerSecret });
    expect(decodeFunctionData({ abi: policyAccountAbi, data: c1.data }).functionName).toBe('cancel');
    const c2 = await signCancel({ chainId: SEPOLIA, account: a1.accountAddress, owner: a1.ownerAddress, kind: 'destination', id: s.id, ownerSecret: key.ownerSecret });
    expect(decodeFunctionData({ abi: policyAccountAbi, data: c2.data }).functionName).toBe('cancelDestination');
  });
  it('builds the deployment call and refuses a factory fee', () => {
    const d = deployCall(DEPLOYMENT, a1.ownerAddress, rec1);
    expect(d.account).toBe(a1.accountAddress);
    expect(d.to).toBe(DEPLOYMENT.factory);
    expect(() => deployCall({ ...DEPLOYMENT, flatFee: 1n }, a1.ownerAddress, rec1)).toThrow(/deployment fee/);
  });
  it('random nonces are 256-bit', () => {
    expect(randomNonce({ getRandomValues: <T extends ArrayBufferView | null>(b: T): T => { new Uint8Array(b!.buffer).fill(0xff); return b; } })).toBe(2n ** 256n - 1n);
    expect(randomNonce()).not.toBe(randomNonce());
  });
});

describe('recovery guard', () => {
  const acct = a1.accountAddress;
  const id = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;
  it('flags unknown pending withdrawals and any destination proposal', async () => {
    const logs = [
      accountLog(acct, 'WithdrawRequested', { id: id(1), token: ZERO_ADDRESS, amount: 5n, executeAfter: 100n }, 10),
      accountLog(acct, 'WithdrawRequested', { id: id(2), token: ZERO_ADDRESS, amount: 6n, executeAfter: 100n }, 11),
      accountLog(acct, 'WithdrawRequested', { id: id(3), token: ZERO_ADDRESS, amount: 7n, executeAfter: 100n }, 12),
      accountLog(acct, 'WithdrawExecuted', { id: id(3), destination: a1.policy.destination, token: ZERO_ADDRESS, amount: 7n }, 13),
      accountLog(acct, 'DestinationProposed', { id: id(9), newDestination: a2.policy.destination, effectiveAt: 999n }, 14),
      accountLog('0x000000000000000000000000000000000000dEaD', 'WithdrawCancelled', { id: id(1) }, 15),
    ];
    const client = fakeChain(SEPOLIA, { head: 2500, logs });
    const { events, complete } = await fetchAccountEvents(client, sepolia, acct, 0n);
    expect(complete).toBe(true);
    expect(events.map((e) => e.kind)).toEqual(['WithdrawRequested', 'WithdrawRequested', 'WithdrawRequested', 'WithdrawExecuted', 'DestinationProposed']);
    const s = summarizeAccount(events, new Set([id(1)]), a1.policy.destination);
    expect(s.pending.map((p) => [p.id, p.known])).toEqual([[id(1), true], [id(2), false]]);
    expect(s.pendingDestination?.newDestination).toBe(a2.policy.destination);
    expect(s.alerts.map((a) => a.cancel)).toEqual([{ kind: 'withdraw', id: id(2) }, { kind: 'destination', id: id(9) }]);
  });
  it('clears cancelled proposals and warns after a completed destination change', () => {
    const base = { block: 1n };
    const s = summarizeAccount([
      { kind: 'DestinationProposed', id: id(1), newDestination: a2.policy.destination, effectiveAt: 5n, ...base },
      { kind: 'DestinationChangeCancelled', id: id(1), ...base },
      { kind: 'DestinationProposed', id: id(2), newDestination: a2.policy.destination, effectiveAt: 5n, ...base },
      { kind: 'DestinationChanged', id: id(2), newDestination: a2.policy.destination, ...base },
      { kind: 'WithdrawRequested', id: id(3), token: ZERO_ADDRESS, amount: 1n, executeAfter: 1n, ...base },
      { kind: 'WithdrawCancelled', id: id(3), ...base },
    ], new Set(), a1.policy.destination);
    expect(s.pendingDestination).toBeUndefined();
    expect(s.pending).toEqual([]);
    expect(s.alerts).toHaveLength(1);
    expect(s.alerts[0]?.level).toBe('warn');
    expect(s.alerts[0]?.text).toMatch(/was changed to/);
  });
  it('refuses an RPC on another chain and stops at the request cap', async () => {
    await expect(fetchAccountEvents(fakeChain(1, {}), sepolia, acct, 0n)).rejects.toThrow(/different chain/);
    const r = await fetchAccountEvents(fakeChain(SEPOLIA, { head: 10_000_000 }), sepolia, acct, 0n);
    expect(r.complete).toBe(false);
  });
});

describe('edge cases', () => {
  const acct = a1.accountAddress;
  it('guard decodes DestinationChanged and skips unknown or malformed logs', async () => {
    const id = `0x${'cd'.repeat(32)}`;
    const good = accountLog(acct, 'DestinationChanged', { id, newDestination: a2.policy.destination }, 5);
    const other = accountLog(acct, 'EIP712DomainChanged', {}, 6);
    const junk = { ...good, topics: [`0x${'00'.repeat(32)}`], blockNumber: '0x7' };
    const removed = { ...good, removed: true };
    const { events } = await fetchAccountEvents(fakeChain(SEPOLIA, { head: 10, logs: [good, other, junk, removed] }), sepolia, acct, 0n, 10n);
    expect(events).toEqual([{ kind: 'DestinationChanged', id, newDestination: a2.policy.destination, block: 5n }]);
  });
  it('scan passes a request cap and keeps transaction hashes optional', async () => {
    const { log } = vectorAnnouncement();
    const noTx: Record<string, unknown> = { ...log };
    delete noTx['transactionHash'];
    const client = fakeChain(SEPOLIA, { head: 1000, logs: [noTx as unknown as typeof log] });
    const f = await fetchScheme2Announcements({ chain: sepolia, client, deployment: DEPLOYMENT, cursor: { nextBlock: 0n }, maxRequests: 1 });
    expect(f.truncated).toBe(true);
    const m = matchScheme2(f.announcements, secretScalarFromBytes(hexToU8(a1.viewingPrivateKey)), parseCompressedPoint(hexToU8(a1.spendingPublicKey)), [a1.policyHash], DEPLOYMENT);
    expect(m[0]?.transactionHash).toBeUndefined();
  });
  it('chain reads refuse malformed answers', async () => {
    const x = acct.toLowerCase();
    const bad = fakeChain(SEPOLIA, { code: new Set([x]), extra: (method) => (method === 'eth_call' ? '0x1234' : undefined) });
    await expect(readAccount(bad, acct)).rejects.toThrow(/as expected/);
    const notHex = fakeChain(SEPOLIA, { code: new Set([x]), extra: (method) => (method === 'eth_call' ? 42 : method === 'eth_getBalance' ? 'zz' : method === 'eth_getBlockByNumber' ? { timestamp: 7 } : undefined) });
    await expect(readAccount(notHex, acct)).rejects.toThrow(/malformed eth_call/);
    await expect(readBalance(notHex, acct, ZERO_ADDRESS)).rejects.toThrow(/malformed balance/);
    await expect(chainNow(notHex)).rejects.toThrow(/malformed block/);
  });
  it('deployment verification refuses unexpected answer types', async () => {
    const f = DEPLOYMENT.factory.toLowerCase();
    const calls = deploymentCalls();
    const rpc = fakeChain(SEPOLIA, { ...calls, extra: (method, params) => {
      const c = params[0] as { to?: string; data?: string } | undefined;
      // FLAT_FEE() answered with an address-shaped word still decodes; IMPLEMENTATION() returning garbage does not.
      if (method === 'eth_call' && c?.to?.toLowerCase() === f && c.data === '0x3a4741bd') return '0x';
      return undefined;
    } });
    await expect(verifyPolicyDeployment(rpc, sepolia, { factory: DEPLOYMENT.factory, router: ROUTER })).rejects.toThrow(/as expected|unexpected types/);
  });
  it('withdraw planning rethrows unexpected errors', () => {
    const rec1 = parsePolicyRecord(canonical('acct-001'));
    const view = { deployed: true as const, owner: a1.ownerAddress, destination: a1.policy.destination, delay: 86400n, limitsRoot: a1.policy.limitsRoot, policyHash: a1.policyHash, pendingDestination: ZERO_ADDRESS, pendingEffectiveAt: 0n };
    const fresh = { window: 0n, bucket: 0n, current: 0n, previous: 0n };
    expect(() => planWithdraw({ record: rec1, view, token: '0xnot', balance: 1n, window: fresh, pendingSameToken: 0n, nowSec: 1n })).toThrow(/invalid address/);
    expect(() => planWithdraw({ record: rec1, view, token: ZERO_ADDRESS, balance: 1n, window: { ...fresh, current: -1n }, pendingSameToken: 0n, nowSec: 1n })).toThrow(/invalid input/);
  });
});
