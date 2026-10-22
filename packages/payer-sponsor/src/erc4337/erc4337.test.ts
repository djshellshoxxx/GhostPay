/* eslint-disable @typescript-eslint/require-await -- fakes implement async ports without awaiting */
import { describe, expect, it } from 'vitest';
import { keccak256, zeroAddress, type Hex } from 'viem';
import {
  assertPayerCalls,
  buildPayerCalls,
  buildUserOperation,
  decodeExecuteBatch,
  encodeExecuteBatch,
  encodeGetNonce,
  encodeHandleOps,
  getUserOpHashV07,
  packUint128Pair,
  packedUserOpHash,
  unpackUint128Pair,
  type BuildUserOperationArgs,
  type PayerCallsArgs,
} from './userop.js';
import {
  DUMMY_PAYMASTER_SIGNATURE,
  decodePaymasterAndData,
  encodePaymasterAndData,
  paymasterSignedHash,
  withPaymasterSignature,
  type PaymasterParams,
} from './paymaster.js';
import { buildInitCode, computeAccountAddress, encodeFactoryGetAddress, verifyEntryPoint, ENTRY_POINT_V07 } from './account.js';
import { parseManifest } from '../manifest.js';
import { A, computeVectors } from '../vectors.testutil.js';

const code = (f: () => unknown, c: string) => expect(f).toThrowError(expect.objectContaining({ code: c }) as Error);
const payerArgs: PayerCallsArgs = { token: A.token, router: A.router, routerCalldata: '0x1234', gross: 1000n, sponsorFee: 10n, sponsorFeeTo: A.sponsorFeeTo };

describe('uint128 packing', () => {
  it('round-trips and rejects overflow', () => {
    const w = packUint128Pair(5n, 7n);
    expect(w).toBe(`0x${'0'.repeat(31)}5${'0'.repeat(31)}7`);
    expect(unpackUint128Pair(w)).toEqual([5n, 7n]);
    expect(() => packUint128Pair(2n ** 128n, 0n)).toThrow();
    expect(() => packUint128Pair(0n, -1n)).toThrow();
    expect(() => unpackUint128Pair('0x12')).toThrow();
  });
});

describe('executeBatch and payer calls', () => {
  it('buildPayerCalls produces approve / router / approve(0) / fee transfer', () => {
    const c = buildPayerCalls(payerArgs);
    expect(c).toHaveLength(4);
    expect(c[1]?.target).toBe(A.router);
    expect(buildPayerCalls({ ...payerArgs, sponsorFee: 0n })).toHaveLength(3);
    expect(() => buildPayerCalls({ ...payerArgs, gross: 0n })).toThrow();
  });
  it('encode/decode round trip; bad calldata and sizes are refused', () => {
    const c = buildPayerCalls(payerArgs);
    expect(decodeExecuteBatch(encodeExecuteBatch(c))).toEqual(c);
    code(() => decodeExecuteBatch('0xdeadbeef'), 'PAYLOAD_MISMATCH');
    expect(() => encodeExecuteBatch([])).toThrow();
    expect(() => encodeExecuteBatch(Array.from({ length: 9 }, () => c[0]!))).toThrow();
  });
  it('assertPayerCalls detects extra, missing and altered calls', () => {
    const c = buildPayerCalls(payerArgs);
    expect(() => assertPayerCalls(c, payerArgs)).not.toThrow();
    code(() => assertPayerCalls(c.slice(0, 3), payerArgs), 'PAYLOAD_MISMATCH');
    code(() => assertPayerCalls([...c, c[0]!], payerArgs), 'PAYLOAD_MISMATCH');
    code(() => assertPayerCalls([c[0]!, c[1]!, c[2]!, { ...c[3]!, target: A.payer }], payerArgs), 'PAYLOAD_MISMATCH');
    code(() => assertPayerCalls([c[0]!, c[1]!, c[2]!, { ...c[3]!, value: 1n }], payerArgs), 'PAYLOAD_MISMATCH');
    code(() => assertPayerCalls([c[0]!, c[1]!, c[2]!, { ...c[3]!, data: '0x00' }], payerArgs), 'PAYLOAD_MISMATCH');
    code(() => assertPayerCalls(c, { ...payerArgs, sponsorFee: 11n }), 'PAYLOAD_MISMATCH');
  });
});

describe('user operation hashing (PH-4-REQ-4)', () => {
  const v = computeVectors();
  it('matches the committed cross-checked vector', () => {
    expect(v.expected.userOpHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(getUserOpHashV07(v.withPm, A.entryPoint, v.chainId)).toBe(v.expected.userOpHash);
    expect(packedUserOpHash(v.withPm)).toBe(v.expected.packedUserOpHash);
  });
  it('depends on entryPoint, chain and every field; mainnet refused', () => {
    const h = getUserOpHashV07(v.withPm, A.entryPoint, 31337);
    expect(getUserOpHashV07(v.withPm, A.router, 31337)).not.toBe(h);
    expect(getUserOpHashV07(v.withPm, A.entryPoint, 84532)).not.toBe(h);
    expect(getUserOpHashV07({ ...v.withPm, nonce: 1n }, A.entryPoint, 31337)).not.toBe(h);
    expect(getUserOpHashV07({ ...v.withPm, paymasterAndData: '0x' }, A.entryPoint, 31337)).not.toBe(h);
    code(() => getUserOpHashV07(v.withPm, A.entryPoint, 1), 'MAINNET_FORBIDDEN');
  });
  const args: BuildUserOperationArgs = {
    chainId: 31337, entryPoint: A.entryPoint, sender: A.account, initCode: '0x', nonce: 0n, calls: buildPayerCalls(payerArgs),
    gas: { verificationGasLimit: 1n, callGasLimit: 2n, preVerificationGas: 3n, maxFeePerGas: 5n, maxPriorityFeePerGas: 4n },
  };
  it('buildUserOperation packs gas fields and starts without paymaster or signature', () => {
    const b = buildUserOperation(args);
    expect(unpackUint128Pair(b.userOp.accountGasLimits)).toEqual([1n, 2n]);
    expect(unpackUint128Pair(b.userOp.gasFees)).toEqual([4n, 5n]);
    expect(b.userOp.paymasterAndData).toBe('0x');
    expect(b.userOpHash).toBe(getUserOpHashV07(b.userOp, A.entryPoint, 31337));
    expect(() => buildUserOperation({ ...args, nonce: -1n })).toThrow();
    code(() => buildUserOperation({ ...args, chainId: 1 }), 'MAINNET_FORBIDDEN');
  });
  it('encodes handleOps and getNonce', () => {
    const b = buildUserOperation(args);
    expect(encodeHandleOps(b.userOp, A.sponsorFeeTo)).toMatch(/^0x/);
    expect(encodeGetNonce(A.account).startsWith('0x35567e1a')).toBe(true);
    expect(encodeGetNonce(A.account, 5n)).not.toBe(encodeGetNonce(A.account));
  });
});

describe('paymaster data (PH-4)', () => {
  const pm: PaymasterParams = { paymaster: A.paymaster, verificationGasLimit: 300_000n, postOpGasLimit: 50_000n, validUntil: 1_700_003_600n, validAfter: 5n };
  const sig: Hex = `0x${'11'.repeat(65)}`;
  it('encodes 129 bytes and decodes back', () => {
    const d = encodePaymasterAndData(pm, sig);
    expect((d.length - 2) / 2).toBe(129);
    expect(decodePaymasterAndData(d)).toEqual({ ...pm, paymaster: A.paymaster.toLowerCase(), signature: sig });
    code(() => decodePaymasterAndData('0x12'), 'PAYLOAD_MISMATCH');
  });
  it('validates ranges', () => {
    expect(() => encodePaymasterAndData({ ...pm, validUntil: 0n }, sig)).toThrow();
    expect(() => encodePaymasterAndData({ ...pm, validUntil: 2n ** 48n }, sig)).toThrow();
    expect(() => encodePaymasterAndData({ ...pm, validAfter: 2n ** 48n }, sig)).toThrow();
    expect(() => encodePaymasterAndData({ ...pm, verificationGasLimit: 2n ** 128n }, sig)).toThrow();
    expect(() => encodePaymasterAndData({ ...pm, postOpGasLimit: -1n }, sig)).toThrow();
    expect(() => encodePaymasterAndData(pm, '0x12')).toThrow();
  });
  it('signed hash matches the cross-checked vector, ignores the signature part and binds the rest', () => {
    const v = computeVectors();
    expect(v.expected.paymasterHash).toMatch(/^0x[0-9a-f]{64}$/);
    const op = buildUserOperation({
      chainId: 31337, entryPoint: A.entryPoint, sender: A.account, initCode: '0x', nonce: 0n, calls: buildPayerCalls(payerArgs),
      gas: { verificationGasLimit: 1n, callGasLimit: 2n, preVerificationGas: 3n, maxFeePerGas: 5n, maxPriorityFeePerGas: 4n },
    }).userOp;
    const a = withPaymasterSignature(op, pm, DUMMY_PAYMASTER_SIGNATURE);
    const b = withPaymasterSignature(op, pm, sig);
    const h = paymasterSignedHash(a, pm, 31337);
    expect(paymasterSignedHash(b, pm, 31337)).toBe(h);
    expect(paymasterSignedHash({ ...a, nonce: 9n }, pm, 31337)).not.toBe(h);
    expect(paymasterSignedHash({ ...a, callData: '0x00' }, pm, 31337)).not.toBe(h);
    expect(paymasterSignedHash(a, { ...pm, validUntil: pm.validUntil + 1n }, 31337)).not.toBe(h);
    expect(paymasterSignedHash(a, { ...pm, paymaster: A.router }, 31337)).not.toBe(h);
    expect(paymasterSignedHash(a, pm, 84532)).not.toBe(h);
    code(() => paymasterSignedHash(a, pm, 1), 'MAINNET_FORBIDDEN');
  });
});

describe('account helpers', () => {
  it('buildInitCode = factory || createAccount(owner, salt)', () => {
    const i = buildInitCode(A.factory, A.owner, 7n);
    expect(i.startsWith(`0x${A.factory.slice(2).toLowerCase()}`)).toBe(true);
    expect(() => buildInitCode(A.factory, A.owner, -1n)).toThrow();
    expect(encodeFactoryGetAddress(A.owner, 7n).startsWith('0x')).toBe(true);
  });
  it('computeAccountAddress is deterministic and depends on every input', () => {
    const base = { factory: A.factory, entryPoint: A.entryPoint, owner: A.owner, saltNonce: 7n, accountCreationCode: '0x6001' as Hex };
    const a = computeAccountAddress(base);
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(computeAccountAddress(base)).toBe(a);
    for (const v of [{ factory: A.router }, { entryPoint: A.router }, { owner: A.router }, { saltNonce: 8n }, { accountCreationCode: '0x6002' as Hex }]) {
      expect(computeAccountAddress({ ...base, ...v })).not.toBe(a);
    }
  });
  it('verifyEntryPoint (PH-4-REQ-2)', async () => {
    const epCode = '0x6080604052' as Hex;
    const m = parseManifest({ deployments: [{ chainId: 31337, entryPoint: ENTRY_POINT_V07, entryPointCodeHash: keccak256(epCode) }, { chainId: 84532, entryPoint: ENTRY_POINT_V07 }, { chainId: 11155111 }] });
    await expect(verifyEntryPoint({ manifest: m, chainId: 31337, getCode: async () => epCode })).resolves.toBe(ENTRY_POINT_V07);
    await expect(verifyEntryPoint({ manifest: m, chainId: 31337, getCode: async () => '0x6080604053' })).rejects.toMatchObject({ code: 'ENTRYPOINT_MISMATCH' });
    await expect(verifyEntryPoint({ manifest: m, chainId: 31337, getCode: async () => '0x' })).rejects.toMatchObject({ code: 'ENTRYPOINT_MISMATCH' });
    await expect(verifyEntryPoint({ manifest: m, chainId: 31337, getCode: async () => undefined })).rejects.toMatchObject({ code: 'ENTRYPOINT_MISMATCH' });
    await expect(verifyEntryPoint({ manifest: m, chainId: 84532, getCode: async () => epCode })).rejects.toMatchObject({ code: 'ENTRYPOINT_MISMATCH' });
    await expect(verifyEntryPoint({ manifest: m, chainId: 11155111, getCode: async () => epCode })).rejects.toMatchObject({ code: 'ENTRYPOINT_MISMATCH' });
    await expect(verifyEntryPoint({ manifest: m, chainId: 1, getCode: async () => epCode })).rejects.toMatchObject({ code: 'MAINNET_FORBIDDEN' });
    expect(zeroAddress).toBeDefined();
  });
});
