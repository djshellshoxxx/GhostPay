import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import fc from 'fast-check';
import { decodeFunctionData, getAddress, hashTypedData, keccak256, toBytes } from 'viem/utils';
import { describe, expect, it, vi } from 'vitest';
import { erc6538RegistryAbi } from './abi/erc6538Registry.js';
import { ERC6538_REGISTRY, metaAddressToRegistryBytes } from './registry.js';
import {
  MAX_REGISTRY_SIGNATURE_BYTES,
  buildIncrementNonceTx,
  buildRegisterKeysOnBehalfTx,
  buildRegistryNonceCall,
  buildRegistryDelegationRequest,
  signRegistryDelegation,
} from './registryDelegation.js';
import { MAX_UINT256, type Hex } from './types.js';

const registrant = getAddress('0x52908400098527886e0f7030069857d2e4169ee7');
const metaAddress = encodeMetaAddress(generateKeySet());

describe('ERC-6538 delegation builders', () => {
  it('invalidates the sending registrant nonce with the canonical no-argument call and zero value', () => {
    const tx = buildIncrementNonceTx();
    expect(tx).toEqual({ to: ERC6538_REGISTRY, value: 0n, data: keccak256(toBytes('incrementNonce()')).slice(0, 10) });
    expect(decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data }).functionName).toBe('incrementNonce');
  });

  it('reads the requested registrant nonce without sending a transaction', () => {
    const call = buildRegistryNonceCall(registrant.toLowerCase());
    expect(call.to).toBe(ERC6538_REGISTRY);
    expect(call.value).toBe(0n);
    expect(decodeFunctionData({ abi: erc6538RegistryAbi, data: call.data })).toEqual({ functionName: 'nonceOf', args: [registrant] });
  });

  it.each(['0x', '0xabcd', `0x${'12'.repeat(65)}`, `0x${'AB'.repeat(MAX_REGISTRY_SIGNATURE_BYTES)}`] as Hex[])(
    'preserves bounded opaque ERC-1271/EOA signature bytes', (signature) => {
      const tx = buildRegisterKeysOnBehalfTx(registrant.toLowerCase(), metaAddress, signature);
      expect(tx.to).toBe(ERC6538_REGISTRY);
      expect(tx.value).toBe(0n);
      expect(tx.data.slice(0, 10)).toBe(keccak256(toBytes('registerKeysOnBehalf(address,uint256,bytes,bytes)')).slice(0, 10));
      expect(decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data })).toEqual({
        functionName: 'registerKeysOnBehalf', args: [registrant, 1n, signature.toLowerCase(), metaAddressToRegistryBytes(metaAddress)],
      });
    },
  );

  it.each(['not-an-address', '0x1234', '0x52908400098527886e0F7030069857D2E4169EE7'])(
    'rejects malformed or incorrectly checksummed registrants (%s)', (invalid) => {
      expect(() => buildRegistryNonceCall(invalid)).toThrow(/registrant/);
      expect(() => buildRegisterKeysOnBehalfTx(invalid, metaAddress, '0x12')).toThrow(/registrant/);
    },
  );

  it.each(['0x1', '0xzz', '0X12', '', `0x${'00'.repeat(8193)}`])('rejects malformed or oversized signature bytes', (signature) => {
    expect(() => buildRegisterKeysOnBehalfTx(registrant, metaAddress, signature as Hex)).toThrow(/signature/);
  });

  it.each([null, undefined, 65, {}])('rejects non-string signature input at the JavaScript boundary', (signature) => {
    const invalid: unknown = signature;
    expect(() => buildRegisterKeysOnBehalfTx(registrant, metaAddress, invalid as Hex)).toThrow(/signature/);
  });

  it('rejects a malformed or non-scheme-1 meta-address instead of encoding arbitrary registry data', () => {
    for (const invalid of ['st:eth:0x12', 'st:eth:0x' + '00'.repeat(66), 'st:gp2:0x' + '11'.repeat(66)]) {
      expect(() => buildRegisterKeysOnBehalfTx(registrant, invalid, '0x12')).toThrow(/meta-address/);
    }
  });

  it('round-trips bounded opaque signature bytes without changing registrant, scheme or meta-address', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 256 }), (bytes) => {
      const signature: Hex = `0x${Buffer.from(bytes).toString('hex')}`;
      const tx = buildRegisterKeysOnBehalfTx(registrant, metaAddress, signature);
      const decoded = decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data });
      expect(decoded.args).toEqual([registrant, 1n, signature, metaAddressToRegistryBytes(metaAddress)]);
    }), { seed: 20261116, numRuns: 200 });
  });
});

describe('ERC-6538 delegated signing boundary', () => {
  const input = { chainId: 31337, registrant, metaAddress, nonce: 0n };

  it('builds the canonical EIP-712 domain and ordered message without adding a registrant field', () => {
    const request = buildRegistryDelegationRequest({ ...input, registrant: registrant.toLowerCase(), nonce: MAX_UINT256 });
    expect(request.registrant).toBe(registrant);
    expect(request.typedData.domain).toEqual({ name: 'ERC6538Registry', version: '1.0', chainId: 31337, verifyingContract: ERC6538_REGISTRY });
    expect(request.typedData.primaryType).toBe('Erc6538RegistryEntry');
    expect(request.typedData.types.Erc6538RegistryEntry).toEqual([
      { name: 'schemeId', type: 'uint256' }, { name: 'stealthMetaAddress', type: 'bytes' }, { name: 'nonce', type: 'uint256' },
    ]);
    expect(request.typedData.message).toEqual({ schemeId: 1n, stealthMetaAddress: metaAddressToRegistryBytes(metaAddress), nonce: MAX_UINT256 });
    expect(request.digest).toBe(hashTypedData(request.typedData));
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '1', 1n, null])('rejects unsafe chain IDs before calling the signer (%s)', async (chainId) => {
    const sign = vi.fn();
    await expect(signRegistryDelegation({ ...input, chainId: chainId as number }, { sign, verify: vi.fn() })).rejects.toThrow(/chainId/);
    expect(sign).not.toHaveBeenCalled();
  });

  it.each([-1n, MAX_UINT256 + 1n, 1, '0', null, undefined])('rejects invalid nonce types and uint256 bounds (%s)', (nonce) => {
    expect(() => buildRegistryDelegationRequest({ ...input, nonce: nonce as bigint })).toThrow(/nonce/);
  });

  it('rejects invalid registrants and keys before asking for signing', async () => {
    for (const invalid of [{ registrant: '0x1234' }, { registrant: `0x${'00'.repeat(20)}` }, { metaAddress: 'st:eth:0x00' }]) {
      const sign = vi.fn();
      await expect(signRegistryDelegation({ ...input, ...invalid }, { sign, verify: vi.fn() })).rejects.toThrow();
      expect(sign).not.toHaveBeenCalled();
    }
  });

  it('binds chain, nonce and keys in the digest while leaving registrant selection to signature verification', () => {
    const original = buildRegistryDelegationRequest(input);
    for (const changed of [{ chainId: 1 }, { nonce: 1n }, { metaAddress: encodeMetaAddress(generateKeySet()) }]) {
      expect(buildRegistryDelegationRequest({ ...input, ...changed }).digest).not.toBe(original.digest);
    }
    // ERC-6538 omits registrant from the signed struct. The contract must validate the selected account.
    expect(buildRegistryDelegationRequest({ ...input, registrant: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }).digest).toBe(original.digest);
  });

  it.each(['0x', '0xAB12', `0x${'12'.repeat(65)}`, `0x${'aa'.repeat(MAX_REGISTRY_SIGNATURE_BYTES)}`] as Hex[])(
    'asks the supplied verifier to authorize exact calldata and opaque bytes (%s)', async (signature) => {
      const sign = vi.fn().mockResolvedValue(signature);
      const verify = vi.fn().mockResolvedValue(true);
      const signed = await signRegistryDelegation(input, { sign, verify });
      expect(sign).toHaveBeenCalledExactlyOnceWith(buildRegistryDelegationRequest(input));
      expect(verify).toHaveBeenCalledExactlyOnceWith(signed);
      expect(signed.signature).toBe(signature.toLowerCase());
      expect(signed.transaction).toEqual(buildRegisterKeysOnBehalfTx(registrant, metaAddress, signature));
    },
  );

  it.each(['0x1', '0xzz', `0x${'ab'.repeat(MAX_REGISTRY_SIGNATURE_BYTES + 1)}`, null])('rejects malformed signer output before verification', async (signature) => {
    const verify = vi.fn();
    await expect(signRegistryDelegation(input, { sign: vi.fn().mockResolvedValue(signature), verify })).rejects.toThrow(/signature/);
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([false, undefined, 1, 'true'])('requires explicit verifier success (%s)', async (accepted) => {
    await expect(signRegistryDelegation(input, { sign: () => Promise.resolve('0x'), verify: vi.fn().mockResolvedValue(accepted) })).rejects.toThrow(/verification/);
  });

  it('propagates signer cancellation and verification failures without returning authorization', async () => {
    const cancelled = new Error('wallet cancelled');
    const verify = vi.fn();
    await expect(signRegistryDelegation(input, { sign: vi.fn().mockRejectedValue(cancelled), verify })).rejects.toBe(cancelled);
    expect(verify).not.toHaveBeenCalled();
    const unavailable = new Error('verified RPC unavailable');
    await expect(signRegistryDelegation(input, { sign: () => Promise.resolve('0x'), verify: vi.fn().mockRejectedValue(unavailable) })).rejects.toBe(unavailable);
  });

  it('requires both injected callbacks before invoking either', async () => {
    const sign = vi.fn();
    for (const callbacks of [{ sign }, { verify: vi.fn() }, null]) {
      await expect(signRegistryDelegation(input, callbacks as Parameters<typeof signRegistryDelegation>[1])).rejects.toThrow(/callbacks/);
    }
    expect(sign).not.toHaveBeenCalled();
  });

  it('snapshots inputs and freezes all request and transaction fields across asynchronous callbacks', async () => {
    const mutable = { ...input };
    const signed = await signRegistryDelegation(mutable, {
      sign: (request) => {
        mutable.nonce = 5n;
        mutable.metaAddress = encodeMetaAddress(generateKeySet());
        mutable.registrant = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
        expect(() => Object.assign(request.typedData.message, { nonce: 5n })).toThrow();
        expect(() => Object.assign(request.typedData.domain, { chainId: 1 })).toThrow();
        expect(() => Object.assign(request.typedData.types.Erc6538RegistryEntry[0], { name: 'changed' })).toThrow();
        expect(Object.isFrozen(request.typedData.types.Erc6538RegistryEntry)).toBe(true);
        expect(Object.isFrozen(request.typedData.types)).toBe(true);
        expect(Object.isFrozen(request.typedData)).toBe(true);
        expect(Object.isFrozen(request)).toBe(true);
        return Promise.resolve('0xab');
      },
      verify: (request) => {
        expect(() => Object.assign(request.transaction, { to: mutable.registrant })).toThrow();
        expect(Object.isFrozen(request)).toBe(true);
        return Promise.resolve(true);
      },
    });
    expect(signed.transaction).toEqual(buildRegisterKeysOnBehalfTx(input.registrant, input.metaAddress, '0xab'));
    expect(signed.typedData.message.nonce).toBe(0n);
  });
});
