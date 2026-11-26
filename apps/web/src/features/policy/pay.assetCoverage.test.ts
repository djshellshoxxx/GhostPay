import { parsePolicyRecord, type Address, type PolicyRecord } from '@ghostpay/policy-scheme';
import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters } from 'viem/utils';
import { connectWallet } from '../../lib/wallet';
import { MockWallet } from '../../test/mockWallet';
import { createPolicyMetaAddress } from './create';
import { reviewPolicyPayment, sendPolicyPayment } from './send';
import { assertPayeeTokenCoverage, preparePolicyPayment } from './pay';
import { DEPLOYMENT, SEPOLIA, account, clientVectors, fakeChain, fixedRng, limitRows, walletMirror } from './fixtures.testutil';

const payee = account('acct-001');
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const canonical = (id: string): string => clientVectors.records.valid.find((v) => v.id === id)!.canonical;
const base = { deployment: DEPLOYMENT, gross: 1_000_000n, nowSec: 1n };

describe('policy payment withdrawal-asset coverage', () => {
  it('refuses preparing a known unsupported ERC-20 asset', () => {
    const input = {
      ...base, metaAddress: payee.metaAddress, token: DAI,
      knownRecords: [parsePolicyRecord(canonical('acct-001'))],
      rng: fixedRng(payee.ephemeralPrivateKey),
    };
    expect(() => preparePolicyPayment(input)).toThrow(/Blocked: the payee's policy record/);
  });

  it('refuses preparing native coin for a policy that only permits an ERC-20 asset', () => {
    const record = createPolicyMetaAddress({
      spendingPublicKeyHex: payee.spendingPublicKey,
      viewingPublicKeyHex: payee.viewingPublicKey,
      destination: payee.policy.destination,
      delaySeconds: 3600n,
      limits: [{ token: USDC, limit: '1000000', windowSeconds: '3600' }],
    });
    const input = {
      ...base, metaAddress: record.metaAddress, token: 'native', knownRecords: [record],
      rng: fixedRng(payee.ephemeralPrivateKey),
    };
    expect(() => preparePolicyPayment(input)).toThrow(/Blocked: the payee's policy record/);
  });
});

it('checks coverage before consuming payment derivation randomness', () => {
  const rng = fixedRng(payee.ephemeralPrivateKey);
  const random = vi.spyOn(rng, 'getRandomValues');
  expect(() => preparePolicyPayment({
    ...base, metaAddress: payee.metaAddress, token: DAI, rng,
    knownRecords: [parsePolicyRecord(canonical('acct-001'))],
  })).toThrow(/Blocked: the payee's policy record/);
  expect(random).not.toHaveBeenCalled();
});

it('leaves missing or unrelated policy records explicitly unknown', () => {
  expect(assertPayeeTokenCoverage(payee.metaAddress, DAI, [])).toBe('unknown');
  expect(assertPayeeTokenCoverage(payee.metaAddress, DAI, [parsePolicyRecord(canonical('acct-002'))])).toBe('unknown');
  expect(preparePolicyPayment({ ...base, metaAddress: payee.metaAddress, token: DAI, rng: fixedRng(payee.ephemeralPrivateKey) }).tokenCoverage).toBe('unknown');
});

it.each(['spendingPublicKey', 'viewingPublicKey'] as const)('does not substitute another seller with equal policy terms but different %s', (key) => {
  const other = account('acct-002');
  expect(other[key]).not.toBe(payee[key]);
  const otherSeller = createPolicyMetaAddress({
    spendingPublicKeyHex: key === 'spendingPublicKey' ? other.spendingPublicKey : payee.spendingPublicKey,
    viewingPublicKeyHex: key === 'viewingPublicKey' ? other.viewingPublicKey : payee.viewingPublicKey,
    destination: payee.policy.destination, delaySeconds: BigInt(payee.policy.delaySeconds), limits: limitRows(payee),
  });
  expect(otherSeller.policyHash).toBe(payee.policyHash);
  expect(otherSeller.metaAddress).not.toBe(payee.metaAddress);
  expect(assertPayeeTokenCoverage(payee.metaAddress, USDC, [otherSeller])).toBe('unknown');
  expect(() => assertPayeeTokenCoverage(payee.metaAddress, DAI, [otherSeller])).toThrow(/Blocked: a loaded record matches the payee's policy commitment/);
  expect(assertPayeeTokenCoverage(payee.metaAddress, USDC, [otherSeller, parsePolicyRecord(canonical('acct-001'))])).toBe('covered');
  expect(() => assertPayeeTokenCoverage(payee.metaAddress, DAI, [otherSeller, parsePolicyRecord(canonical('acct-001'))])).toThrow(/Blocked: the payee's policy record/);
});

it('confirms native, ERC-20 and unrestricted coverage without forwarding an ERC-20 native buffer', () => {
  const record = parsePolicyRecord(canonical('acct-001'));
  expect(assertPayeeTokenCoverage(` ${payee.metaAddress} `, USDC.toLowerCase() as Address, [record])).toBe('covered');
  for (const token of ['native', USDC]) {
    const prepared = preparePolicyPayment({
      ...base, metaAddress: payee.metaAddress, token, knownRecords: [record], rng: fixedRng(payee.ephemeralPrivateKey),
    });
    expect(prepared.tokenCoverage).toBe('covered');
    expect(prepared.built.method).toBe(token === 'native' ? 'payNative' : 'payERC20');
    expect(prepared.built.tx.value).toBe(token === 'native' ? base.gross : 0n);
  }
  const unrestricted = parsePolicyRecord(canonical('acct-002'));
  expect(assertPayeeTokenCoverage(unrestricted.metaAddress, DAI, [unrestricted])).toBe('covered');
  expect(assertPayeeTokenCoverage(unrestricted.metaAddress, 'native', [unrestricted])).toBe('covered');
});

it('blocks payment after a mined approval when a newly loaded record excludes the asset, retaining the approval warning', async () => {
  const w = new MockWallet({ chainId: SEPOLIA });
  const wallet = await connectWallet({ id: 'mock', name: 'Mock', kind: 'eip6963', provider: w }, SEPOLIA);
  const mirror = walletMirror(w);
  let records: readonly PolicyRecord[] = [];
  let allowanceReads = 0;
  const rpc = fakeChain(SEPOLIA, { extra: (method, params) => {
    if (method === 'eth_call' && (params[0] as { to: string }).to.toLowerCase() === DAI.toLowerCase()) {
      allowanceReads += 1;
      return encodeAbiParameters([{ type: 'uint256' }], [allowanceReads === 1 ? 0n : base.gross]);
    }
    // The record arrives while the RPC is reporting the approval receipt, after the wallet request.
    if (method === 'eth_getTransactionReceipt') records = [parsePolicyRecord(canonical('acct-001'))];
    return mirror(method);
  } });
  const prepared = preparePolicyPayment({ ...base, metaAddress: payee.metaAddress, token: DAI, rng: fixedRng(payee.ephemeralPrivateKey) });
  const hashes: string[] = [];
  await expect(sendPolicyPayment(wallet, prepared, { rpc, nowSeconds: () => 1, sleep: () => Promise.resolve() }, () => undefined, (hash) => hashes.push(hash), {
    deployment: DEPLOYMENT, reviewed: reviewPolicyPayment(prepared, DEPLOYMENT),
    assertCurrent: () => { assertPayeeTokenCoverage(prepared.metaAddress, prepared.token, records); },
  // #286 item 5: the error names no approval hash; the hash stays in the wallet attempt journal.
  })).rejects.toThrow(/^(?!.*0x[0-9a-f]{64}).*The approval was already mined and the router allowance remains; no payment was sent/s);
  expect(w.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(1);
  expect(String(w.sent?.['to']).toLowerCase()).toBe(DAI.toLowerCase());
  expect(hashes).toEqual([`0x${'9'.repeat(64)}`]);
  expect(allowanceReads).toBe(2);
});
