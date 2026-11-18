import { CHAINS, erc20Abi } from '@ghostpay/chain-adapters';
import { ZERO_ADDRESS, type Address, type Hex } from '@ghostpay/policy-scheme';
import { encodeAbiParameters, encodeEventTopics, keccak256 } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import type { PolicyDeploymentProfile } from './deploymentEvidence';
import { DEPLOYMENT, FEE_RECIPIENT, LOCAL_POLICY_PROFILE, SEPOLIA, account, deploymentCalls, fakeChain, fixedRng, scheme2Log } from './fixtures.testutil';
import { preparePolicyPayment } from './pay';
import { isPolicyEvidenceBlockCanonical, mergePolicyPaymentEvidence, verifyPolicyPaymentEvidence, type VerifiedPolicyPayment } from './paymentEvidence';
import type { Scheme2Match } from './scan2';

const chain = CHAINS.find((c) => c.chainId === SEPOLIA)!;
const vector = account('acct-001');
const payer: Address = '0x3333333333333333333333333333333333333333';
const token: Address = '0x4444444444444444444444444444444444444444';
const other: Address = '0x5555555555555555555555555555555555555555';
const otherHash: Hex = `0x${'ab'.repeat(32)}`;
const quantity = (n: bigint | number): Hex => `0x${n.toString(16)}`;

type Raw = Record<string, unknown>;
function fixture(erc20 = false) {
  const payment = preparePolicyPayment({ metaAddress: vector.metaAddress, deployment: DEPLOYMENT, token: erc20 ? token : 'native', gross: 1_000_000n, nowSec: 1_800_000_000n, rng: fixedRng(vector.ephemeralPrivateKey) });
  const event = scheme2Log({ stealth: vector.accountAddress, ephemeralPublicKey: vector.ephemeralPublicKey, metadata: payment.built.metadata, block: 500, index: erc20 ? 2 : 0 });
  const announcement = { ...event, transactionIndex: '0x0', removed: false };
  const transfer = (to: Address, value: bigint, index: number): Raw => ({
    ...announcement, address: token, logIndex: quantity(index), topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: payer, to } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
  });
  const tx: Raw = { hash: event.transactionHash, from: payer, to: DEPLOYMENT.router, blockHash: event.blockHash, blockNumber: event.blockNumber,
    transactionIndex: '0x0', chainId: quantity(SEPOLIA), input: payment.built.tx.data, value: quantity(payment.built.tx.value ?? 0n) };
  const receipt: Raw = { transactionHash: tx['hash'], from: payer, to: DEPLOYMENT.router, blockHash: tx['blockHash'], blockNumber: tx['blockNumber'],
    transactionIndex: '0x0', status: '0x1', contractAddress: null, logs: erc20 ? [transfer(FEE_RECIPIENT, payment.built.fee, 0), transfer(vector.accountAddress, payment.built.net, 1), announcement] : [announcement] };
  const match: Scheme2Match = { id: `${event.blockHash}:${erc20 ? '2' : '0'}`, transactionHash: event.transactionHash! as Hex, blockHash: event.blockHash as Hex,
    logIndex: erc20 ? 2 : 0, blockNumber: 500n, caller: DEPLOYMENT.router, accountAddress: vector.accountAddress, ownerAddress: vector.ownerAddress,
    policyHash: vector.policyHash, ephemeralPublicKey: vector.ephemeralPublicKey, metadata: payment.built.metadata };
  const profile: PolicyDeploymentProfile = erc20 ? { ...LOCAL_POLICY_PROFILE, assets: [...LOCAL_POLICY_PROFILE.assets, { token, semantics: 'erc20-exact-transfer', codeHash: keccak256('0x6001') }] } : LOCAL_POLICY_PROFILE;
  const base = deploymentCalls();
  if (erc20) base.code.add(token.toLowerCase());
  const extra = { handler: undefined as ((method: string, params: readonly unknown[]) => unknown) | undefined };
  const rpc = fakeChain(SEPOLIA, { ...base, extra: (method, params) => {
    const override = extra.handler?.(method, params);
    if (override !== undefined) return override;
    if (method === 'eth_getTransactionByHash') return tx;
    if (method === 'eth_getTransactionReceipt') return receipt;
    return undefined;
  } });
  const options = { chain, client: rpc, profile, match, expected: { token: erc20 ? token : ZERO_ADDRESS, net: payment.built.net }, seenEvidenceIds: new Set<string>() };
  return { options, tx, receipt, rpc, extra, payment, log: announcement, logs: receipt['logs'] as Raw[] };
}

async function verified(erc20 = false): Promise<VerifiedPolicyPayment> {
  const result = await verifyPolicyPaymentEvidence(fixture(erc20).options);
  expect(result.status).toBe('verified');
  if (result.status !== 'verified') throw new Error('fixture did not verify');
  return result;
}

describe('independent scheme-2 payment evidence', () => {
  it.each([false, true])('verifies exact canonical direct payment (ERC20=%s)', async (erc20) => {
    const f = fixture(erc20);
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'verified', account: vector.accountAddress, owner: vector.ownerAddress,
      policyHash: vector.policyHash, payer, token: erc20 ? token : ZERO_ADDRESS, gross: 1_000_000n, net: 997_500n, blockNumber: 500n });
    expect(f.rpc.calls.some((c) => c.method === 'eth_getBalance')).toBe(false);
  });
  it('refuses unknown positions, duplicate observations and zero expected amount', async () => {
    const f = fixture();
    for (const key of ['transactionHash', 'blockHash', 'logIndex'] as const) {
      const match = { ...f.options.match };
      delete match[key];
      expect(await verifyPolicyPaymentEvidence({ ...f.options, match })).toEqual({ status: 'unverified', reason: 'missing-position' });
    }
    f.options.seenEvidenceIds.add(`${String(SEPOLIA)}:${f.options.match.transactionHash!}`);
    expect(await verifyPolicyPaymentEvidence(f.options)).toEqual({ status: 'unverified', reason: 'duplicate' });
    f.options.seenEvidenceIds.clear();
    expect(await verifyPolicyPaymentEvidence({ ...f.options, expected: { token: ZERO_ADDRESS, net: 0n } })).toMatchObject({ status: 'unverified' });
  });
  it.each([
    ['hash', otherHash], ['blockHash', otherHash], ['blockNumber', '0x1'], ['chainId', '0x1'], ['transactionIndex', '0x1'],
    ['to', other], ['from', other], ['value', '0x1'], ['input', '0x12345678'], ['input', '0x' + 'aa'.repeat(4097)],
  ])('rejects mismatched or malformed transaction %s', async (field, value) => {
    const f = fixture(); f.tx[field] = value;
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
  });
  it.each([
    ['transactionHash', otherHash], ['blockHash', otherHash], ['blockNumber', '0x1'], ['transactionIndex', '0x1'], ['status', '0x0'],
    ['from', other], ['to', other], ['contractAddress', other], ['logs', []], ['logs', null], ['logs', new Array(129).fill({})],
  ])('rejects mismatched or malformed receipt %s', async (field, value) => {
    const f = fixture(); f.receipt[field] = value;
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
  });
  it.each([
    ['transactionHash', otherHash], ['blockHash', otherHash], ['blockNumber', '0x1'], ['transactionIndex', '0x1'], ['logIndex', '0x1'],
    ['removed', true], ['address', other], ['topics', []], ['data', '0x'], ['data', '0x' + 'aa'.repeat(4097)],
  ])('rejects mismatched or malformed announcement %s', async (field, value) => {
    const f = fixture(); f.logs[0]![field] = value;
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
  });
  it.each([
    { ownerAddress: other }, { accountAddress: other }, { caller: other }, { policyHash: otherHash }, { id: 'spoofed' },
    { ephemeralPublicKey: `0x02${'ab'.repeat(32)}` }, { metadata: '0x' }, { blockHash: otherHash }, { logIndex: -1 },
  ])('rejects spoofed matched fields %j', async (change) => {
    const f = fixture();
    expect(await verifyPolicyPaymentEvidence({ ...f.options, match: { ...f.options.match, ...change } })).toMatchObject({ status: 'unverified' });
  });
  it('rejects duplicate receipt events and a second announcement', async () => {
    const f = fixture(); f.logs.push({ ...f.log });
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
    f.logs[1]!['logIndex'] = '0x1';
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
  });
  it('requires independently known exact amount and a supported asset profile', async () => {
    const f = fixture(true);
    expect(await verifyPolicyPaymentEvidence({ ...f.options, expected: { token, net: 1n } })).toMatchObject({ status: 'unverified' });
    expect(await verifyPolicyPaymentEvidence({ ...f.options, profile: LOCAL_POLICY_PROFILE })).toEqual({ status: 'unverified', reason: 'unsupported-asset' });
    expect(await verifyPolicyPaymentEvidence({ ...f.options, expected: { token: ZERO_ADDRESS, net: f.payment.built.net } })).toEqual({ status: 'unverified', reason: 'unsupported-asset' });
  });
  it.each(['missing', 'wrong-amount', 'wrong-recipient', 'wrong-sender', 'wrong-emitter', 'duplicate', 'extra', 'native-value'])('rejects ERC20 transfer mismatch: %s', async (mode) => {
    const f = fixture(true);
    if (mode === 'missing') f.logs.splice(1, 1);
    if (mode === 'wrong-amount') f.logs[1]!['data'] = encodeAbiParameters([{ type: 'uint256' }], [1n]);
    if (mode === 'wrong-recipient') f.logs[1]!['topics'] = encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: payer, to: other } });
    if (mode === 'wrong-sender') f.logs[1]!['topics'] = encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: other, to: vector.accountAddress } });
    if (mode === 'wrong-emitter') f.logs[1]!['address'] = other;
    if (mode === 'duplicate') f.logs.push({ ...f.logs[1], logIndex: '0x3' });
    if (mode === 'extra') f.logs.push({ ...f.logs[1], logIndex: '0x3', data: encodeAbiParameters([{ type: 'uint256' }], [1n]) });
    if (mode === 'native-value') f.tx['value'] = '0x1';
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
  });
  it('rejects ABI trailing bytes and unsupported indirect execution', async () => {
    const f = fixture();
    f.tx['input'] = `${String(f.tx['input'])}00`;
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
    f.tx['input'] = f.payment.built.tx.data;
    f.tx['to'] = other;
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
  });
  it('rejects insufficient finality and reorg during evidence reads', async () => {
    const f = fixture();
    f.extra.handler = (method, params) => method === 'eth_getBlockByNumber' && params[0] === 'latest' ? { number: '0x1f5', hash: otherHash, timestamp: '0x6b49d200' } : undefined;
    expect(await verifyPolicyPaymentEvidence(f.options)).toEqual({ status: 'unverified', reason: 'insufficient-finality' });
    let reads = 0;
    f.extra.handler = (method, params) => method === 'eth_getBlockByNumber' && params[0] === '0x1f4' && ++reads === 3 ? { number: '0x1f4', hash: otherHash, timestamp: '0x6b49d200' } : undefined;
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
  });
  it('rejects chain drift and late duplicate acceptance', async () => {
    const f = fixture();
    let calls = 0;
    f.extra.handler = (method) => method === 'eth_chainId' && ++calls === 3 ? '0x1' : undefined;
    expect(await verifyPolicyPaymentEvidence(f.options)).toMatchObject({ status: 'unverified' });
    f.extra.handler = (method) => {
      if (method === 'eth_getTransactionReceipt') f.options.seenEvidenceIds.add(`${String(SEPOLIA)}:${f.options.match.transactionHash!}`);
      return undefined;
    };
    expect(await verifyPolicyPaymentEvidence(f.options)).toEqual({ status: 'unverified', reason: 'duplicate' });
  });
  it('does not surface provider exceptions or malformed provider payloads', async () => {
    const f = fixture();
    f.extra.handler = () => { throw new Error('secret RPC credential data'); };
    expect(await verifyPolicyPaymentEvidence(f.options)).toEqual({ status: 'unverified', reason: 'invalid-evidence' });
    f.extra.handler = (method) => method === 'eth_getTransactionReceipt' ? null : undefined;
    expect(await verifyPolicyPaymentEvidence(f.options)).toEqual({ status: 'unverified', reason: 'invalid-evidence' });
  });
});

describe('canonical evidence lifecycle', () => {
  it('deduplicates by chain/transaction and replaces reorged evidence only after reverification', async () => {
    const value = await verified();
    const replacement = { ...value, blockHash: otherHash, announcementId: `${otherHash}:0` };
    expect(mergePolicyPaymentEvidence([value], [value, value])).toEqual([value]);
    expect(mergePolicyPaymentEvidence([value], [], { chainId: SEPOLIA, rolledBackTo: 500n })).toEqual([]);
    expect(mergePolicyPaymentEvidence([value], [replacement], { chainId: SEPOLIA, rolledBackTo: 500n })).toEqual([replacement]);
    expect(mergePolicyPaymentEvidence([value], [], { chainId: SEPOLIA + 1, rolledBackTo: 0n })).toEqual([value]);
  });
  it('invalidates previously trusted in-memory evidence when the canonical block or chain changes', async () => {
    const value = await verified();
    const f = fixture();
    expect(await isPolicyEvidenceBlockCanonical(f.rpc, value)).toBe(true);
    f.extra.handler = (method) => method === 'eth_getBlockByNumber' ? { number: '0x1f4', hash: otherHash, timestamp: '0x6b49d200' } : undefined;
    expect(await isPolicyEvidenceBlockCanonical(f.rpc, value)).toBe(false);
    let reads = 0;
    f.extra.handler = (method) => method === 'eth_chainId' && ++reads === 2 ? '0x1' : undefined;
    expect(await isPolicyEvidenceBlockCanonical(f.rpc, value)).toBe(false);
  });
});
