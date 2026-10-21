import { decodeFunctionData, encodeFunctionData } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import {
  MAX_POLICY_ROUTER_GROSS,
  accountSalt,
  predictAccountAddressFromSalt,
  PolicySchemeError,
  buildPolicyPaymentTx,
  decodePolicyPaymentCalldata,
  deriveScheme2Payment,
  encodeExecuteWithdraw,
  ghostPayPolicyRouterAbi,
  policyRouterFee,
  type Address,
  type PolicyPaymentInput,
} from './index.js';
import { hexBytes, scriptedRng, vectors, type VectorAccount } from './fixtures.testutil.js';

const dep = { factory: vectors.deployment.factory, implementation: vectors.deployment.implementation };
const A = vectors.accounts[0] as VectorAccount;
const ROUTER: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const FEE: Address = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const payment = deriveScheme2Payment(A.metaAddress, dep, scriptedRng([hexBytes(A.ephemeralPrivateKey)]));
const base: PolicyPaymentInput = { router: ROUTER, feeRecipient: FEE, deployment: dep, payment, token: USDC, gross: 1_000_000n, deadline: 100n };

function code(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    if (e instanceof PolicySchemeError) return e.code;
    return `other:${(e as Error).name}`;
  }
  return 'no error';
}

describe('policy router calldata', () => {
  it('fee mirrors the contract', () => {
    expect(policyRouterFee(399n)).toBe(0n);
    expect(policyRouterFee(400n)).toBe(1n);
    expect(policyRouterFee(MAX_POLICY_ROUTER_GROSS)).toBe((MAX_POLICY_ROUTER_GROSS * 25n) / 10_000n);
    expect(code(() => policyRouterFee(0n))).toBe('INVALID_INPUT');
    expect(code(() => policyRouterFee(MAX_POLICY_ROUTER_GROSS + 1n))).toBe('INVALID_INPUT');
  });

  it('payERC20 with the policy binding and metadata', () => {
    const p = buildPolicyPaymentTx(base);
    expect(p.method).toBe('payERC20');
    expect(p.fee).toBe(2500n);
    expect(p.net).toBe(997_500n);
    expect(p.metadata).toBe(`${A.viewTag}a9059cbb${USDC.slice(2).toLowerCase()}${p.net.toString(16).padStart(64, '0')}`);
    const d = decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: p.tx.data });
    expect(d.functionName).toBe('payERC20');
    expect(d.args?.[1]).toBe(A.accountAddress);
    const salt = accountSalt(A.ownerAddress, A.policyHash);
    expect(d.args?.[2]).toBe(salt);
    expect(predictAccountAddressFromSalt(dep, salt)).toBe(A.accountAddress);
    const dec = decodePolicyPaymentCalldata(p.tx.data, dep);
    expect(dec).toEqual({ method: 'payERC20', stealth: A.accountAddress, salt, ephemeralPublicKey: A.ephemeralPublicKey, metadata: p.metadata });
    expect(decodePolicyPaymentCalldata(p.tx.data, dep, { owner: A.ownerAddress, policyHash: A.policyHash })).toEqual(dec);
    expect(p.tx.value).toBe(0n);
  });

  it('native, permit and buffer variants', () => {
    const n = buildPolicyPaymentTx({ ...base, token: 'native', minNet: 1n });
    expect(n.method).toBe('payNative');
    expect(n.tx.value).toBe(base.gross);
    expect(decodePolicyPaymentCalldata(n.tx.data, dep).metadata).toBe(n.metadata);
    const sig = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as const;
    const pm = buildPolicyPaymentTx({ ...base, permitSignature: sig });
    expect(pm.method).toBe('payERC20WithPermit');
    const pd = decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: pm.tx.data });
    expect(pd.args?.[8]).toEqual({ v: 27, r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}` });
    const pm0 = buildPolicyPaymentTx({ ...base, permitSignature: `0x${'11'.repeat(64)}01` });
    expect((decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: pm0.tx.data }).args?.[8] as { v: number }).v).toBe(28);
    const b = buildPolicyPaymentTx({ ...base, buffer: { bufferWei: 5n, maxBufferWei: 9n } });
    expect(b.method).toBe('payERC20WithBuffer');
    expect(b.tx.value).toBe(5n);
    expect(decodePolicyPaymentCalldata(b.tx.data, dep).ephemeralPublicKey).toBe(A.ephemeralPublicKey);
    expect(buildPolicyPaymentTx({ ...base, buffer: { bufferWei: 5n } }).tx.value).toBe(5n);
  });

  it('refuses inconsistent input', () => {
    const other = vectors.accounts[1] as VectorAccount;
    expect(code(() => buildPolicyPaymentTx({ ...base, payment: { ...payment, accountAddress: other.accountAddress } }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, payment: { ...payment, policyHash: other.policyHash } }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, router: A.accountAddress }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, minNet: 0n }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, minNet: 997_501n }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, now: 100n }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, permitSignature: '0x11', buffer: { bufferWei: 1n } }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, token: 'native', buffer: { bufferWei: 1n } }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, permitSignature: '0x11' }))).toBe('INVALID_HEX');
    expect(code(() => buildPolicyPaymentTx({ ...base, permitSignature: `0x${'11'.repeat(64)}1d` }))).toBe('INVALID_HEX');
    expect(code(() => buildPolicyPaymentTx({ ...base, buffer: { bufferWei: 0n } }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, buffer: { bufferWei: 5n, maxBufferWei: 4n } }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, token: '0x0000000000000000000000000000000000000000' }))).toBe('INVALID_ADDRESS');
    expect(code(() => buildPolicyPaymentTx({ ...base, gross: 0n }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, payment: { ...payment, ephemeralPublicKey: new Uint8Array(33) as never } }))).toBe('other:GhostPayCryptoError');
  });

  it('calldata never carries the seller-constant policyHash (audit N-01)', () => {
    const other = deriveScheme2Payment(A.metaAddress, dep, scriptedRng([new Uint8Array(32).fill(7)]));
    expect(other.policyHash).toBe(payment.policyHash);
    expect(other.ownerAddress).not.toBe(payment.ownerAddress);
    const h = A.policyHash.slice(2).toLowerCase();
    for (const pay of [payment, other]) {
      for (const extra of [{}, { token: 'native' as const }, { buffer: { bufferWei: 1n } }, { permitSignature: `0x${'11'.repeat(64)}1b` as const }]) {
        const p = buildPolicyPaymentTx({ ...base, ...extra, payment: pay });
        expect(p.tx.data.toLowerCase()).not.toContain(h);
      }
    }
    const s1 = decodePolicyPaymentCalldata(buildPolicyPaymentTx(base).tx.data, dep).salt;
    const s2 = decodePolicyPaymentCalldata(buildPolicyPaymentTx({ ...base, payment: other }).tx.data, dep).salt;
    expect(s1).not.toBe(s2);
  });

  it('decoder rejects foreign calldata and a tampered stealth', () => {
    expect(code(() => decodePolicyPaymentCalldata('0x12345678', dep))).toBe('INVALID_INPUT');
    expect(code(() => decodePolicyPaymentCalldata(encodeExecuteWithdraw(A.accountAddress, A.policyHash).data, dep))).toBe('INVALID_INPUT');
    expect(code(() => decodePolicyPaymentCalldata('0x4e487b71', dep))).toBe('INVALID_INPUT');
    const p = buildPolicyPaymentTx(base);
    const tampered = p.tx.data.replace(A.accountAddress.slice(2).toLowerCase(), (vectors.accounts[1] as VectorAccount).accountAddress.slice(2).toLowerCase()) as `0x${string}`;
    expect(code(() => decodePolicyPaymentCalldata(tampered, dep))).toBe('INVALID_INPUT');
    const other = vectors.accounts[1] as VectorAccount;
    expect(code(() => decodePolicyPaymentCalldata(p.tx.data, dep, { owner: A.ownerAddress, policyHash: other.policyHash }))).toBe('INVALID_INPUT');
    expect(code(() => decodePolicyPaymentCalldata(p.tx.data, dep, { owner: other.ownerAddress, policyHash: A.policyHash }))).toBe('INVALID_INPUT');
    // FEE_BPS() is in the router ABI but is not a payment method.
    expect(code(() => decodePolicyPaymentCalldata('0xbf333f2c', dep))).toBe('INVALID_INPUT');
  });
});

describe('round3b: decodePolicyPaymentCalldata verifies metadata and encoding (TS-05)', () => {
  const good = buildPolicyPaymentTx(base);
  const goodArgs = decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: good.tx.data }).args as unknown as unknown[];
  // payERC20: [token, stealth, salt, gross, minNet, deadline, eph, metadata]
  const rebuild = (patch: Record<number, unknown>): `0x${string}` =>
    encodeFunctionData({
      abi: ghostPayPolicyRouterAbi,
      functionName: 'payERC20',
      args: goodArgs.map((v, i) => (i in patch ? patch[i] : v)) as never,
    });
  const tagByte = good.metadata.slice(2, 4);
  const mk = (token: string, net: bigint): string =>
    `0x${tagByte}a9059cbb${token.slice(2).toLowerCase()}${net.toString(16).padStart(64, '0')}`;

  it('baseline decodes', () => {
    expect(code(() => decodePolicyPaymentCalldata(rebuild({}), dep))).toBe('no error');
  });
  it('rejects corrupt metadata, swapped metadata token/amount, and a net that is not gross minus fee', () => {
    expect(code(() => decodePolicyPaymentCalldata(rebuild({ 7: `0x${'ff'.repeat(57)}` }), dep))).toBe('INVALID_INPUT');
    expect(code(() => decodePolicyPaymentCalldata(rebuild({ 7: '0x00' }), dep))).toBe('INVALID_INPUT');
    const other: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    expect(code(() => decodePolicyPaymentCalldata(rebuild({ 7: mk(other, good.net) }), dep))).toBe('INVALID_INPUT');
    expect(code(() => decodePolicyPaymentCalldata(rebuild({ 7: mk(USDC, good.net + 1n) }), dep))).toBe('INVALID_INPUT');
  });
  it('rejects an invalid ephemeral key and non-canonical (padded) calldata', () => {
    expect(code(() => decodePolicyPaymentCalldata(rebuild({ 6: `0x04${'11'.repeat(32)}` }), dep))).toBe('INVALID_INPUT');
    expect(code(() => decodePolicyPaymentCalldata(`${good.tx.data}00`, dep))).toBe('INVALID_INPUT');
  });
  it('binds ephemeral key, view tag, token and net amount when expected', () => {
    const exp = {
      owner: A.ownerAddress,
      policyHash: A.policyHash,
      ephemeralPublicKey: A.ephemeralPublicKey,
      viewTag: A.viewTag,
      token: USDC,
      netAmount: good.net,
    };
    expect(code(() => decodePolicyPaymentCalldata(good.tx.data, dep, exp))).toBe('no error');
    const o = vectors.accounts[1] as VectorAccount;
    for (const bad of [
      { ephemeralPublicKey: o.ephemeralPublicKey },
      { viewTag: tagByte === '00' ? 'ff' : '00' },
      { token: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address },
      { netAmount: good.net - 1n },
    ])
      expect(code(() => decodePolicyPaymentCalldata(good.tx.data, dep, { ...exp, ...bad }))).toBe('INVALID_INPUT');
  });
  it('native calldata: metadata must be native-kind', () => {
    const n = buildPolicyPaymentTx({ ...base, token: 'native', minNet: 1n });
    expect(code(() => decodePolicyPaymentCalldata(n.tx.data, dep, { owner: A.ownerAddress, policyHash: A.policyHash, token: 'native', netAmount: n.net }))).toBe('no error');
    expect(code(() => decodePolicyPaymentCalldata(n.tx.data, dep, { owner: A.ownerAddress, policyHash: A.policyHash, token: USDC }))).toBe('INVALID_INPUT');
  });
});
